'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, MessageSquare, Bell } from 'lucide-react'
import { TabsContent } from '@/components/ui/tabs'
import { SessionCalendarPanel } from '@/components/session-calendar-panel'
import { CollapsibleCard } from '@/components/collapsible-card'
import { cn } from '@/lib/utils'
import MessagingPanel, { type CommSection } from './messaging-panel'
import NotificationsPanel from './notifications-panel'
import type { AppNotification, CommsRole } from './types'

interface CommunicationsPageProps {
  role: CommsRole
}

export default function CommunicationsPage({ role }: CommunicationsPageProps) {
  const [activeTab, setActiveTab] = useState('messaging')
  const [activeSection, setActiveSection] = useState<CommSection>('chats')

  // Notifications state
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(true)
  const [respondingIds, setRespondingIds] = useState<Record<string, 'accept' | 'reject' | null>>({})

  useEffect(() => {
    fetchNotifications()
  }, [])

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' })
      if (!res.ok) {
        if (res.status === 401) return
        throw new Error('Failed to load notifications')
      }
      const data = await res.json()
      const list: AppNotification[] = (data.notifications || []).map(
        (n: Record<string, unknown>) => ({
          id: (n.notificationId as string) || (n.id as string),
          type: (n.type as string) || 'message',
          title: n.title as string,
          message: n.message as string,
          read: !!n.read,
          createdAt: (n.createdAt as string) || new Date().toISOString(),
          actionUrl: (n.actionUrl as string | null) || null,
          data: (n.data as Record<string, unknown> | null) || null,
        })
      )
      setNotifications(list)
    } catch {
      toast.error('Failed to load notifications')
    } finally {
      setNotificationsLoading(false)
    }
  }

  const markAllAsRead = async () => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ markAll: true }),
      })
      if (!res.ok) throw new Error('Failed to mark as read')
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      toast.success('All marked as read')
    } catch {
      toast.error('Failed to mark all as read')
    }
  }

  const markAsRead = async (id: string) => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notificationIds: [id] }),
      })
      if (!res.ok) throw new Error('Failed to mark as read')
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)))
    } catch {
      toast.error('Failed to mark as read')
    }
  }

  const deleteNotification = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to delete')
      setNotifications(prev => prev.filter(n => n.id !== id))
      toast.success('Notification deleted')
    } catch {
      toast.error('Failed to delete notification')
    }
  }

  const clearAllNotifications = async () => {
    try {
      const res = await fetch('/api/notifications?all=true', {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to clear notifications')
      setNotifications([])
      toast.success('All notifications cleared')
    } catch {
      toast.error('Failed to clear notifications')
    }
  }

  const respondToOneOnOne = async (
    notificationId: string,
    requestId: string,
    action: 'accept' | 'reject'
  ) => {
    setRespondingIds(prev => ({ ...prev, [notificationId]: action }))
    try {
      const res = await fetch('/api/one-on-one/respond', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestId, action }),
      })
      if (res.ok) {
        await markAsRead(notificationId)
        toast.success(`Request ${action === 'accept' ? 'accepted' : 'rejected'}`)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Unable to respond to request')
      }
    } catch {
      toast.error('Unable to respond to request')
    } finally {
      setRespondingIds(prev => ({ ...prev, [notificationId]: null }))
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  if (notificationsLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-full flex-col bg-white px-3 pb-0 lg:px-4">
      {/* Hero — Analytics-style header */}
      <section className="relative mb-4 flex-shrink-0 rounded-[20px] border border-white/10 bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] p-5 shadow-[0_12px_40px_-4px_rgba(0,0,0,0.22)] ring-1 ring-white/20">
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <h1 className="text-xl font-bold text-white">Communications</h1>
            <p className="mt-1 text-sm text-white/60">Message tutors, students, and parents</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 sm:absolute sm:right-5 sm:top-1/2 sm:-translate-y-1/2 sm:justify-end">
            <div
              className={cn(
                'flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm',
                notificationsLoading && 'animate-pulse'
              )}
            >
              <MessageSquare className="h-4 w-4 text-white/80" />
              <span className="text-xs font-medium text-white/80">New Messages</span>
              <span className="text-sm font-bold text-white">0</span>
            </div>
            <div
              className={cn(
                'flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm',
                notificationsLoading && 'animate-pulse'
              )}
            >
              <Bell className="h-4 w-4 text-white/80" />
              <span className="text-xs font-medium text-white/80">Notifications</span>
              <span className="text-sm font-bold text-white">{unreadCount}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Mode selector + tab content */}
      <div className="flex min-h-0 flex-1 flex-col pb-0.5">
        <SessionCalendarPanel
          value={activeTab}
          onValueChange={setActiveTab}
          variant="charcoal"
          tabs={[
            { value: 'messaging', label: 'Messaging' },
            { value: 'notifications', label: 'Notifications' },
          ]}
        >
          <TabsContent value="messaging" className="flex h-full flex-col">
            <div className="flex flex-1 flex-col">
              <CollapsibleCard
                title="Messaging"
                icon={<MessageSquare className="h-5 w-5 text-slate-900" />}
                defaultOpen
                className="flex-1"
              >
                <MessagingPanel activeSection={activeSection} onSectionChange={setActiveSection} />
              </CollapsibleCard>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="flex h-full flex-col">
            <div className="flex flex-1 flex-col">
              <CollapsibleCard
                title="Notifications"
                icon={<Bell className="h-5 w-5 text-slate-900" />}
                defaultOpen
                className="flex-1"
              >
                <NotificationsPanel
                  role={role}
                  notifications={notifications}
                  loading={notificationsLoading}
                  unreadCount={unreadCount}
                  onMarkAllRead={markAllAsRead}
                  onClearAll={clearAllNotifications}
                  onMarkRead={markAsRead}
                  onDelete={deleteNotification}
                  onRespondOneOnOne={role === 'tutor' ? respondToOneOnOne : undefined}
                  respondingIds={respondingIds}
                />
              </CollapsibleCard>
            </div>
          </TabsContent>
        </SessionCalendarPanel>
      </div>
    </div>
  )
}
