'use client'

/**
 * CourseCategoryPicker — the exam-board / subject category selector, extracted
 * so it can be used both at course creation (CreateCourseDialog) and on the
 * Course Details page. Controlled by `value`/`onChange` (the selected
 * categories); all other UI state (region/country, active tab, search, custom
 * categories) is internal. Custom categories persist to localStorage keyed by
 * `storageUserId`, matching the previous Course Details behaviour.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  Globe,
  MapPin,
  Flag,
  GraduationCap,
  Wrench,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  REGIONS,
  GLOBAL_EXAMS_CATEGORIES,
  AP_CATEGORIES,
  A_LEVEL_CATEGORIES,
  IB_CATEGORIES,
  IGCSE_CATEGORIES,
  UNIVERSITY_CATEGORIES,
  LANGUAGE_CATEGORIES,
  PROFESSIONAL_CATEGORIES,
  UNIVERSITIES_BY_COUNTRY_CODE,
  type CountryData,
  type ExamCategory,
} from '@/lib/data/tutor-categories'
import {
  CATEGORY_TAB_CONFIG,
  getTabConfig,
  type CategoryTabConfig,
} from '@/lib/data/category-tab-config'

const TAB_COLORS: Record<string, { bg: string; text: string; close: string }> = {
  global: { bg: 'bg-[#0A84FF]', text: 'text-white', close: 'text-white/60 hover:text-white' },
  ap: { bg: 'bg-[#FF1493]', text: 'text-white', close: 'text-white/60 hover:text-white' },
  alevel: { bg: 'bg-[#BF5AF2]', text: 'text-white', close: 'text-white/60 hover:text-white' },
  ib: { bg: 'bg-[#32D74B]', text: 'text-white', close: 'text-white/60 hover:text-white' },
  igcse: { bg: 'bg-[#64D2FF]', text: 'text-white', close: 'text-white/60 hover:text-white' },
  national: { bg: 'bg-[#FF9F0A]', text: 'text-white', close: 'text-white/60 hover:text-white' },
  universities: { bg: 'bg-[#FF375F]', text: 'text-white', close: 'text-white/60 hover:text-white' },
  languages: { bg: 'bg-[#00C7BE]', text: 'text-white', close: 'text-white/60 hover:text-white' },
  professional: {
    bg: 'bg-[#FFD60A]',
    text: 'text-slate-900',
    close: 'text-slate-900/60 hover:text-slate-900',
  },
  diy: { bg: 'bg-[#FF9500]', text: 'text-white', close: 'text-white/60 hover:text-white' },
}

/** Fixed exam-board tabs render a static dataset with single-select radios. */
const BOARD_DATASETS: Record<string, ExamCategory[]> = {
  global: GLOBAL_EXAMS_CATEGORIES,
  ap: AP_CATEGORIES,
  alevel: A_LEVEL_CATEGORIES,
  ib: IB_CATEGORIES,
  igcse: IGCSE_CATEGORIES,
  languages: LANGUAGE_CATEGORIES,
  professional: PROFESSIONAL_CATEGORIES,
}

function CategoryHeading({ config, label }: { config: CategoryTabConfig; label: string }) {
  const Icon = config.icon
  return (
    <div className="flex items-center gap-2">
      <Icon
        className="h-4 w-4"
        style={{ color: config.color ? config.color + 'CC' : 'rgba(255,255,255,0.8)' }}
      />
      <h4
        className="flex items-center gap-2 text-[14px] font-medium"
        style={{ color: config.color || 'white' }}
      >
        {label}
      </h4>
    </div>
  )
}

export interface CourseCategoryPickerProps {
  /** Selected categories (single-select in practice; kept as an array to match
   *  the persisted `course.categories` shape). */
  value: string[]
  onChange: (categories: string[]) => void
  /** Tutor id used to scope custom categories in localStorage. */
  storageUserId?: string
  className?: string
}

export function CourseCategoryPicker({
  value,
  onChange,
  storageUserId,
  className,
}: CourseCategoryPickerProps) {
  const [selectedRegion, setSelectedRegion] = useState('')
  const [selectedCountryCode, setSelectedCountryCode] = useState('')
  const [categoryTab, setCategoryTab] = useState('global')
  const [categorySearch, setCategorySearch] = useState('')
  const [customCategories, setCustomCategories] = useState<string[]>([])
  const [customCategoryInput, setCustomCategoryInput] = useState('')
  const globalContentRef = useRef<HTMLDivElement>(null)

  // Load the tutor's saved custom categories (localStorage, per-user key).
  useEffect(() => {
    if (!storageUserId || typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(`tutor-custom-categories:${storageUserId}`)
      const parsed = raw ? JSON.parse(raw) : null
      if (Array.isArray(parsed)) setCustomCategories(parsed.filter(c => typeof c === 'string'))
    } catch {
      // ignore malformed storage
    }
  }, [storageUserId])

  const availableCountries = useMemo<CountryData[]>(() => {
    const region = REGIONS.find(r => r.id === selectedRegion)
    return region ? region.countries : []
  }, [selectedRegion])

  const nationalExams = useMemo<ExamCategory[]>(() => {
    if (!selectedCountryCode) return []
    const country = availableCountries.find(c => c.code === selectedCountryCode)
    return country && country.nationalExams.length > 0 ? country.nationalExams : []
  }, [selectedCountryCode, availableCountries])

  const filteredUniversityCategories = useMemo<ExamCategory[]>(() => {
    if (!selectedRegion) return []
    if (selectedCountryCode) {
      const country = availableCountries.find(c => c.code === selectedCountryCode)
      const universities = UNIVERSITIES_BY_COUNTRY_CODE[selectedCountryCode]
      if (universities && universities.length > 0) {
        return [
          {
            id: `universities-${selectedCountryCode.toLowerCase()}`,
            label: `Universities — ${country?.name || selectedCountryCode}`,
            exams: universities,
          },
        ]
      }
      return []
    }
    return UNIVERSITY_CATEGORIES.filter(
      cat => cat.id.replace('universities-', '') === selectedRegion
    )
  }, [selectedRegion, selectedCountryCode, availableCountries])

  const selectedCountryName = useMemo(
    () => availableCountries.find(c => c.code === selectedCountryCode)?.name || null,
    [selectedCountryCode, availableCountries]
  )

  const examToTabKey = useMemo(() => {
    const map = new Map<string, string>()
    const add = (cats: ExamCategory[], key: string) =>
      cats.forEach(c => c.exams.forEach(e => map.set(e, key)))
    Object.entries(BOARD_DATASETS).forEach(([key, cats]) => add(cats, key))
    nationalExams.forEach(c => c.exams.forEach(e => map.set(e, 'national')))
    filteredUniversityCategories.forEach(c => c.exams.forEach(e => map.set(e, 'universities')))
    return map
  }, [nationalExams, filteredUniversityCategories])

  // Keep every tab the same height as the (tallest) Global tab.
  const [baseContentHeight, setBaseContentHeight] = useState<number>(480)

  useLayoutEffect(() => {
    if (categoryTab !== 'global') return
    if (globalContentRef.current) {
      setBaseContentHeight(globalContentRef.current.scrollHeight + 32)
    }
  }, [categoryTab])

  const globalContentHeight = baseContentHeight

  const selectCategory = (category: string) => onChange([category])

  const addCustomCategory = () => {
    const name = customCategoryInput.trim()
    if (!name) return
    if (customCategories.some(c => c.toLowerCase() === name.toLowerCase())) {
      toast.error('This custom category already exists')
      return
    }
    if (name.length > 100) {
      toast.error('Category name must be 100 characters or less')
      return
    }
    const updated = [...customCategories, name]
    setCustomCategories(updated)
    setCustomCategoryInput('')
    if (storageUserId && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          `tutor-custom-categories:${storageUserId}`,
          JSON.stringify(updated)
        )
      } catch {
        // ignore
      }
    }
    onChange([name])
  }

  const removeCustomCategory = (category: string) => {
    const updated = customCategories.filter(c => c !== category)
    setCustomCategories(updated)
    if (storageUserId && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          `tutor-custom-categories:${storageUserId}`,
          JSON.stringify(updated)
        )
      } catch {
        // ignore
      }
    }
    if (value[0] === category) onChange([])
  }

  const matchesSearch = (exam: string) =>
    !categorySearch || exam.toLowerCase().includes(categorySearch.toLowerCase())
  const categoryMatchesSearch = (cat: ExamCategory) =>
    !categorySearch || cat.exams.some(matchesSearch)

  const renderExam = (exam: string, opts?: { multi?: boolean; color?: string }) => (
    <label
      key={exam}
      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-white/90 transition-colors hover:bg-white/10"
    >
      <div className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        <input
          type={opts?.multi ? 'checkbox' : 'radio'}
          name="category"
          checked={opts?.multi ? value.includes(exam) : value[0] === exam}
          onChange={() => selectCategory(exam)}
          className="h-3.5 w-3.5 appearance-none rounded-full border border-white/50 transition-colors"
          style={{
            borderColor: (opts?.multi ? value.includes(exam) : value[0] === exam)
              ? opts?.color || '#4F46E5'
              : 'rgba(255,255,255,0.5)',
            backgroundColor: (opts?.multi ? value.includes(exam) : value[0] === exam)
              ? opts?.color || '#4F46E5'
              : 'transparent',
          }}
        />
      </div>
      <span className="line-clamp-2">{exam}</span>
    </label>
  )

  const renderCategoryList = (
    cats: ExamCategory[],
    tabValue: string,
    opts?: { multi?: boolean; contentRef?: React.Ref<HTMLDivElement> }
  ) => {
    const config = getTabConfig(tabValue)
    return (
      <div ref={opts?.contentRef} className="space-y-6">
        {cats.filter(categoryMatchesSearch).map(category => (
          <div key={`${tabValue}-${category.id}`} className="space-y-4">
            <CategoryHeading config={config!} label={category.label} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {category.exams
                .filter(matchesSearch)
                .map(exam => renderExam(exam, { ...opts, color: config?.color }))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const tabs = CATEGORY_TAB_CONFIG.filter(config => config.value !== 'specialties')

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* Region + Country — always visible for all tabs */}
      <div className="flex flex-wrap gap-3">
        <Select
          value={selectedRegion}
          onValueChange={v => {
            setSelectedRegion(v)
            setSelectedCountryCode('')
          }}
        >
          <SelectTrigger className="h-[30px] w-[160px] rounded-sm border border-slate-700/25 bg-white/30 text-sm text-white shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-slate-700/50 hover:bg-white/60 hover:shadow-md focus:outline-none focus-visible:!shadow-none focus-visible:outline-none">
            <SelectValue placeholder="Region" />
          </SelectTrigger>
          <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-lg border border-slate-700/25 bg-white/30 bg-none p-1.5 shadow-lg backdrop-blur-xl">
            {REGIONS.filter(r => r.id !== 'global').map(region => (
              <SelectItem
                key={region.id}
                value={region.id}
                className="mx-1.5 rounded-md text-white"
              >
                {region.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={!selectedRegion}
              className="inline-flex h-[30px] w-[160px] items-center justify-between rounded-sm border border-slate-700/25 bg-white/30 px-3 text-sm text-white shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-slate-700/50 hover:bg-white/60 hover:shadow-md focus:outline-none focus-visible:!shadow-none disabled:cursor-not-allowed disabled:border-slate-400/20 disabled:bg-slate-100/20 disabled:text-slate-400 disabled:opacity-50 disabled:backdrop-blur-none disabled:hover:border-slate-400/20 disabled:hover:bg-slate-100/20 disabled:hover:shadow-none"
            >
              <span className="truncate">
                {selectedCountryCode
                  ? availableCountries.find(c => c.code === selectedCountryCode)?.name || 'Country'
                  : 'Country'}
              </span>
              <svg
                className="h-4 w-4 opacity-50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[160px] rounded-lg border border-slate-700/25 bg-white/30 p-1.5 text-white shadow-lg backdrop-blur-xl"
            align="start"
          >
            <div className="flex flex-col gap-1">
              {availableCountries.map(country => (
                <button
                  key={country.code}
                  onClick={() => setSelectedCountryCode(country.code)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-white hover:bg-white/40"
                >
                  <div
                    className={cn(
                      'h-4 w-4 rounded-full border-2 transition-colors',
                      selectedCountryCode === country.code
                        ? 'border-white bg-white'
                        : 'border-white/50 bg-transparent'
                    )}
                  />
                  <span>{country.name}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Search + selected badges */}
      <div className="mb-1 flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="scrollbar-hide flex h-10 min-w-0 items-center overflow-x-auto rounded-md border border-slate-200 bg-white px-6 py-1">
            <div className="flex min-w-0 flex-nowrap items-center gap-2">
              {value.length === 0 && (
                <span className="select-none text-sm text-slate-400">Select a category below</span>
              )}
              {value.map(cat => {
                const tabKey = examToTabKey.get(cat) || 'diy'
                const colors = TAB_COLORS[tabKey] || {
                  bg: 'bg-blue-50',
                  text: 'text-[#0A84FF]',
                  close: 'text-[#0A84FF]/60 hover:text-[#0A84FF]',
                }
                return (
                  <span
                    key={cat}
                    className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full ${colors.bg} px-3 py-1 text-xs font-medium ${colors.text}`}
                  >
                    {cat} - {selectedCountryName || 'Global'}
                    <button
                      type="button"
                      onClick={() => onChange([])}
                      className={`ml-0.5 ${colors.close}`}
                      aria-label={`Remove ${cat}`}
                    >
                      ×
                    </button>
                  </span>
                )
              })}
            </div>
          </div>
        </div>
        <div className="relative z-10 max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search categories..."
            value={categorySearch}
            onChange={e => setCategorySearch(e.target.value)}
            className="h-10 border-slate-200 bg-white pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:border-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={categoryTab} onValueChange={setCategoryTab} className="flex w-full flex-col">
        <div>
          <TabsList className="scrollbar-hide flex w-full flex-nowrap justify-between overflow-x-auto bg-transparent p-0">
            {tabs.map(config => {
              const Icon = config.icon
              const isActive = categoryTab === config.value
              return (
                <TabsTrigger
                  key={config.value}
                  value={config.value}
                  // National stays clickable even before a country is chosen —
                  // its country selects only appear once the tab is active, so
                  // gating the tab on nationalExams would deadlock it (can't
                  // pick a country to unlock the tab you need to pick it in).
                  // The tab's own empty state prompts for a region/country.
                  className={cn(
                    'rounded-none border-b-2 border-transparent px-2 py-2 text-[14px] font-medium text-slate-500 data-[state=active]:border-white data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 data-[state=active]:shadow-none'
                  )}
                  style={{
                    color: isActive ? config.color : config.color + '80',
                    borderBottomColor: isActive ? config.color : 'transparent',
                  }}
                >
                  <Icon className="mr-1.5 h-4 w-4" style={{ color: config.color }} />
                  {config.label}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>

        <div
          className={cn(
            'scrollbar-no-arrows flex flex-col overscroll-contain border-t border-white/10 pb-4 pt-2',
            categoryTab === 'global' ? 'overflow-hidden' : 'overflow-y-auto'
          )}
          style={{ height: globalContentHeight, maxHeight: globalContentHeight }}
        >
          {/* Fixed-dataset board tabs */}
          {Object.keys(BOARD_DATASETS).map(tabValue => (
            <TabsContent key={tabValue} value={tabValue} className="mt-0">
              {renderCategoryList(BOARD_DATASETS[tabValue], tabValue, {
                contentRef: tabValue === 'global' ? globalContentRef : undefined,
              })}
            </TabsContent>
          ))}

          {/* National (checkbox; needs a country) */}
          <TabsContent value="national" className="mt-0">
            {nationalExams.length === 0 ? (
              <div className="py-12 text-center">
                <Flag className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                <p className="text-sm text-white/70">
                  Select a region or country to see national exams.
                </p>
              </div>
            ) : (
              renderCategoryList(nationalExams, 'national', { multi: true })
            )}
          </TabsContent>

          {/* Universities (needs a region/country) */}
          <TabsContent value="universities" className="mt-0">
            {filteredUniversityCategories.length === 0 ? (
              <div className="py-12 text-center">
                <GraduationCap className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                <p className="text-sm text-white/70">Select a country to see universities</p>
              </div>
            ) : (
              renderCategoryList(filteredUniversityCategories, 'universities')
            )}
          </TabsContent>

          {/* DIY / custom categories */}
          <TabsContent value="diy" className="mt-0">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="relative max-w-md flex-1">
                  <Input
                    placeholder="Enter custom category name..."
                    value={customCategoryInput}
                    onChange={e => setCustomCategoryInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addCustomCategory()
                      }
                    }}
                    className="h-10 border-slate-200 bg-white text-slate-900"
                    maxLength={100}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={addCustomCategory}
                  disabled={!customCategoryInput.trim()}
                  className="h-10 gap-1 rounded-md border border-white bg-blue-700 text-white hover:border-blue-700 hover:bg-blue-600"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>

              {customCategories.length === 0 ? (
                <div className="py-8 text-center">
                  <Wrench className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                  <p className="text-white/70">No custom categories yet.</p>
                  <p className="text-sm text-white/50">Create your own category above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <CategoryHeading config={getTabConfig('diy')!} label="Your Custom Categories" />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
                    {customCategories.filter(matchesSearch).map(exam => (
                      <label
                        key={exam}
                        className="group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-white/90 transition-colors hover:bg-white/10"
                      >
                        <div className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                          <input
                            type="radio"
                            name="category"
                            checked={value[0] === exam}
                            onChange={() => selectCategory(exam)}
                            className="h-3.5 w-3.5 appearance-none rounded-full border border-white/50 transition-colors"
                            style={{
                              borderColor: value[0] === exam ? '#FF9500' : 'rgba(255,255,255,0.5)',
                              backgroundColor: value[0] === exam ? '#FF9500' : 'transparent',
                            }}
                          />
                        </div>
                        <span className="line-clamp-2 flex-1">{exam}</span>
                        <button
                          type="button"
                          onClick={e => {
                            e.preventDefault()
                            removeCustomCategory(exam)
                          }}
                          className="text-white/40 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                          aria-label={`Remove ${exam}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
