'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Bell, Globe, Lock, Moon, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { TimezoneSelector } from '@/components/timezone-selector'

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'zh', name: 'Chinese' },
  { code: 'es', name: 'Español (Spanish)' },
  { code: 'fr', name: 'Français (French)' },
  { code: 'de', name: 'Deutsch (German)' },
  { code: 'ja', name: 'Japanese' },
]

export default function ParentSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [timezone, setTimezone] = useState(
    (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC'
  )
  const [language, setLanguage] = useState('en')

  // Load profile data on mount
  useEffect(() => {
    fetch('/api/user/profile', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data?.profile) {
          setTimezone(data.profile.timezone || timezone)
          setLanguage(data.profile.preferredLanguage || 'en')
        }
      })
      .catch(err => {
        console.error('Failed to load profile:', err)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          preferredLanguage: language,
          timezone,
        }),
      })

      if (response.ok) {
        // Store timezone preference in localStorage for client-side timezone
        try {
          localStorage.setItem('user-timezone', timezone)
        } catch {
          // Ignore localStorage errors
        }
        toast.success('Settings saved successfully')
      } else {
        throw new Error('Failed to save settings')
      }
    } catch (err) {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-gray-500">Manage your preferences and account settings</p>
      </div>

      <div className="grid gap-6">
        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notification Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { id: 'email', label: 'Email Notifications', desc: 'Receive updates via email' },
              { id: 'sms', label: 'SMS Notifications', desc: 'Receive text message alerts' },
              {
                id: 'app',
                label: 'In-App Notifications',
                desc: 'Receive notifications in the app',
              },
              { id: 'weekly', label: 'Weekly Reports', desc: 'Get weekly progress summaries' },
              { id: 'payments', label: 'Payment Alerts', desc: 'Get notified about payments' },
            ].map(item => (
              <div key={item.id} className="flex items-center justify-between">
                <div>
                  <Label htmlFor={item.id} className="font-medium">
                    {item.label}
                  </Label>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
                <Switch id={item.id} defaultChecked />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Language & Region */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Language & Region
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(lang => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <TimezoneSelector value={timezone} onChange={setTimezone} />
            </div>
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
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Two-Factor Authentication</Label>
                <p className="text-sm text-gray-500">Add an extra layer of security</p>
              </div>
              <Button variant="outline">Enable</Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Change Password</Label>
                <p className="text-sm text-gray-500">Update your password regularly</p>
              </div>
              <Button variant="outline">Change</Button>
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Moon className="h-5 w-5" />
              Appearance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Dark Mode</Label>
                <p className="text-sm text-gray-500">Toggle dark mode theme</p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
