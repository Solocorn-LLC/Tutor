'use client'

import { useState, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  REGIONS,
  GLOBAL_EXAM_CATEGORIES,
  OTHER_COUNTRY,
  type ExamCategory,
  getCategoriesForCountry,
} from '@/lib/tutoring/categories-new'
import { Globe, MapPin, BookOpen, GraduationCap, Check } from 'lucide-react'

interface CategorySelectorProps {
  selectedCountry: string | null
  selectedCategories: string[]
  onCountryChange: (countryCode: string | null) => void
  onCategoriesChange: (categories: string[]) => void
  className?: string
  maxHeight?: string
}

export function CategorySelector({
  selectedCountry,
  selectedCategories,
  onCountryChange,
  onCategoriesChange,
  className,
  maxHeight = '400px',
}: CategorySelectorProps) {
  const [examType, setExamType] = useState<'global' | 'national'>('global')
  const [selectedRegion, setSelectedRegion] = useState<string>('')

  // Get available countries based on region selection
  const availableCountries = useMemo(() => {
    if (!selectedRegion) return []
    const region = REGIONS.find(r => r.id === selectedRegion)
    return region ? [...region.countries, OTHER_COUNTRY] : [OTHER_COUNTRY]
  }, [selectedRegion])

  // Get categories for selected country
  const { global: globalCategories, national: nationalCategories } = useMemo(() => {
    return getCategoriesForCountry(selectedCountry)
  }, [selectedCountry])

  // Handle region change
  const handleRegionChange = (regionId: string) => {
    setSelectedRegion(regionId)
    onCountryChange(null)
  }

  // Handle country change
  const handleCountryChange = (countryCode: string) => {
    onCountryChange(countryCode)
  }

  // Handle exam type change
  const handleExamTypeChange = (type: 'global' | 'national') => {
    setExamType(type)
    if (type === 'global') {
      // Clear country selection when switching to global
      onCountryChange(null)
      setSelectedRegion('')
    }
  }

  // Toggle category selection
  const toggleCategory = (category: string) => {
    const newCategories = selectedCategories.includes(category)
      ? selectedCategories.filter(c => c !== category)
      : [...selectedCategories, category]
    onCategoriesChange(newCategories)
  }

  // Select all in category
  const selectAllInCategory = (exams: string[]) => {
    const newCategories = [...selectedCategories]
    exams.forEach(exam => {
      if (!newCategories.includes(exam)) {
        newCategories.push(exam)
      }
    })
    onCategoriesChange(newCategories)
  }

  // Clear all in category
  const clearAllInCategory = (exams: string[]) => {
    const newCategories = selectedCategories.filter(c => !exams.includes(c))
    onCategoriesChange(newCategories)
  }

  return (
    <div
      className={cn('w-full overflow-hidden rounded-lg border border-gray-200 bg-white', className)}
    >
      {/* Header with Exam Type Selection */}
      <div className="space-y-4 border-b border-gray-200 bg-gray-50 p-4">
        {/* Exam Type Selection - First Step */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">Exam Type</Label>
          <div className="flex gap-3">
            <Button
              type="button"
              variant={examType === 'global' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleExamTypeChange('global')}
              className={cn('flex-1', examType === 'global' && 'bg-[#1D4ED8] hover:bg-[#1e40af]')}
            >
              <Globe className="mr-2 h-4 w-4" />
              Global Exams
            </Button>
            <Button
              type="button"
              variant={examType === 'national' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleExamTypeChange('national')}
              className={cn('flex-1', examType === 'national' && 'bg-[#F17623] hover:bg-[#e06613]')}
            >
              <MapPin className="mr-2 h-4 w-4" />
              National Exams
            </Button>
          </div>
        </div>

        {/* National Exam Selection - Region and Country Dropdowns */}
        {examType === 'national' && (
          <div className="space-y-3 border-t border-gray-200 pt-3">
            <Label className="text-sm font-medium text-gray-700">Location Selection</Label>

            {/* Region Dropdown */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs text-gray-500">
                <Globe className="h-3.5 w-3.5 text-[#1D4ED8]" />
                Region
              </Label>
              <Select value={selectedRegion} onValueChange={handleRegionChange}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Select a region" />
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

            {/* Country Dropdown */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs text-gray-500">
                <MapPin className="h-3.5 w-3.5 text-[#F17623]" />
                Country
              </Label>
              <Select
                value={selectedCountry || ''}
                onValueChange={handleCountryChange}
                disabled={!selectedRegion}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue
                    placeholder={selectedRegion ? 'Select a country' : 'Select region first'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableCountries.map(country => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Selected Categories Summary */}
        {selectedCategories.length > 0 && (
          <div className="flex items-center gap-2 border-t pt-2">
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-sm text-gray-600">
              {selectedCategories.length} categor{selectedCategories.length === 1 ? 'y' : 'ies'}{' '}
              selected
            </span>
          </div>
        )}
      </div>

      {/* Categories Display */}
      {examType === 'global' ? (
        /* Global Exams Display */
        <div className="m-0">
          <div className="flex items-center gap-2 border-b bg-gray-50/50 px-4 py-3">
            <Globe className="h-4 w-4 text-[#1D4ED8]" />
            <span className="font-medium text-gray-700">Global Exams</span>
            <Badge variant="secondary" className="ml-auto text-xs">
              {globalCategories.reduce((acc, cat) => acc + cat.exams.length, 0)} exams
            </Badge>
          </div>
          <ScrollArea className="h-[400px]" style={{ maxHeight }}>
            <div className="space-y-6 p-4">
              {globalCategories.map(category => (
                <ExamCategorySection
                  key={category.id}
                  category={category}
                  selectedCategories={selectedCategories}
                  onToggle={toggleCategory}
                  onSelectAll={() => selectAllInCategory(category.exams)}
                  onClearAll={() => clearAllInCategory(category.exams)}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      ) : (
        /* National Exams Display */
        <div className="m-0">
          <div className="flex items-center gap-2 border-b bg-gray-50/50 px-4 py-3">
            <GraduationCap className="h-4 w-4 text-[#F17623]" />
            <span className="font-medium text-gray-700">National Exams</span>
            {selectedCountry && selectedCountry !== 'OTHER' && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {nationalCategories.reduce((acc, cat) => acc + cat.exams.length, 0)} exams
              </Badge>
            )}
          </div>
          <ScrollArea className="h-[400px]" style={{ maxHeight }}>
            <div className="space-y-6 p-4">
              {!selectedCountry || selectedCountry === 'OTHER' ? (
                <div className="py-8 text-center text-gray-500">
                  <MapPin className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                  <p>
                    {selectedCountry === 'OTHER'
                      ? 'Please select a specific country to view national exams.'
                      : 'Please select a region and country to view national exams.'}
                  </p>
                </div>
              ) : nationalCategories.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <GraduationCap className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                  <p>No national exams available for the selected country.</p>
                </div>
              ) : (
                nationalCategories.map(category => (
                  <ExamCategorySection
                    key={category.id}
                    category={category}
                    selectedCategories={selectedCategories}
                    onToggle={toggleCategory}
                    onSelectAll={() => selectAllInCategory(category.exams)}
                    onClearAll={() => clearAllInCategory(category.exams)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

// Exam Category Section Component
interface ExamCategorySectionProps {
  category: ExamCategory
  selectedCategories: string[]
  onToggle: (exam: string) => void
  onSelectAll: () => void
  onClearAll: () => void
}

function ExamCategorySection({
  category,
  selectedCategories,
  onToggle,
  onSelectAll,
  onClearAll,
}: ExamCategorySectionProps) {
  const selectedCount = category.exams.filter(exam => selectedCategories.includes(exam)).length
  const isFullySelected = selectedCount === category.exams.length && category.exams.length > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-[#1D4ED8]" />
          <h4 className="font-semibold text-gray-900">{category.label}</h4>
          {selectedCount > 0 && (
            <Badge variant="secondary" className="bg-[#1D4ED8]/20 text-xs text-[#1F2933]">
              {selectedCount}/{category.exams.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSelectAll}
            className="h-7 text-xs text-[#1D4ED8] hover:text-[#1e40af]"
          >
            All
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-7 text-xs text-gray-500 hover:text-gray-700"
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {category.exams.map(exam => (
          <label
            key={exam}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-md p-2 transition-colors',
              selectedCategories.includes(exam)
                ? 'border border-[#1D4ED8]/30 bg-[#1D4ED8]/10'
                : 'border border-transparent hover:bg-gray-50'
            )}
          >
            <Checkbox
              checked={selectedCategories.includes(exam)}
              onCheckedChange={() => onToggle(exam)}
            />
            <span
              className={cn(
                'text-sm',
                selectedCategories.includes(exam) ? 'font-medium text-[#1F2933]' : 'text-gray-700'
              )}
            >
              {exam}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

export default CategorySelector
