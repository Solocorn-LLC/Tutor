'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  DialogPanel,
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
  Trash2,
  Power,
  Smartphone,
  Lock,
  LogOut,
  Download,
  Check,
  AlertTriangle,
} from 'lucide-react'
import { BackButton } from '@/components/navigation'
import { AvatarUploader } from '@/components/avatar-uploader'

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'zh', name: '中文 (Chinese)' },
  { code: 'es', name: 'Español (Spanish)' },
  { code: 'fr', name: 'Français (French)' },
  { code: 'de', name: 'Deutsch (German)' },
  { code: 'ja', name: '日本語 (Japanese)' },
]

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

export default function StudentAccount() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)

  const { update: updateSession } = useSession()

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    avatarUrl: '',
    language: 'en',
    timezone: 'Asia/Shanghai',
  })

  const [notifications, setNotifications] = useState({
    emailMarketing: true,
    emailLessons: true,
    emailBilling: true,
    pushNotifications: false,
    smsReminders: false,
  })

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
      description: 'Premium Plan - March 2024',
      amount: 29.99,
      status: 'paid',
    },
    {
      id: 'inv_002',
      date: '2024-02-01',
      description: 'Premium Plan - February 2024',
      amount: 29.99,
      status: 'paid',
    },
  ])

  const [connectedDevices, setConnectedDevices] = useState([
    {
      id: '1',
      name: 'Chrome on MacOS',
      location: 'Singapore',
      lastActive: 'Active now',
      isCurrent: true,
    },
    {
      id: '2',
      name: 'Safari on iPhone',
      location: 'Singapore',
      lastActive: '2 hours ago',
      isCurrent: false,
    },
  ])

  useEffect(() => {
    fetch('/api/user/profile')
      .then(res => res.json())
      .then(data => {
        if (data.profile) {
          setFormData({
            name: data.profile.name || '',
            email: data.email || '',
            avatarUrl: data.profile.avatarUrl || '',
            language: data.profile.preferredLanguage || 'en',
            timezone: data.profile.timezone || 'Asia/Shanghai',
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

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify({
          avatarUrl: formData.avatarUrl,
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

  const sectionCardClass = 'border border-slate-200 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]'

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-blue-500" />
          <p className="text-gray-600">Loading account...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white pb-12">
      <header className="sticky top-0 z-10 w-full bg-white px-4 pb-2 pt-4 sm:px-6">
        <div className="w-full">
          <div className="flex w-full flex-col gap-4 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-[0_8px_20px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <BackButton href="/student/dashboard" />
              <div className="flex flex-col justify-center">
                <h1 className="text-lg font-bold text-slate-800">Account Settings</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-4 py-8 sm:px-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="flex h-auto w-full flex-wrap gap-2 bg-transparent p-0">
            <TabsTrigger
              value="profile"
              className="flex-1 justify-center gap-2 rounded-full border-0 bg-[#F3F4F6] px-4 py-2.5 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-[#E5E7EB] data-[state=active]:bg-gradient-to-r data-[state=active]:from-slate-700 data-[state=active]:to-slate-900 data-[state=active]:font-semibold data-[state=active]:text-white data-[state=active]:shadow-md md:flex-none"
            >
              <User className="h-4 w-4" />
              <span className="hidden md:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger
              value="billing"
              className="flex-1 justify-center gap-2 rounded-full border-0 bg-[#F3F4F6] px-4 py-2.5 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-[#E5E7EB] data-[state=active]:bg-gradient-to-r data-[state=active]:from-slate-700 data-[state=active]:to-slate-900 data-[state=active]:font-semibold data-[state=active]:text-white data-[state=active]:shadow-md md:flex-none"
            >
              <CreditCard className="h-4 w-4" />
              <span className="hidden md:inline">Billing</span>
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="flex-1 justify-center gap-2 rounded-full border-0 bg-[#F3F4F6] px-4 py-2.5 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-[#E5E7EB] data-[state=active]:bg-gradient-to-r data-[state=active]:from-slate-700 data-[state=active]:to-slate-900 data-[state=active]:font-semibold data-[state=active]:text-white data-[state=active]:shadow-md md:flex-none"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden md:inline">History</span>
            </TabsTrigger>
            <TabsTrigger
              value="notifications"
              className="flex-1 justify-center gap-2 rounded-full border-0 bg-[#F3F4F6] px-4 py-2.5 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-[#E5E7EB] data-[state=active]:bg-gradient-to-r data-[state=active]:from-slate-700 data-[state=active]:to-slate-900 data-[state=active]:font-semibold data-[state=active]:text-white data-[state=active]:shadow-md md:flex-none"
            >
              <Bell className="h-4 w-4" />
              <span className="hidden md:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="flex-1 justify-center gap-2 rounded-full border-0 bg-[#F3F4F6] px-4 py-2.5 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-[#E5E7EB] data-[state=active]:bg-gradient-to-r data-[state=active]:from-slate-700 data-[state=active]:to-slate-900 data-[state=active]:font-semibold data-[state=active]:text-white data-[state=active]:shadow-md md:flex-none"
            >
              <Shield className="h-4 w-4" />
              <span className="hidden md:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger
              value="controls"
              className="flex-1 justify-center gap-2 rounded-full border-0 bg-[#F3F4F6] px-4 py-2.5 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-[#E5E7EB] data-[state=active]:bg-gradient-to-r data-[state=active]:from-slate-700 data-[state=active]:to-slate-900 data-[state=active]:font-semibold data-[state=active]:text-white data-[state=active]:shadow-md md:flex-none"
            >
              <Power className="h-4 w-4" />
              <span className="hidden md:inline">Controls</span>
            </TabsTrigger>
          </TabsList>

          {/* Profile & Identity */}
          <TabsContent value="profile" className="space-y-6">
            <Card className={sectionCardClass}>
              <CardHeader>
                <CardTitle>Profile & Identity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                  <AvatarUploader
                    avatarUrl={formData.avatarUrl}
                    uploadUrl="/api/user/avatar"
                    deleteUrl="/api/user/avatar"
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
                    <Input id="timezone" value={formData.timezone} disabled className="bg-white" />
                    <p className="text-xs text-gray-500">Automatically detected</p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSaveProfile} disabled={saving}>
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Billing & Payment */}
          <TabsContent value="billing" className="space-y-6">
            <Card className={sectionCardClass}>
              <CardHeader>
                <CardTitle>Billing & Payment Methods</CardTitle>
                <CardDescription>
                  Manage your payment methods and billing preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {paymentMethods.map(method => (
                  <div
                    key={method.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                        <CreditCard className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {method.brand} •••• {method.last4}
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
                    <div className="flex gap-2">
                      {!method.isDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDefaultPaymentMethod(method.id)}
                        >
                          Set Default
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => removePaymentMethod(method.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}

                <Button variant="outline" className="w-full">
                  <CreditCard className="mr-2 h-4 w-4" />
                  Add Payment Method
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Billing History */}
          <TabsContent value="history" className="space-y-6">
            <Card className={sectionCardClass}>
              <CardHeader>
                <CardTitle>Billing History</CardTitle>
                <CardDescription>View and download your invoices and receipts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {billingHistory.map(invoice => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between rounded-lg border p-4"
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications */}
          <TabsContent value="notifications" className="space-y-6">
            <Card className={sectionCardClass}>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Control how and when we contact you</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
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
                      <p className="text-sm text-gray-500">Browser and mobile push notifications</p>
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Privacy & Security */}
          <TabsContent value="security" className="space-y-6">
            <Card className={sectionCardClass}>
              <CardHeader>
                <CardTitle>Privacy & Security</CardTitle>
                <CardDescription>Manage your password and account security</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
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
                        className="flex items-center justify-between rounded-lg border p-3"
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Account Controls */}
          <TabsContent value="controls" className="space-y-6">
            <Card className={sectionCardClass}>
              <CardHeader>
                <CardTitle>Account Controls</CardTitle>
                <CardDescription>
                  Temporarily deactivate or permanently delete your account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
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
                        Permanently delete your account and all associated data. This action cannot
                        be undone.
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
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Delete Account Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Delete Account
            </DialogTitle>
          </DialogHeader>
          <div className="p-6">
            <DialogPanel className="space-y-4 p-6">
              <p className="text-sm text-gray-600">
                This action is permanent and cannot be undone. All your data will be permanently
                deleted.
              </p>
              <p className="text-sm text-gray-600">
                To confirm deletion, type <strong>DELETE</strong> below:
              </p>
              <Input
                value={deleteConfirmation}
                onChange={e => setDeleteConfirmation(e.target.value)}
                placeholder="Type DELETE"
              />
            </DialogPanel>
          </div>
          <DialogFooter align="end" className="gap-3">
            <Button
              variant="modal-secondary"
              className="h-10"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="h-10"
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
          </DialogHeader>
          <div className="p-6">
            <DialogPanel className="space-y-4 p-6">
              <p className="text-sm text-gray-600">
                Your account will be temporarily disabled. You can reactivate it by logging in
                again.
              </p>
              <p className="text-sm text-gray-600">While deactivated:</p>
              <ul className="list-disc pl-5 text-sm text-gray-600">
                <li>You won&apos;t receive any notifications</li>
                <li>Your profile will be hidden</li>
                <li>Your data will be preserved</li>
                <li>You can reactivate anytime by logging in</li>
              </ul>
            </DialogPanel>
          </div>
          <DialogFooter align="end" className="gap-3">
            <Button
              variant="modal-secondary"
              className="h-10"
              onClick={() => setShowDeactivateDialog(false)}
            >
              Cancel
            </Button>
            <Button variant="modal-primary" className="h-10" onClick={handleDeactivateAccount}>
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
