'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import MessagingPanel from './messaging-panel'
import NotificationsPanel from './notifications-panel'
import type { Conversation, Message, AppNotification, CommsRole } from './types'

interface CommunicationsPageProps {
  role: CommsRole
}

export default function CommunicationsPage({ role }: CommunicationsPageProps) {
  const { data: session } = useSession()

  // Messaging state
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [inputMessage, setInputMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [messagesLoading, setMessagesLoading] = useState(true)

  // Notifications state
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(true)
  const [respondingIds, setRespondingIds] = useState<Record<string, 'accept' | 'reject' | null>>({})

  useEffect(() => {
    fetchConversations()
    fetchNotifications()
  }, [])

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id)
    }
  }, [selectedConversation])

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/conversations', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      } else {
        toast.error('Failed to load conversations')
      }
    } catch {
      toast.error('Failed to load conversations')
    } finally {
      setMessagesLoading(false)
    }
  }

  const fetchMessages = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
      } else {
        toast.error('Failed to load messages')
      }
    } catch {
      toast.error('Failed to load messages')
    }
  }

  const sendMessage = async () => {
    if (!inputMessage.trim() || !selectedConversation) return

    setSending(true)
    const content = inputMessage
    setInputMessage('')

    try {
      const res = await fetch(`/api/conversations/${selectedConversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content }),
      })

      if (res.ok) {
        const data = await res.json()
        setMessages(prev => [...prev, data.message])
        setConversations(prev =>
          prev.map(c =>
            c.id === selectedConversation.id
              ? {
                  ...c,
                  lastMessage: {
                    content,
                    createdAt: new Date().toISOString(),
                    read: true,
                    senderId: role === 'student' ? session?.user?.id || 'me' : 'me',
                  },
                }
              : c
          )
        )
      } else {
        toast.error('Failed to send message')
        setInputMessage(content)
      }
    } catch {
      toast.error('Failed to send message')
      setInputMessage(content)
    } finally {
      setSending(false)
    }
  }

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' })
      if (!res.ok) {
        if (res.status === 401) return
        throw new Error('Failed to load notifications')
      }
      const data = await res.json()
      const list: AppNotification[] = (data.notifications || []).map((n: Record<string, unknown>) => ({
        id: (n.notificationId as string) || (n.id as string),
        type: (n.type as string) || 'message',
        title: n.title as string,
        message: n.message as string,
        read: !!n.read,
        createdAt: (n.createdAt as string) || new Date().toISOString(),
        actionUrl: (n.actionUrl as string | null) || null,
        data: (n.data as Record<string, unknown> | null) || null,
      }))
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

  if (messagesLoading && notificationsLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col bg-white px-4 py-4 sm:px-6 lg:px-8">
      <div className="h-[45%] min-h-0 shrink-0 pb-4">
        <MessagingPanel
          role={role}
          conversations={conversations}
          selectedConversation={selectedConversation}
          messages={messages}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectConversation={setSelectedConversation}
          inputMessage={inputMessage}
          onInputChange={setInputMessage}
          onSend={sendMessage}
          sending={sending}
          loading={messagesLoading}
        />
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
