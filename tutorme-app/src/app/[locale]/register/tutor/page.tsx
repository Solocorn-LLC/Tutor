'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BackButton } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { HANDLE_REGEX, isReservedHandle } from '@/lib/mentions/handles'
import {
  GraduationCap,
  ShieldCheck,
  Globe,
  UserRound,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  X,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from '@/components/ui/dialog'

import { cn } from '@/lib/utils'

type GlobalExamState = {
  standardizedEnglish: string[]
  undergradAdmissions: string[]
  apAdvancedPlacement: string[]
  internationalAS: string[]
}

type SocialLinks = {
  instagram: string
  tiktok: string
  youtube: string
  facebook: string
}

import {
  REGIONS,
  GLOBAL_EXAMS_CATEGORIES,
  AP_CATEGORIES,
  A_LEVEL_CATEGORIES,
  IB_CATEGORIES,
  IGCSE_CATEGORIES,
  type ExamCategory,
  ALL_COUNTRIES,
} from '@/lib/data/tutor-categories'

const REGION_OPTIONS = [
  'Worldwide',
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
  'Middle East',
  'Other',
]

const REGION_COUNTRY_MAP: Record<string, string[]> = {
  Africa: [
    'Algeria',
    'Angola',
    'Benin',
    'Botswana',
    'Burkina Faso',
    'Burundi',
    'Cabo Verde',
    'Cameroon',
    'Central African Republic',
    'Chad',
    'Comoros',
    'Congo (Congo-Brazzaville)',
    'Congo (DRC)',
    "Côte d'Ivoire",
    'Djibouti',
    'Egypt',
    'Equatorial Guinea',
    'Eritrea',
    'Eswatini',
    'Ethiopia',
    'Gabon',
    'Gambia',
    'Ghana',
    'Guinea',
    'Guinea-Bissau',
    'Kenya',
    'Lesotho',
    'Liberia',
    'Libya',
    'Madagascar',
    'Malawi',
    'Mali',
    'Mauritania',
    'Mauritius',
    'Morocco',
    'Mozambique',
    'Namibia',
    'Niger',
    'Nigeria',
    'Rwanda',
    'Sao Tome and Principe',
    'Senegal',
    'Seychelles',
    'Sierra Leone',
    'Somalia',
    'South Africa',
    'South Sudan',
    'Sudan',
    'Tanzania',
    'Togo',
    'Tunisia',
    'Uganda',
    'Zambia',
    'Zimbabwe',
    'Western Sahara',
  ],
  Asia: [
    'Afghanistan',
    'Armenia',
    'Azerbaijan',
    'Bahrain',
    'Bangladesh',
    'Bhutan',
    'Brunei',
    'Cambodia',
    'China',
    'Georgia',
    'India',
    'Indonesia',
    'Japan',
    'Kazakhstan',
    'Kyrgyzstan',
    'Laos',
    'Malaysia',
    'Maldives',
    'Mongolia',
    'Myanmar (Burma)',
    'Nepal',
    'North Korea',
    'Pakistan',
    'Philippines',
    'Singapore',
    'South Korea',
    'Sri Lanka',
    'Taiwan',
    'Tajikistan',
    'Thailand',
    'Timor-Leste',
    'Turkmenistan',
    'Uzbekistan',
    'Vietnam',
  ],
  Europe: [
    'Albania',
    'Andorra',
    'Austria',
    'Belarus',
    'Belgium',
    'Bosnia and Herzegovina',
    'Bulgaria',
    'Croatia',
    'Cyprus',
    'Czechia',
    'Denmark',
    'Estonia',
    'Finland',
    'France',
    'Germany',
    'Greece',
    'Hungary',
    'Iceland',
    'Ireland',
    'Italy',
    'Kosovo',
    'Latvia',
    'Liechtenstein',
    'Lithuania',
    'Luxembourg',
    'Malta',
    'Moldova',
    'Monaco',
    'Montenegro',
    'Netherlands',
    'North Macedonia',
    'Norway',
    'Poland',
    'Portugal',
    'Romania',
    'Russia',
    'San Marino',
    'Serbia',
    'Slovakia',
    'Slovenia',
    'Spain',
    'Sweden',
    'Switzerland',
    'Ukraine',
    'United Kingdom',
    'Vatican City',
  ],
  'North America': [
    'Antigua and Barbuda',
    'Bahamas',
    'Barbados',
    'Belize',
    'Canada',
    'Costa Rica',
    'Cuba',
    'Dominica',
    'Dominican Republic',
    'El Salvador',
    'Grenada',
    'Guatemala',
    'Haiti',
    'Honduras',
    'Jamaica',
    'Mexico',
    'Nicaragua',
    'Panama',
    'Saint Kitts and Nevis',
    'Saint Lucia',
    'Saint Vincent and the Grenadines',
    'Trinidad and Tobago',
    'United States',
    'Puerto Rico',
    'Greenland',
    'Bermuda',
  ],
  'South America': [
    'Argentina',
    'Bolivia',
    'Brazil',
    'Chile',
    'Colombia',
    'Ecuador',
    'Guyana',
    'Paraguay',
    'Peru',
    'Suriname',
    'Uruguay',
    'Venezuela',
    'Falkland Islands',
  ],
  Oceania: [
    'Australia',
    'Fiji',
    'Kiribati',
    'Marshall Islands',
    'Micronesia',
    'Nauru',
    'New Zealand',
    'Palau',
    'Papua New Guinea',
    'Samoa',
    'Solomon Islands',
    'Tonga',
    'Tuvalu',
    'Vanuatu',
    'New Caledonia',
    'French Polynesia',
    'Guam',
    'American Samoa',
  ],
  'Middle East': [
    'Algeria',
    'Bahrain',
    'Egypt',
    'Iran',
    'Iraq',
    'Israel',
    'Jordan',
    'Kuwait',
    'Lebanon',
    'Libya',
    'Oman',
    'Palestine',
    'Qatar',
    'Saudi Arabia',
    'Syria',
    'Turkey',
    'United Arab Emirates',
    'Yemen',
  ],
}

const COUNTRY_TO_REGION = new Map<string, string>()
Object.entries(REGION_COUNTRY_MAP).forEach(([region, countries]) => {
  countries.forEach(country => COUNTRY_TO_REGION.set(country, region))
})

const resolveRegionForCountry = (country: string) => COUNTRY_TO_REGION.get(country) ?? 'Other'

export default function TutorRegistrationPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState(1)

  const [usernameStatus, setUsernameStatus] = useState<{
    status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid'
    message?: string
    suggestion?: string
  }>({
    status: 'idle',
  })
  const [emailStatus, setEmailStatus] = useState<{
    status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid'
    message?: string
  }>({
    status: 'idle',
  })
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showUsernameCheckModal, setShowUsernameCheckModal] = useState(false)

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    middleName: '',
    lastName: '',
    legalName: '',
    nationality: '',
    countryOfResidence: '',
    educationLevel: '',
    tutoringExperienceRange: '',
    globalExams: {
      standardizedEnglish: [],
      undergradAdmissions: [],
      apAdvancedPlacement: [],
      internationalAS: [],
    } as GlobalExamState,
    tutoringCountries: [] as string[],
    countrySubjectSelections: {} as Record<string, string[]>,
    username: '',
    socialLinks: {
      instagram: '',
      tiktok: '',
      youtube: '',
      facebook: '',
    } as SocialLinks,
    timezone: 'Asia/Shanghai',
    preferredLanguage: 'en',
    agreeToTerms: false,
    // New fields for category selection
    selectedRegions: [] as string[],
    selectedCountries: [] as string[],
    selectedCategories: [] as string[],
  })

  // New state for category selection
  const [selectedRegions, setSelectedRegions] = useState<string[]>([])
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  const passwordMismatch =
    formData.password.length > 0 &&
    formData.confirmPassword.length > 0 &&
    formData.password !== formData.confirmPassword

  // Updated: No dots allowed, use underscores instead
  const normalizeUsernameInput = (value: string) =>
    value
      .trim()
      .replace(/^@+/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30)

  // Generate username suggestion from first and last name
  const generateUsernameSuggestion = () => {
    const first = formData.firstName.toLowerCase().replace(/[^a-z]/g, '')
    const last = formData.lastName.toLowerCase().replace(/[^a-z]/g, '')
    if (first && last) {
      return `${first}_${last}`
    } else if (first) {
      return `${first}_tutor`
    } else if (last) {
      return `${last}_tutor`
    }
    return ''
  }

  const checkUsernameAvailability = async (value: string): Promise<boolean> => {
    const normalized = normalizeUsernameInput(value)
    if (!normalized.trim()) {
      setUsernameStatus({ status: 'idle' })
      return false
    }
    if (!HANDLE_REGEX.test(normalized)) {
      setUsernameStatus({
        status: 'invalid',
        message: 'Username must be 3-30 characters (letters, numbers, underscores)',
      })
      return false
    }
    if (isReservedHandle(normalized)) {
      setUsernameStatus({ status: 'invalid', message: 'This username is reserved' })
      return false
    }
    setUsernameStatus({ status: 'checking' })
    try {
      // Add timeout to prevent hanging
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const res = await fetch(
        `/api/public/username-availability?username=${encodeURIComponent(normalized)}`,
        { signal: controller.signal }
      )
      clearTimeout(timeoutId)

      if (!res.ok) {
        setUsernameStatus({ status: 'idle' })
        return false
      }
      const data = await res.json()
      if (data.available) {
        setUsernameStatus({ status: 'available', message: 'Username is available' })
        return true
      } else {
        setUsernameStatus({
          status: 'taken',
          message: 'Username is taken',
          suggestion: data.suggestion,
        })
        return false
      }
    } catch (err) {
      // Handle timeout or network errors gracefully
      if (err instanceof Error && err.name === 'AbortError') {
        setUsernameStatus({ status: 'idle', message: 'Check timed out, please try again' })
      } else {
        setUsernameStatus({ status: 'idle' })
      }
      return false
    }
  }

  const checkEmailAvailability = async (value: string) => {
    if (!value.trim()) {
      setEmailStatus({ status: 'idle' })
      return false
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(value)) {
      setEmailStatus({ status: 'invalid', message: 'Enter a valid email address' })
      return false
    }
    setEmailStatus({ status: 'checking' })
    try {
      const res = await fetch(`/api/public/email-availability?email=${encodeURIComponent(value)}`)
      if (!res.ok) {
        setEmailStatus({ status: 'idle', message: 'Unable to verify right now' })
        return true
      }
      const data = await res.json()
      if (data.available) {
        setEmailStatus({ status: 'available', message: 'Email is available' })
        return true
      }
      setEmailStatus({ status: 'taken', message: 'Email is already registered' })
      return false
    } catch {
      setEmailStatus({ status: 'idle', message: 'Unable to verify right now' })
      return true
    }
  }

  const applySuggestion = () => {
    if (!usernameStatus.suggestion) return
    setFormData(prev => ({ ...prev, username: usernameStatus.suggestion ?? prev.username }))
    setUsernameTouched(true)
    setUsernameStatus({ status: 'idle' })
  }

  useEffect(() => {
    const email = formData.email.trim()
    if (!email) {
      setEmailStatus({ status: 'idle' })
      return
    }
    const handle = setTimeout(() => {
      void checkEmailAvailability(email)
    }, 500)
    return () => clearTimeout(handle)
  }, [formData.email])

  useEffect(() => {
    const normalized = normalizeUsernameInput(formData.username)
    if (!normalized) {
      setUsernameStatus({ status: 'idle' })
      return
    }
    if (!HANDLE_REGEX.test(normalized)) {
      setUsernameStatus({
        status: 'invalid',
        message: 'Username must be 3-30 characters (letters, numbers, underscores)',
      })
      return
    }
    if (isReservedHandle(normalized)) {
      setUsernameStatus({ status: 'invalid', message: 'This username is reserved' })
      return
    }
    const handle = setTimeout(() => {
      void checkUsernameAvailability(normalized)
    }, 500)
    return () => clearTimeout(handle)
  }, [formData.username])

  // Auto-suggest username when entering step 2
  useEffect(() => {
    if (step === 2 && !formData.username && formData.firstName && formData.lastName) {
      const suggestion = generateUsernameSuggestion()
      if (suggestion) {
        // Set username and immediately check availability
        setFormData(prev => ({ ...prev, username: suggestion }))
        // Don't wait for setFormData to propagate, check immediately
        checkUsernameAvailability(suggestion)
      }
    }
  }, [step])

  const validateStepOne = async () => {
    if (!formData.firstName || !formData.lastName) {
      toast.error('First and last name are required')
      return false
    }
    if (!formData.email || !formData.password) {
      toast.error('Email and password are required')
      return false
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(formData.email)) {
      toast.error('Enter a valid email address')
      return false
    }
    if (emailStatus.status === 'invalid') {
      toast.error('Enter a valid email address')
      return false
    }
    if (emailStatus.status === 'taken') {
      toast.error('Email already exists')
      return false
    }
    // Always verify email before proceeding
    const ok = await checkEmailAvailability(formData.email)
    if (!ok) {
      toast.error('Email already exists or is invalid')
      return false
    }
    if (passwordMismatch) {
      toast.error('Passwords do not match')
      return false
    }
    if (!formData.nationality) {
      toast.error('Nationality is required')
      return false
    }
    return true
  }

  const validateStepTwo = async () => {
    if (!formData.username) {
      toast.error('Username is required')
      return false
    }
    const normalized = normalizeUsernameInput(formData.username)
    if (!HANDLE_REGEX.test(normalized)) {
      toast.error('Username must be 3-30 characters (letters, numbers, underscores)')
      return false
    }
    if (isReservedHandle(normalized)) {
      toast.error('This username is reserved')
      return false
    }
    if (usernameStatus.status === 'invalid') {
      toast.error(usernameStatus.message || 'Username is invalid')
      return false
    }

    // If already checked and available, proceed immediately
    if (usernameStatus.status === 'available') {
      return true
    }

    // Show checking modal and verify username
    setShowUsernameCheckModal(true)

    // Check availability and get result directly
    const isAvailable = await checkUsernameAvailability(normalized)

    setShowUsernameCheckModal(false)

    if (isAvailable) {
      return true
    }

    // Check failed or username is taken
    if (usernameStatus.status === 'taken') {
      toast.error('Username is already taken')
      return false
    }

    // Timeout or error - allow proceeding with server-side verification
    toast.info('We will verify your username during signup')
    return true
  }

  // Helper to get country names from codes
  const getCountryNamesFromCodes = (codes: string[]) => {
    const names: string[] = []
    codes.forEach(code => {
      REGIONS.forEach(region => {
        const country = region.countries.find(c => c.code === code)
        if (country) {
          names.push(country.name)
        }
      })
    })
    return names
  }

  const handleSubmit = async () => {
    if (!formData.agreeToTerms) {
      toast.error('You must accept the Terms and Agreements')
      return
    }

    setIsLoading(true)
    try {
      // Get country names from selected country codes
      const tutoringCountryNames = getCountryNamesFromCodes(selectedCountries)

      // Generate Category-Nationality combinations
      // e.g., ["IELTS - Korea", "TOEFL - Korea", "IELTS - Hong Kong", "TOEFL - Hong Kong"]
      const categoryNationalityCombinations: string[] = []

      if (selectedRegions.includes('global')) {
        // If Global is selected, just use categories without nationality suffix
        selectedCategories.forEach(category => {
          categoryNationalityCombinations.push(`${category} - Global`)
        })
      } else {
        // Create combinations of each category with each selected country
        selectedCategories.forEach(category => {
          tutoringCountryNames.forEach(countryName => {
            categoryNationalityCombinations.push(`${category} - ${countryName}`)
          })
        })
      }

      const payload = {
        role: 'TUTOR',
        email: formData.email,
        password: formData.password,
        name: `${formData.firstName} ${formData.lastName}`.trim(),
        tosAccepted: formData.agreeToTerms,
        profileData: {
          timezone: formData.timezone,
          preferredLanguage: formData.preferredLanguage,
          nationality: formData.nationality,
          tutorNationalities: selectedRegions.includes('global')
            ? ['Global']
            : tutoringCountryNames,
          categoryNationalityCombinations: categoryNationalityCombinations,
        },
        additionalData: {
          firstName: formData.firstName,
          middleName: formData.middleName,
          lastName: formData.lastName,
          legalName: formData.legalName,
          nationality: formData.nationality,
          phoneCountryCode: '+1',
          phoneNumber: '0000000000',
          educationLevel: 'Bachelor',
          hasTeachingCertificate: false,
          tutoringExperienceRange: '0-2',
          globalExams: formData.globalExams,
          tutoringCountries: tutoringCountryNames,
          countrySubjectSelections: formData.countrySubjectSelections,
          categories: selectedCategories,
          username: formData.username,
          socialLinks: formData.socialLinks,
        },
      }

      const formPayload = new FormData()
      formPayload.set('payload', JSON.stringify(payload))
      const response = await fetch('/api/auth/register/tutor', {
        method: 'POST',
        body: formPayload,
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Tutor account created successfully!')
        router.push('/login?registered=1')
      } else {
        toast.error(data.error || 'Failed to create account')
      }
    } catch {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Updated steps - removed Tutoring (step 2)
  const steps = [
    { number: 1, title: 'Account' },
    { number: 2, title: 'Profile' },
    { number: 3, title: 'Review' },
    { number: 4, title: 'Terms' },
  ]

  return (
    <div className="min-h-screen bg-white px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <BackButton href="/register" className="mb-4" />

        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F17623]/10">
            <GraduationCap className="h-8 w-8 text-[#F17623]" />
          </div>
          <h1 className="text-3xl font-bold text-[#1F2933]">Become a Solocorn Tutor</h1>
          <p className="mt-2 text-gray-600">
            Complete your application to start tutoring on the platform
          </p>
        </div>

        <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
          {steps.map(s => (
            <div key={s.number} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${step >= s.number ? 'bg-[#F17623] text-white' : 'bg-gray-200 text-gray-500'}`}
              >
                {s.number}
              </div>
              <span className={`text-sm ${step >= s.number ? 'text-[#F17623]' : 'text-gray-400'}`}>
                {s.title}
              </span>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {step === 1 && 'Become a Solocorn Tutor'}
              {step === 2 && 'Profile'}
              {step === 3 && 'Review'}
              {step === 4 && 'Terms and Agreements'}
            </CardTitle>
            <CardDescription>
              {step === 1 && 'Tell us who you are'}
              {step === 2 && 'Complete your profile information'}
              {step === 3 && 'Review your application before registering'}
              {step === 4 && 'Accept the terms to finalize your application'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {step === 1 && (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input
                      value={formData.firstName}
                      onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Middle Name</Label>
                    <Input
                      value={formData.middleName}
                      onChange={e => setFormData({ ...formData, middleName: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input
                      value={formData.lastName}
                      onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="tutor@example.com"
                  />
                  {emailStatus.status === 'checking' && (
                    <p className="text-xs text-gray-500">Checking availability...</p>
                  )}
                  {emailStatus.status === 'available' && (
                    <p className="text-xs text-green-600">{emailStatus.message}</p>
                  )}
                  {emailStatus.status === 'taken' && (
                    <p className="text-xs text-red-600">{emailStatus.message}</p>
                  )}
                  {emailStatus.status === 'invalid' && (
                    <p className="text-xs text-red-600">{emailStatus.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        placeholder="Create a password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(prev => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm Password</Label>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={formData.confirmPassword}
                        onChange={e =>
                          setFormData({ ...formData, confirmPassword: e.target.value })
                        }
                        placeholder="Confirm your password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(prev => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {passwordMismatch && (
                      <p className="text-xs text-red-500">Passwords do not match.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Nationality</Label>
                  <Select
                    value={formData.nationality}
                    onValueChange={value => {
                      setFormData(prev => ({
                        ...prev,
                        nationality: value,
                      }))
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select your nationality" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_COUNTRIES.map(country => (
                        <SelectItem key={country.code} value={country.name}>
                          {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-3">
                  <Button
                    className="flex-1 bg-[#F17623] hover:bg-[#e06613]"
                    onClick={async () => {
                      if (await validateStepOne()) setStep(2)
                    }}
                  >
                    Next
                  </Button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-2">
                  <Label>Solocorn Username</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex w-full items-center gap-2 rounded-md border bg-white px-3 py-2">
                      <span className="text-gray-500">@</span>
                      <Input
                        className="h-auto border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                        value={formData.username}
                        onChange={e => {
                          setFormData({
                            ...formData,
                            username: normalizeUsernameInput(e.target.value),
                          })
                          setUsernameTouched(true)
                          setUsernameStatus({ status: 'idle' })
                        }}
                        placeholder="your_username"
                      />
                    </div>
                  </div>
                  {usernameStatus.status === 'checking' && (
                    <p className="text-xs text-gray-500">Checking availability...</p>
                  )}
                  {usernameStatus.status === 'available' && (
                    <p className="text-xs text-green-600">{usernameStatus.message}</p>
                  )}
                  {usernameStatus.status === 'taken' && (
                    <div className="text-xs text-red-600">
                      <p>{usernameStatus.message}</p>
                      {usernameStatus.suggestion && (
                        <button
                          className="text-[#1D4ED8] underline"
                          type="button"
                          onClick={applySuggestion}
                        >
                          Use {usernameStatus.suggestion}
                        </button>
                      )}
                    </div>
                  )}
                  {usernameStatus.status === 'invalid' && (
                    <p className="text-xs text-red-600">{usernameStatus.message}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    3-15 characters. Only letters, numbers, and underscores allowed.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>Social Media Accounts</Label>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                      value={formData.socialLinks.instagram}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          socialLinks: { ...formData.socialLinks, instagram: e.target.value },
                        })
                      }
                      placeholder="Instagram"
                    />
                    <Input
                      value={formData.socialLinks.tiktok}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          socialLinks: { ...formData.socialLinks, tiktok: e.target.value },
                        })
                      }
                      placeholder="TikTok"
                    />
                    <Input
                      value={formData.socialLinks.youtube}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          socialLinks: { ...formData.socialLinks, youtube: e.target.value },
                        })
                      }
                      placeholder="YouTube"
                    />
                    <Input
                      value={formData.socialLinks.facebook}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          socialLinks: { ...formData.socialLinks, facebook: e.target.value },
                        })
                      }
                      placeholder="Facebook"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    className="flex-1 bg-[#F17623] hover:bg-[#e06613]"
                    onClick={async () => {
                      const isValid = await validateStepTwo()
                      if (isValid) setStep(3)
                    }}
                  >
                    Next
                  </Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-4">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <h4 className="mb-2 flex items-center gap-2 font-semibold">
                      <UserRound className="h-4 w-4" />
                      Profile Overview
                    </h4>
                    <p className="text-sm">
                      <strong>Name:</strong> {formData.firstName} {formData.lastName}
                    </p>
                    <p className="text-sm">
                      <strong>Username:</strong> {formData.username}
                    </p>
                    {formData.nationality && (
                      <p className="text-sm">
                        <strong>Nationality:</strong> {formData.nationality}
                      </p>
                    )}
                  </div>

                  {/* Categories and Countries sections removed — no selection UI in current form */}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button
                    className="flex-1 bg-[#F17623] hover:bg-[#e06613]"
                    onClick={() => setStep(4)}
                  >
                    Register
                  </Button>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="terms"
                      checked={formData.agreeToTerms}
                      onCheckedChange={checked =>
                        setFormData({ ...formData, agreeToTerms: checked as boolean })
                      }
                    />
                    <Label htmlFor="terms" className="text-sm">
                      I agree to the Terms and Agreements and confirm that the information provided
                      is accurate.
                    </Label>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(3)}>
                    Back
                  </Button>
                  <Button
                    className="flex-1 bg-[#F17623] hover:bg-[#e06613]"
                    onClick={handleSubmit}
                    disabled={isLoading || !formData.agreeToTerms}
                  >
                    {isLoading ? 'Submitting...' : 'Complete Registration'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Username Check Modal */}
        <Dialog open={showUsernameCheckModal} onOpenChange={setShowUsernameCheckModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-[#F17623]" />
                Checking Username Availability
              </DialogTitle>
              <DialogDescription>
                Please wait while we verify if @{formData.username} is available...
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 p-6 pt-0">
              <DialogPanel className="py-8 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-500" />
                <p className="mt-3 text-sm text-gray-600">Verifying username...</p>
              </DialogPanel>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
