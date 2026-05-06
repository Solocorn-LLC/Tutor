'use client'

import { useState, useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2,
  CheckCircle,
  DollarSign,
  Globe,
  MapPin,
  BookOpen,
  Award,
  GraduationCap,
  School,
  Flag,
  X,
  Search,
  Plus,
  ArrowLeft,
  ChevronRight,
  Check,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

import {
  REGIONS,
  GLOBAL_EXAMS_CATEGORIES,
  AP_CATEGORIES,
  A_LEVEL_CATEGORIES,
  IB_CATEGORIES,
  IGCSE_CATEGORIES,
  type ExamCategory,
  type CountryData,
} from '@/lib/data/tutor-categories'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const TIME_SLOTS = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
]

export default function TutorOnboarding() {
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [completed, setCompleted] = useState(false)

  // Step 1: Profile
  const [bio, setBio] = useState('')
  const [credentials, setCredentials] = useState('')

  // Step 2: Regions, Countries & Categories
  const [selectedRegions, setSelectedRegions] = useState<string[]>([])
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState('global')
  const [searchQuery, setSearchQuery] = useState('')
  const [customCategory, setCustomCategory] = useState('')

  // Step 3: Availability
  const [availability, setAvailability] = useState<Record<string, string[]>>({})

  // Step 4: Hourly Rate
  const [hourlyRate, setHourlyRate] = useState('')

  // Get countries for selected regions
  const availableCountries = useMemo(() => {
    if (selectedRegions.length === 0) return []
    const countries: CountryData[] = []
    selectedRegions.forEach(regionId => {
      const region = REGIONS.find(r => r.id === regionId)
      if (region) {
        countries.push(...region.countries)
      }
    })
    return countries
  }, [selectedRegions])

  // Get national exams for selected countries
  const nationalExams = useMemo(() => {
    if (selectedCountries.length === 0) return []
    const exams: ExamCategory[] = []
    selectedCountries.forEach(countryCode => {
      const country = availableCountries.find(c => c.code === countryCode)
      if (country && country.nationalExams.length > 0) {
        exams.push(...country.nationalExams)
      }
    })
    return exams
  }, [selectedCountries, availableCountries])

  // Toggle region selection
  const toggleRegion = (regionId: string) => {
    setSelectedRegions(prev => {
      const newRegions = prev.includes(regionId)
        ? prev.filter(r => r !== regionId)
        : [...prev, regionId]

      // Remove countries from unselected regions
      if (prev.includes(regionId)) {
        const region = REGIONS.find(r => r.id === regionId)
        if (region) {
          const countryCodes = region.countries.map(c => c.code)
          setSelectedCountries(prevCountries =>
            prevCountries.filter(c => !countryCodes.includes(c))
          )
        }
      }
      return newRegions
    })
  }

  // Toggle country selection
  const toggleCountry = (countryCode: string) => {
    setSelectedCountries(prev =>
      prev.includes(countryCode) ? prev.filter(c => c !== countryCode) : [...prev, countryCode]
    )
  }

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

  const toggleTimeSlot = (day: string, time: string) => {
    setAvailability(prev => {
      const daySlots = prev[day] || []
      const newSlots = daySlots.includes(time)
        ? daySlots.filter(t => t !== time)
        : [...daySlots, time]
      return { ...prev, [day]: newSlots }
    })
  }

  const handleComplete = async () => {
    setIsLoading(true)

    try {
      const response = await fetch('/api/onboarding/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bio,
          credentials,
          regions: selectedRegions,
          countries: selectedCountries,
          subjects: selectedCategories,
          availability,
          hourlyRate: parseFloat(hourlyRate) || 0,
        }),
      })

      if (response.ok) {
        setCompleted(true)
        setTimeout(() => {
          window.location.href = '/tutor/dashboard'
        }, 1500)
      }
    } catch (error) {
      console.error('Failed to save onboarding:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const progress = ((step - 1) / 4) * 100

  if (completed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-green-50 to-white p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pb-8 pt-8">
            <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-500" />
            <h2 className="mb-2 text-2xl font-bold">Welcome to Solocorn!</h2>
            <p className="text-gray-600">
              Your tutor profile is set up. Redirecting to your dashboard...
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Complete Your Tutor Profile</CardTitle>
            <CardDescription>
              Step {step} of 4:{' '}
              {step === 1
                ? 'About You'
                : step === 2
                  ? 'Teaching Areas'
                  : step === 3
                    ? 'Availability'
                    : 'Pricing'}
            </CardDescription>
            <Progress value={progress} className="mt-2" />
          </CardHeader>
          <CardContent>
            {/* Step 1: Profile */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    placeholder="Tell students about yourself, your teaching experience, and your teaching style..."
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="credentials">Credentials</Label>
                  <Input
                    id="credentials"
                    placeholder="e.g., PhD in Mathematics, Certified Teacher, 10 years experience..."
                    value={credentials}
                    onChange={e => setCredentials(e.target.value)}
                  />
                </div>

                <Button className="mt-4 w-full" disabled={!bio.trim()} onClick={() => setStep(2)}>
                  Continue
                </Button>
              </div>
            )}

            {/* Step 2: Regions, Countries & Categories - View All Categories Replica */}
            {step === 2 && (
              <div className="space-y-6">
                {/* Header */}
                <div className="mb-6 text-center">
                  <h3 className="mb-2 text-xl font-bold text-[#1F2933]">
                    Select Your Teaching Areas
                  </h3>
                  <p className="text-gray-600">
                    Select your regions, countries, and the categories you teach.
                  </p>
                </div>

                {/* Region & Country Selection - At the TOP */}
                <Card>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {/* Region Selection */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                          <Globe className="h-4 w-4 text-[#1D4ED8]" />
                          Regions
                        </Label>
                        <div className="max-h-[150px] overflow-y-auto rounded-md border p-2">
                          {REGIONS.map(region => (
                            <label
                              key={region.id}
                              className="flex cursor-pointer items-center gap-2 rounded p-1.5 hover:bg-gray-50"
                            >
                              <Checkbox
                                checked={selectedRegions.includes(region.id)}
                                onCheckedChange={() => toggleRegion(region.id)}
                              />
                              <span className="text-sm">{region.name}</span>
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500">{selectedRegions.length} selected</p>
                      </div>

                      {/* Country Selection */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                          <MapPin className="h-4 w-4 text-[#F17623]" />
                          Countries
                        </Label>
                        <div className="max-h-[150px] overflow-y-auto rounded-md border p-2">
                          {availableCountries.length === 0 ? (
                            <p className="p-1.5 text-sm text-gray-400">Select regions first</p>
                          ) : (
                            availableCountries.map(country => (
                              <label
                                key={country.code}
                                className="flex cursor-pointer items-center gap-2 rounded p-1.5 hover:bg-gray-50"
                              >
                                <Checkbox
                                  checked={selectedCountries.includes(country.code)}
                                  onCheckedChange={() => toggleCountry(country.code)}
                                />
                                <span className="text-sm">{country.name}</span>
                              </label>
                            ))
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{selectedCountries.length} selected</p>
                      </div>
                    </div>

                    {/* Selected Count */}
                    {selectedCategories.length > 0 && (
                      <div className="mt-3 flex items-center gap-2 border-t pt-3">
                        <Check className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-gray-600">
                          {selectedCategories.length} categor
                          {selectedCategories.length === 1 ? 'y' : 'ies'} selected
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
                  {/* Left Column - Categories Tabs & Custom Category */}
                  <div className="space-y-4 lg:col-span-3">
                    {/* Categories Tabs - Auto-populate based on country selection */}
                    <Card className="flex h-[400px] flex-col">
                      <Tabs
                        value={activeTab}
                        onValueChange={setActiveTab}
                        className="flex h-full flex-col"
                      >
                        <CardHeader className="pb-0 pt-4">
                          <TabsList className="grid w-full grid-cols-6">
                            <TabsTrigger value="global" className="text-xs">
                              <Globe className="mr-1 h-3 w-3" />
                              Global
                            </TabsTrigger>
                            <TabsTrigger value="ap" className="text-xs">
                              <Award className="mr-1 h-3 w-3" />
                              AP
                            </TabsTrigger>
                            <TabsTrigger value="alevel" className="text-xs">
                              <GraduationCap className="mr-1 h-3 w-3" />A Level
                            </TabsTrigger>
                            <TabsTrigger value="ib" className="text-xs">
                              <BookOpen className="mr-1 h-3 w-3" />
                              IB
                            </TabsTrigger>
                            <TabsTrigger value="igcse" className="text-xs">
                              <School className="mr-1 h-3 w-3" />
                              IGCSE
                            </TabsTrigger>
                            <TabsTrigger
                              value="national"
                              className="text-xs"
                              disabled={nationalExams.length === 0}
                            >
                              <Flag className="mr-1 h-3 w-3" />
                              National
                            </TabsTrigger>
                          </TabsList>
                        </CardHeader>

                        <CardContent className="flex-1 overflow-hidden pt-4">
                          {/* Search Bar */}
                          <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <Input
                              placeholder="Search categories..."
                              value={searchQuery}
                              onChange={e => setSearchQuery(e.target.value)}
                              className="pl-9"
                            />
                          </div>

                          {/* Tab Contents */}
                          <div className="h-[calc(100%-40px)]">
                            <ScrollArea className="h-full pr-4">
                              <TabsContent value="global" className="mt-0">
                                <div className="space-y-4 pb-4">
                                  {GLOBAL_EXAMS_CATEGORIES.map(renderCategorySection)}
                                </div>
                              </TabsContent>

                              <TabsContent value="ap" className="mt-0">
                                <div className="space-y-4 pb-4">
                                  {AP_CATEGORIES.map(renderCategorySection)}
                                </div>
                              </TabsContent>

                              <TabsContent value="alevel" className="mt-0">
                                <div className="space-y-4 pb-4">
                                  {A_LEVEL_CATEGORIES.map(renderCategorySection)}
                                </div>
                              </TabsContent>

                              <TabsContent value="ib" className="mt-0">
                                <div className="space-y-4 pb-4">
                                  {IB_CATEGORIES.map(renderCategorySection)}
                                </div>
                              </TabsContent>

                              <TabsContent value="igcse" className="mt-0">
                                <div className="space-y-4 pb-4">
                                  {IGCSE_CATEGORIES.map(renderCategorySection)}
                                </div>
                              </TabsContent>

                              <TabsContent value="national" className="mt-0">
                                <div className="space-y-4 pb-4">
                                  {nationalExams.length === 0 ? (
                                    <div className="py-8 text-center text-gray-500">
                                      <Flag className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                                      <p>No national exams available for selected countries.</p>
                                    </div>
                                  ) : (
                                    nationalExams.map(renderCategorySection)
                                  )}
                                </div>
                              </TabsContent>
                            </ScrollArea>
                          </div>
                        </CardContent>
                      </Tabs>
                    </Card>

                    {/* Your Own Category */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Plus className="h-4 w-4 text-[#1D4ED8]" />
                          Your Own Category
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Add a custom category if you don&apos;t see what you&apos;re looking for
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
                            <Plus className="mr-1 h-4 w-4" />
                            Add
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Right Column - Selected Categories Sidebar */}
                  <div className="space-y-4">
                    <Card className="flex h-[300px] flex-col">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1D4ED8] text-xs text-white">
                            {selectedCategories.length}
                          </span>
                          Selected
                        </CardTitle>
                        <CardDescription className="text-xs">
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
                  </div>
                </div>

                <div className="mt-6 flex gap-3 border-t pt-4">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={selectedCategories.length === 0}
                    onClick={() => setStep(3)}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Availability */}
            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">When are you available?</h3>
                <p className="text-sm text-gray-600">Select your preferred teaching hours</p>

                <div className="max-h-96 space-y-4 overflow-y-auto">
                  {DAYS.map(day => (
                    <div key={day} className="rounded-lg border p-3">
                      <h4 className="mb-2 font-medium">{day}</h4>
                      <div className="flex flex-wrap gap-2">
                        {TIME_SLOTS.map(time => (
                          <button
                            key={time}
                            onClick={() => toggleTimeSlot(day, time)}
                            className={`rounded border px-3 py-1 text-sm transition-colors ${
                              availability[day]?.includes(time)
                                ? 'border-green-500 bg-green-500 text-white'
                                : 'border-gray-200 hover:border-green-300'
                            }`}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex gap-3">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button className="flex-1" onClick={() => setStep(4)}>
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Hourly Rate */}
            {step === 4 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium">Set Your Hourly Rate</h3>
                  <p className="text-sm text-gray-600">
                    Students will pay this rate for 1-on-1 sessions
                  </p>
                </div>

                <div className="rounded-lg bg-gray-50 p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <DollarSign className="h-6 w-6 text-gray-600" />
                    <Input
                      type="number"
                      placeholder="50"
                      value={hourlyRate}
                      onChange={e => setHourlyRate(e.target.value)}
                      className="text-2xl font-bold"
                    />
                    <span className="text-gray-600">/ hour</span>
                  </div>

                  <div className="text-sm text-gray-500">
                    <p>Platform fee: 20%</p>
                    <p className="font-medium text-gray-700">
                      You receive: $
                      {hourlyRate ? (parseFloat(hourlyRate) * 0.8).toFixed(2) : '0.00'} / hour
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(3)}>
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleComplete}
                    disabled={isLoading || !hourlyRate}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Complete Setup'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
