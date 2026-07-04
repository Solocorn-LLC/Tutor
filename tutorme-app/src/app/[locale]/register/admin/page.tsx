'use client'

import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { BackButton } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  adminRegistrationSchema,
  type AdminPermissionGroup,
} from '@/lib/validation/user-registration'

const PERMISSION_GROUPS: { id: AdminPermissionGroup; label: string; desc: string }[] = [
  {
    id: 'user_management',
    label: 'User Management',
    desc: 'Create, edit, and manage user accounts',
  },
  {
    id: 'content_management',
    label: 'Content Management',
    desc: 'Manage courses, lessons, and materials',
  },
  {
    id: 'financial_access',
    label: 'Financial Access',
    desc: 'View and manage financial data',
  },
  {
    id: 'system_settings',
    label: 'System Settings',
    desc: 'Configure platform settings',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    desc: 'Access reports and analytics',
  },
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

export default function AdminRegistrationPage() {
  const router = useRouter()
  const params = useParams<{ locale?: string }>()
  const localePrefix = params?.locale ? `/${params.locale}` : ''
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    organizationName: '',
    organizationSlug: '',
    adminLevel: 'standard' as 'super' | 'standard' | 'limited',
    jobTitle: '',
    department: '',
    permissions: [] as AdminPermissionGroup[],
    mfaEnabled: true,
    tosAccepted: false,
    bootstrapKey: '',
  })

  const updateField = useCallback(
    <K extends keyof typeof formData>(key: K, value: (typeof formData)[K]) => {
      setFormData(prev => {
        const next = { ...prev, [key]: value }
        if (key === 'organizationName' && !prev.organizationSlug) {
          next.organizationSlug = slugify(value as string)
        }
        return next
      })
      if (errors[key]) {
        setErrors(prev => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      }
    },
    [errors]
  )

  const validateStep = useCallback(
    (s: number): boolean => {
      const newErrors: Record<string, string> = {}

      if (s === 1) {
        if (!formData.firstName?.trim()) newErrors.firstName = 'First name is required'
        if (!formData.lastName?.trim()) newErrors.lastName = 'Last name is required'
        if (!formData.email?.trim()) newErrors.email = 'Email is required'
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
          newErrors.email = 'Please enter a valid email'
        if (!formData.phoneNumber?.trim()) newErrors.phoneNumber = 'Phone number is required'
        else if (!/^\+?[\d\s\-\(\)]{10,}$/.test(formData.phoneNumber))
          newErrors.phoneNumber = 'Valid phone number required'
      }

      if (s === 2) {
        if (!formData.organizationName?.trim())
          newErrors.organizationName = 'Organization name is required'
        else if (formData.organizationName.length < 2)
          newErrors.organizationName = 'Organization name must be at least 2 characters'
      }

      if (s === 3) {
        if (!formData.password) newErrors.password = 'Password is required'
        else if (formData.password.length < 8)
          newErrors.password = 'Password must be at least 8 characters'
        else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password))
          newErrors.password = 'Password must contain uppercase, lowercase, and number'
        if (formData.password !== formData.confirmPassword)
          newErrors.confirmPassword = "Passwords don't match"
        if (formData.permissions.length === 0)
          newErrors.permissions = 'Select at least one permission group'
        if (!formData.tosAccepted) newErrors.tosAccepted = 'You must accept the Terms of Service'
      }

      setErrors(newErrors)
      if (Object.keys(newErrors).length > 0) {
        toast.error(Object.values(newErrors)[0])
        return false
      }
      return true
    },
    [formData]
  )

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(s => Math.min(s + 1, 3))
    }
  }

  const handleBack = () => {
    setStep(s => Math.max(s - 1, 1))
    setErrors({})
  }

  const handleSubmit = async () => {
    const payload = {
      ...formData,
      organizationSlug: formData.organizationSlug || undefined,
    }
    const result = adminRegistrationSchema.safeParse(payload)
    if (!result.success) {
      const newErrors: Record<string, string> = {}
      result.error.issues.forEach(issue => {
        const path = issue.path[0] as string
        if (!newErrors[path]) newErrors[path] = issue.message
      })
      setErrors(newErrors)
      toast.error(Object.values(newErrors)[0] || 'Please check your form')
      return
    }

    setIsLoading(true)
    setErrors({})
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      // Include bootstrap key if provided (required when ADMIN_BOOTSTRAP_KEY env var is set)
      if (formData.bootstrapKey.trim()) {
        headers['x-admin-bootstrap-key'] = formData.bootstrapKey.trim()
      }

      const response = await fetch('/api/auth/register/admin', {
        method: 'POST',
        headers,
        body: JSON.stringify(result.data),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Admin account created successfully!')
        router.push(`${localePrefix}/admin/login`)
      } else {
        toast.error(data.error || 'Failed to create account')
      }
    } catch {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const togglePermission = (id: AdminPermissionGroup) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(id)
        ? prev.permissions.filter(p => p !== id)
        : [...prev.permissions, id],
    }))
  }

  const steps = [
    { number: 1, title: 'Account' },
    { number: 2, title: 'Organization' },
    { number: 3, title: 'Security' },
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
                className="absolute left-0 top-0 h-full bg-red-500 transition-all duration-300"
                style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
              />
            </div>
            {steps.map(s => (
              <div key={s.number} className="relative z-10 flex flex-col items-center">
                <span
                  className={`mb-2 text-[11px] font-medium ${step >= s.number ? 'text-red-500' : 'text-gray-400'}`}
                >
                  {s.title}
                </span>
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white transition-all duration-200 ${step >= s.number ? 'bg-gradient-to-r from-red-500 to-red-600 shadow-[0_0_16px_rgba(239,68,68,0.45)]' : 'bg-gray-200 text-gray-500'}`}
                >
                  {s.number}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-[20px] bg-gradient-to-br from-red-500 to-red-600 shadow-[0_20px_50px_rgba(0,0,0,0.18),0_8px_20px_rgba(0,0,0,0.12)]">
          {step >= 2 && (
            <div className="border-b border-white/10 px-5 pb-3 pt-5">
              <h2 className="text-lg font-semibold text-white/90">
                {step === 2 && 'Organization Setup'}
                {step === 3 && 'Security & Permissions'}
              </h2>
              <p className="text-xs text-white/50">
                {step === 2 && 'Configure your organization and role'}
                {step === 3 && 'Set password and permission groups'}
              </p>
            </div>
          )}
          <div className="space-y-5 px-5 py-5">
            {step === 1 && (
              <>
                <form autoComplete="off" onSubmit={e => e.preventDefault()}>
                  <div className="space-y-5">
                    {/* Name row */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">First Name *</Label>
                        <Input
                          className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-red-500/40"
                          value={formData.firstName}
                          onChange={e => updateField('firstName', e.target.value)}
                          autoComplete="off"
                        />
                        {errors.firstName && (
                          <p className="text-xs text-red-300">{errors.firstName}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">Last Name *</Label>
                        <Input
                          className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-red-500/40"
                          value={formData.lastName}
                          onChange={e => updateField('lastName', e.target.value)}
                          autoComplete="off"
                        />
                        {errors.lastName && (
                          <p className="text-xs text-red-300">{errors.lastName}</p>
                        )}
                      </div>
                    </div>

                    {/* Email row */}
                    <div className="space-y-1">
                      <Label className="text-xs text-white/70">Email Address *</Label>
                      <Input
                        className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-red-500/40"
                        type="email"
                        name="admin_registration_email"
                        autoComplete="off"
                        value={formData.email}
                        onChange={e => updateField('email', e.target.value)}
                      />
                      {errors.email && <p className="text-xs text-red-300">{errors.email}</p>}
                    </div>

                    {/* Phone */}
                    <div className="space-y-1">
                      <Label className="text-xs text-white/70">Phone Number *</Label>
                      <Input
                        className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-red-500/40"
                        value={formData.phoneNumber}
                        onChange={e => updateField('phoneNumber', e.target.value)}
                        placeholder="+86 138 0000 0000"
                        autoComplete="off"
                      />
                      {errors.phoneNumber && (
                        <p className="text-xs text-red-300">{errors.phoneNumber}</p>
                      )}
                    </div>

                    {/* Next button */}
                    <div className="flex gap-3">
                      <Button className={primaryBtnClass} onClick={handleNext}>
                        Next
                      </Button>
                    </div>
                  </div>
                </form>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-5">
                  <div className="space-y-1">
                    <Label className="text-xs text-white/70">Organization Name *</Label>
                    <Input
                      className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-red-500/40"
                      value={formData.organizationName}
                      onChange={e => updateField('organizationName', e.target.value)}
                      placeholder="Acme Education Inc."
                      autoComplete="off"
                    />
                    {errors.organizationName && (
                      <p className="text-xs text-red-300">{errors.organizationName}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-white/70">Organization Slug (optional)</Label>
                    <Input
                      className="h-8 border-white/10 bg-white font-mono text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-red-500/40"
                      value={formData.organizationSlug}
                      onChange={e => updateField('organizationSlug', e.target.value)}
                      placeholder="acme-education"
                      autoComplete="off"
                    />
                    <p className="text-xs text-white/50">
                      Lowercase letters, numbers, hyphens only. Auto-generated from name if empty.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-white/70">Admin Level</Label>
                    <Select
                      value={formData.adminLevel}
                      onValueChange={v =>
                        updateField('adminLevel', v as 'super' | 'standard' | 'limited')
                      }
                    >
                      <SelectTrigger className="h-8 w-full rounded-md border border-white/10 bg-white px-3 py-2 text-sm text-[#1F2933] shadow-sm transition-all duration-200 hover:border-slate-400/50 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-red-500/40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-md border border-white/10 bg-[#1F2933] p-1.5 shadow-lg">
                        <SelectItem
                          value="super"
                          className="rounded-md text-[13px] text-white/[0.94] hover:bg-white/15"
                        >
                          Super Admin
                        </SelectItem>
                        <SelectItem
                          value="standard"
                          className="rounded-md text-[13px] text-white/[0.94] hover:bg-white/15"
                        >
                          Standard Admin
                        </SelectItem>
                        <SelectItem
                          value="limited"
                          className="rounded-md text-[13px] text-white/[0.94] hover:bg-white/15"
                        >
                          Limited Admin
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-white/70">Job Title</Label>
                      <Input
                        className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-red-500/40"
                        value={formData.jobTitle}
                        onChange={e => updateField('jobTitle', e.target.value)}
                        placeholder="Platform Admin"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-white/70">Department</Label>
                      <Input
                        className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-red-500/40"
                        value={formData.department}
                        onChange={e => updateField('department', e.target.value)}
                        placeholder="Operations"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button className={secondaryBtnClass} onClick={handleBack}>
                    Back
                  </Button>
                  <Button className={primaryBtnClass} onClick={handleNext}>
                    Next
                  </Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-5">
                  {/* Password */}
                  <div className="space-y-1">
                    <Label className="text-xs text-white/70">Password *</Label>
                    <div className="relative">
                      <Input
                        className="h-8 border-white/10 bg-white pr-9 text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-red-500/40"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={e => updateField('password', e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
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
                    <p className="text-xs text-white/50">
                      Min 8 chars, at least one uppercase, one lowercase, one number.
                    </p>
                    {errors.password && <p className="text-xs text-red-300">{errors.password}</p>}
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1">
                    <Label className="text-xs text-white/70">Confirm Password *</Label>
                    <div className="relative">
                      <Input
                        className="h-8 border-white/10 bg-white pr-9 text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-red-500/40"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={formData.confirmPassword}
                        onChange={e => updateField('confirmPassword', e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
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
                    {errors.confirmPassword && (
                      <p className="text-xs text-red-300">{errors.confirmPassword}</p>
                    )}
                  </div>

                  {/* Bootstrap Key */}
                  <div className="space-y-1">
                    <Label className="text-xs text-white/70">Bootstrap Key (if required)</Label>
                    <Input
                      className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-red-500/40"
                      type="password"
                      value={formData.bootstrapKey}
                      onChange={e => updateField('bootstrapKey', e.target.value)}
                      placeholder="Enter bootstrap key if configured"
                      autoComplete="off"
                    />
                    <p className="text-xs text-white/50">
                      Required only if ADMIN_BOOTSTRAP_KEY environment variable is set on the
                      server.
                    </p>
                  </div>

                  {/* Permission Groups */}
                  <div className="space-y-4">
                    <Label className="text-xs text-white/70">Permission Groups *</Label>
                    <p className="text-xs text-white/50">
                      Select at least one permission group for your admin role.
                    </p>
                    <div className="space-y-3">
                      {PERMISSION_GROUPS.map(group => (
                        <div
                          key={group.id}
                          className="flex items-start space-x-3 rounded-lg border border-white/10 bg-white/10 p-3"
                        >
                          <Checkbox
                            id={group.id}
                            checked={formData.permissions.includes(group.id)}
                            onCheckedChange={() => togglePermission(group.id)}
                            className="border-white/40 data-[state=checked]:border-red-400 data-[state=checked]:bg-red-400 data-[state=checked]:text-white"
                          />
                          <div className="flex-1 space-y-1">
                            <Label
                              htmlFor={group.id}
                              className="cursor-pointer text-sm font-medium text-white"
                            >
                              {group.label}
                            </Label>
                            <p className="text-xs text-white/60">{group.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {errors.permissions && (
                      <p className="text-xs text-red-300">{errors.permissions}</p>
                    )}
                  </div>

                  {/* MFA */}
                  <div className="flex items-start space-x-3 rounded-lg border border-white/10 bg-white/10 p-3">
                    <Checkbox
                      id="mfa"
                      checked={formData.mfaEnabled}
                      onCheckedChange={checked => updateField('mfaEnabled', checked === true)}
                      className="border-white/40 data-[state=checked]:border-red-400 data-[state=checked]:bg-red-400 data-[state=checked]:text-white"
                    />
                    <div className="space-y-1">
                      <Label
                        htmlFor="mfa"
                        className="cursor-pointer text-sm font-medium text-white"
                      >
                        Enable Two-Factor Authentication
                      </Label>
                      <p className="text-xs text-white/60">
                        Add an extra layer of security to your account
                      </p>
                    </div>
                  </div>

                  {/* Terms */}
                  <div className="flex items-start space-x-3 rounded-lg border border-white/20 bg-white/10 p-4">
                    <Checkbox
                      id="terms"
                      checked={formData.tosAccepted}
                      onCheckedChange={checked => updateField('tosAccepted', checked === true)}
                      className="border-white/40 data-[state=checked]:border-red-400 data-[state=checked]:bg-red-400 data-[state=checked]:text-white"
                    />
                    <Label
                      htmlFor="terms"
                      className="cursor-pointer text-sm font-medium text-white"
                    >
                      I agree to the Terms of Service and Privacy Policy *
                    </Label>
                  </div>
                  {errors.tosAccepted && (
                    <p className="text-xs text-red-300">{errors.tosAccepted}</p>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button className={secondaryBtnClass} onClick={handleBack} disabled={isLoading}>
                    Back
                  </Button>
                  <Button
                    className={primaryBtnClass}
                    onClick={handleSubmit}
                    disabled={
                      isLoading || !formData.tosAccepted || formData.permissions.length === 0
                    }
                  >
                    {isLoading ? 'Creating Account...' : 'Create Admin Account'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
