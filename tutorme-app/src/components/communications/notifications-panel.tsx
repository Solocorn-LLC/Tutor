'use client'

import { useMemo } from 'react'
import { useParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Trash2,
  Loader2,
  MessageSquare,
  Calendar,
  BookOpen,
  Trophy,
  Users,
  DollarSign,
  Info,
  Inbox,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { CommsRole, AppNotification } from './types'

interface NotificationsPanelProps {
  role: CommsRole
  notifications: AppNotification[]
  loading: boolean
  unreadCount: number
  onMarkAllRead: () => void
  onClearAll: () => void
  onMarkRead: (id: string) => void
  onDelete: (id: string) => void
  onRespondOneOnOne?: (
    notificationId: string,
    requestId: string,
    action: 'accept' | 'reject'
  ) => void
  respondingIds?: Record<string, 'accept' | 'reject' | null>
}

export default function NotificationsPanel({
  role,
  notifications,
  loading,
  unreadCount,
  onMarkAllRead,
  onClearAll,
  onMarkRead,
  onDelete,
  onRespondOneOnOne,
  respondingIds = {},
}: NotificationsPanelProps) {
  const params = useParams()
  const pathname = usePathname()
  const locale = typeof params?.locale === 'string' ? params.locale : 'en'
  const hasLocalePrefix = pathname.startsWith(`/${locale}/`)

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

  const isOneOnOneRequest = (notification: AppNotification) =>
    notification.data?.type === 'one-on-one-request' &&
    typeof notification.data?.requestId === 'string'

  const getIcon = (type: string) => {
    switch (type) {
      case 'class':
        return <Calendar className="h-4 w-4 text-blue-500" />
      case 'assignment':
        return <BookOpen className="h-4 w-4 text-amber-500" />
      case 'achievement':
        return <Trophy className="h-4 w-4 text-purple-500" />
      case 'message':
        return <MessageSquare className="h-4 w-4 text-green-500" />
      case 'enrollment':
        return <Users className="h-4 w-4 text-purple-500" />
      case 'payment':
        return <DollarSign className="h-4 w-4 text-amber-500" />
      case 'reminder':
        return <Bell className="h-4 w-4 text-orange-500" />
      default:
        return <Info className="h-4 w-4 text-slate-500" />
    }
  }

  const formatTime = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true })
    } catch {
      return dateString
    }
  }

  const EmptyState = useMemo(
    () => (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Inbox className="mb-2 h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">No notifications yet</p>
        <p className="max-w-xs text-[11px] text-slate-400">
          {role === 'student'
            ? 'Class updates and messages will appear here'
            : 'Student activity and class updates will appear here'}
        </p>
      </div>
    ),
    [role]
  )

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[20px] border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-bold text-slate-800">Notifications</h3>
          {unreadCount > 0 && (
            <Badge className="bg-red-500 px-1.5 py-0 text-[10px] text-white">{unreadCount}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMarkAllRead}
              className="h-7 px-2 text-xs text-slate-600 hover:bg-slate-100"
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              Mark all
            </Button>
          )}
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="h-7 px-2 text-xs text-red-600 hover:bg-red-50"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : notifications.length === 0 ? (
            EmptyState
          ) : (
            <div className="divide-y divide-gray-200">
              {notifications.map(notification => {
                const Card = (
                  <div
                    className={cn(
                      'flex items-start gap-2 p-2 transition-colors',
                      notification.read ? 'bg-white' : 'bg-blue-50/40'
                    )}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
                      {getIcon(notification.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                            <span className="truncate">{notification.title}</span>
                            {!notification.read && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                            )}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-tight text-slate-600">
                            {notification.message}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {formatTime(notification.createdAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {!notification.read && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-500 hover:text-green-600"
                              onClick={e => {
                                e.preventDefault()
                                e.stopPropagation()
                                onMarkRead(notification.id)
                              }}
                              title="Mark as read"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {role === 'tutor' &&
                            isOneOnOneRequest(notification) &&
                            onRespondOneOnOne && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-1.5 text-[10px]"
                                  disabled={!!respondingIds[notification.id]}
                                  onClick={e => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    const requestId = notification.data?.requestId as string
                                    onRespondOneOnOne(notification.id, requestId, 'accept')
                                  }}
                                >
                                  Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1.5 text-[10px] text-red-600 hover:text-red-700"
                                  disabled={!!respondingIds[notification.id]}
                                  onClick={e => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    const requestId = notification.data?.requestId as string
                                    onRespondOneOnOne(notification.id, requestId, 'reject')
                                  }}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-500 hover:text-red-600"
                            onClick={e => {
                              e.preventDefault()
                              e.stopPropagation()
                              onDelete(notification.id)
                            }}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
                    onClick={() => !notification.read && onMarkRead(notification.id)}
                    className="block"
                  >
                    {Card}
                  </Link>
                ) : (
                  <div key={notification.id}>{Card}</div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
