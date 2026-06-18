'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import MessagingPanel, { type CommSection } from './messaging-panel'
import NotificationsPanel from './notifications-panel'
import type { AppNotification, CommsRole } from './types'

interface CommunicationsPageProps {
  role: CommsRole
}

export default function CommunicationsPage({ role }: CommunicationsPageProps) {
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
    <div className="flex h-full w-full flex-col px-4 sm:px-6 lg:px-8">
      <div className="h-[45%] min-h-0 shrink-0 pb-4">
        <MessagingPanel activeSection={activeSection} onSectionChange={setActiveSection} />
      </div>
      <div className="min-h-0 flex-1">
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
      </div>
    </div>
  )
}
