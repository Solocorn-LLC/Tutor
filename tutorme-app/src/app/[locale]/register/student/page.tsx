'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { REGIONS } from '@/lib/data/tutor-categories'
import { BackButton } from '@/components/navigation'
import { cn } from '@/lib/utils'

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
        {STEPS.map(s => (
          <div key={s.num} className="relative z-10 flex flex-col items-center">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                currentStep >= s.num
                  ? 'bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white'
                  : 'bg-gray-200 text-gray-500'
              )}
            >
              {currentStep > s.num ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <span className="text-sm font-medium">{s.num}</span>
              )}
            </div>
            <span
              className={`mt-2 text-xs font-medium transition-colors duration-200 ${
                currentStep >= s.num ? 'text-[#F97316]' : 'text-gray-400'
              }`}
            >
              {s.title}
            </span>
          </div>
        ))}
      </div>
      <div className="relative mb-8 mt-[-2.25rem]">
        <div className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 bg-gray-200" />
        <div
          className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 bg-gradient-to-r from-[#F97316] to-[#EA580C] transition-all duration-300 ease-in-out"
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
    nationality: '',
    isSixteen: false,
    tosAccepted: false,
  })

  const nationalityOptions = useMemo(
    () =>
      REGIONS.flatMap(region =>
        region.countries.map(country => ({
          ...country,
          regionName: region.name,
        }))
      ),
    []
  )

  const selectedNationality = useMemo(
    () => nationalityOptions.find(country => country.code === formData.nationality),
    [nationalityOptions, formData.nationality]
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
      if (!formData.nationality) {
        toast.error('Please select your nationality')
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
            region: selectedNationality?.regionName || 'Global',
            country: selectedNationality?.name || formData.nationality,
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
    <div className="min-h-screen bg-white px-4 py-10">
      <div className="mx-auto max-w-lg">
        <BackButton href="/register" className="mb-4" />

        <Stepper currentStep={step} />

        <Card className="overflow-hidden rounded-[22px] border border-white/20 bg-gradient-to-br from-[#F97316] to-[#EA580C] shadow-[0_18px_45px_rgba(0,0,0,0.18)]">
          <CardContent className="space-y-6 px-8 py-8">
            {step === 1 && (
              <>
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-white">First Name</Label>
                    <Input
                      id="firstName"
                      autoComplete="given-name"
                      value={formData.firstName}
                      onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                      placeholder="John"
                      className="h-11 rounded-[12px] bg-white text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#F97316]/40"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-white">Last Name</Label>
                    <Input
                      id="lastName"
                      autoComplete="family-name"
                      value={formData.lastName}
                      onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                      placeholder="Doe"
                      className="h-11 rounded-[12px] bg-white text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#F97316]/40"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="student@example.com"
                    className="h-11 rounded-[12px] bg-white text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#F97316]/40"
                  />
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-white">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        name="new-password"
                        autoComplete="new-password"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        placeholder="Create password"
                        className="h-11 rounded-[12px] bg-white pr-10 text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#F97316]/40"
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
                    <p className="min-h-[18px] text-xs text-red-500">
                      {formData.confirmPassword.length > 0 &&
                      formData.password !== formData.confirmPassword
                        ? 'Passwords do not match.'
                        : ''}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-white">Confirm Password</Label>
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
                        className="h-11 rounded-[12px] bg-white pr-10 text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#F97316]/40"
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
                    <p className="min-h-[18px] text-xs text-red-500">
                      {formData.confirmPassword.length > 0 &&
                      formData.password !== formData.confirmPassword
                        ? 'Passwords do not match.'
                        : ''}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nationality" className="text-white">Nationality</Label>
                  <Select
                    value={formData.nationality}
                    onValueChange={value => setFormData({ ...formData, nationality: value })}
                  >
                    <SelectTrigger id="nationality" className="h-11 rounded-[12px] border-transparent bg-white text-[#1F2933] focus:ring-[#F97316]/40">
                      <SelectValue placeholder="Select your nationality" />
                    </SelectTrigger>
                    <SelectContent>
                      {nationalityOptions.map(country => (
                        <SelectItem key={country.code} value={country.code}>
                          {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {step === 2 && (
              <div className="flex items-start space-x-3 rounded-[14px] border border-white/20 p-5">
                <Checkbox
                  id="isSixteen"
                  checked={formData.isSixteen}
                  onCheckedChange={checked =>
                    setFormData(prev => ({ ...prev, isSixteen: checked === true }))
                  }
                />
                <div className="space-y-1">
                  <Label htmlFor="isSixteen" className="cursor-pointer font-medium text-white">
                    I am 16 years of age or older
                  </Label>
                </div>
              </div>
            )}

            {step === 3 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="age" className="text-white">Age</Label>
                  <Input
                    id="age"
                    type="number"
                    min={5}
                    max={100}
                    value={formData.age}
                    onChange={e => setFormData({ ...formData, age: e.target.value })}
                    placeholder="Enter age"
                    className="h-11 rounded-[12px] bg-white text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-[#F97316]/40"
                  />
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div className="rounded-lg border border-white/20 bg-white p-4">
                  <h3 className="text-sm font-semibold text-[#1F2933]">
                    Agree to Terms of Service
                  </h3>
                  <p className="mt-2 text-sm text-[#1F2933]/70">
                    Please review and agree to the Terms of Service and Privacy Policy to complete
                    your registration.
                  </p>
                </div>
                <div className="flex items-start space-x-3 rounded-lg border border-white/20 bg-white/10 p-4">
                  <Checkbox
                    id="tosAccepted"
                    checked={formData.tosAccepted}
                    onCheckedChange={checked =>
                      setFormData(prev => ({ ...prev, tosAccepted: checked === true }))
                    }
                  />
                  <div className="space-y-1">
                    <Label htmlFor="tosAccepted" className="cursor-pointer font-medium text-white">
                      I accept the Terms of Service and Privacy Policy
                    </Label>
                    <p className="text-sm text-white/70">
                      You must accept the terms to create an account.
                    </p>
                  </div>
                </div>
              </>
            )}

            <div className={cn(step === 1 ? 'pt-2' : 'pt-1')}>
              {step === 1 ? (
                <Button
                  className="h-12 w-full rounded-[14px] bg-white text-base font-semibold text-[#1F2933] transition-all hover:bg-[#1F2933] hover:text-white"
                  onClick={handleNext}
                  disabled={isLoading}
                >
                  Continue
                </Button>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    className="border-white bg-transparent text-white transition-all hover:bg-white hover:text-[#1F2933]"
                    onClick={goBack}
                    disabled={step === 1 || isLoading}
                  >
                    Back
                  </Button>
                  {step < 4 ? (
                    <Button
                      className="bg-white font-semibold text-[#1F2933] transition-all hover:bg-[#1F2933] hover:text-white"
                      onClick={handleNext}
                      disabled={isLoading}
                    >
                      Continue
                    </Button>
                  ) : (
                    <Button
                      className="bg-white font-semibold text-[#1F2933] transition-all hover:bg-[#1F2933] hover:text-white"
                      onClick={handleSubmit}
                      disabled={isLoading}
                    >
                      {isLoading ? 'Creating Account...' : 'Confirm & Create Account'}
                    </Button>
                  )}
                </div>
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
