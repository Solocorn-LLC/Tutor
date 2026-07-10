'use client'

import * as React from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  REGIONS,
  GLOBAL_EXAMS_CATEGORIES,
  AP_CATEGORIES,
  A_LEVEL_CATEGORIES,
  IB_CATEGORIES,
  IGCSE_CATEGORIES,
  NATIONAL_EXAMS_DATA,
  UNIVERSITY_CATEGORIES,
  LANGUAGE_CATEGORIES,
  PROFESSIONAL_CATEGORIES,
  UNIVERSITIES_BY_COUNTRY_CODE,
  ALL_COUNTRIES,
  type ExamCategory,
} from '@/lib/data/tutor-categories'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Globe,
  Award,
  GraduationCap,
  BookOpen,
  School,
  Flag,
  Languages,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EmptyState = ({ search, fallbackText }: { search: string; fallbackText: string }) => (
  <div className="py-12 text-center text-slate-500">
    <Search className="mx-auto mb-3 h-12 w-12 text-slate-300" />
    <p className="text-sm">{search ? `No results for "${search}"` : fallbackText}</p>
  </div>
)

const CategorySection = ({
  label,
  icon: Icon,
  exams,
  categorySearch,
  selectedCategories,
  onToggleCategory,
  color,
}: {
  label: string
  icon: React.ElementType
  exams: string[]
  categorySearch: string
  selectedCategories: string[]
  onToggleCategory: (category: string) => void
  color?: string
}) => {
  const filtered = categorySearch
    ? exams.filter(e => e.toLowerCase().includes(categorySearch.toLowerCase()))
    : exams
  if (filtered.length === 0) return null
  return (
    <div className="space-y-4">
      <h4
        className="flex items-center gap-2 text-[14px] font-medium"
        style={{ color: color || 'white' }}
      >
        <Icon
          className="h-4 w-4"
          style={{ color: color ? `${color}CC` : 'rgba(255,255,255,0.8)' }}
        />
        {label}
      </h4>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {filtered.map((exam, idx) => (
          <label
            key={`${label}-${idx}-${exam}`}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-white/90 transition-colors hover:bg-white/10"
          >
            <div className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
              <input
                type="checkbox"
                checked={selectedCategories.includes(exam)}
                onChange={() => onToggleCategory(exam)}
                className="h-3.5 w-3.5 appearance-none rounded-full border border-white/50 transition-colors"
                style={{
                  borderColor: selectedCategories.includes(exam)
                    ? color || '#4F46E5'
                    : 'rgba(255,255,255,0.5)',
                  backgroundColor: selectedCategories.includes(exam)
                    ? color || '#4F46E5'
                    : 'transparent',
                }}
              />
            </div>
            <span className="line-clamp-2">{exam}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Modal
// ---------------------------------------------------------------------------

export interface CategorySearchModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectCategory: (categories: string[]) => void
}

export function CategorySearchModal({
  isOpen,
  onClose,
  onSelectCategory,
}: CategorySearchModalProps) {
  const [categorySearch, setCategorySearch] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('')
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [geoDetected, setGeoDetected] = useState(false)
  const [activeTab, setActiveTab] = useState('global')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [globalContentHeight, setGlobalContentHeight] = useState<number>(480)
  const globalContentRef = useRef<HTMLDivElement>(null)

  // Auto-detect user's country from IP on mount
  useEffect(() => {
    if (geoDetected || !isOpen) return
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then((data: { country?: string }) => {
        if (!data.country) return
        const code = data.country.toUpperCase()
        for (const region of REGIONS) {
          if (region.id === 'global') continue
          const found = region.countries.find(c => c.code === code)
          if (found) {
            setSelectedRegion(region.id)
            setSelectedCountries([code])
            setGeoDetected(true)
            break
          }
        }
      })
      .catch(() => {})
  }, [geoDetected, isOpen])

  // Badge bar scroll navigation
  const badgeScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const el = badgeScrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
  }, [])

  const scrollBadges = (amount: number) => {
    badgeScrollRef.current?.scrollBy({ left: amount, behavior: 'smooth' })
  }

  useEffect(() => {
    checkScroll()
    const el = badgeScrollRef.current
    if (!el) return
    el.addEventListener('scroll', checkScroll)
    window.addEventListener('resize', checkScroll)
    return () => {
      el.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [checkScroll, selectedCategories, selectedCountries])

  const TAB_COLORS: Record<string, { bg: string; text: string; close: string }> = {
    global: { bg: 'bg-[#0A84FF]', text: 'text-white', close: 'text-white/60 hover:text-white' },
    ap: { bg: 'bg-[#FF1493]', text: 'text-white', close: 'text-white/60 hover:text-white' },
    alevel: { bg: 'bg-[#BF5AF2]', text: 'text-white', close: 'text-white/60 hover:text-white' },
    ib: { bg: 'bg-[#32D74B]', text: 'text-white', close: 'text-white/60 hover:text-white' },
    igcse: { bg: 'bg-[#64D2FF]', text: 'text-white', close: 'text-white/60 hover:text-white' },
    national: { bg: 'bg-[#FF9F0A]', text: 'text-white', close: 'text-white/60 hover:text-white' },
    universities: {
      bg: 'bg-[#FF375F]',
      text: 'text-white',
      close: 'text-white/60 hover:text-white',
    },
    languages: { bg: 'bg-[#00C7BE]', text: 'text-white', close: 'text-white/60 hover:text-white' },
    professional: {
      bg: 'bg-[#FFD60A]',
      text: 'text-slate-900',
      close: 'text-slate-900/60 hover:text-slate-900',
    },
  }

  const UNIVERSITY_TO_COUNTRY = useMemo(() => {
    const map = new Map<string, string>()
    Object.entries(UNIVERSITIES_BY_COUNTRY_CODE).forEach(([code, universities]) => {
      const countryName = ALL_COUNTRIES.find(c => c.code === code)?.name || code
      universities.forEach((u: string) => map.set(u, countryName))
    })
    return map
  }, [])

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCategorySearch('')
      setSelectedRegion('')
      setSelectedCountries([])
      setActiveTab('global')
      setSelectedCategories([])
    }
  }, [isOpen])

  // Lock body scroll while modal is open
  useEffect(() => {
    if (isOpen) {
      const originalBodyOverflow = document.body.style.overflow
      const originalHtmlOverflow = document.documentElement.style.overflow
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalBodyOverflow
        document.documentElement.style.overflow = originalHtmlOverflow
      }
    }
  }, [isOpen])

  const toggleCategory = (exam: string) => {
    setSelectedCategories(prev =>
      prev.includes(exam) ? prev.filter(c => c !== exam) : [...prev, exam]
    )
  }

  const removeCategory = (exam: string) => {
    setSelectedCategories(prev => prev.filter(c => c !== exam))
  }

  const removeCountry = (code: string) => {
    setSelectedCountries(prev => prev.filter(c => c !== code))
  }

  const toggleCountry = (code: string) => {
    setSelectedCountries(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    )
  }

  const availableCountries = selectedRegion
    ? REGIONS.find(r => r.id === selectedRegion)?.countries || []
    : []

  const nationalExamsRaw =
    selectedCountries.length > 0
      ? selectedCountries.flatMap(code => NATIONAL_EXAMS_DATA[code] || [])
      : selectedRegion
        ? REGIONS.find(r => r.id === selectedRegion)?.countries.flatMap(c => c.nationalExams) || []
        : []

  const nationalExams = nationalExamsRaw.filter(
    (cat, idx, arr) => arr.findIndex(c => c.label === cat.label) === idx
  )

  const filteredUniversityCategories =
    selectedCountries.length > 0
      ? selectedCountries.flatMap(code =>
          UNIVERSITIES_BY_COUNTRY_CODE[code]
            ? [
                {
                  id: `universities-${code}`,
                  label: 'Universities',
                  exams: UNIVERSITIES_BY_COUNTRY_CODE[code],
                },
              ]
            : []
        )
      : selectedRegion
        ? UNIVERSITY_CATEGORIES.filter(u => u.id === `universities-${selectedRegion}`)
        : UNIVERSITY_CATEGORIES

  const examToTabKey = useMemo(() => {
    const map = new Map<string, string>()
    const add = (cats: ExamCategory[], key: string) =>
      cats.forEach(c => c.exams.forEach(e => map.set(e, key)))
    add(GLOBAL_EXAMS_CATEGORIES, 'global')
    add(AP_CATEGORIES, 'ap')
    add(A_LEVEL_CATEGORIES, 'alevel')
    add(IB_CATEGORIES, 'ib')
    add(IGCSE_CATEGORIES, 'igcse')
    add(LANGUAGE_CATEGORIES, 'languages')
    add(PROFESSIONAL_CATEGORIES, 'professional')
    add(nationalExams, 'national')
    add(filteredUniversityCategories, 'universities')
    return map
  }, [nationalExams, filteredUniversityCategories])

  const filterExams = (exams: string[]) =>
    categorySearch
      ? exams.filter(e => e.toLowerCase().includes(categorySearch.toLowerCase()))
      : exams

  const hasResults = (exams: string[]) => filterExams(exams).length > 0

  // Measure Global tab content height to establish container size for other tabs
  useLayoutEffect(() => {
    if (activeTab !== 'global') return
    if (globalContentRef.current) {
      setGlobalContentHeight(globalContentRef.current.scrollHeight + 48)
    }
  }, [activeTab, isOpen])

  const tabTriggerClass =
    'rounded-none border-b-2 border-transparent px-3 py-3 text-[16px] font-medium text-slate-500 data-[state=active]:border-white data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 data-[state=active]:shadow-none'

  if (!isOpen) return null

  return (
    <div className="animate-in fade-in fixed inset-0 z-[100] flex items-center justify-center p-4 duration-200">
      <div
        className="absolute inset-0 bg-transparent"
        onClick={onClose}
        onWheel={e => e.stopPropagation()}
        onTouchMove={e => e.stopPropagation()}
      />
      <div className="animate-in zoom-in-95 relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgba(31,41,51,0.60)] shadow-2xl backdrop-blur-xl duration-200">
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-slate-900/5 via-slate-900/10 to-slate-900/20" />
        <div className="relative z-10 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="relative shrink-0 px-6 pb-4 pt-4">
            <button
              onClick={onClose}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-all duration-150 hover:bg-white/10 hover:text-white focus:outline-none disabled:pointer-events-none"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="mb-1 text-2xl font-bold text-white">
              Search for a Tutor or Course by Category
            </h2>
            <p className="mb-3 text-sm text-white/70">
              Select a category to search for courses and tutors
            </p>

            {/* Selected category badges container + Search */}
            <div className="mb-1 flex items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <div
                  ref={badgeScrollRef}
                  className="scrollbar-hide flex h-10 min-w-0 items-center overflow-x-auto rounded-md border border-slate-200 bg-white px-6 py-1"
                >
                  <div className="flex min-w-0 flex-nowrap items-center gap-2">
                    {selectedCategories.length === 0 && (
                      <span className="select-none text-sm text-slate-400">
                        Select a category below
                      </span>
                    )}
                    {selectedCategories.flatMap(cat => {
                      const colors = TAB_COLORS[examToTabKey.get(cat) || ''] || {
                        bg: 'bg-blue-50',
                        text: 'text-[#0A84FF]',
                        close: 'text-[#0A84FF]/60 hover:text-[#0A84FF]',
                      }
                      if (selectedCountries.length === 0) {
                        return (
                          <span
                            key={cat}
                            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full ${colors.bg} px-3 py-1 text-xs font-medium ${colors.text}`}
                          >
                            {examToTabKey.get(cat) === 'universities'
                              ? `${cat} - ${UNIVERSITY_TO_COUNTRY.get(cat) || 'Global'}`
                              : `${cat} - Global`}
                            <button
                              onClick={() => removeCategory(cat)}
                              className={`ml-0.5 ${colors.close}`}
                              aria-label={`Remove ${cat}`}
                            >
                              ×
                            </button>
                          </span>
                        )
                      }
                      return selectedCountries.map(code => {
                        const countryName = ALL_COUNTRIES.find(c => c.code === code)?.name || code
                        return (
                          <span
                            key={`${cat}-${code}`}
                            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full ${colors.bg} px-3 py-1 text-xs font-medium ${colors.text}`}
                          >
                            {cat} - {countryName}
                            <button
                              onClick={() => removeCountry(code)}
                              className={`ml-0.5 ${colors.close}`}
                              aria-label={`Remove ${countryName}`}
                            >
                              ×
                            </button>
                          </span>
                        )
                      })
                    })}
                  </div>
                </div>
                <div
                  className={cn(
                    'mt-1 flex items-center justify-end gap-1',
                    canScrollLeft || canScrollRight ? 'visible' : 'invisible'
                  )}
                >
                  <button
                    onClick={() => scrollBadges(-200)}
                    disabled={!canScrollLeft}
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full transition-colors',
                      canScrollLeft ? 'bg-white/20 text-white hover:bg-white/30' : 'text-white/30'
                    )}
                    aria-label="Scroll left"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => scrollBadges(200)}
                    disabled={!canScrollRight}
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full transition-colors',
                      canScrollRight ? 'bg-white/20 text-white hover:bg-white/30' : 'text-white/30'
                    )}
                    aria-label="Scroll right"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <Button
                onClick={() => {
                  const countryNames = selectedCountries.map(
                    code => ALL_COUNTRIES.find(c => c.code === code)?.name || code
                  )
                  onSelectCategory([...selectedCategories, ...countryNames])
                }}
                disabled={selectedCategories.length === 0}
                className={`h-10 shrink-0 px-5 text-sm focus:outline-none focus-visible:!shadow-none ${
                  selectedCategories.length === 0
                    ? 'rounded-md border border-white bg-white/10 text-white shadow-md backdrop-blur-sm disabled:opacity-50'
                    : 'rounded-md border !border-white bg-blue-700 text-white hover:!border-blue-700 hover:bg-blue-600'
                }`}
              >
                Search
              </Button>
            </div>

            {/* Region & Country dropdowns */}
            <div className="flex flex-wrap gap-3">
              <Select
                value={selectedRegion}
                onValueChange={v => {
                  setSelectedRegion(v)
                  setSelectedCountries([])
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
                      className="mx-1.5 rounded-md text-white hover:bg-white/20"
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
                      {selectedCountries.length > 0
                        ? `${selectedCountries.length} countr${selectedCountries.length === 1 ? 'y' : 'ies'}`
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
                      <label
                        key={country.code}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-white hover:bg-white/20"
                        onClick={() => toggleCountry(country.code)}
                      >
                        <div
                          className={cn(
                            'h-4 w-4 rounded-full border-2 transition-colors',
                            selectedCountries.includes(country.code)
                              ? 'border-white bg-white'
                              : 'border-white/50 bg-transparent'
                          )}
                        />
                        <span>{country.name}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Tabs Content */}
          <div className="w-full pb-2 pl-6 pr-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div>
                <TabsList className="flex w-full flex-wrap justify-between bg-transparent p-0">
                  <TabsTrigger
                    value="global"
                    className={tabTriggerClass}
                    style={{ color: '#0A84FF' }}
                  >
                    <Globe className="mr-1.5 h-4 w-4" /> Global
                  </TabsTrigger>
                  <TabsTrigger value="ap" className={tabTriggerClass}>
                    <Award className="mr-1.5 h-4 w-4 text-[#FF1493]" />
                    <span className="bg-gradient-to-b from-[#FF69B4] via-[#FF1493] to-[#C71585] bg-clip-text font-semibold text-transparent">
                      AP
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="alevel"
                    className={tabTriggerClass}
                    style={{ color: '#BF5AF2' }}
                  >
                    <GraduationCap className="mr-1.5 h-4 w-4" /> A Level
                  </TabsTrigger>
                  <TabsTrigger value="ib" className={tabTriggerClass} style={{ color: '#32D74B' }}>
                    <BookOpen className="mr-1.5 h-4 w-4" /> IB
                  </TabsTrigger>
                  <TabsTrigger
                    value="igcse"
                    className={tabTriggerClass}
                    style={{ color: '#64D2FF' }}
                  >
                    <School className="mr-1.5 h-4 w-4" /> IGCSE
                  </TabsTrigger>
                  <TabsTrigger
                    value="national"
                    className={tabTriggerClass}
                    disabled={nationalExams.length === 0}
                    style={{ color: '#FF9F0A' }}
                  >
                    <Flag className="mr-1.5 h-4 w-4" /> National
                  </TabsTrigger>
                  <TabsTrigger
                    value="universities"
                    className={tabTriggerClass}
                    style={{ color: '#FF375F' }}
                  >
                    <GraduationCap className="mr-1.5 h-4 w-4" /> Universities
                  </TabsTrigger>
                  <TabsTrigger
                    value="languages"
                    className={tabTriggerClass}
                    style={{ color: '#00C7BE' }}
                  >
                    <Languages className="mr-1.5 h-4 w-4" /> Languages
                  </TabsTrigger>
                  <TabsTrigger
                    value="professional"
                    className={tabTriggerClass}
                    style={{ color: '#FFD60A' }}
                  >
                    <Award className="mr-1.5 h-4 w-4" /> Professional
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Search */}
              <div className="relative z-10 pb-2 pt-[15px]">
                <div className="relative mx-auto max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search categories..."
                    value={categorySearch}
                    onChange={e => setCategorySearch(e.target.value)}
                    className="h-[34px] border-slate-200 bg-white pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:border-slate-300 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
              </div>

              <div
                className={cn(
                  'scrollbar-no-arrows overscroll-contain border-t border-white/10 pb-4 pt-2',
                  activeTab === 'global' ? 'overflow-hidden' : 'overflow-y-auto'
                )}
                style={{ height: globalContentHeight, maxHeight: globalContentHeight }}
              >
                {!categorySearch ? (
                  <>
                    <TabsContent value="global" className="mt-0 space-y-8">
                      <div ref={globalContentRef} className="space-y-8">
                        {GLOBAL_EXAMS_CATEGORIES.map(cat => (
                          <CategorySection
                            key={cat.id}
                            label={cat.label}
                            icon={Globe}
                            exams={cat.exams}
                            categorySearch={categorySearch}
                            selectedCategories={selectedCategories}
                            onToggleCategory={toggleCategory}
                            color="#0A84FF"
                          />
                        ))}
                        {!GLOBAL_EXAMS_CATEGORIES.some(cat => hasResults(cat.exams)) && (
                          <EmptyState
                            search={categorySearch}
                            fallbackText="No categories available."
                          />
                        )}
                      </div>
                    </TabsContent>
                    <TabsContent value="ap" className="mt-0 space-y-8">
                      {AP_CATEGORIES.map(cat => (
                        <CategorySection
                          key={cat.id}
                          label={cat.label}
                          icon={Award}
                          exams={cat.exams}
                          categorySearch={categorySearch}
                          selectedCategories={selectedCategories}
                          onToggleCategory={toggleCategory}
                          color="#FF1493"
                        />
                      ))}
                      {!AP_CATEGORIES.some(cat => hasResults(cat.exams)) && (
                        <EmptyState
                          search={categorySearch}
                          fallbackText="No categories available."
                        />
                      )}
                    </TabsContent>
                    <TabsContent value="alevel" className="mt-0 space-y-8">
                      {A_LEVEL_CATEGORIES.map(cat => (
                        <CategorySection
                          key={cat.id}
                          label={cat.label}
                          icon={GraduationCap}
                          exams={cat.exams}
                          categorySearch={categorySearch}
                          selectedCategories={selectedCategories}
                          onToggleCategory={toggleCategory}
                          color="#BF5AF2"
                        />
                      ))}
                      {!A_LEVEL_CATEGORIES.some(cat => hasResults(cat.exams)) && (
                        <EmptyState
                          search={categorySearch}
                          fallbackText="No categories available."
                        />
                      )}
                    </TabsContent>
                    <TabsContent value="ib" className="mt-0 space-y-8">
                      {IB_CATEGORIES.map(cat => (
                        <CategorySection
                          key={cat.id}
                          label={cat.label}
                          icon={BookOpen}
                          exams={cat.exams}
                          categorySearch={categorySearch}
                          selectedCategories={selectedCategories}
                          onToggleCategory={toggleCategory}
                          color="#32D74B"
                        />
                      ))}
                      {!IB_CATEGORIES.some(cat => hasResults(cat.exams)) && (
                        <EmptyState
                          search={categorySearch}
                          fallbackText="No categories available."
                        />
                      )}
                    </TabsContent>
                    <TabsContent value="igcse" className="mt-0 space-y-8">
                      {IGCSE_CATEGORIES.map(cat => (
                        <CategorySection
                          key={cat.id}
                          label={cat.label}
                          icon={School}
                          exams={cat.exams}
                          categorySearch={categorySearch}
                          selectedCategories={selectedCategories}
                          onToggleCategory={toggleCategory}
                          color="#64D2FF"
                        />
                      ))}
                      {!IGCSE_CATEGORIES.some(cat => hasResults(cat.exams)) && (
                        <EmptyState
                          search={categorySearch}
                          fallbackText="No categories available."
                        />
                      )}
                    </TabsContent>
                    <TabsContent value="national" className="mt-0 space-y-8">
                      {nationalExams.map(cat => (
                        <CategorySection
                          key={cat.id}
                          label={cat.label}
                          icon={Flag}
                          exams={cat.exams}
                          categorySearch={categorySearch}
                          selectedCategories={selectedCategories}
                          onToggleCategory={toggleCategory}
                          color="#FF9F0A"
                        />
                      ))}
                      {nationalExams.length === 0 && (
                        <div className="py-12 text-center text-slate-500">
                          <Flag className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                          <p className="text-sm">
                            Select a region or country to see national exams.
                          </p>
                        </div>
                      )}
                      {nationalExams.length > 0 &&
                        !nationalExams.some(cat => hasResults(cat.exams)) && (
                          <EmptyState
                            search={categorySearch}
                            fallbackText="No categories available."
                          />
                        )}
                    </TabsContent>
                    <TabsContent value="universities" className="mt-0 space-y-8">
                      {filteredUniversityCategories.length === 0 && (
                        <div className="py-12 text-center text-slate-500">
                          <GraduationCap className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                          <p className="text-sm">Select a country to see universities</p>
                        </div>
                      )}
                      {filteredUniversityCategories.map(cat => (
                        <CategorySection
                          key={cat.id}
                          label={cat.label}
                          icon={GraduationCap}
                          exams={cat.exams}
                          categorySearch={categorySearch}
                          selectedCategories={selectedCategories}
                          onToggleCategory={toggleCategory}
                          color="#FF375F"
                        />
                      ))}
                      {filteredUniversityCategories.length > 0 &&
                        !filteredUniversityCategories.some(cat => hasResults(cat.exams)) && (
                          <EmptyState
                            search={categorySearch}
                            fallbackText="No categories available."
                          />
                        )}
                    </TabsContent>
                    <TabsContent value="languages" className="mt-0 space-y-8">
                      {LANGUAGE_CATEGORIES.map(cat => (
                        <CategorySection
                          key={cat.id}
                          label={cat.label}
                          icon={Languages}
                          exams={cat.exams}
                          categorySearch={categorySearch}
                          selectedCategories={selectedCategories}
                          onToggleCategory={toggleCategory}
                          color="#00C7BE"
                        />
                      ))}
                      {!LANGUAGE_CATEGORIES.some(cat => hasResults(cat.exams)) && (
                        <EmptyState
                          search={categorySearch}
                          fallbackText="No categories available."
                        />
                      )}
                    </TabsContent>
                    <TabsContent value="professional" className="mt-0 space-y-8">
                      {PROFESSIONAL_CATEGORIES.map(cat => (
                        <CategorySection
                          key={cat.id}
                          label={cat.label}
                          icon={Award}
                          exams={cat.exams}
                          categorySearch={categorySearch}
                          selectedCategories={selectedCategories}
                          onToggleCategory={toggleCategory}
                          color="#FFD60A"
                        />
                      ))}
                      {!PROFESSIONAL_CATEGORIES.some(cat => hasResults(cat.exams)) && (
                        <EmptyState
                          search={categorySearch}
                          fallbackText="No categories available."
                        />
                      )}
                    </TabsContent>
                  </>
                ) : (
                  <div className="space-y-8">
                    {GLOBAL_EXAMS_CATEGORIES.filter(cat => hasResults(cat.exams)).map(cat => (
                      <CategorySection
                        key={cat.id}
                        label={cat.label}
                        icon={Globe}
                        exams={cat.exams}
                        categorySearch={categorySearch}
                        selectedCategories={selectedCategories}
                        onToggleCategory={toggleCategory}
                        color="#0A84FF"
                      />
                    ))}
                    {AP_CATEGORIES.filter(cat => hasResults(cat.exams)).map(cat => (
                      <CategorySection
                        key={cat.id}
                        label={cat.label}
                        icon={Award}
                        exams={cat.exams}
                        categorySearch={categorySearch}
                        selectedCategories={selectedCategories}
                        onToggleCategory={toggleCategory}
                        color="#FF1493"
                      />
                    ))}
                    {A_LEVEL_CATEGORIES.filter(cat => hasResults(cat.exams)).map(cat => (
                      <CategorySection
                        key={cat.id}
                        label={cat.label}
                        icon={GraduationCap}
                        exams={cat.exams}
                        categorySearch={categorySearch}
                        selectedCategories={selectedCategories}
                        onToggleCategory={toggleCategory}
                        color="#BF5AF2"
                      />
                    ))}
                    {IB_CATEGORIES.filter(cat => hasResults(cat.exams)).map(cat => (
                      <CategorySection
                        key={cat.id}
                        label={cat.label}
                        icon={BookOpen}
                        exams={cat.exams}
                        categorySearch={categorySearch}
                        selectedCategories={selectedCategories}
                        onToggleCategory={toggleCategory}
                        color="#32D74B"
                      />
                    ))}
                    {IGCSE_CATEGORIES.filter(cat => hasResults(cat.exams)).map(cat => (
                      <CategorySection
                        key={cat.id}
                        label={cat.label}
                        icon={School}
                        exams={cat.exams}
                        categorySearch={categorySearch}
                        selectedCategories={selectedCategories}
                        onToggleCategory={toggleCategory}
                        color="#64D2FF"
                      />
                    ))}
                    {nationalExams
                      .filter(cat => hasResults(cat.exams))
                      .map(cat => (
                        <CategorySection
                          key={cat.id}
                          label={cat.label}
                          icon={Flag}
                          exams={cat.exams}
                          categorySearch={categorySearch}
                          selectedCategories={selectedCategories}
                          onToggleCategory={toggleCategory}
                          color="#FF9F0A"
                        />
                      ))}
                    {filteredUniversityCategories
                      .filter(cat => hasResults(cat.exams))
                      .map(cat => (
                        <CategorySection
                          key={cat.id}
                          label={cat.label}
                          icon={GraduationCap}
                          exams={cat.exams}
                          categorySearch={categorySearch}
                          selectedCategories={selectedCategories}
                          onToggleCategory={toggleCategory}
                          color="#FF375F"
                        />
                      ))}
                    {LANGUAGE_CATEGORIES.filter(cat => hasResults(cat.exams)).map(cat => (
                      <CategorySection
                        key={cat.id}
                        label={cat.label}
                        icon={Languages}
                        exams={cat.exams}
                        categorySearch={categorySearch}
                        selectedCategories={selectedCategories}
                        onToggleCategory={toggleCategory}
                        color="#00C7BE"
                      />
                    ))}
                    {PROFESSIONAL_CATEGORIES.filter(cat => hasResults(cat.exams)).map(cat => (
                      <CategorySection
                        key={cat.id}
                        label={cat.label}
                        icon={Award}
                        exams={cat.exams}
                        categorySearch={categorySearch}
                        selectedCategories={selectedCategories}
                        onToggleCategory={toggleCategory}
                        color="#8E8E93"
                      />
                    ))}
                    {![
                      GLOBAL_EXAMS_CATEGORIES,
                      AP_CATEGORIES,
                      A_LEVEL_CATEGORIES,
                      IB_CATEGORIES,
                      IGCSE_CATEGORIES,
                      nationalExams,
                      filteredUniversityCategories,
                      LANGUAGE_CATEGORIES,
                      PROFESSIONAL_CATEGORIES,
                    ].some(group => group.some(cat => hasResults(cat.exams))) && (
                      <EmptyState search={categorySearch} fallbackText="No categories available." />
                    )}
                  </div>
                )}
              </div>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  )
}
