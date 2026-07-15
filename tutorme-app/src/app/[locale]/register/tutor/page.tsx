'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BackButton } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { HANDLE_REGEX, isReservedHandle } from '@/lib/mentions/handles'
import { GraduationCap, ShieldCheck, UserRound, Eye, EyeOff, Loader2, X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  type CountryData,
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
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showUsernameCheckModal, setShowUsernameCheckModal] = useState(false)
  const [region, setRegion] = useState('')
  const [countryCode, setCountryCode] = useState('')
  // Inline per-field validation errors (empty/invalid required fields turn red).
  const [errors, setErrors] = useState<Record<string, string>>({})
  const clearError = (field: string) =>
    setErrors(prev => (prev[field] ? { ...prev, [field]: '' } : prev))

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
    timezone:
      (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC',
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

  const availableCountries = useMemo<CountryData[]>(() => {
    if (!region) return []
    return REGIONS.find(r => r.id === region)?.countries ?? []
  }, [region])

  const selectedCountryName = useMemo(() => {
    if (!countryCode) return ''
    return availableCountries.find(c => c.code === countryCode)?.name ?? ''
  }, [countryCode, availableCountries])

  // Auto-detect timezone on mount (fallback to IP-based detection if browser API unavailable)
  useEffect(() => {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) {
      // Browser supports timezone detection
      return
    }
    // Fallback: detect via IP API
    fetch('https://ipapi.co/json/')
      .then(r => r.json().catch(() => ({})))
      .then((data: { timezone?: string }) => {
        if (data.timezone) {
          setFormData((prev: any) => ({ ...prev, timezone: data.timezone }))
        }
      })
      .catch(() => {
        // Silently fail — UTC default is acceptable
      })
  }, [])

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

  const applySuggestion = () => {
    if (!usernameStatus.suggestion) return
    setFormData(prev => ({ ...prev, username: usernameStatus.suggestion ?? prev.username }))
    setUsernameTouched(true)
    setUsernameStatus({ status: 'idle' })
  }

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
    // Collect ALL empty/invalid required fields so each is highlighted red at
    // once, rather than a one-at-a-time toast.
    const next: Record<string, string> = {}
    if (!formData.firstName?.trim()) next.firstName = 'Please enter your first name'
    if (!formData.lastName?.trim()) next.lastName = 'Please enter your last name'
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!formData.email) next.email = 'Email is required'
    else if (!emailPattern.test(formData.email)) next.email = 'Enter a valid email address'
    if (!formData.password) next.password = 'Password is required'
    if (passwordMismatch) next.confirmPassword = 'Passwords do not match'
    if (!region) next.region = 'Region is required'
    if (!countryCode) next.countryCode = 'Country is required'
    setErrors(next)
    return Object.keys(next).length === 0
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

  const primaryBtnClass =
    'flex-1 bg-white text-sm font-semibold text-[#1F2933] shadow-[0_4px_14px_rgba(0,0,0,0.15)] transition-all duration-200 hover:bg-[#F97316] hover:text-white hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] hover:!translate-y-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 active:scale-[0.98]'
  const secondaryBtnClass =
    'flex-1 bg-white text-sm font-semibold text-[#1F2933] shadow-[0_4px_14px_rgba(0,0,0,0.15)] transition-all duration-200 hover:bg-[#1F2933] hover:text-white hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] hover:!translate-y-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 active:scale-[0.98]'

  return (
    <div className="flex min-h-screen flex-col items-center bg-white px-4 pt-[120px] sm:pt-[180px]">
      <div className="w-full max-w-4xl">
        <BackButton href="/register" className="mb-4" />

        <div className="mb-6">
          <div className="relative flex items-center justify-between">
            {/* Connecting line */}
            <div className="absolute left-0 right-0 top-[18px] h-[2px]">
              <div className="h-full w-full bg-gray-200" />
              <div
                className="absolute left-0 top-0 h-full bg-[#2563EB] transition-all duration-300"
                style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
              />
            </div>
            {steps.map(s => (
              <div key={s.number} className="relative z-10 flex flex-col items-center">
                <span
                  className={`mb-2 text-[11px] font-medium ${step >= s.number ? 'text-[#2563EB]' : 'text-gray-400'}`}
                >
                  {s.title}
                </span>
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white transition-all duration-200 ${step >= s.number ? 'bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] shadow-[0_0_16px_rgba(37,99,235,0.45)]' : 'bg-gray-200 text-gray-500'}`}
                >
                  {s.number}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-[20px] bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] shadow-[0_20px_50px_rgba(0,0,0,0.18),0_8px_20px_rgba(0,0,0,0.12)]">
          {step >= 3 && (
            <div className="border-b border-white/10 px-5 pb-3 pt-5">
              <h2 className="text-lg font-semibold text-white/90">
                {step === 3 && 'Review'}
                {step === 4 && 'Terms and Agreements'}
              </h2>
              <p className="text-xs text-white/50">
                {step === 3 && 'Review your application before registering'}
                {step === 4 && 'Accept the terms to finalize your application'}
              </p>
            </div>
          )}
          <div className="space-y-5 px-5 py-5">
            {step === 1 && (
              <>
                <form autoComplete="off" onSubmit={e => e.preventDefault()}>
                  <div className="space-y-5">
                    {/* Name row */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">First Name</Label>
                        <Input
                          className={cn(
                            'h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#2563EB]/40',
                            errors.firstName && 'border-red-500 focus-visible:ring-red-500/30'
                          )}
                          aria-invalid={!!errors.firstName}
                          value={formData.firstName}
                          onChange={e => {
                            setFormData({ ...formData, firstName: e.target.value })
                            clearError('firstName')
                          }}
                          autoComplete="off"
                        />
                        {errors.firstName && (
                          <p className="text-xs text-red-400" role="alert">
                            {errors.firstName}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">Middle Name</Label>
                        <Input
                          className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#2563EB]/40"
                          value={formData.middleName}
                          onChange={e => setFormData({ ...formData, middleName: e.target.value })}
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">Last Name</Label>
                        <Input
                          className={cn(
                            'h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#2563EB]/40',
                            errors.lastName && 'border-red-500 focus-visible:ring-red-500/30'
                          )}
                          aria-invalid={!!errors.lastName}
                          value={formData.lastName}
                          onChange={e => {
                            setFormData({ ...formData, lastName: e.target.value })
                            clearError('lastName')
                          }}
                          autoComplete="off"
                        />
                        {errors.lastName && (
                          <p className="text-xs text-red-400" role="alert">
                            {errors.lastName}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Email row */}
                    <div className="space-y-1">
                      <Label className="text-xs text-white/70">Email</Label>
                      <Input
                        className={cn(
                          'h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#2563EB]/40',
                          errors.email && 'border-red-500 focus-visible:ring-red-500/30'
                        )}
                        aria-invalid={!!errors.email}
                        type="email"
                        name="tutor_registration_email"
                        autoComplete="off"
                        value={formData.email}
                        onChange={e => {
                          setFormData({ ...formData, email: e.target.value })
                          clearError('email')
                        }}
                      />
                      {errors.email && (
                        <p className="text-xs text-red-400" role="alert">
                          {errors.email}
                        </p>
                      )}
                    </div>

                    {/* Password row */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">Password</Label>
                        <div className="relative">
                          <Input
                            className={cn(
                              'h-8 border-white/10 bg-white pr-9 text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#2563EB]/40',
                              errors.password && 'border-red-500 focus-visible:ring-red-500/30'
                            )}
                            aria-invalid={!!errors.password}
                            type={showPassword ? 'text' : 'password'}
                            name="tutor_registration_password"
                            autoComplete="new-password"
                            value={formData.password}
                            onChange={e => {
                              setFormData({ ...formData, password: e.target.value })
                              clearError('password')
                            }}
                            placeholder="Create a password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(prev => !prev)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                        {errors.password && (
                          <p className="text-xs text-red-400" role="alert">
                            {errors.password}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">Confirm Password</Label>
                        <div className="relative">
                          <Input
                            className={cn(
                              'h-8 border-white/10 bg-white pr-9 text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#2563EB]/40',
                              errors.confirmPassword &&
                                'border-red-500 focus-visible:ring-red-500/30'
                            )}
                            aria-invalid={!!errors.confirmPassword}
                            type={showConfirmPassword ? 'text' : 'password'}
                            name="tutor_registration_confirm_password"
                            autoComplete="new-password"
                            value={formData.confirmPassword}
                            onChange={e => {
                              setFormData({ ...formData, confirmPassword: e.target.value })
                              clearError('confirmPassword')
                            }}
                            placeholder="Confirm your password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(prev => !prev)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                        <p className="min-h-[18px] text-xs text-red-400">
                          {errors.confirmPassword ||
                            (passwordMismatch ? 'Passwords do not match.' : '\u00A0')}
                        </p>
                      </div>
                    </div>

                    {/* Region/Country row */}
                    <div className="space-y-1">
                      <Label className="text-xs text-white/70">Where do you live?</Label>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {/* Region */}
                        <div>
                          <Select
                            value={region}
                            onValueChange={v => {
                              setRegion(v)
                              setCountryCode('')
                              clearError('region')
                            }}
                          >
                            <SelectTrigger
                              aria-invalid={!!errors.region}
                              className={cn(
                                'h-8 w-full rounded-md border border-white/10 bg-white px-3 py-2 text-sm text-[#1F2933] shadow-sm transition-all duration-200 hover:border-slate-400/50 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40',
                                errors.region && 'border-red-500 focus:ring-red-500/40'
                              )}
                            >
                              <SelectValue placeholder="Select Region..." />
                            </SelectTrigger>
                            <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-md border border-white/10 p-1.5 shadow-lg">
                              {REGIONS.filter(r => r.id !== 'global').map(regionItem => (
                                <SelectItem
                                  key={regionItem.id}
                                  value={regionItem.id}
                                  className="rounded-md text-[13px] text-white/[0.94] hover:bg-white/15"
                                >
                                  {regionItem.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {errors.region && (
                            <p className="mt-1 text-xs text-red-400" role="alert">
                              {errors.region}
                            </p>
                          )}
                        </div>

                        {/* Country */}
                        <div>
                          <Select
                            value={countryCode}
                            onValueChange={v => {
                              setCountryCode(v)
                              clearError('countryCode')
                            }}
                            disabled={!region}
                          >
                            <SelectTrigger
                              aria-invalid={!!errors.countryCode}
                              className={cn(
                                'h-8 w-full rounded-md border border-white/10 bg-white px-3 py-2 text-sm text-[#1F2933] shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 disabled:text-white disabled:opacity-100',
                                !region && 'border-slate-400/20 bg-slate-100/50',
                                errors.countryCode && 'border-red-500 focus:ring-red-500/40'
                              )}
                            >
                              <SelectValue placeholder="Select Country" />
                            </SelectTrigger>
                            <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-md border border-white/10 p-1.5 shadow-lg">
                              {availableCountries.length === 0 ? (
                                <div className="py-3 text-center text-[13px] text-white/70">
                                  No countries available
                                </div>
                              ) : (
                                availableCountries.map(country => (
                                  <SelectItem
                                    key={country.code}
                                    value={country.code}
                                    className="rounded-md text-[13px] text-white/[0.94] hover:bg-white/15"
                                  >
                                    {country.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          {errors.countryCode && (
                            <p className="mt-1 text-xs text-red-400" role="alert">
                              {errors.countryCode}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Next button */}
                    <div className="flex gap-3">
                      <Button
                        className={primaryBtnClass}
                        onClick={async () => {
                          if (await validateStepOne()) setStep(2)
                        }}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </form>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-white/70">Solocorn Username</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-full items-center gap-2 rounded-md border border-white/10 bg-white px-3">
                      <span className="text-sm text-gray-500">@</span>
                      <Input
                        className="h-8 border-0 bg-transparent p-0 text-sm text-[#1F2933] placeholder:text-gray-400 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
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
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="min-h-[18px]">
                      {usernameStatus.status === 'checking' && (
                        <p className="text-xs text-white/50">Checking availability...</p>
                      )}
                      {usernameStatus.status === 'available' && (
                        <p className="text-xs text-green-400">{usernameStatus.message}</p>
                      )}
                      {usernameStatus.status === 'taken' && (
                        <div className="text-xs text-red-400">
                          <p>{usernameStatus.message}</p>
                          {usernameStatus.suggestion && (
                            <button
                              className="text-blue-400 underline"
                              type="button"
                              onClick={applySuggestion}
                            >
                              Use {usernameStatus.suggestion}
                            </button>
                          )}
                        </div>
                      )}
                      {usernameStatus.status === 'invalid' && (
                        <p className="text-xs text-red-400">{usernameStatus.message}</p>
                      )}
                      {usernameStatus.status === 'idle' && <p className="text-xs">\u00A0</p>}
                    </div>
                    <p className="text-xs text-white/50">
                      3-15 characters. Letters, numbers, underscores only.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-white/70">Social Media Accounts</Label>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <Input
                      className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#2563EB]/40"
                      value={formData.socialLinks.instagram}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          socialLinks: { ...formData.socialLinks, instagram: e.target.value },
                        })
                      }
                      placeholder="Instagram"
                      autoComplete="off"
                    />
                    <Input
                      className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#2563EB]/40"
                      value={formData.socialLinks.tiktok}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          socialLinks: { ...formData.socialLinks, tiktok: e.target.value },
                        })
                      }
                      placeholder="TikTok"
                      autoComplete="off"
                    />
                    <Input
                      className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#2563EB]/40"
                      value={formData.socialLinks.youtube}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          socialLinks: { ...formData.socialLinks, youtube: e.target.value },
                        })
                      }
                      placeholder="YouTube"
                      autoComplete="off"
                    />
                    <Input
                      className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#2563EB]/40"
                      value={formData.socialLinks.facebook}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          socialLinks: { ...formData.socialLinks, facebook: e.target.value },
                        })
                      }
                      placeholder="Facebook"
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button className={cn(secondaryBtnClass, 'h-9')} onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    className={cn(primaryBtnClass, 'h-9')}
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
                  <div className="rounded-xl border border-white/20 bg-white p-4">
                    <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#1F2933]">
                      <UserRound className="h-4 w-4 text-[#1F2933]/60" />
                      Profile Overview
                    </h4>
                    <p className="text-sm text-[#1F2933]/80">
                      <span className="text-[#1F2933]/50">Name:</span> {formData.firstName}{' '}
                      {formData.lastName}
                    </p>
                    <p className="text-sm text-[#1F2933]/80">
                      <span className="text-[#1F2933]/50">Username:</span> {formData.username}
                    </p>
                    {formData.nationality && (
                      <p className="text-sm text-[#1F2933]/80">
                        <span className="text-[#1F2933]/50">Nationality:</span>{' '}
                        {formData.nationality}
                      </p>
                    )}
                  </div>

                  {/* Categories and Countries sections removed — no selection UI in current form */}
                </div>

                <div className="flex gap-3">
                  <Button className={secondaryBtnClass} onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button className={primaryBtnClass} onClick={() => setStep(4)}>
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
                      className="border-white/40 data-[state=checked]:border-[#F17623] data-[state=checked]:bg-[#F17623] data-[state=checked]:text-white"
                    />
                    <Label htmlFor="terms" className="text-sm text-white/80">
                      I agree to the Terms and Agreements and confirm that the information provided
                      is accurate.
                    </Label>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button className={secondaryBtnClass} onClick={() => setStep(3)}>
                    Back
                  </Button>
                  <Button
                    className={primaryBtnClass}
                    onClick={handleSubmit}
                    disabled={isLoading || !formData.agreeToTerms}
                  >
                    {isLoading ? 'Submitting...' : 'Complete Registration'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

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
