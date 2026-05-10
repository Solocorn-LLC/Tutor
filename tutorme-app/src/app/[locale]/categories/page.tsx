'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen,
  ArrowLeft,
  Search,
  Globe,
  MapPin,
  GraduationCap,
  Check,
  X,
  ChevronRight,
  School,
  Award,
  Flag,
  Plus,
  Sparkles,
  CheckCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

import {
  REGIONS,
  GLOBAL_EXAMS_CATEGORIES,
  AP_CATEGORIES,
  A_LEVEL_CATEGORIES,
  IB_CATEGORIES,
  IGCSE_CATEGORIES,
  type ExamCategory,
} from '@/lib/data/tutor-categories'

export default function CategoriesPage() {
  const [selectedRegion, setSelectedRegion] = useState<string>('')
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState('global')
  const [searchQuery, setSearchQuery] = useState('')
  const [customCategory, setCustomCategory] = useState('')
  const [tutorModalOpen, setTutorModalOpen] = useState(false)

  // Get countries for selected region
  const availableCountries = useMemo(() => {
    if (!selectedRegion) return []
    const region = REGIONS.find(r => r.id === selectedRegion)
    return region ? region.countries : []
  }, [selectedRegion])

  // Get selected country
  const selectedCountry = useMemo(() => {
    if (!selectedCountryCode) return null
    return availableCountries.find(c => c.code === selectedCountryCode)
  }, [selectedCountryCode, availableCountries])

  // Get national exams for selected country
  const nationalExams = useMemo(() => {
    return selectedCountry?.nationalExams || []
  }, [selectedCountry])

  // Toggle category selection
  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    )
  }

  // Select all in category
  const selectAllInCategory = (exams: string[]) => {
    setSelectedCategories(prev => {
      const newCategories = [...prev]
      exams.forEach(exam => {
        if (!newCategories.includes(exam)) {
          newCategories.push(exam)
        }
      })
      return newCategories
    })
  }

  // Clear all in category
  const clearAllInCategory = (exams: string[]) => {
    setSelectedCategories(prev => prev.filter(c => !exams.includes(c)))
  }

  // Remove single category
  const removeCategory = (category: string) => {
    setSelectedCategories(prev => prev.filter(c => c !== category))
  }

  // Clear all selections
  const clearAllSelections = () => {
    setSelectedCategories([])
  }

  // Add custom category
  const addCustomCategory = () => {
    if (customCategory.trim() && !selectedCategories.includes(customCategory.trim())) {
      setSelectedCategories(prev => [...prev, customCategory.trim()])
      setCustomCategory('')
    }
  }

  // Filter exams based on search
  const filterExams = (exams: string[]) => {
    if (!searchQuery) return exams
    return exams.filter(e => e.toLowerCase().includes(searchQuery.toLowerCase()))
  }

  // Render category section
  const renderCategorySection = (category: ExamCategory) => {
    const filteredExams = filterExams(category.exams)
    if (filteredExams.length === 0) return null

    const selectedCount = filteredExams.filter(exam => selectedCategories.includes(exam)).length

    return (
      <div key={category.id} className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#1D4ED8]" />
            <h4 className="font-semibold text-gray-900">{category.label}</h4>
            {selectedCount > 0 && (
              <Badge variant="secondary" className="bg-[#1D4ED8]/20 text-xs text-[#1F2933]">
                {selectedCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => selectAllInCategory(category.exams)}
              className="h-7 text-xs text-[#1D4ED8] hover:text-[#1e40af]"
            >
              All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearAllInCategory(category.exams)}
              className="h-7 text-xs text-gray-500 hover:text-gray-700"
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {filteredExams.map(exam => (
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
                onCheckedChange={() => toggleCategory(exam)}
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - Full Width */}
      <header className="bg-[#1F2933] py-6 text-white">
        <div className="mx-auto max-w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-white hover:text-gray-300">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Home
                </Button>
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-[#1D4ED8]" />
              <span className="text-xl font-bold text-[#1F2933]">
                Select your region and exam categories
              </span>
            </div>
            <div className="w-32" />
          </div>
        </div>
      </header>

      {/* Main Content - Full Width */}
      <main className="mx-auto max-w-full px-4 py-8 sm:px-6 lg:px-8">
        {/* Introduction */}
        <div className="mb-8 text-center">
          <p className="mx-auto max-w-2xl text-gray-600">
            Select your region and country to see relevant exams. All categories will be assigned to
            your selected country.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          {/* Left Column - Region, Country, Tabs & Custom Category */}
          <div className="space-y-6 lg:col-span-3">
            {/* Region & Country Dropdowns */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {/* Region Dropdown */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <Globe className="h-4 w-4 text-[#1D4ED8]" />
                      Region
                    </Label>
                    <Select
                      value={selectedRegion}
                      onValueChange={value => {
                        setSelectedRegion(value)
                        setSelectedCountryCode('')
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Region" />
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
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <MapPin className="h-4 w-4 text-[#F17623]" />
                      Country
                    </Label>
                    <Select
                      value={selectedCountryCode}
                      onValueChange={setSelectedCountryCode}
                      disabled={!selectedRegion}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={selectedRegion ? 'Select Country' : 'Select Region first'}
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

                {/* Selected Count */}
                {selectedCategories.length > 0 && (
                  <div className="mt-4 flex items-center gap-2 border-t pt-4">
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-gray-600">
                      {selectedCategories.length} categor
                      {selectedCategories.length === 1 ? 'y' : 'ies'} selected
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Categories Tabs - Fixed Height Container */}
            <Card className="flex h-[500px] flex-col">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
                <CardHeader className="pb-0">
                  <TabsList className="grid w-full grid-cols-6">
                    <TabsTrigger value="global" className="text-xs md:text-sm">
                      <Globe className="mr-1 h-3 w-3 md:mr-2 md:h-4 md:w-4" />
                      Global
                    </TabsTrigger>
                    <TabsTrigger value="ap" className="text-xs md:text-sm">
                      <Award className="mr-1 h-3 w-3 md:mr-2 md:h-4 md:w-4" />
                      AP
                    </TabsTrigger>
                    <TabsTrigger value="alevel" className="text-xs md:text-sm">
                      <GraduationCap className="mr-1 h-3 w-3 md:mr-2 md:h-4 md:w-4" />A Level
                    </TabsTrigger>
                    <TabsTrigger value="ib" className="text-xs md:text-sm">
                      <BookOpen className="mr-1 h-3 w-3 md:mr-2 md:h-4 md:w-4" />
                      IB
                    </TabsTrigger>
                    <TabsTrigger value="igcse" className="text-xs md:text-sm">
                      <School className="mr-1 h-3 w-3 md:mr-2 md:h-4 md:w-4" />
                      IGCSE
                    </TabsTrigger>
                    <TabsTrigger
                      value="national"
                      className="text-xs md:text-sm"
                      disabled={!selectedCountryCode || nationalExams.length === 0}
                    >
                      <Flag className="mr-1 h-3 w-3 md:mr-2 md:h-4 md:w-4" />
                      National
                    </TabsTrigger>
                  </TabsList>
                </CardHeader>

                <CardContent className="flex-1 overflow-hidden pt-6">
                  {/* Search Bar */}
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="Search categories..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {/* Tab Contents */}
                  <div className="h-[calc(100%-60px)]">
                    {/* Global Exams Tab */}
                    <TabsContent value="global" className="m-0 h-full">
                      <ScrollArea className="h-full pr-4">
                        <div className="space-y-6 pb-4">
                          {GLOBAL_EXAMS_CATEGORIES.map(renderCategorySection)}
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    {/* AP Tab */}
                    <TabsContent value="ap" className="m-0 h-full">
                      <ScrollArea className="h-full pr-4">
                        <div className="space-y-6 pb-4">
                          {AP_CATEGORIES.map(renderCategorySection)}
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    {/* A Level Tab */}
                    <TabsContent value="alevel" className="m-0 h-full">
                      <ScrollArea className="h-full pr-4">
                        <div className="space-y-6 pb-4">
                          {A_LEVEL_CATEGORIES.map(renderCategorySection)}
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    {/* IB Tab */}
                    <TabsContent value="ib" className="m-0 h-full">
                      <ScrollArea className="h-full pr-4">
                        <div className="space-y-6 pb-4">
                          {IB_CATEGORIES.map(renderCategorySection)}
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    {/* IGCSE Tab */}
                    <TabsContent value="igcse" className="m-0 h-full">
                      <ScrollArea className="h-full pr-4">
                        <div className="space-y-6 pb-4">
                          {IGCSE_CATEGORIES.map(renderCategorySection)}
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    {/* National Tab */}
                    <TabsContent value="national" className="m-0 h-full">
                      <ScrollArea className="h-full pr-4">
                        <div className="space-y-6 pb-4">
                          {!selectedCountryCode ? (
                            <div className="py-12 text-center text-gray-500">
                              <Flag className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                              <p>Please select a country to view national exams.</p>
                            </div>
                          ) : nationalExams.length === 0 ? (
                            <div className="py-12 text-center text-gray-500">
                              <Flag className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                              <p>No national exams available for {selectedCountry?.name}.</p>
                            </div>
                          ) : (
                            nationalExams.map(renderCategorySection)
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  </div>
                </CardContent>
              </Tabs>
            </Card>

            {/* Your Own Category Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Plus className="h-5 w-5 text-[#1D4ED8]" />
                  Your Own Category
                </CardTitle>
                <CardDescription>
                  Add a custom category if you don't see what you're looking for
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter your own category..."
                    value={customCategory}
                    onChange={e => setCustomCategory(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        addCustomCategory()
                      }
                    }}
                  />
                  <Button onClick={addCustomCategory} disabled={!customCategory.trim()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Selected Categories Sidebar (Shorter) & CTA */}
          <div className="space-y-6">
            {/* Selected Card - Shorter */}
            <Card className="flex h-[300px] flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1D4ED8] text-xs text-white">
                    {selectedCategories.length}
                  </span>
                  Selected
                </CardTitle>
                <CardDescription>
                  {selectedCategories.length === 0
                    ? 'No categories selected'
                    : `${selectedCategories.length} selected`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden">
                <ScrollArea className="h-full pr-2">
                  <div className="flex flex-wrap gap-2">
                    {selectedCategories.map(cat => (
                      <Badge
                        key={cat}
                        variant="secondary"
                        className="cursor-pointer bg-[#1D4ED8]/20 pr-1 text-[#1F2933] hover:bg-[#1D4ED8]/30"
                      >
                        {cat}
                        <button
                          onClick={() => removeCategory(cat)}
                          className="ml-1 rounded-full p-0.5 hover:bg-red-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
              {selectedCategories.length > 0 && (
                <CardContent className="pt-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAllSelections}
                    className="w-full"
                  >
                    Clear All
                  </Button>
                </CardContent>
              )}
            </Card>

            {/* CTA - Now aligned with Your Own Category */}
            <Card className="border-[#1D4ED8]/30 bg-gradient-to-br from-[#60A5FA]/10 to-[#1D4ED8]/10">
              <CardContent className="pt-6">
                <p className="mb-4 text-sm text-gray-600">
                  Create an account and start sharing your expertise.
                </p>
                <Button
                  className="w-full bg-[#F17623] hover:bg-[#e06613]"
                  onClick={() => setTutorModalOpen(true)}
                >
                  Become a Tutor
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Coming Soon Modal */}
      <TutorComingSoonModal isOpen={tutorModalOpen} onClose={() => setTutorModalOpen(false)} />
    </div>
  )
}

// Coming Soon Modal Component for Tutor Application
const TutorComingSoonModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    about: '',
    socialMedia: '',
  })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'tutor',
          ...formData,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setSubmitted(true)
      } else {
        setError(data.error || 'Failed to submit. Please try again.')
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative w-full max-w-md rounded-2xl border border-black/10 bg-white/90 p-8 shadow-2xl backdrop-blur-xl"
          >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-2 text-zinc-600 transition-colors hover:text-black"
          >
            <X className="h-5 w-5" />
          </button>

          {!submitted ? (
            <>
              <div className="mb-6 text-center">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                  <Sparkles className="h-3 w-3" />
                  Coming Soon
                </div>
                <h3 className="mb-2 text-xl font-bold text-zinc-900">Apply to Become a Tutor</h3>
                <p className="text-sm text-zinc-600">
                  We&apos;re preparing an amazing platform for tutors. Pre-register now and
                  we&apos;ll notify you when we launch!
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  type="text"
                  placeholder="Name"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full border border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500"
                />
                <Input
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="w-full border border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500"
                />
                <textarea
                  placeholder="Tell us about your tutoring experience (500 characters max)"
                  value={formData.about}
                  onChange={e => setFormData({ ...formData, about: e.target.value.slice(0, 500) })}
                  required
                  rows={3}
                  className="w-full resize-none rounded-lg border border-black/10 bg-black/5 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500"
                />
                <Input
                  type="text"
                  placeholder="Social media (optional)"
                  value={formData.socialMedia}
                  onChange={e => setFormData({ ...formData, socialMedia: e.target.value })}
                  className="w-full border border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-500"
                />
                {error && <p className="text-center text-sm text-red-500">{error}</p>}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-emerald-500 py-3 font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Submitting...' : 'Confirm'}
                </Button>
              </form>
            </>
          ) : (
            <div className="py-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-zinc-900">Thank You!</h3>
              <p className="text-zinc-600">
                We&apos;ve received your application. We&apos;ll be in touch soon!
              </p>
              <Button
                onClick={onClose}
                className="mt-6 bg-black/10 text-zinc-900 hover:bg-black/20"
              >
                Close
              </Button>
            </div>
          )}
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  )
}
