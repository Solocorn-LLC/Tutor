'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
import { toast } from 'sonner'
import { BookOpen, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { REGIONS } from '@/lib/data/tutor-categories'
import { BackButton } from '@/components/navigation'

const STEPS = [
  { num: 1, title: 'Account' },
  { num: 2, title: 'Security' },
  { num: 3, title: 'Profile' },
  { num: 4, title: 'Terms' },
]

function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {STEPS.map((s, i) => (
          <div key={s.num} className="relative z-10 flex flex-col items-center">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors duration-200 ${
                currentStep > s.num
                  ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white'
                  : currentStep === s.num
                    ? 'border-[#1D4ED8] bg-white text-[#1D4ED8]'
                    : 'border-gray-200 bg-white text-gray-400'
              }`}
            >
              {currentStep > s.num ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <span className="text-sm font-medium">{s.num}</span>
              )}
            </div>
            <span
              className={`mt-2 text-xs font-medium transition-colors duration-200 ${
                currentStep >= s.num ? 'text-slate-900' : 'text-gray-400'
              }`}
            >
              {s.title}
            </span>
          </div>
        ))}
      </div>
      <div className="relative mb-8 mt-[-2rem]">
        <div className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 bg-gray-200" />
        <div
          className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 bg-[#1D4ED8] transition-all duration-300 ease-in-out"
          style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
        />
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
    lastName: '',
    age: '',
    region: '',
    country: '',
    isSixteen: false,
    tosAccepted: false,
  })

  const selectedRegion = useMemo(
    () => REGIONS.find(region => region.id === formData.region),
    [formData.region]
  )
  const countryOptions = useMemo(
    () => (selectedRegion ? selectedRegion.countries : []),
    [selectedRegion]
  )
  const selectedCountry = useMemo(
    () => countryOptions.find(country => country.code === formData.country),
    [countryOptions, formData.country]
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
    }
    if (step === 2) {
      if (!formData.password || !formData.confirmPassword) {
        toast.error('Please enter and confirm your password')
        return false
      }
      if (formData.password !== formData.confirmPassword) {
        toast.error('Passwords do not match')
        return false
      }
    }
    if (step === 3) {
      if (!formData.age) {
        toast.error('Please enter your age')
        return false
      }
      if (!formData.region || !formData.country) {
        toast.error('Please select your region and country')
        return false
      }
      if (!formData.isSixteen) {
        toast.error('Please confirm if you are 16 years of age or older')
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
            region: selectedRegion?.name || formData.region,
            country: selectedCountry?.name || formData.country,
            isSixteen: formData.isSixteen,
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

  return (
    <div className="min-h-screen bg-white px-4 py-8">
      <div className="mx-auto max-w-lg">
        <BackButton href="/register" className="mb-4" />

        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#1D4ED8]/20">
            <BookOpen className="h-8 w-8 text-[#1D4ED8]" />
          </div>
          <h1 className="text-3xl font-bold text-[#1F2933]">Student Registration</h1>
        </div>

        <Stepper currentStep={step} />

        <Card>
          <CardHeader>
            <CardTitle className="text-[#1F2933]">Create Your Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {step === 1 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      autoComplete="given-name"
                      value={formData.firstName}
                      onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      autoComplete="family-name"
                      value={formData.lastName}
                      onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="student@example.com"
                  />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        name="new-password"
                        autoComplete="new-password"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        placeholder="Create password"
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
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
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
                        placeholder="Confirm password"
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
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="age">Age</Label>
                    <Input
                      id="age"
                      type="number"
                      min={5}
                      max={100}
                      value={formData.age}
                      onChange={e => setFormData({ ...formData, age: e.target.value })}
                      placeholder="Enter age"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region">Region</Label>
                    <Select
                      value={formData.region}
                      onValueChange={value =>
                        setFormData({ ...formData, region: value, country: '' })
                      }
                    >
                      <SelectTrigger id="region">
                        <SelectValue placeholder="Select region" />
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Select
                    value={formData.country}
                    onValueChange={value => setFormData({ ...formData, country: value })}
                    disabled={!formData.region}
                  >
                    <SelectTrigger id="country">
                      <SelectValue
                        placeholder={formData.region ? 'Select country' : 'Select region first'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {countryOptions.map(country => (
                        <SelectItem key={country.code} value={country.code}>
                          {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-start space-x-3 rounded-lg border p-4">
                  <Checkbox
                    id="isSixteen"
                    checked={formData.isSixteen}
                    onCheckedChange={checked =>
                      setFormData(prev => ({ ...prev, isSixteen: checked === true }))
                    }
                  />
                  <div className="space-y-1">
                    <Label htmlFor="isSixteen" className="cursor-pointer font-medium">
                      I am 16 years of age or older
                    </Label>
                  </div>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div className="rounded-lg border bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-800">
                    Agree to Terms of Service
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Please review and agree to the Terms of Service and Privacy Policy to complete
                    your registration.
                  </p>
                </div>
                <div className="flex items-start space-x-3 rounded-lg border p-4">
                  <Checkbox
                    id="tosAccepted"
                    checked={formData.tosAccepted}
                    onCheckedChange={checked =>
                      setFormData(prev => ({ ...prev, tosAccepted: checked === true }))
                    }
                  />
                  <div className="space-y-1">
                    <Label htmlFor="tosAccepted" className="cursor-pointer font-medium">
                      I accept the Terms of Service and Privacy Policy
                    </Label>
                    <p className="text-sm text-gray-500">
                      You must accept the terms to create an account.
                    </p>
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" onClick={goBack} disabled={step === 1 || isLoading}>
                Back
              </Button>
              {step < 4 ? (
                <Button
                  className="bg-[#1D4ED8] hover:bg-[#1E40AF]"
                  onClick={handleNext}
                  disabled={isLoading}
                >
                  Continue
                </Button>
              ) : (
                <Button
                  className="bg-[#1D4ED8] hover:bg-[#1E40AF]"
                  onClick={handleSubmit}
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating Account...' : 'Confirm & Create Account'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-[#1D4ED8] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
