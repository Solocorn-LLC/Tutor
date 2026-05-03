'use client'

/**
 * NotificationSettings — Full preferences panel for notification channels.
 *
 * Features:
 *  - Global channel toggles (email, push, in-app)
 *  - Per-type overrides (assignment, class, message, etc.)
 *  - Quiet hours configuration
 *  - Email digest frequency
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Bell,
  Mail,
  Smartphone,
  Monitor,
  Moon,
  Clock,
  Save,
  CheckCircle2,
  BookOpen,
  Calendar,
  MessageSquare,
  Trophy,
  CreditCard,
  AlertCircle,
  Zap,
  Settings2,
  AtSign,
} from 'lucide-react'
import { toast } from 'sonner'

interface ChannelOverride {
  email?: boolean
  push?: boolean
  inApp?: boolean
}

interface Preferences {
  emailEnabled: boolean
  pushEnabled: boolean
  inAppEnabled: boolean
  channelOverrides: Record<string, ChannelOverride>
  quietHoursStart: string | null
  quietHoursEnd: string | null
  timezone: string
  emailDigest: string
}

const NOTIFICATION_TYPES = [
  { key: 'assignment', label: 'Assignments & Homework', icon: BookOpen, color: 'text-amber-500' },
  { key: 'class', label: 'Classes & Schedule', icon: Calendar, color: 'text-blue-500' },
  { key: 'grade', label: 'Grades & Scores', icon: Zap, color: 'text-indigo-500' },
  { key: 'message', label: 'Messages', icon: MessageSquare, color: 'text-green-500' },
  { key: 'mention', label: 'Mentions', icon: AtSign, color: 'text-emerald-500' },
  { key: 'achievement', label: 'Achievements & Badges', icon: Trophy, color: 'text-purple-500' },
  { key: 'payment', label: 'Payments & Billing', icon: CreditCard, color: 'text-emerald-500' },
  { key: 'reminder', label: 'Reminders', icon: AlertCircle, color: 'text-orange-500' },
  { key: 'system', label: 'System Updates', icon: Settings2, color: 'text-gray-500' },
]

const TIMEZONES = [
  'UTC',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Berlin',
  'Australia/Sydney',
]

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    fetch('/api/notifications/preferences', { credentials: 'include' })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setPrefs({
            emailEnabled: res.preferences.emailEnabled,
            pushEnabled: res.preferences.pushEnabled,
            inAppEnabled: res.preferences.inAppEnabled,
            channelOverrides:
              (res.preferences.channelOverrides as Record<string, ChannelOverride>) || {},
            quietHoursStart: res.preferences.quietHoursStart,
            quietHoursEnd: res.preferences.quietHoursEnd,
            timezone: res.preferences.timezone || 'UTC',
            emailDigest: res.preferences.emailDigest || 'instant',
          })
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const update = (patch: Partial<Preferences>) => {
    setPrefs(prev => (prev ? { ...prev, ...patch } : prev))
    setDirty(true)
  }

  const updateOverride = (type: string, channel: 'email' | 'push' | 'inApp', value: boolean) => {
    if (!prefs) return
    const overrides = { ...prefs.channelOverrides }
    overrides[type] = { ...overrides[type], [channel]: value }
    update({ channelOverrides: overrides })
  }

  const getOverrideValue = (type: string, channel: 'email' | 'push' | 'inApp'): boolean => {
    if (!prefs) return true
    const override = prefs.channelOverrides[type]
    if (override && typeof override[channel] === 'boolean') return override[channel]!
    // Fall back to global
    if (channel === 'email') return prefs.emailEnabled
    if (channel === 'push') return prefs.pushEnabled
    return prefs.inAppEnabled
  }

  const handleSave = async () => {
    if (!prefs) return
    setSaving(true)
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(prefs),
      })
      if (!res.ok) throw new Error('Failed to save')
      setDirty(false)
      toast.success('Notification preferences saved')
    } catch {
      toast.error('Failed to save preferences')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40" />
        <Skeleton className="h-60" />
      </div>
    )
  }

  if (!prefs) return null
  const sectionCardClass =
    'border border-slate-200 bg-white shadow-[0_14px_45px_rgba(0,0,0,0.12)]'

  return (
    <div className="space-y-6">
      {/* Global Channels */}
      <Card className={sectionCardClass}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5" />
            Notification Channels
          </CardTitle>
          <CardDescription>Choose how you want to receive notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                <Monitor className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium">In-App Notifications</p>
                <p className="text-xs text-gray-500">Show notifications inside the app</p>
              </div>
            </div>
            <Switch
              checked={prefs.inAppEnabled}
              onCheckedChange={v => update({ inAppEnabled: v })}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100">
                <Smartphone className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Push Notifications</p>
                <p className="text-xs text-gray-500">Real-time alerts while using the app</p>
              </div>
            </div>
            <Switch checked={prefs.pushEnabled} onCheckedChange={v => update({ pushEnabled: v })} />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100">
                <Mail className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Email Notifications</p>
                <p className="text-xs text-gray-500">Receive notifications via email</p>
              </div>
            </div>
            <Switch
              checked={prefs.emailEnabled}
              onCheckedChange={v => update({ emailEnabled: v })}
            />
          </div>

          {prefs.emailEnabled && (
            <div className="ml-12 border-l-2 border-purple-100 pl-3">
              <label className="text-sm font-medium text-gray-700">Email Frequency</label>
              <Select value={prefs.emailDigest} onValueChange={v => update({ emailDigest: v })}>
                <SelectTrigger className="mt-1 w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instant">Instant</SelectItem>
                  <SelectItem value="daily">Daily Digest</SelectItem>
                  <SelectItem value="weekly">Weekly Digest</SelectItem>
                  <SelectItem value="none">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-Type Overrides */}
      <Card className={sectionCardClass}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings2 className="h-5 w-5" />
            Notification Types
          </CardTitle>
          <CardDescription>
            Fine-tune which channels are used for each notification type
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 grid grid-cols-[1fr,60px,60px,60px] gap-2 text-xs font-medium text-gray-500">
            <span>Category</span>
            <span className="text-center">In-App</span>
            <span className="text-center">Push</span>
            <span className="text-center">Email</span>
          </div>
          <div className="space-y-2">
            {NOTIFICATION_TYPES.map(nt => {
              const Icon = nt.icon
              return (
                <div
                  key={nt.key}
                  className="grid grid-cols-[1fr,60px,60px,60px] items-center gap-2 border-b py-2 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${nt.color}`} />
                    <span className="text-sm">{nt.label}</span>
                  </div>
                  <div className="flex justify-center">
                    <Switch
                      checked={getOverrideValue(nt.key, 'inApp')}
                      onCheckedChange={v => updateOverride(nt.key, 'inApp', v)}
                      className="scale-75"
                    />
                  </div>
                  <div className="flex justify-center">
                    <Switch
                      checked={getOverrideValue(nt.key, 'push')}
                      onCheckedChange={v => updateOverride(nt.key, 'push', v)}
                      className="scale-75"
                    />
                  </div>
                  <div className="flex justify-center">
                    <Switch
                      checked={getOverrideValue(nt.key, 'email')}
                      onCheckedChange={v => updateOverride(nt.key, 'email', v)}
                      className="scale-75"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card className={sectionCardClass}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Moon className="h-5 w-5" />
            Quiet Hours
          </CardTitle>
          <CardDescription>Pause push notifications during certain hours</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
              <input
                type="time"
                value={prefs.quietHoursStart || ''}
                onChange={e => update({ quietHoursStart: e.target.value || null })}
                className="rounded-md border px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
              <input
                type="time"
                value={prefs.quietHoursEnd || ''}
                onChange={e => update({ quietHoursEnd: e.target.value || null })}
                className="rounded-md border px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Timezone</label>
              <Select value={prefs.timezone} onValueChange={v => update({ timezone: v })}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {prefs.quietHoursStart && prefs.quietHoursEnd && (
            <p className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              Push notifications will be paused from {prefs.quietHoursStart} to{' '}
              {prefs.quietHoursEnd} ({prefs.timezone})
            </p>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!dirty || saving} className="gap-2">
          {saving ? (
            <>Saving...</>
          ) : dirty ? (
            <>
              <Save className="h-4 w-4" />
              Save Preferences
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
