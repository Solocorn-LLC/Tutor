'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Bell,
  CheckCircle2,
  Calendar,
  MessageSquare,
  Users,
  DollarSign,
  Trash2,
  CheckCheck,
  Loader2,
  Info,
} from 'lucide-react'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { toast } from 'sonner'

interface Notification {
  id: string
  type: 'class' | 'message' | 'enrollment' | 'payment' | 'system' | 'reminder'
  title: string
  message: string
  read: boolean
  readAt: string | null
  actionUrl: string | null
  createdAt: string
  data?: Record<string, unknown> | null
}

export default function TutorNotificationsPage() {
  const params = useParams()
  const pathname = usePathname()
  const locale = typeof params?.locale === 'string' ? params.locale : 'en'
  const hasLocalePrefix = pathname.startsWith(`/${locale}/`)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [respondingIds, setRespondingIds] = useState<Record<string, 'accept' | 'reject' | null>>({})

  // Fetch notifications on mount
  useEffect(() => {
    fetchNotifications()
  }, [])

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications', {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
      } else {
        toast.error('Failed to load notifications')
      }
    } catch {
      toast.error('Failed to load notifications')
    } finally {
      setLoading(false)
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

      if (res.ok) {
        setNotifications(prev =>
          prev.map(n => ({ ...n, read: true, readAt: new Date().toISOString() }))
        )
        setUnreadCount(0)
        toast.success('Marked all as read')
      }
    } catch {
      toast.error('Failed to mark notifications')
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

      if (res.ok) {
        setNotifications(prev =>
          prev.map(n => (n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n))
        )
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
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

      if (res.ok) {
        setNotifications(prev => prev.filter(n => n.id !== id))
        toast.success('Notification deleted')
      }
    } catch {
      toast.error('Failed to delete')
    }
  }

  const deleteOldNotifications = async () => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'DELETE',
        credentials: 'include',
      })

      if (res.ok) {
        const data = await res.json()
        fetchNotifications() // Refresh list
        toast.success(`${data.deleted} old notifications cleaned up`)
      }
    } catch {
      toast.error('Failed to clean up')
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

  const isOneOnOneRequest = (notification: Notification) =>
    notification.data?.type === 'one-on-one-request' &&
    typeof notification.data?.requestId === 'string'

  const getIcon = (type: string) => {
    switch (type) {
      case 'class':
        return <Calendar className="h-5 w-5 text-blue-500" />
      case 'message':
        return <MessageSquare className="h-5 w-5 text-green-500" />
      case 'enrollment':
        return <Users className="h-5 w-5 text-purple-500" />
      case 'payment':
        return <DollarSign className="h-5 w-5 text-amber-500" />
      case 'reminder':
        return <Bell className="h-5 w-5 text-orange-500" />
      default:
        return <Info className="h-5 w-5 text-gray-500" />
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  const withLocale = (actionUrl: string) => {
    if (actionUrl.startsWith('http')) return actionUrl
    if (hasLocalePrefix) {
      if (actionUrl.startsWith(`/${locale}/`)) return actionUrl
      if (actionUrl.startsWith('/')) return `/${locale}${actionUrl}`
      return `/${locale}/${actionUrl}`
    }
    if (actionUrl.startsWith('/')) return actionUrl
    return `/${actionUrl}`
  }

  if (loading) {
    return (
      <div className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Bell className="h-6 w-6" />
            Notifications
            {unreadCount > 0 && <Badge className="bg-red-500">{unreadCount} new</Badge>}
          </h1>
          <p className="mt-1 text-gray-600">Stay updated with your classes and students</p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" onClick={markAllAsRead}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark all read
            </Button>
          )}
          <Button variant="ghost" onClick={deleteOldNotifications}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clean up old
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Notifications</CardTitle>
          <CardDescription>You have {unreadCount} unread notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notifications.length === 0 ? (
            <div className="py-12 text-center">
              <Bell className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <p className="text-gray-500">No notifications yet</p>
              <p className="mt-1 text-sm text-gray-400">
                Notifications will appear here when students interact with your classes
              </p>
            </div>
          ) : (
            notifications.map(notification => {
              const NotificationCard = (
                <div
                  className={`flex items-start gap-4 rounded-lg border p-4 transition-colors ${
                    notification.read ? 'bg-white' : 'border-blue-100 bg-blue-50/50'
                  }`}
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
                    {getIcon(notification.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {notification.title}
                          {!notification.read && (
                            <span className="ml-2 inline-block h-2 w-2 rounded-full bg-blue-500" />
                          )}
                        </h4>
                        <p className="mt-1 text-sm text-gray-600">{notification.message}</p>
                        <p className="mt-2 text-xs text-gray-400">
                          {formatTime(notification.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => markAsRead(notification.id)}
                            title="Mark as read"
                          >
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          </Button>
                        )}
                        {isOneOnOneRequest(notification) && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-xs"
                              disabled={!!respondingIds[notification.id]}
                              onClick={e => {
                                e.preventDefault()
                                e.stopPropagation()
                                const requestId = notification.data?.requestId as string
                                void respondToOneOnOne(notification.id, requestId, 'accept')
                              }}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs text-red-600 hover:text-red-700"
                              disabled={!!respondingIds[notification.id]}
                              onClick={e => {
                                e.preventDefault()
                                e.stopPropagation()
                                const requestId = notification.data?.requestId as string
                                void respondToOneOnOne(notification.id, requestId, 'reject')
                              }}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteNotification(notification.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )

              return notification.actionUrl ? (
                <Link
                  key={notification.id}
                  href={withLocale(notification.actionUrl)}
                  onClick={() => !notification.read && markAsRead(notification.id)}
                  className="block cursor-pointer"
                >
                  {NotificationCard}
                </Link>
              ) : (
                <div key={notification.id}>{NotificationCard}</div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
