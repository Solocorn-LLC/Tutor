'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'
import { REGIONS } from '@/lib/data/tutor-categories'
import { BackButton } from '@/components/navigation'
import { cn } from '@/lib/utils'

const STEPS = [
  { number: 1, title: 'Account' },
  { number: 2, title: 'Security' },
  { number: 3, title: 'Profile' },
  { number: 4, title: 'Terms' },
]

function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="mb-6">
      <div className="relative flex items-center justify-between">
        {/* Connecting line */}
        <div className="absolute left-0 right-0 top-[18px] h-[2px]">
          <div className="h-full w-full bg-gray-200" />
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#F97316] to-[#EA580C] transition-all duration-300"
            style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
          />
        </div>
        {STEPS.map(s => (
          <div key={s.number} className="relative z-10 flex flex-col items-center">
            <span
              className={cn(
                'mb-2 text-[11px] font-medium',
                currentStep >= s.number ? 'text-[#F97316]' : 'text-gray-400'
              )}
            >
              {s.title}
            </span>
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white transition-all duration-200',
                currentStep >= s.number
                  ? 'bg-gradient-to-r from-[#F97316] to-[#EA580C] shadow-[0_0_16px_rgba(249,115,22,0.45)]'
                  : 'bg-gray-200 text-gray-500'
              )}
            >
              {s.number}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function StudentRegistrationPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    middleName: '',
    lastName: '',
    age: '',
    region: '',
    countryCode: '',
    isSixteen: false,
    tosAccepted: false,
  })

  const [region, countryCode] = [formData.region, formData.countryCode]

  const availableCountries = useMemo(() => {
    if (!region) return []
    const selectedRegion = REGIONS.find(r => r.id === region)
    return selectedRegion?.countries || []
  }, [region])

  const selectedRegionName = useMemo(
    () => REGIONS.find(r => r.id === region)?.name || 'Global',
    [region]
  )
  const selectedCountryName = useMemo(
    () => availableCountries.find(c => c.code === countryCode)?.name || '',
    [availableCountries, countryCode]
  )

  const goNext = () => setStep(prev => Math.min(4, prev + 1))
  const goBack = () => setStep(prev => Math.max(1, prev - 1))

  const validateStep = () => {
    if (step === 1) {
      const fullName = `${formData.firstName} ${formData.lastName}`.trim()
      if (fullName.length < 2) {
        toast.error('Please enter your first and last name')
        return false
      }
      if (!formData.email) {
        toast.error('Please enter your email address')
        return false
      }
      if (!formData.password || !formData.confirmPassword) {
        toast.error('Please enter and confirm your password')
        return false
      }
      if (formData.password !== formData.confirmPassword) {
        toast.error('Passwords do not match')
        return false
      }
      if (!formData.region) {
        toast.error('Please select your region')
        return false
      }
      if (!formData.countryCode) {
        toast.error('Please select your country')
        return false
      }
    }
    if (step === 2) {
      if (!formData.isSixteen) {
        toast.error('Please confirm if you are 16 years of age or older')
        return false
      }
    }
    if (step === 3) {
      if (!formData.age) {
        toast.error('Please enter your age')
        return false
      }
    }
    return true
  }

  const handleNext = () => {
    if (!validateStep()) return
    goNext()
  }

  const handleSubmit = async () => {
    if (!validateStep()) return

    if (!formData.isSixteen) {
      toast.error('You must be 16 years of age or older to create an account')
      return
    }

    if (!formData.tosAccepted) {
      toast.error('You must accept the Terms of Service')
      return
    }

    const fullName = `${formData.firstName} ${formData.lastName}`.trim()
    setIsLoading(true)
    try {
      const response = await fetch('/api/auth/register/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          name: fullName,
          tosAccepted: true,
          profileData: {
            age: Number(formData.age),
            region: selectedRegionName,
            country: selectedCountryName,
            isSixteen: formData.isSixteen,
            middleName: formData.middleName,
          },
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Student account created successfully!')
        router.push('/login')
      } else {
        toast.error(data.error || 'Failed to create account')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const passwordMismatch =
    formData.confirmPassword.length > 0 && formData.password !== formData.confirmPassword

  const inputClassName =
    'h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#F97316]/40'

  const primaryBtnClass =
    'flex-1 bg-white text-sm font-semibold text-[#1F2933] shadow-[0_4px_14px_rgba(0,0,0,0.15)] transition-all duration-200 hover:bg-[#F97316] hover:text-white hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 active:scale-[0.98]'
  const secondaryBtnClass =
    'flex-1 bg-white text-sm font-semibold text-[#1F2933] shadow-[0_4px_14px_rgba(0,0,0,0.15)] transition-all duration-200 hover:bg-[#1F2933] hover:text-white hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 active:scale-[0.98]'

  return (
    <div className="flex min-h-screen flex-col items-center bg-white px-4 pt-[120px] sm:pt-[180px]">
      <div className="w-full max-w-4xl">
        <BackButton href="/register" className="mb-4" />

        <Stepper currentStep={step} />

        <Card className="overflow-hidden rounded-[20px] border border-white/20 bg-gradient-to-br from-[#F97316] to-[#EA580C] shadow-[0_20px_50px_rgba(0,0,0,0.18),0_8px_20px_rgba(0,0,0,0.12)]">
          <CardContent className="space-y-5 px-5 py-5">
            {step === 1 && (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="firstName" className="text-xs text-white/70">
                      First Name
                    </Label>
                    <Input
                      id="firstName"
                      autoComplete="given-name"
                      value={formData.firstName}
                      onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                      placeholder="John"
                      className={inputClassName}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="middleName" className="text-xs text-white/70">
                      Middle Name
                    </Label>
                    <Input
                      id="middleName"
                      autoComplete="additional-name"
                      value={formData.middleName}
                      onChange={e => setFormData({ ...formData, middleName: e.target.value })}
                      placeholder="Optional"
                      className={inputClassName}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lastName" className="text-xs text-white/70">
                      Last Name
                    </Label>
                    <Input
                      id="lastName"
                      autoComplete="family-name"
                      value={formData.lastName}
                      onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                      placeholder="Doe"
                      className={inputClassName}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="email" className="text-xs text-white/70">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="student@example.com"
                    className={inputClassName}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="password" className="text-xs text-white/70">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        name="new-password"
                        autoComplete="new-password"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        placeholder="Create a password"
                        className={cn(inputClassName, 'pr-9')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(prev => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="confirmPassword" className="text-xs text-white/70">
                      Confirm Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        name="confirm-new-password"
                        autoComplete="new-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={formData.confirmPassword}
                        onChange={e =>
                          setFormData({ ...formData, confirmPassword: e.target.value })
                        }
                        placeholder="Confirm your password"
                        className={cn(inputClassName, 'pr-9')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(prev => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
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
                      {passwordMismatch ? 'Passwords do not match.' : '\u00A0'}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-white/70">Where do you live?</Label>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {/* Region */}
                    <div>
                      <Select
                        value={formData.region}
                        onValueChange={v => {
                          setFormData(prev => ({ ...prev, region: v, countryCode: '' }))
                        }}
                      >
                        <SelectTrigger className="h-8 w-full rounded-md border border-white/10 bg-white px-3 py-2 text-sm text-[#1F2933] shadow-sm transition-all duration-200 hover:border-slate-400/50 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#F97316]/40">
                          <SelectValue placeholder="Select Region..." />
                        </SelectTrigger>
                        <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-md border border-white/10 bg-[#1F2933] p-1.5 shadow-lg">
                          {REGIONS.filter(r => r.id !== 'global').map(regionItem => (
                            <SelectItem
                              key={regionItem.id}
                              value={regionItem.id}
                              className="rounded-md text-[13px] text-white/[0.94] hover:bg-white/15 focus:bg-white/20 focus:text-white"
                            >
                              {regionItem.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Country */}
                    <div>
                      <Select
                        value={formData.countryCode}
                        onValueChange={v => setFormData(prev => ({ ...prev, countryCode: v }))}
                        disabled={!formData.region}
                      >
                        <SelectTrigger
                          className={cn(
                            'h-8 w-full rounded-md border border-white/10 bg-white px-3 py-2 text-sm text-[#1F2933] shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#F97316]/40 disabled:opacity-100',
                            !formData.region && 'border-slate-400/20 bg-slate-100/50 text-slate-400'
                          )}
                        >
                          <SelectValue placeholder="Select Country" />
                        </SelectTrigger>
                        <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-md border border-white/10 bg-[#1F2933] p-1.5 shadow-lg">
                          {availableCountries.length === 0 ? (
                            <div className="py-3 text-center text-[13px] text-white/70">
                              No countries available
                            </div>
                          ) : (
                            availableCountries.map(country => (
                              <SelectItem
                                key={country.code}
                                value={country.code}
                                className="rounded-md text-[13px] text-white/[0.94] hover:bg-white/15 focus:bg-white/20 focus:text-white"
                              >
                                {country.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-3">
                  <Button
                    className={primaryBtnClass}
                    onClick={handleNext}
                    disabled={isLoading}
                  >
                    Next
                  </Button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="isSixteen"
                    checked={formData.isSixteen}
                    onCheckedChange={checked =>
                      setFormData(prev => ({ ...prev, isSixteen: checked === true }))
                    }
                    className="border-white/40 data-[state=checked]:border-[#F97316] data-[state=checked]:bg-[#F97316] data-[state=checked]:text-white"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="isSixteen" className="cursor-pointer text-sm text-white/80">
                      I am 16 years of age or older
                    </Label>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    className={secondaryBtnClass}
                    onClick={goBack}
                    disabled={isLoading}
                  >
                    Back
                  </Button>
                  <Button
                    className={primaryBtnClass}
                    onClick={handleNext}
                    disabled={isLoading}
                  >
                    Next
                  </Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="age" className="text-xs text-white/70">
                    Age
                  </Label>
                  <Input
                    id="age"
                    type="number"
                    min={5}
                    max={100}
                    value={formData.age}
                    onChange={e => setFormData({ ...formData, age: e.target.value })}
                    placeholder="Enter age"
                    className={inputClassName}
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    className={secondaryBtnClass}
                    onClick={goBack}
                    disabled={isLoading}
                  >
                    Back
                  </Button>
                  <Button
                    className={primaryBtnClass}
                    onClick={handleNext}
                    disabled={isLoading}
                  >
                    Register
                  </Button>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="tosAccepted"
                    checked={formData.tosAccepted}
                    onCheckedChange={checked =>
                      setFormData(prev => ({ ...prev, tosAccepted: checked === true }))
                    }
                    className="border-white/40 data-[state=checked]:border-[#F97316] data-[state=checked]:bg-[#F97316] data-[state=checked]:text-white"
                  />
                  <Label
                    htmlFor="tosAccepted"
                    className="cursor-pointer text-sm font-medium text-white/80"
                  >
                    I agree to the Terms and Agreements and confirm that the information provided
                    is accurate.
                  </Label>
                </div>

                <div className="flex gap-3">
                  <Button
                    className={secondaryBtnClass}
                    onClick={goBack}
                    disabled={isLoading}
                  >
                    Back
                  </Button>
                  <Button
                    className={primaryBtnClass}
                    onClick={handleSubmit}
                    disabled={isLoading || !formData.tosAccepted}
                  >
                    {isLoading ? 'Submitting...' : 'Complete Registration'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>


      </div>
    </div>
  )
}
