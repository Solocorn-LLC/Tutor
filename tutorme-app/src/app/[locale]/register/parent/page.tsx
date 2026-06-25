'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BackButton } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { parentRegistrationSchema } from '@/lib/validation/user-registration'
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

interface StudentForm {
  name: string
  childEmail: string
  childUniqueId: string
  grade: string
  subjects: string[]
}

interface EmergencyContact {
  name: string
  relationship: string
  phone: string
}

export default function ParentRegistrationPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [emailStatus, setEmailStatus] = useState<{
    status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid'
    message?: string
  }>({
    status: 'idle',
  })

  // Form data
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    relationship: 'parent',
    timezone: 'Asia/Shanghai',
    preferredLanguage: 'zh-CN',
    students: [
      { name: '', childEmail: '', childUniqueId: '', grade: '', subjects: [] },
    ] as StudentForm[],
    emergencyContacts: [{ name: '', relationship: '', phone: '' }] as EmergencyContact[],
    notificationPreferences: {
      email: true,
      sms: true,
      app: true,
      weeklyReports: true,
      paymentNotifications: true,
      emergencyContacts: true,
      mentions: true,
    },
    tosAccepted: false,
  })

  const handleAddStudent = () => {
    setFormData(prev => ({
      ...prev,
      students: [
        ...prev.students,
        { name: '', childEmail: '', childUniqueId: '', grade: '', subjects: [] },
      ],
    }))
  }

  const handleRemoveStudent = (index: number) => {
    setFormData(prev => ({
      ...prev,
      students: prev.students.filter((_, i) => i !== index),
    }))
  }

  const handleStudentChange = (
    index: number,
    field: keyof StudentForm,
    value: string | string[]
  ) => {
    setFormData(prev => ({
      ...prev,
      students: prev.students.map((student, i) =>
        i === index ? { ...student, [field]: value } : student
      ),
    }))
  }

  const handleAddEmergencyContact = () => {
    setFormData(prev => ({
      ...prev,
      emergencyContacts: [...prev.emergencyContacts, { name: '', relationship: '', phone: '' }],
    }))
  }

  const handleRemoveEmergencyContact = (index: number) => {
    setFormData(prev => ({
      ...prev,
      emergencyContacts: prev.emergencyContacts.filter((_, i) => i !== index),
    }))
  }

  const handleEmergencyContactChange = (
    index: number,
    field: keyof EmergencyContact,
    value: string
  ) => {
    setFormData(prev => ({
      ...prev,
      emergencyContacts: prev.emergencyContacts.map((contact, i) =>
        i === index ? { ...contact, [field]: value } : contact
      ),
    }))
  }

  const handleSubmit = async () => {
    const fullName = `${formData.firstName} ${formData.lastName}`.trim()
    if (fullName.length < 2) {
      toast.error('Please enter your first and last name')
      return
    }

    const validationPayload = {
      email: formData.email,
      password: formData.password,
      confirmPassword: formData.confirmPassword,
      phoneNumber: formData.phoneNumber,
      relationship: formData.relationship,
      timezone: formData.timezone,
      preferredLanguage: formData.preferredLanguage,
      students: formData.students,
      emergencyContacts: formData.emergencyContacts.filter(
        c => c.name && c.relationship && c.phone
      ),
      notificationPreferences: formData.notificationPreferences,
      tosAccepted: formData.tosAccepted,
    }

    const result = parentRegistrationSchema.safeParse(validationPayload)
    if (!result.success) {
      const firstError = result.error.issues[0]
      toast.error(firstError?.message ?? 'Please check your form and try again')
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'PARENT',
          email: formData.email,
          password: formData.password,
          name: fullName,
          tosAccepted: formData.tosAccepted,
          profileData: {
            phoneNumber: formData.phoneNumber,
            relationship: formData.relationship,
            timezone: formData.timezone,
            preferredLanguage: formData.preferredLanguage,
          },
          additionalData: {
            students: formData.students.map(s => ({
              childEmail: s.childEmail?.trim() || undefined,
              childUniqueId: s.childUniqueId?.trim() || undefined,
              name: s.name,
              grade: s.grade,
              subjects: s.subjects,
            })),
            emergencyContacts: formData.emergencyContacts.filter(
              c => c.name && c.relationship && c.phone
            ),
            notificationPreferences: formData.notificationPreferences,
          },
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Parent account created successfully!')
        router.push('/login')
      } else {
        toast.error(data.error || 'Failed to create account')
      }
    } catch {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
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

  const validateStepOne = async () => {
    if (!formData.firstName || !formData.lastName) {
      toast.error('First and last name are required')
      return false
    }
    if (!formData.email) {
      toast.error('Email is required')
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
    if (emailStatus.status === 'idle') {
      const ok = await checkEmailAvailability(formData.email)
      if (!ok) {
        toast.error('Email already exists')
        return false
      }
    }
    if (emailStatus.status === 'checking') {
      const ok = await checkEmailAvailability(formData.email)
      if (!ok) {
        toast.error('Email already exists')
        return false
      }
    }
    if (!formData.password || !formData.confirmPassword) {
      toast.error('Password and confirmation are required')
      return false
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match')
      return false
    }
    if (!formData.phoneNumber?.trim()) {
      toast.error('Phone number is required')
      return false
    }
    if (!/^\+?[\d\s\-\(\)]{10,}$/.test(formData.phoneNumber)) {
      toast.error('Valid phone number required')
      return false
    }
    return true
  }

  const validateStepTwo = () => {
    if (!formData.students.length) {
      toast.error('Please add at least one student')
      return false
    }
    for (const student of formData.students) {
      const hasAny = Boolean(
        student.name ||
        student.childEmail ||
        student.childUniqueId ||
        student.grade ||
        student.subjects.length
      )
      if (!hasAny) {
        toast.error('Please complete the student details or remove the empty entry')
        return false
      }
      if (!student.childEmail && !student.childUniqueId) {
        toast.error('Provide a child email or unique ID for each student')
        return false
      }
      if (student.childEmail) {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailPattern.test(student.childEmail)) {
          toast.error('Enter a valid child email address')
          return false
        }
      }
      if (student.childUniqueId && student.childUniqueId.trim().length < 8) {
        toast.error('Child unique ID must be at least 8 characters')
        return false
      }
    }
    return true
  }

  const validateStepThree = () => {
    for (const contact of formData.emergencyContacts) {
      const hasAny = Boolean(contact.name || contact.relationship || contact.phone)
      if (!hasAny) continue
      if (!contact.name || !contact.relationship || !contact.phone) {
        toast.error('Complete all emergency contact fields or remove the entry')
        return false
      }
      if (!/^\+?[\d\s\-\(\)]{10,}$/.test(contact.phone)) {
        toast.error('Enter a valid emergency contact phone number')
        return false
      }
    }
    return true
  }

  const validateStepFour = () => {
    if (!formData.tosAccepted) {
      toast.error('You must accept the Terms of Service')
      return false
    }
    return true
  }

  const steps = [
    { number: 1, title: 'Account' },
    { number: 2, title: 'Children' },
    { number: 3, title: 'Emergency' },
    { number: 4, title: 'Preferences' },
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
                className="absolute left-0 top-0 h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
              />
            </div>
            {steps.map(s => (
              <div key={s.number} className="relative z-10 flex flex-col items-center">
                <span
                  className={`mb-2 text-[11px] font-medium ${step >= s.number ? 'text-emerald-500' : 'text-gray-400'}`}
                >
                  {s.title}
                </span>
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white transition-all duration-200 ${step >= s.number ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-[0_0_16px_rgba(16,185,129,0.45)]' : 'bg-gray-200 text-gray-500'}`}
                >
                  {s.number}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-[20px] bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-[0_20px_50px_rgba(0,0,0,0.18),0_8px_20px_rgba(0,0,0,0.12)]">
          {step >= 3 && (
            <div className="border-b border-white/10 px-5 pb-3 pt-5">
              <h2 className="text-lg font-semibold text-white/90">
                {step === 3 && 'Emergency Contacts'}
                {step === 4 && 'Notification Preferences'}
              </h2>
              <p className="text-xs text-white/50">
                {step === 3 && 'Add emergency contacts for safety purposes'}
                {step === 4 && 'Choose how you want to receive notifications'}
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
                        <Label className="text-xs text-white/70">First Name</Label>
                        <Input
                          className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-emerald-500/40"
                          value={formData.firstName}
                          onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">Last Name</Label>
                        <Input
                          className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-emerald-500/40"
                          value={formData.lastName}
                          onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                          autoComplete="off"
                        />
                      </div>
                    </div>

                    {/* Email row */}
                    <div className="space-y-1">
                      <Label className="text-xs text-white/70">Email</Label>
                      <Input
                        className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-emerald-500/40"
                        type="email"
                        name="parent_registration_email"
                        autoComplete="off"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                      />
                      {emailStatus.status === 'checking' && (
                        <p className="text-xs text-white/50">Checking availability...</p>
                      )}
                      {emailStatus.status === 'available' && (
                        <p className="text-xs text-green-300">{emailStatus.message}</p>
                      )}
                      {emailStatus.status === 'taken' && (
                        <p className="text-xs text-red-300">{emailStatus.message}</p>
                      )}
                    </div>

                    {/* Password row */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">Password</Label>
                        <div className="relative">
                          <Input
                            className="h-8 border-white/10 bg-white pr-9 text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-emerald-500/40"
                            type={showPassword ? 'text' : 'password'}
                            name="parent_registration_password"
                            autoComplete="new-password"
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
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
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">Confirm Password</Label>
                        <div className="relative">
                          <Input
                            className="h-8 border-white/10 bg-white pr-9 text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-emerald-500/40"
                            type={showConfirmPassword ? 'text' : 'password'}
                            name="parent_registration_confirm_password"
                            autoComplete="new-password"
                            value={formData.confirmPassword}
                            onChange={e =>
                              setFormData({ ...formData, confirmPassword: e.target.value })
                            }
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
                        <p className="min-h-[18px] text-xs text-red-300">
                          {formData.password.length > 0 &&
                          formData.confirmPassword.length > 0 &&
                          formData.password !== formData.confirmPassword
                            ? 'Passwords do not match.'
                            : '\u00A0'}
                        </p>
                      </div>
                    </div>

                    {/* Phone */}
                    <div className="space-y-1">
                      <Label className="text-xs text-white/70">Phone Number</Label>
                      <Input
                        className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-emerald-500/40"
                        value={formData.phoneNumber}
                        onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
                        placeholder="+86 138 0000 0000"
                        autoComplete="off"
                      />
                    </div>

                    {/* Relationship */}
                    <div className="space-y-1">
                      <Label className="text-xs text-white/70">Relationship to Student</Label>
                      <Select
                        value={formData.relationship}
                        onValueChange={value => setFormData({ ...formData, relationship: value })}
                      >
                        <SelectTrigger className="h-8 w-full rounded-md border border-white/10 bg-white px-3 py-2 text-sm text-[#1F2933] shadow-sm transition-all duration-200 hover:border-slate-400/50 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-md border border-white/10 bg-[#1F2933] p-1.5 shadow-lg">
                          <SelectItem
                            value="parent"
                            className="rounded-md text-[13px] text-white/[0.94] hover:bg-white/15 focus:bg-white/20 focus:text-white"
                          >
                            Parent
                          </SelectItem>
                          <SelectItem
                            value="guardian"
                            className="rounded-md text-[13px] text-white/[0.94] hover:bg-white/15 focus:bg-white/20 focus:text-white"
                          >
                            Guardian
                          </SelectItem>
                          <SelectItem
                            value="step-parent"
                            className="rounded-md text-[13px] text-white/[0.94] hover:bg-white/15 focus:bg-white/20 focus:text-white"
                          >
                            Step-Parent
                          </SelectItem>
                          <SelectItem
                            value="grandparent"
                            className="rounded-md text-[13px] text-white/[0.94] hover:bg-white/15 focus:bg-white/20 focus:text-white"
                          >
                            Grandparent
                          </SelectItem>
                          <SelectItem
                            value="other"
                            className="rounded-md text-[13px] text-white/[0.94] hover:bg-white/15 focus:bg-white/20 focus:text-white"
                          >
                            Other
                          </SelectItem>
                        </SelectContent>
                      </Select>
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
                <div className="space-y-5">
                  {formData.students.map((student, index) => (
                    <div
                      key={index}
                      className="space-y-4 rounded-xl border border-white/10 bg-white/10 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-white">Child {index + 1}</h4>
                        {formData.students.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveStudent(index)}
                            className="text-red-300 hover:bg-white/10 hover:text-red-200"
                          >
                            Remove
                          </Button>
                        )}
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">Child&apos;s Name</Label>
                        <Input
                          className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-emerald-500/40"
                          value={student.name}
                          onChange={e => handleStudentChange(index, 'name', e.target.value)}
                          placeholder="Enter child's name"
                          autoComplete="off"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">
                          Child&apos;s Email (Required - child must register first)
                        </Label>
                        <Input
                          className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-emerald-500/40"
                          type="email"
                          value={student.childEmail}
                          onChange={e => handleStudentChange(index, 'childEmail', e.target.value)}
                          placeholder="child@example.com"
                          autoComplete="off"
                        />
                        <p className="text-xs text-white/50">
                          Or use Student ID below if child has one
                        </p>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">
                          Student Unique ID (Alternative to email)
                        </Label>
                        <Input
                          className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-emerald-500/40"
                          value={student.childUniqueId}
                          onChange={e =>
                            handleStudentChange(index, 'childUniqueId', e.target.value)
                          }
                          placeholder="STU-xxxxxxxxxxxx"
                          autoComplete="off"
                        />
                        <p className="text-xs text-white/50">
                          Min 8 characters. Students can copy this from Student Dashboard → Settings
                          → Account Security → Student ID.
                        </p>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">Grade Level</Label>
                        <Select
                          value={student.grade}
                          onValueChange={value => handleStudentChange(index, 'grade', value)}
                        >
                          <SelectTrigger className="h-8 w-full rounded-md border border-white/10 bg-white px-3 py-2 text-sm text-[#1F2933] shadow-sm transition-all duration-200 hover:border-slate-400/50 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                            <SelectValue placeholder="Select grade" />
                          </SelectTrigger>
                          <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-md border border-white/10 bg-[#1F2933] p-1.5 shadow-lg">
                            {[
                              'Grade 1',
                              'Grade 2',
                              'Grade 3',
                              'Grade 4',
                              'Grade 5',
                              'Grade 6',
                              'Grade 7',
                              'Grade 8',
                              'Grade 9',
                              'Grade 10',
                              'Grade 11',
                              'Grade 12',
                              'University',
                            ].map(grade => (
                              <SelectItem
                                key={grade}
                                value={grade}
                                className="rounded-md text-[13px] text-white/[0.94] hover:bg-white/15 focus:bg-white/20 focus:text-white"
                              >
                                {grade}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}

                  <Button
                    variant="outline"
                    onClick={handleAddStudent}
                    className="w-full border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  >
                    Add Another Child
                  </Button>
                </div>

                <div className="flex gap-3">
                  <Button className={secondaryBtnClass} onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    className={primaryBtnClass}
                    onClick={() => {
                      if (validateStepTwo()) setStep(3)
                    }}
                  >
                    Next
                  </Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-5">
                  {formData.emergencyContacts.map((contact, index) => (
                    <div
                      key={index}
                      className="space-y-4 rounded-xl border border-white/10 bg-white/10 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-white">
                          Emergency Contact {index + 1}
                        </h4>
                        {formData.emergencyContacts.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveEmergencyContact(index)}
                            className="text-red-300 hover:bg-white/10 hover:text-red-200"
                          >
                            Remove
                          </Button>
                        )}
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">Name</Label>
                        <Input
                          className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-emerald-500/40"
                          value={contact.name}
                          onChange={e =>
                            handleEmergencyContactChange(index, 'name', e.target.value)
                          }
                          placeholder="Contact name"
                          autoComplete="off"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">Relationship</Label>
                        <Input
                          className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-emerald-500/40"
                          value={contact.relationship}
                          onChange={e =>
                            handleEmergencyContactChange(index, 'relationship', e.target.value)
                          }
                          placeholder="e.g., Spouse, Aunt, Uncle"
                          autoComplete="off"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-white/70">Phone Number</Label>
                        <Input
                          className="h-8 border-white/10 bg-white text-sm text-[#1F2933] placeholder:text-gray-400 focus-visible:ring-emerald-500/40"
                          value={contact.phone}
                          onChange={e =>
                            handleEmergencyContactChange(index, 'phone', e.target.value)
                          }
                          placeholder="+86 138 0000 0000"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  ))}

                  {formData.emergencyContacts.length < 3 && (
                    <Button
                      variant="outline"
                      onClick={handleAddEmergencyContact}
                      className="w-full border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                    >
                      Add Emergency Contact
                    </Button>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button className={secondaryBtnClass} onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button
                    className={primaryBtnClass}
                    onClick={() => {
                      if (validateStepThree()) setStep(4)
                    }}
                  >
                    Next
                  </Button>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div className="space-y-5">
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-white">Notification Channels</h4>
                    <div className="space-y-3">
                      {[
                        {
                          key: 'email',
                          label: 'Email Notifications',
                          description: 'Receive updates via email',
                        },
                        {
                          key: 'sms',
                          label: 'SMS Notifications',
                          description: 'Receive text message alerts',
                        },
                        {
                          key: 'app',
                          label: 'In-App Notifications',
                          description: 'Receive notifications in the app',
                        },
                      ].map(({ key, label, description }) => (
                        <div key={key} className="flex items-start space-x-3">
                          <Checkbox
                            id={key}
                            checked={
                              formData.notificationPreferences[
                                key as keyof typeof formData.notificationPreferences
                              ]
                            }
                            onCheckedChange={checked =>
                              setFormData(prev => ({
                                ...prev,
                                notificationPreferences: {
                                  ...prev.notificationPreferences,
                                  [key]: checked,
                                },
                              }))
                            }
                            className="border-white/40 data-[state=checked]:border-emerald-400 data-[state=checked]:bg-emerald-400 data-[state=checked]:text-white"
                          />
                          <div className="space-y-1">
                            <Label htmlFor={key} className="text-sm font-medium text-white">
                              {label}
                            </Label>
                            <p className="text-xs text-white/60">{description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-white">Notification Types</h4>
                    <div className="space-y-3">
                      {[
                        {
                          key: 'weeklyReports',
                          label: 'Weekly Progress Reports',
                          description: "Get weekly summaries of your child's progress",
                        },
                        {
                          key: 'paymentNotifications',
                          label: 'Payment Notifications',
                          description: 'Receive alerts about payments and invoices',
                        },
                        {
                          key: 'emergencyContacts',
                          label: 'Emergency Contact Alerts',
                          description: 'Get notified about important updates',
                        },
                        {
                          key: 'mentions',
                          label: 'Mentions',
                          description: 'Get notified when a tutor mentions you',
                        },
                      ].map(({ key, label, description }) => (
                        <div key={key} className="flex items-start space-x-3">
                          <Checkbox
                            id={key}
                            checked={
                              formData.notificationPreferences[
                                key as keyof typeof formData.notificationPreferences
                              ]
                            }
                            onCheckedChange={checked =>
                              setFormData(prev => ({
                                ...prev,
                                notificationPreferences: {
                                  ...prev.notificationPreferences,
                                  [key]: checked,
                                },
                              }))
                            }
                            className="border-white/40 data-[state=checked]:border-emerald-400 data-[state=checked]:bg-emerald-400 data-[state=checked]:text-white"
                          />
                          <div className="space-y-1">
                            <Label htmlFor={key} className="text-sm font-medium text-white">
                              {label}
                            </Label>
                            <p className="text-xs text-white/60">{description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 rounded-lg border border-white/20 bg-white/10 p-4">
                    <Checkbox
                      id="tosAccepted"
                      checked={formData.tosAccepted}
                      onCheckedChange={checked =>
                        setFormData(prev => ({ ...prev, tosAccepted: checked === true }))
                      }
                      className="border-white/40 data-[state=checked]:border-emerald-400 data-[state=checked]:bg-emerald-400 data-[state=checked]:text-white"
                    />
                    <div className="space-y-1">
                      <Label
                        htmlFor="tosAccepted"
                        className="cursor-pointer text-sm font-medium text-white"
                      >
                        I accept the Terms of Service and Privacy Policy
                      </Label>
                      <p className="text-xs text-white/60">
                        You must accept the terms to create an account.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button className={secondaryBtnClass} onClick={() => setStep(3)}>
                    Back
                  </Button>
                  <Button
                    className={primaryBtnClass}
                    onClick={() => {
                      if (!validateStepFour()) return
                      void handleSubmit()
                    }}
                    disabled={isLoading || !formData.tosAccepted}
                  >
                    {isLoading ? 'Creating Account...' : 'Create Account'}
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
