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
import { Search, Globe, MapPin, Flag, GraduationCap, Wrench, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
      <Icon className="h-4 w-4" style={{ color: config.color }} />
      <h4 className="text-sm font-semibold text-slate-700">{label}</h4>
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
  const [globalContentHeight, setGlobalContentHeight] = useState<number>(480)
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
  useLayoutEffect(() => {
    if (categoryTab !== 'global') return
    if (globalContentRef.current) {
      setGlobalContentHeight(globalContentRef.current.scrollHeight + 32)
    }
  }, [categoryTab])

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

  const renderExam = (exam: string, opts?: { multi?: boolean }) => (
    <label
      key={exam}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
    >
      <input
        type={opts?.multi ? 'checkbox' : 'radio'}
        name="category"
        checked={opts?.multi ? value.includes(exam) : value[0] === exam}
        onChange={() => selectCategory(exam)}
        className="border-input rounded text-indigo-600 focus:ring-indigo-500"
      />
      <span className="text-sm text-slate-700">{exam}</span>
    </label>
  )

  const renderCategoryList = (
    cats: ExamCategory[],
    tabValue: string,
    opts?: { multi?: boolean; contentRef?: React.Ref<HTMLDivElement> }
  ) => (
    <div ref={opts?.contentRef} className="space-y-6">
      {cats.filter(categoryMatchesSearch).map(category => (
        <div key={`${tabValue}-${category.id}`} className="space-y-3">
          <CategoryHeading config={getTabConfig(tabValue)!} label={category.label} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {category.exams.filter(matchesSearch).map(exam => renderExam(exam, opts))}
          </div>
        </div>
      ))}
    </div>
  )

  const tabs = CATEGORY_TAB_CONFIG.filter(config => config.value !== 'specialties')

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* Region + Country */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex-1 space-y-3">
          <Label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Globe className="h-4 w-4 text-[#1D4ED8]" />
            Region
          </Label>
          <Select
            value={selectedRegion}
            onValueChange={v => {
              setSelectedRegion(v)
              setSelectedCountryCode('')
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-lg border bg-white text-slate-700 shadow-sm">
              <SelectValue placeholder="Select Regions..." />
            </SelectTrigger>
            <SelectContent>
              {REGIONS.map(region => (
                <SelectItem key={region.id} value={region.id}>
                  {region.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-3">
          <Label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <MapPin className="h-4 w-4 text-[#F17623]" />
            Country
          </Label>
          <Select
            value={selectedCountryCode}
            onValueChange={setSelectedCountryCode}
            disabled={!selectedRegion}
          >
            <SelectTrigger className="h-10 w-full rounded-lg border bg-white text-slate-700 shadow-sm">
              <SelectValue
                placeholder={selectedRegion ? 'Select Countries...' : 'Select Region First'}
              />
            </SelectTrigger>
            <SelectContent>
              {availableCountries.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-500">
                  No countries available
                </div>
              ) : (
                availableCountries.map(country => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Search + selected badges */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search categories..."
            value={categorySearch}
            onChange={e => setCategorySearch(e.target.value)}
            className="h-10 bg-white pl-10 text-slate-900"
          />
        </div>
        <div className="scrollbar-hide flex h-10 min-w-0 items-center overflow-x-auto rounded-md border border-slate-300 bg-white px-6 py-1">
          <div className="flex min-w-0 flex-nowrap items-center gap-2">
            {value.length === 0 && (
              <span className="select-none text-sm text-slate-400">Select a category below</span>
            )}
            {value.map(cat => {
              const tabKey = examToTabKey.get(cat) || 'diy'
              const colors = TAB_COLORS[tabKey] || {
                bg: 'bg-slate-100',
                text: 'text-slate-700',
                close: 'text-slate-500/60 hover:text-slate-700',
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

      {/* Tabs */}
      <Tabs value={categoryTab} onValueChange={setCategoryTab} className="flex w-full flex-col">
        <div className="border-b border-slate-200">
          <TabsList className="flex w-full flex-wrap justify-evenly bg-transparent p-0">
            {tabs.map(config => {
              const Icon = config.icon
              const isNational = config.value === 'national'
              const isActive = categoryTab === config.value
              return (
                <TabsTrigger
                  key={config.value}
                  value={config.value}
                  disabled={isNational && nationalExams.length === 0}
                  className={cn(
                    'rounded-none border-b-2 border-transparent px-1 py-3 text-base font-medium data-[state=active]:bg-transparent data-[state=active]:shadow-none',
                    isNational && nationalExams.length === 0 && 'disabled:opacity-50'
                  )}
                  style={{
                    color: config.color,
                    borderBottomColor: isActive ? config.color : 'transparent',
                  }}
                >
                  <Icon className="mr-2 h-4 w-4" style={{ color: config.color }} />
                  {config.label}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>

        <div
          className="scrollbar-hide overflow-y-auto py-4"
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
              <div className="py-12 text-center text-slate-500">
                <Flag className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                <p>Select countries to view national exams</p>
              </div>
            ) : (
              renderCategoryList(nationalExams, 'national', { multi: true })
            )}
          </TabsContent>

          {/* Universities (needs a region/country) */}
          <TabsContent value="universities" className="mt-0">
            {filteredUniversityCategories.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <GraduationCap className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                <p className="text-sm">Please select a region or country.</p>
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
                    className="h-10 bg-white text-slate-900"
                    maxLength={100}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={addCustomCategory}
                  disabled={!customCategoryInput.trim()}
                  className="h-10 gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>

              {customCategories.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                  <Wrench className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                  <p>No custom categories yet.</p>
                  <p className="text-sm text-slate-400">Create your own category above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <CategoryHeading config={getTabConfig('diy')!} label="Your Custom Categories" />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
                    {customCategories.filter(matchesSearch).map(exam => (
                      <label
                        key={exam}
                        className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
                      >
                        <input
                          type="radio"
                          name="category"
                          checked={value[0] === exam}
                          onChange={() => selectCategory(exam)}
                          className="border-input rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="flex-1 text-sm text-slate-700">{exam}</span>
                        <button
                          type="button"
                          onClick={e => {
                            e.preventDefault()
                            removeCustomCategory(exam)
                          }}
                          className="text-slate-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
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
