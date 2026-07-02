'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Loader2,
  Save,
  CreditCard,
  FileText,
  Bell,
  Shield,
  User,
  UserCircle,
  Trash2,
  Power,
  Smartphone,
  Lock,
  LogOut,
  Download,
  Check,
  AlertTriangle,
  LayoutPanelTop,
  PenTool,
  ChevronDown,
  ChevronUp,
  History,
  DollarSign,
  Calendar,
} from 'lucide-react'
import { CollapsibleCard } from '@/components/collapsible-card'
import { REGIONS } from '@/lib/data/tutor-categories'
import { CountryFlag } from '@/components/country-flag'
import { useAutoScrollOnExpand } from '@/hooks/use-auto-scroll-on-expand'
import { AvatarUploader } from '@/components/avatar-uploader'
import { SessionCalendarPanel } from '@/components/session-calendar-panel'
import { PendingRefundsPanel } from '@/components/tutor/pending-refunds-panel'
import SessionLog from '@/components/session-log'

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'zh', name: '中文 (Chinese)' },
  { code: 'es', name: 'Español (Spanish)' },
  { code: 'fr', name: 'Français (French)' },
  { code: 'de', name: 'Deutsch (German)' },
  { code: 'ja', name: '日本語 (Japanese)' },
]

const SECTION_CARD_CLASS =
  'overflow-hidden bg-white shadow-[0_14px_45px_rgba(0,0,0,0.14)] rounded-[16px]'

interface PaymentMethod {
  id: string
  type: 'card' | 'paypal'
  last4?: string
  brand?: string
  expiryMonth?: string
  expiryYear?: string
  isDefault: boolean
}

interface BillingRecord {
  id: string
  date: string
  description: string
  amount: number
  status: 'paid' | 'pending' | 'failed'
  invoiceUrl?: string
}

// One-on-One Settings Card Component
function OneOnOneSettingsCard() {
  const [settings, setSettings] = useState({
    oneOnOneEnabled: true,
    hourlyRate: 50,
    sessionDuration: 60,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/one-on-one/settings', {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setSettings({
          oneOnOneEnabled: data.oneOnOneEnabled ?? true,
          hourlyRate: data.hourlyRate ?? 50,
          sessionDuration: data.sessionDuration ?? 60,
        })
      }
    } catch (error) {
      console.error('Failed to load one-on-one settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/one-on-one/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          oneOnOneEnabled: settings.oneOnOneEnabled,
          hourlyRate: settings.hourlyRate,
        }),
      })
      if (res.ok) {
        toast.success('One-on-one settings saved')
      } else {
        toast.error('Failed to save settings')
      }
    } catch (error) {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <CollapsibleCard
        flush
        className={SECTION_CARD_CLASS}
        title="1-on-1 Booking"
        icon={<Calendar className="h-5 w-5 text-slate-900" />}
        defaultOpen
      >
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </CollapsibleCard>
    )
  }

  return (
    <CollapsibleCard
      flush
      className={SECTION_CARD_CLASS}
      title="1-on-1 Booking"
      description="Allow students to book private sessions with you"
      icon={<Calendar className="h-5 w-5 text-slate-900" />}
      defaultOpen
    >
      <div className="space-y-6 p-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between rounded-[12px] border p-4 transition-all hover:bg-slate-50 hover:shadow-sm">
          <div>
            <p className="font-medium">Enable 1-on-1 Booking</p>
            <p className="text-sm text-gray-500">
              Allow students to request private tutoring sessions
            </p>
          </div>
          <Switch
            checked={settings.oneOnOneEnabled}
            onCheckedChange={checked =>
              setSettings(prev => ({ ...prev, oneOnOneEnabled: checked }))
            }
          />
        </div>

        {settings.oneOnOneEnabled && (
          <>
            <Separator />

            {/* Hourly Rate */}
            <div className="space-y-2">
              <Label htmlFor="hourlyRate">Hourly Rate (USD)</Label>
              <div className="flex items-center justify-start gap-2">
                <span className="text-lg text-gray-500">$</span>
                <Input
                  id="hourlyRate"
                  type="number"
                  min={1}
                  max={1000}
                  value={settings.hourlyRate}
                  onChange={e =>
                    setSettings(prev => ({
                      ...prev,
                      hourlyRate: parseInt(e.target.value) || 0,
                    }))
                  }
                  className="w-32"
                />
                <span className="text-sm text-gray-500">per hour</span>
              </div>
              <p className="text-xs text-gray-500">
                Students will see this rate when booking a session
              </p>
              {(!settings.hourlyRate || settings.hourlyRate <= 0) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <span className="font-medium">⚠️ Rate Required:</span> You must set an hourly rate
                  above $0 for students to be able to book one-on-one sessions with you.
                </div>
              )}
            </div>

            {/* Session Duration */}
            <div className="space-y-2">
              <Label htmlFor="sessionDuration">Session Duration</Label>
              <Select
                value={settings.sessionDuration.toString()}
                onValueChange={value =>
                  setSettings(prev => ({
                    ...prev,
                    sessionDuration: parseInt(value),
                  }))
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>
    </CollapsibleCard>
  )
}

export default function TutorSettings() {
  const { data: session, update: updateSession } = useSession()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const searchParams = useSearchParams()
  const handleTabChange = (value: string) => {
    setActiveTab(value)
    // Scroll to top of content area when tab changes
    const contentArea = document.querySelector('.h-full.space-y-6.overflow-y-auto')
    if (contentArea) {
      contentArea.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab')
    const validTabs = [
      'profile',
      'billing',
      'history',
      'refunds',
      'notifications',
      'security',
      'controls',
      'session-log',
    ]
    return validTabs.find(tab => tab === tabParam) ?? 'profile'
  })
  const [profileOpen, setProfileOpen] = useState(true)
  const [publicProfileOpen, setPublicProfileOpen] = useState(false)
  const [taxOpen, setTaxOpen] = useState(false)
  const [tutorInfoOpen, setTutorInfoOpen] = useState(false)

  const profileRef = useAutoScrollOnExpand(profileOpen)
  const publicProfileRef = useAutoScrollOnExpand(publicProfileOpen)
  const taxRef = useAutoScrollOnExpand(taxOpen)
  const tutorInfoRef = useAutoScrollOnExpand(tutorInfoOpen)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)

  const [formData, setFormData] = useState({
    name: session?.user?.name || '',
    email: session?.user?.email || '',
    avatarUrl: '',
    language: 'en',
    timezone: 'Asia/Shanghai',
    nationality: '',
    countryOfResidence: '',
    specialties: [] as string[],
    tutorNationalities: [] as string[],
    categoryNationalityCombinations: [] as string[],
    bio: '',
    socialLinks: {} as Record<string, string>,
  })

  // Load profile on mount
  useEffect(() => {
    fetch('/api/user/profile', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data?.profile) {
          setFormData(prev => ({
            ...prev,
            avatarUrl: data.profile.avatarUrl || '',
            nationality: data.profile.nationality || '',
            countryOfResidence: data.profile.countryOfResidence || '',
            specialties: data.profile.specialties || [],
            tutorNationalities: data.profile.tutorNationalities || [],
            categoryNationalityCombinations: data.profile.categoryNationalityCombinations || [],
            bio: data.profile.bio || '',
            socialLinks:
              data.profile.socialLinks && typeof data.profile.socialLinks === 'object'
                ? (data.profile.socialLinks as Record<string, string>)
                : {},
          }))
        }
      })
      .catch(() => {
        // Silent fail - will use empty avatar
      })
  }, [])

  const [notifications, setNotifications] = useState({
    emailMarketing: true,
    emailLessons: true,
    emailBilling: true,
    pushNotifications: false,
    smsReminders: false,
  })

  // Live session mirroring preferences (stored in localStorage)
  const [mirrorPreferences, setMirrorPreferences] = useState({
    defaultMirrorClass: true,
    defaultMirrorBoard: false,
  })

  // Load mirror preferences from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('tutor-mirror-preferences')
      if (raw) {
        const parsed = JSON.parse(raw)
        setMirrorPreferences({
          defaultMirrorClass: parsed.defaultMirrorClass ?? true,
          defaultMirrorBoard: parsed.defaultMirrorBoard ?? false,
        })
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  const saveMirrorPreferences = () => {
    try {
      localStorage.setItem('tutor-mirror-preferences', JSON.stringify(mirrorPreferences))
      toast.success('Mirroring preferences saved')
    } catch {
      toast.error('Failed to save preferences')
    }
  }

  // Course sync mode preference (stored in localStorage)
  const [syncMode, setSyncMode] = useState<'auto' | 'manual' | 'ask'>('auto')

  // Load sync mode from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('tutor-sync-mode')
      if (raw && ['auto', 'manual', 'ask'].includes(raw)) {
        setSyncMode(raw as 'auto' | 'manual' | 'ask')
      }
    } catch {
      // ignore
    }
  }, [])

  const saveSyncMode = () => {
    try {
      localStorage.setItem('tutor-sync-mode', syncMode)
      toast.success('Sync mode saved')
    } catch {
      toast.error('Failed to save sync mode')
    }
  }

  // Document parsing preference (stored in localStorage)
  const [parseDocuments, setParseDocuments] = useState(false)

  // Load document parsing preference from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('tutor-parse-documents')
      if (raw) {
        setParseDocuments(raw === 'true')
      }
    } catch {
      // ignore
    }
  }, [])

  const saveParseDocuments = () => {
    try {
      localStorage.setItem('tutor-parse-documents', String(parseDocuments))
      toast.success('Document parsing preference saved')
    } catch {
      toast.error('Failed to save preference')
    }
  }

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    {
      id: '1',
      type: 'card',
      last4: '4242',
      brand: 'Visa',
      expiryMonth: '12',
      expiryYear: '25',
      isDefault: true,
    },
  ])

  const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([
    {
      id: 'inv_001',
      date: '2024-03-01',
      description: 'Tutor Subscription - March 2024',
      amount: 15.0,
      status: 'paid',
    },
    {
      id: 'inv_002',
      date: '2024-02-01',
      description: 'Tutor Subscription - February 2024',
      amount: 15.0,
      status: 'paid',
    },
  ])

  const [connectedDevices, setConnectedDevices] = useState([
    {
      id: '1',
      name: 'Chrome on MacOS',
      location: 'Shanghai, CN',
      lastActive: 'Active now',
      isCurrent: true,
    },
    {
      id: '2',
      name: 'Safari on iPhone',
      location: 'Singapore',
      lastActive: 'Yesterday 18:11',
      isCurrent: false,
    },
  ])

  // Billing & Tax state
  const [billingAddress, setBillingAddress] = useState('')
  const [renewTerm, setRenewTerm] = useState('1')
  const [payoutBalance] = useState('$0.00')
  const [taxRegion, setTaxRegion] = useState('')
  const [taxCountry, setTaxCountry] = useState('')
  const [taxLegalName, setTaxLegalName] = useState('')
  const [taxAddress, setTaxAddress] = useState('')
  const [taxId, setTaxId] = useState('')
  const [taxEntityType, setTaxEntityType] = useState('Individual')

  const selectedTaxRegion = useMemo(
    () => REGIONS.find(region => region.id === taxRegion),
    [taxRegion]
  )
  const taxCountryOptions = useMemo(
    () => (selectedTaxRegion ? selectedTaxRegion.countries : []),
    [selectedTaxRegion]
  )

  const timeZoneOptions = useMemo(() => {
    if (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl) {
      return (
        Intl as unknown as { supportedValuesOf: (value: 'timeZone') => string[] }
      ).supportedValuesOf('timeZone')
    }
    return ['UTC', 'Asia/Shanghai', 'America/New_York', 'Europe/London']
  }, [])

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredLanguage: formData.language,
          timezone: formData.timezone,
        }),
      })

      if (response.ok) {
        toast.success('Profile updated successfully')
      } else {
        throw new Error('Failed to update profile')
      }
    } catch (err) {
      toast.error('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotifications = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/user/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifications),
      })

      if (response.ok) {
        toast.success('Notification preferences saved')
      } else {
        throw new Error('Failed to save preferences')
      }
    } catch (err) {
      toast.error('Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      toast.error('Please type DELETE to confirm')
      return
    }
    try {
      const response = await fetch('/api/user/account', {
        method: 'DELETE',
      })
      if (response.ok) {
        toast.success('Account deleted. Redirecting...')
        window.location.href = '/'
      } else {
        throw new Error('Failed to delete account')
      }
    } catch (err) {
      toast.error('Failed to delete account')
    }
  }

  const handleDeactivateAccount = async () => {
    try {
      const response = await fetch('/api/user/account/deactivate', {
        method: 'POST',
      })
      if (response.ok) {
        toast.success('Account deactivated. Redirecting...')
        window.location.href = '/'
      } else {
        throw new Error('Failed to deactivate account')
      }
    } catch (err) {
      toast.error('Failed to deactivate account')
    }
  }

  const handleLogoutAllDevices = async () => {
    try {
      const response = await fetch('/api/auth/logout-all', {
        method: 'POST',
      })
      if (response.ok) {
        toast.success('Logged out from all devices')
        setConnectedDevices(devices => devices.filter(d => d.isCurrent))
      } else {
        throw new Error('Failed to logout')
      }
    } catch (err) {
      toast.error('Failed to logout from all devices')
    }
  }

  const setDefaultPaymentMethod = (id: string) => {
    setPaymentMethods(methods => methods.map(m => ({ ...m, isDefault: m.id === id })))
    toast.success('Default payment method updated')
  }

  const removePaymentMethod = (id: string) => {
    setPaymentMethods(methods => methods.filter(m => m.id !== id))
    toast.success('Payment method removed')
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-blue-500" />
          <p className="text-gray-600">Loading account...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-full flex-col bg-white px-3 pb-0 pt-2 lg:px-4 lg:pt-0">
      {/* Hero */}
      <section className="relative mb-4 flex-shrink-0 overflow-hidden rounded-[20px] border border-white/10 bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.20)] ring-1 ring-white/20">
        <div className="text-center">
          <h1 className="text-xl font-bold text-white">Account Settings</h1>
          <p className="mt-1 text-sm text-white/60">Manage your profile and preferences</p>
        </div>
      </section>

      {/* Mode selector + tab content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-0.5">
        <SessionCalendarPanel
          value={activeTab}
          onValueChange={handleTabChange}
          variant="charcoal"
          tabs={[
            { value: 'profile', label: 'Profile', icon: User },
            { value: '1-on-1', label: '1-on-1', icon: Calendar },
            { value: 'billing', label: 'Billing', icon: CreditCard },
            { value: 'refunds', label: 'Refunds', icon: DollarSign },
            { value: 'notifications', label: 'Notifications', icon: Bell },
            { value: 'security', label: 'Security', icon: Shield },
            { value: 'controls', label: 'Account', icon: UserCircle },
            { value: 'session-log', label: 'Session Log', icon: History },
          ]}
        >
          {/* Profile & Identity */}
          <TabsContent
            value="profile"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="h-full space-y-6 overflow-y-auto pb-4 pr-2">
              <CollapsibleCard
                className={SECTION_CARD_CLASS}
                title="Your Profile"
                icon={<User className="h-5 w-5 text-slate-900" />}
                defaultOpen
              >
                <div className="space-y-6 p-6">
                  {/* Avatar */}
                  <div className="flex items-center gap-4">
                    <AvatarUploader
                      avatarUrl={formData.avatarUrl}
                      uploadUrl="/api/tutor/public-profile/avatar"
                      deleteUrl="/api/tutor/public-profile/avatar"
                      size={80}
                      fallbackText={formData.name.charAt(0).toUpperCase() || '?'}
                      onUploadSuccess={url => {
                        const busted = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`
                        setFormData(prev => ({ ...prev, avatarUrl: busted }))
                        updateSession({ image: busted }).catch(() => {})
                      }}
                      onDeleteSuccess={() => {
                        setFormData(prev => ({ ...prev, avatarUrl: '' }))
                        updateSession({ image: null }).catch(() => {})
                      }}
                    />
                    <div className="flex-1">
                      <Label>Profile Photo</Label>
                      <p className="mt-1 text-xs text-gray-500">Upload a profile photo</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Name & Email */}
                  <div className="grid gap-4 md:grid-cols-2">
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
                        to change your name
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input id="email" value={formData.email} disabled className="bg-white" />
                      <p className="text-xs text-gray-500">
                        Contact{' '}
                        <a
                          href="mailto:support@solocorn.co"
                          className="text-blue-600 hover:underline"
                        >
                          support@solocorn.co
                        </a>{' '}
                        to change your email
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Language & Timezone */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="language">Preferred Language</Label>
                      <select
                        id="language"
                        value={formData.language}
                        onChange={e => setFormData({ ...formData, language: e.target.value })}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      >
                        {LANGUAGES.map(lang => (
                          <option key={lang.code} value={lang.code}>
                            {lang.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Input
                        id="timezone"
                        value={formData.timezone}
                        disabled
                        className="bg-white"
                      />
                      <p className="text-xs text-gray-500">Automatically detected</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Bio Preview */}
                  <div className="space-y-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{formData.name || 'Your Name'}</p>
                      <p className="mt-1 line-clamp-3 text-sm text-slate-500">
                        {formData.bio ||
                          'No bio added yet. Your bio helps students learn more about you.'}
                      </p>
                    </div>

                    {Object.entries(formData.socialLinks).filter(([, v]) => v).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(formData.socialLinks)
                          .filter(([, v]) => v)
                          .map(([platform, url]) => (
                            <a
                              key={platform}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
                            >
                              {platform.charAt(0).toUpperCase() + platform.slice(1)}
                            </a>
                          ))}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button
                        className="bg-[#2563EB] text-white hover:border-[#2563EB] hover:bg-white hover:text-[#2563EB]"
                        onClick={handleSaveProfile}
                        disabled={saving}
                      >
                        {saving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Save
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  {/* Nationality */}
                  <div className="space-y-2">
                    <Label className="inline-flex items-center gap-1.5">
                      <CountryFlag countryName={formData.nationality} size="xs" />
                      Nationality
                    </Label>
                    <Input
                      value={formData.nationality || 'Not specified'}
                      disabled
                      className="bg-white"
                    />
                    <p className="text-xs text-gray-500">
                      Your nationality as selected during registration
                    </p>
                  </div>
                </div>
              </CollapsibleCard>

              {/* Tax Information */}
              <CollapsibleCard
                flush
                className={SECTION_CARD_CLASS}
                title="Tax Information"
                description="Required for payout and tax reporting"
                icon={<FileText className="h-5 w-5 text-slate-900" />}
              >
                <div className="space-y-6 p-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Region</Label>
                      <Select
                        value={taxRegion}
                        onValueChange={value => {
                          setTaxRegion(value)
                          setTaxCountry('')
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select region" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {REGIONS.map(region => (
                            <SelectItem key={region.id} value={region.id}>
                              {region.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Country</Label>
                      <Select
                        value={taxCountry}
                        onValueChange={setTaxCountry}
                        disabled={!taxRegion}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={taxRegion ? 'Select country' : 'Select region first'}
                          />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {taxCountryOptions.map(country => (
                            <SelectItem key={country.code} value={country.code}>
                              {country.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Legal Name</Label>
                      <Input
                        value={taxLegalName}
                        onChange={e => setTaxLegalName(e.target.value)}
                        placeholder="Legal name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Input
                        value={taxAddress}
                        onChange={e => setTaxAddress(e.target.value)}
                        placeholder="Registered address"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tax ID (optional)</Label>
                      <Input
                        value={taxId}
                        onChange={e => setTaxId(e.target.value)}
                        placeholder="Tax ID"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Business / Individual</Label>
                      <Select value={taxEntityType} onValueChange={setTaxEntityType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Individual">Individual</SelectItem>
                          <SelectItem value="Business">Business</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => toast.success('Tax information saved')}
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Tax Info
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CollapsibleCard>
            </div>
          </TabsContent>

          {/* 1-on-1 Booking */}
          <TabsContent value="1-on-1" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="h-full space-y-6 overflow-y-auto pb-4 pr-2">
              <OneOnOneSettingsCard />
            </div>
          </TabsContent>

          {/* Billing & Payment */}
          <TabsContent
            value="billing"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="h-full space-y-6 overflow-y-auto pb-4 pr-2">
              <CollapsibleCard
                flush
                className={SECTION_CARD_CLASS}
                title="Payment Methods"
                description="Manage your payment methods for subscription"
                icon={<CreditCard className="h-5 w-5 text-slate-900" />}
                defaultOpen
              >
                <div className="space-y-6 p-6">
                  {paymentMethods.map(method => (
                    <div
                      key={method.id}
                      className="flex items-center justify-between rounded-[12px] border p-4 transition-all hover:bg-slate-50 hover:shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                          <CreditCard className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {method.brand} •••• {method.last4}{' '}
                            {method.isDefault && (
                              <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                Default
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-gray-500">
                            Expires {method.expiryMonth}/{method.expiryYear}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => removePaymentMethod(method.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}

                  <Button variant="outline" className="w-full">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Add Payment Method
                  </Button>
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                flush
                className={SECTION_CARD_CLASS}
                title="Subscription Plan"
                description="Manage your tutor subscription"
                icon={<DollarSign className="h-5 w-5 text-slate-900" />}
              >
                <div className="space-y-6 p-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Renew Subscription</Label>
                      <Select value={renewTerm} onValueChange={setRenewTerm}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select term" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 month</SelectItem>
                          <SelectItem value="2">2 months</SelectItem>
                          <SelectItem value="12">1 year</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Subscription Cost</Label>
                      <div className="h-10 rounded-md border bg-white px-3 py-2 text-sm">$15</div>
                    </div>
                    <div className="space-y-2">
                      <Label>Action</Label>
                      <Button
                        className="w-full bg-[#1D4ED8] text-white hover:bg-[#1E40AF]"
                        onClick={() => toast.message('Subscription renewal queued')}
                      >
                        Renew
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      className="border-[#F59E0B] text-[#92400E] hover:bg-[#FDE68A]"
                      onClick={() => {
                        if (confirm('Are you sure you want to cancel your subscription?')) {
                          toast.message(
                            'Thank you for being with us. We hope you return another time.'
                          )
                        }
                      }}
                    >
                      Cancel subscription
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => toast.message('Payment history loading')}
                    >
                      Payment history
                    </Button>
                    <Button variant="outline" onClick={() => toast.message('Billing details')}>
                      Billing
                    </Button>
                  </div>
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                flush
                className={SECTION_CARD_CLASS}
                title="Payout Settings"
                description="Manage your earnings and withdrawals"
                icon={<DollarSign className="h-5 w-5 text-slate-900" />}
              >
                <div className="space-y-6 p-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Payout Available Balance</Label>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 rounded-md border bg-white px-3 py-2 text-sm">
                          {payoutBalance}
                        </div>
                        <Button
                          variant="modal-primary"
                          onClick={() => toast.message('Withdrawal request sent')}
                        >
                          Withdraw
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Download earnings report</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => toast.message('CSV report generated')}
                        >
                          CSV
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => toast.message('PDF report generated')}
                        >
                          PDF
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                flush
                className={SECTION_CARD_CLASS}
                title="Billing History"
                description="View and download your invoices and receipts"
                icon={<FileText className="h-5 w-5 text-slate-900" />}
              >
                <div className="space-y-4 p-6">
                  {billingHistory.map(invoice => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between rounded-[12px] border p-4 transition-all hover:bg-slate-50 hover:shadow-sm"
                    >
                      <div>
                        <p className="font-medium">{invoice.description}</p>
                        <p className="text-sm text-gray-500">{invoice.date}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-medium">${invoice.amount.toFixed(2)}</p>
                          <span
                            className={`text-xs ${
                              invoice.status === 'paid'
                                ? 'text-green-600'
                                : invoice.status === 'pending'
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                            }`}
                          >
                            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                          </span>
                        </div>
                        <Button variant="ghost" size="icon">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {billingHistory.length === 0 && (
                    <div className="py-8 text-center text-gray-500">
                      <FileText className="mx-auto mb-2 h-8 w-8" />
                      <p>No billing history available</p>
                    </div>
                  )}
                </div>
              </CollapsibleCard>
            </div>
          </TabsContent>

          {/* Refunds */}
          <TabsContent
            value="refunds"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="h-full space-y-6 overflow-y-auto pb-4 pr-2">
              <CollapsibleCard
                flush
                className={SECTION_CARD_CLASS}
                title="Refunds"
                description="Pending refund requests across all your courses — approve to process via the payment gateway, or decline."
                icon={<DollarSign className="h-5 w-5 text-slate-900" />}
                defaultOpen
              >
                <div className="p-6">
                  <PendingRefundsPanel showCourse hideWhenEmpty={false} />
                </div>
              </CollapsibleCard>
            </div>
          </TabsContent>

          {/* Notifications */}
          <TabsContent
            value="notifications"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="h-full space-y-6 overflow-y-auto pb-4 pr-2">
              <CollapsibleCard
                flush
                className={SECTION_CARD_CLASS}
                title="Notification Preferences"
                description="Control how and when we contact you"
                icon={<Bell className="h-5 w-5 text-slate-900" />}
                defaultOpen
              >
                <div className="space-y-6 p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Marketing Emails</p>
                        <p className="text-sm text-gray-500">
                          Receive updates about new features and offers
                        </p>
                      </div>
                      <Switch
                        checked={notifications.emailMarketing}
                        onCheckedChange={checked =>
                          setNotifications(prev => ({ ...prev, emailMarketing: checked }))
                        }
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Lesson Reminders</p>
                        <p className="text-sm text-gray-500">Get notified about upcoming lessons</p>
                      </div>
                      <Switch
                        checked={notifications.emailLessons}
                        onCheckedChange={checked =>
                          setNotifications(prev => ({ ...prev, emailLessons: checked }))
                        }
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Billing Notifications</p>
                        <p className="text-sm text-gray-500">Receipts and payment confirmations</p>
                      </div>
                      <Switch
                        checked={notifications.emailBilling}
                        onCheckedChange={checked =>
                          setNotifications(prev => ({ ...prev, emailBilling: checked }))
                        }
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Push Notifications</p>
                        <p className="text-sm text-gray-500">
                          Browser and mobile push notifications
                        </p>
                      </div>
                      <Switch
                        checked={notifications.pushNotifications}
                        onCheckedChange={checked =>
                          setNotifications(prev => ({ ...prev, pushNotifications: checked }))
                        }
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">SMS Reminders</p>
                        <p className="text-sm text-gray-500">Text message reminders for lessons</p>
                      </div>
                      <Switch
                        checked={notifications.smsReminders}
                        onCheckedChange={checked =>
                          setNotifications(prev => ({ ...prev, smsReminders: checked }))
                        }
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleSaveNotifications} disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Preferences
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CollapsibleCard>
            </div>
          </TabsContent>

          {/* Privacy & Security */}
          <TabsContent
            value="security"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="h-full space-y-6 overflow-y-auto pb-4 pr-2">
              <CollapsibleCard
                flush
                className={SECTION_CARD_CLASS}
                title="Privacy & Security"
                description="Manage your password and account security"
                icon={<Shield className="h-5 w-5 text-slate-900" />}
                defaultOpen
              >
                <div className="space-y-6 p-6">
                  {/* Password Change */}
                  <div className="space-y-4">
                    <h3 className="font-medium">Change Password</h3>
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="currentPassword">Current Password</Label>
                        <Input id="currentPassword" type="password" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newPassword">New Password</Label>
                        <Input id="newPassword" type="password" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm New Password</Label>
                        <Input id="confirmPassword" type="password" />
                      </div>
                    </div>
                    <Button variant="outline">
                      <Lock className="mr-2 h-4 w-4" />
                      Update Password
                    </Button>
                  </div>

                  <Separator />

                  {/* Two-Factor Authentication */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">Two-Factor Authentication</h3>
                        <p className="text-sm text-gray-500">
                          Add an extra layer of security to your account
                        </p>
                      </div>
                      <Switch checked={twoFactorEnabled} onCheckedChange={setTwoFactorEnabled} />
                    </div>
                    {twoFactorEnabled && (
                      <div className="rounded-lg bg-blue-50 p-4">
                        <div className="flex items-start gap-2">
                          <Check className="mt-0.5 h-4 w-4 text-blue-600" />
                          <div>
                            <p className="text-sm font-medium text-blue-800">2FA Enabled</p>
                            <p className="text-xs text-blue-600">
                              Your account is protected with two-factor authentication
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Connected Devices */}
                  <div className="space-y-4">
                    <h3 className="font-medium">Connected Devices</h3>
                    <div className="space-y-3">
                      {connectedDevices.map(device => (
                        <div
                          key={device.id}
                          className="flex items-center justify-between rounded-[12px] border p-3 transition-all hover:bg-slate-50 hover:shadow-sm"
                        >
                          <div className="flex items-center gap-3">
                            <Smartphone className="h-5 w-5 text-gray-400" />
                            <div>
                              <p className="font-medium">
                                {device.name}
                                {device.isCurrent && (
                                  <span className="ml-2 text-xs text-green-600">(Current)</span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500">
                                {device.location} • {device.lastActive}
                              </p>
                            </div>
                          </div>
                          {!device.isCurrent && (
                            <Button variant="ghost" size="sm" className="text-red-600">
                              <LogOut className="mr-1 h-4 w-4" />
                              Logout
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" onClick={handleLogoutAllDevices}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Logout from All Devices
                    </Button>
                  </div>
                </div>
              </CollapsibleCard>
            </div>
          </TabsContent>

          {/* Live Session Mirroring */}
          <TabsContent
            value="controls"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="h-full space-y-6 overflow-y-auto pb-4 pr-2">
              <CollapsibleCard
                flush
                className={SECTION_CARD_CLASS}
                title="Live Session Mirroring"
                description="Control what students see by default during live sessions"
                icon={<Smartphone className="h-5 w-5 text-slate-900" />}
                defaultOpen
              >
                <div className="space-y-6 p-6">
                  {/* Mirror Classroom Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <LayoutPanelTop className="mt-0.5 h-5 w-5 text-indigo-500" />
                      <div>
                        <p className="font-medium">Mirror Classroom by Default</p>
                        <p className="text-sm text-gray-500">
                          When a session starts, automatically broadcast your classroom view to all
                          students
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={mirrorPreferences.defaultMirrorClass}
                      onCheckedChange={checked =>
                        setMirrorPreferences(prev => ({ ...prev, defaultMirrorClass: checked }))
                      }
                    />
                  </div>

                  <Separator />

                  {/* Mirror Whiteboard Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <PenTool className="mt-0.5 h-5 w-5 text-indigo-500" />
                      <div>
                        <p className="font-medium">Mirror Whiteboard by Default</p>
                        <p className="text-sm text-gray-500">
                          When a session starts, automatically broadcast your whiteboard to all
                          students
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={mirrorPreferences.defaultMirrorBoard}
                      onCheckedChange={checked =>
                        setMirrorPreferences(prev => ({ ...prev, defaultMirrorBoard: checked }))
                      }
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={saveMirrorPreferences}>
                      <Save className="mr-2 h-4 w-4" />
                      Save Preferences
                    </Button>
                  </div>
                </div>
              </CollapsibleCard>

              {/* Course Sync Mode */}
              <CollapsibleCard
                flush
                className={SECTION_CARD_CLASS}
                title="Course Sync Mode"
                description="Control how course edits are shared with students during live sessions"
                icon={<LayoutPanelTop className="h-5 w-5 text-slate-900" />}
              >
                <div className="space-y-6 p-6">
                  <div className="space-y-3">
                    {[
                      {
                        value: 'auto' as const,
                        label: 'Automatic',
                        description:
                          'Edits sync automatically after you stop editing for 3 seconds. Students always see the latest content.',
                      },
                      {
                        value: 'manual' as const,
                        label: 'Manual',
                        description:
                          'You must click the Sync button to share changes. Best for preparing content privately.',
                      },
                      {
                        value: 'ask' as const,
                        label: 'Ask Before Syncing',
                        description:
                          'A prompt asks you to confirm before syncing. Good for awareness of what students see.',
                      },
                    ].map(option => (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                          syncMode === option.value
                            ? 'border-indigo-300 bg-indigo-50'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="syncMode"
                          value={option.value}
                          checked={syncMode === option.value}
                          onChange={() => setSyncMode(option.value)}
                          className="mt-1"
                        />
                        <div>
                          <p className="font-medium text-slate-800">{option.label}</p>
                          <p className="text-sm text-slate-500">{option.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={saveSyncMode}>
                      <Save className="mr-2 h-4 w-4" />
                      Save Sync Mode
                    </Button>
                  </div>
                </div>
              </CollapsibleCard>

              {/* Document Parsing */}
              <CollapsibleCard
                flush
                className={SECTION_CARD_CLASS}
                title="Document Import"
                description="Control how documents are handled when importing into tasks and assessments"
                icon={<FileText className="h-5 w-5 text-slate-900" />}
              >
                <div className="space-y-6 p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <FileText className="mt-0.5 h-5 w-5 text-indigo-500" />
                      <div>
                        <p className="font-medium">Parse Documents on Import</p>
                        <p className="text-sm text-gray-500">
                          Automatically extract text from PDFs, Word docs, and other files when
                          importing into tasks and assessments
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={parseDocuments}
                      onCheckedChange={checked => setParseDocuments(checked)}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={saveParseDocuments}>
                      <Save className="mr-2 h-4 w-4" />
                      Save Preference
                    </Button>
                  </div>
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                flush
                className={SECTION_CARD_CLASS}
                title="Account Controls"
                description="Temporarily deactivate or permanently delete your account"
                icon={<UserCircle className="h-5 w-5 text-slate-900" />}
              >
                <div className="space-y-6 p-6">
                  {/* Deactivate Account */}
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                    <div className="flex items-start gap-4">
                      <Power className="mt-1 h-5 w-5 text-yellow-600" />
                      <div className="flex-1">
                        <h3 className="font-medium text-yellow-800">Deactivate Account</h3>
                        <p className="text-sm text-yellow-700">
                          Temporarily disable your account. You can reactivate it at any time by
                          logging in. Your data will be preserved.
                        </p>
                        <Button
                          variant="outline"
                          className="mt-3 border-yellow-300 text-yellow-700 hover:bg-yellow-100"
                          onClick={() => setShowDeactivateDialog(true)}
                        >
                          Deactivate Account
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Delete Account */}
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <div className="flex items-start gap-4">
                      <Trash2 className="mt-1 h-5 w-5 text-red-600" />
                      <div className="flex-1">
                        <h3 className="font-medium text-red-800">Delete Account</h3>
                        <p className="text-sm text-red-700">
                          Permanently delete your account and all associated data. This action
                          cannot be undone.
                        </p>
                        <Button
                          variant="outline"
                          className="mt-3 border-red-300 text-red-700 hover:bg-red-100"
                          onClick={() => setShowDeleteDialog(true)}
                        >
                          Delete Account
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CollapsibleCard>
            </div>
          </TabsContent>

          {/* Session Log */}
          <TabsContent
            value="session-log"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <SessionLog />
          </TabsContent>
        </SessionCalendarPanel>
      </div>

      {/* Delete Account Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. All your data will be permanently
              deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              To confirm deletion, type <strong>DELETE</strong> below:
            </p>
            <Input
              value={deleteConfirmation}
              onChange={e => setDeleteConfirmation(e.target.value)}
              placeholder="Type DELETE"
            />
          </div>
          <DialogFooter>
            <Button variant="modal-secondary-dark" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmation !== 'DELETE'}
            >
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Account Dialog */}
      <Dialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Power className="h-5 w-5" />
              Deactivate Account
            </DialogTitle>
            <DialogDescription>
              Your account will be temporarily disabled. You can reactivate it by logging in again.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-gray-600">While deactivated:</p>
          <ul className="list-disc pl-5 text-sm text-gray-600">
            <li>You won&apos;t receive any notifications</li>
            <li>Your profile will be hidden</li>
            <li>Your data will be preserved</li>
            <li>You can reactivate anytime by logging in</li>
          </ul>
          <DialogFooter>
            <Button variant="modal-secondary-dark" onClick={() => setShowDeactivateDialog(false)}>
              Cancel
            </Button>
            <Button variant="modal-primary-dark" onClick={handleDeactivateAccount}>
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
