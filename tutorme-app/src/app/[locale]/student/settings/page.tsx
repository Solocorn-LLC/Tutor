'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NotificationSettings } from '@/components/notifications/NotificationSettings'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, ArrowLeft, Save, Copy, Check } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

const GRADE_LEVELS = [
  { id: 6, name: '6th Grade' },
  { id: 7, name: '7th Grade' },
  { id: 8, name: '8th Grade' },
  { id: 9, name: '9th Grade' },
  { id: 10, name: '10th Grade' },
  { id: 11, name: '11th Grade' },
  { id: 12, name: '12th Grade' },
]

const SUBJECTS = [
  { id: 'math', name: 'Mathematics', icon: '📐' },
  { id: 'physics', name: 'Physics', icon: '⚡' },
  { id: 'chemistry', name: 'Chemistry', icon: '🧪' },
  { id: 'biology', name: 'Biology', icon: '🧬' },
  { id: 'english', name: 'English', icon: '📚' },
  { id: 'history', name: 'History', icon: '🏛️' },
]

// Add more subjects icon map or reuse
// ... existing constants ...

export default function StudentSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')
  const [copiedField, setCopiedField] = useState<'studentId' | 'accountId' | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    userId: '',
    role: '',
    studentUniqueId: '',
    // Profile
    avatarUrl: '',
    bio: '',
    subjectsOfInterest: [] as string[],
    preferredLanguages: [] as string[],
    // Preferences
    timezone: 'Asia/Shanghai',
    emailNotifications: true,
    smsNotifications: false,
  })

  useEffect(() => {
    fetch('/api/user/profile')
      .then(res => res.json())
      .then(data => {
        if (data.profile) {
          setFormData({
            name: data.profile.name || '',
            email: data.email || '',
            userId: data.userId || '',
            role: data.role || '',
            studentUniqueId: data.profile.studentUniqueId || '',
            avatarUrl: data.profile.avatarUrl || '',
            bio: data.profile.bio || '',
            subjectsOfInterest: data.profile.subjectsOfInterest || [],
            preferredLanguages: data.profile.preferredLanguages || [],
            timezone: data.profile.timezone || 'Asia/Shanghai',
            emailNotifications: data.profile.emailNotifications !== false,
            smsNotifications: data.profile.smsNotifications === true,
          })
        }
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load profile:', err)
        toast.error('Failed to load profile')
        setLoading(false)
      })
  }, [])

  const toggleSubject = (subjectId: string) => {
    setFormData(prev => ({
      ...prev,
      subjectsOfInterest: prev.subjectsOfInterest.includes(subjectId)
        ? prev.subjectsOfInterest.filter(s => s !== subjectId)
        : [...prev.subjectsOfInterest, subjectId],
    }))
  }

  const getCsrf = async () => {
    const res = await fetch('/api/csrf', { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    return data?.token ?? null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const csrf = await getCsrf()
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'X-CSRF-Token': csrf }),
        },
        credentials: 'include',
        body: JSON.stringify({
          // Profile
          avatarUrl: formData.avatarUrl,
          bio: formData.bio,
          subjectsOfInterest: formData.subjectsOfInterest,
          preferredLanguages: formData.preferredLanguages,
          // Preferences
          timezone: formData.timezone,
          emailNotifications: formData.emailNotifications,
          smsNotifications: formData.smsNotifications,
        }),
      })

      if (response.ok) {
        toast.success('Settings updated successfully')
      } else {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData?.error || 'Failed to update settings')
      }
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to update settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-blue-500" />
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    )
  }

  const sectionCardClass =
    'border border-slate-200 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]'

  const copyValue = async (kind: 'studentId' | 'accountId', value: string) => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopiedField(kind)
    setTimeout(() => setCopiedField(null), 1200)
    toast.success(kind === 'studentId' ? 'Student ID copied' : 'Account ID copied')
  }

  return (
    <div className="min-h-screen bg-white pb-12">
      <header className="safe-top sticky top-0 z-10 border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4">
          <Link href="/student/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Sidebar Tabs */}
          <div className="w-full flex-shrink-0 space-y-2 md:w-64">
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full rounded-lg px-4 py-2 text-left text-sm font-medium transition-colors ${
                activeTab === 'profile'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Profile details
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`w-full rounded-lg px-4 py-2 text-left text-sm font-medium transition-colors ${
                activeTab === 'notifications'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Notifications
            </button>
            <button
              onClick={() => setActiveTab('account')}
              className={`w-full rounded-lg px-4 py-2 text-left text-sm font-medium transition-colors ${
                activeTab === 'account'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Account Security
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 space-y-6">
            <form onSubmit={handleSubmit}>
              {activeTab === 'profile' && (
                <Card className={sectionCardClass}>
                  <CardHeader>
                    <CardTitle>Profile Details</CardTitle>
                    <CardDescription>Manage your public profile and preferences.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Avatar */}
                    <div className="flex items-center gap-4">
                      <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-full border-2 border-white bg-gray-200 shadow-sm">
                        {formData.avatarUrl ? (
                          <Image
                            src={formData.avatarUrl}
                            alt="Avatar"
                            width={80}
                            height={80}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gray-100 text-2xl font-bold text-gray-400">
                            {formData.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="avatarUrl">Avatar URL</Label>
                        <Input
                          id="avatarUrl"
                          placeholder="https://example.com/avatar.jpg"
                          value={formData.avatarUrl}
                          onChange={e => setFormData({ ...formData, avatarUrl: e.target.value })}
                          className="mt-1"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Paste a direct link to an image.
                        </p>
                      </div>
                    </div>

                    {/* Name & Bio */}
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Full Name</Label>
                        <Input id="name" value={formData.name} disabled className="bg-white" />
                        <p className="text-xs text-gray-500">
                          Contact{' '}
                          <a
                            href="mailto:support@solocorn.co"
                            className="text-blue-600 hover:underline"
                          >
                            support@solocorn.co
                          </a>{' '}
                          to change your name.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bio">Bio</Label>
                        <Input
                          id="bio"
                          placeholder="Tell us a bit about yourself..."
                          value={formData.bio}
                          onChange={e => setFormData({ ...formData, bio: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="border-t pt-6">
                      <h3 className="mb-4 text-lg font-medium">Academic & Interests</h3>

                      <div className="mb-6">
                        <Label className="mb-3 block">Subjects of Interest</Label>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                          {SUBJECTS.map(subject => (
                            <button
                              key={subject.id}
                              type="button"
                              onClick={() => toggleSubject(subject.id)}
                              className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
                                formData.subjectsOfInterest.includes(subject.id)
                                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <span className="text-lg">{subject.icon}</span>
                              <span className="text-sm font-medium">{subject.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                  <div className="flex justify-end rounded-b-lg border-t bg-white p-6">
                    <Button type="submit" disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </Card>
              )}

              {activeTab === 'notifications' && <NotificationSettings />}

              {activeTab === 'account' && (
                <Card className={sectionCardClass}>
                  <CardHeader>
                    <CardTitle>Account Security</CardTitle>
                    <CardDescription>Manage your account credentials.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input id="email" value={formData.email} disabled className="bg-white" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="accountId">Account ID</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="accountId"
                            value={formData.userId}
                            disabled
                            className="bg-white font-mono text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => copyValue('accountId', formData.userId)}
                            disabled={!formData.userId}
                            aria-label="Copy account ID"
                          >
                            {copiedField === 'accountId' ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      {formData.role === 'STUDENT' && (
                        <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3">
                          <Label htmlFor="studentUniqueId">Student ID (for parent linking)</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              id="studentUniqueId"
                              value={formData.studentUniqueId}
                              disabled
                              className="bg-white font-mono text-sm tracking-wide"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => copyValue('studentId', formData.studentUniqueId)}
                              disabled={!formData.studentUniqueId}
                              aria-label="Copy student ID"
                            >
                              {copiedField === 'studentId' ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                          <p className="text-xs text-blue-700">
                            Share this Student ID with your parent so they can link your account
                            during Parent signup.
                          </p>
                        </div>
                      )}
                      <div className="pt-4">
                        <Button variant="outline" className="text-gray-600" disabled>
                          Change Password (Coming Soon)
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}
