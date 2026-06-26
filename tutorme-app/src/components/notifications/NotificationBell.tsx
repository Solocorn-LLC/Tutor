'use client'

/**
 * NotificationBell — Simple bell icon linking to Communications page.
 *
 * Features:
 *  - Live unread count badge
 *  - Click navigates to the full Communications / notifications page
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Bell } from 'lucide-react'

interface NotificationBellProps {
  /** Where the bell links (role-specific). */
  viewAllHref?: string
}

export function NotificationBell({
  viewAllHref = '/student/communications',
}: NotificationBellProps = {}) {
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=0', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setUnreadCount(data.unreadCount || 0)
    } catch (error) {
      console.error('[NotificationBell] Failed to fetch unread count:', error)
    }
  }, [])

  // Fetch initial count and poll every 30 seconds
  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  return (
    <Link href={viewAllHref}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="animate-in zoom-in-50 absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>
    </Link>
  )
}
