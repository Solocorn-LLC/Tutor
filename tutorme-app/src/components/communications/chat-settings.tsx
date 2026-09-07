'use client'

/**
 * ChatSettings — in-chat behavior preferences (replaces the generic
 * notification panel in the chat menu). All toggles are client-side and
 * persisted to localStorage via useChatPreferences.
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Keyboard, Volume2, Clock, ArrowDownToLine } from 'lucide-react'
import type { ChatPreferences } from '@/lib/chat/chat-preferences'

interface ChatSettingsProps {
  prefs: ChatPreferences
  onChange: (patch: Partial<ChatPreferences>) => void
}

export function ChatSettings({ prefs, onChange }: ChatSettingsProps) {
  const items = [
    {
      key: 'enterToSend' as const,
      icon: Keyboard,
      iconBg: 'bg-blue-50 text-blue-600',
      label: 'Enter to Send',
      description: 'Press Enter to send; off = Enter adds a new line (Ctrl+Enter sends)',
    },
    {
      key: 'soundsOn' as const,
      icon: Volume2,
      iconBg: 'bg-emerald-50 text-emerald-600',
      label: 'Message Sounds',
      description: 'Play a soft sound when a new message arrives',
    },
    {
      key: 'showTimestamps' as const,
      icon: Clock,
      iconBg: 'bg-violet-50 text-violet-600',
      label: 'Show Timestamps',
      description: 'Show the time on each message',
    },
    {
      key: 'autoScrollOnNew' as const,
      icon: ArrowDownToLine,
      iconBg: 'bg-amber-50 text-amber-600',
      label: 'Auto-scroll to Newest',
      description: 'Jump to the latest message when one arrives',
    },
  ]

  return (
    <Card className="border-[rgba(0,0,0,0.04)] shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Keyboard className="h-5 w-5" />
          Chat Settings
        </CardTitle>
        <CardDescription>Customize how the chat behaves for you</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.map(({ key, icon: Icon, iconBg, label, description }) => (
          <div key={key} className="flex items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg} [&>svg]:h-4 [&>svg]:w-4`}
              >
                <Icon />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{label}</p>
                <p className="text-xs text-slate-500">{description}</p>
              </div>
            </div>
            <Switch
              checked={prefs[key]}
              onCheckedChange={checked => onChange({ [key]: checked })}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
