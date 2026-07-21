'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MentionInput } from '@/components/mentions/MentionInput'
import { renderMentions } from '@/lib/mentions/render-mentions'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { toast } from 'sonner'
import {
  MessageSquare,
  Users,
  UserPlus,
  Heart,
  Settings,
  Search,
  Inbox,
  Send,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type CommSection = 'chats' | 'contacts' | 'requests' | 'followers' | 'settings'

interface Conversation {
  id: string
  otherParticipant: {
    id: string
    name: string
    avatarUrl: string | null
    role?: string | null
  }
  lastMessage: {
    content: string
    createdAt: string
    read: boolean
    senderId: string
  } | null
  unreadCount: number
  updatedAt: string
}

interface Message {
  id: string
  content: string
  type: string
  senderId: string
  sender: {
    id: string
    profile: {
      name: string | null
      avatarUrl: string | null
    } | null
  }
  createdAt: string
  read: boolean
}

interface MessagingPanelProps {
  activeSection: CommSection
  onSectionChange: (section: CommSection) => void
}

const topItems: { id: CommSection; label: string; icon: React.ElementType }[] = [
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'requests', label: 'Requests', icon: UserPlus },
  { id: 'followers', label: 'Followers', icon: Heart },
]

const emptyStates: Record<CommSection, { icon: React.ElementType; title: string; hint: string }> = {
  chats: {
    icon: MessageSquare,
    title: 'No conversations yet',
    hint: 'Start a chat to see it here',
  },
  contacts: { icon: Users, title: 'No contacts yet', hint: 'Your contacts will appear here' },
  requests: {
    icon: UserPlus,
    title: 'No requests yet',
    hint: 'Connection requests will appear here',
  },
  followers: { icon: Heart, title: 'No followers yet', hint: 'Your followers will appear here' },
  settings: {
    icon: Settings,
    title: 'Settings',
    hint: 'Communication preferences will appear here',
  },
}

function roleLabel(role?: string | null): string {
  if (!role) return ''
  const r = role.toString().toUpperCase()
  return r.charAt(0) + r.slice(1).toLowerCase()
}

export default function MessagingPanel({ activeSection, onSectionChange }: MessagingPanelProps) {
  const { data: session } = useSession()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const list = emptyStates[activeSection]
  const ListIcon = list.icon

  useEffect(() => {
    fetchConversations()
  }, [])

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id)
    }
  }, [selectedConversation])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/conversations', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      }
    } catch {
      toast.error('Failed to load conversations')
    } finally {
      setLoading(false)
    }
  }

  const fetchMessages = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
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
      const res = await fetchWithCsrf(`/api/conversations/${selectedConversation.id}/messages`, {
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
                    senderId: session?.user?.id || 'me',
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

  const filteredConversations = conversations.filter(c =>
    c.otherParticipant.name.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)

  return (
    <div className="flex h-full w-full overflow-hidden bg-white">
      {/* Left menu rail */}
      <div className="flex w-40 flex-col items-center gap-2 border-r border-gray-200 py-4">
        {topItems.map(item => {
          const Icon = item.icon
          const active = activeSection === item.id
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={cn(
                'flex w-14 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[10px] font-semibold transition-colors',
                active
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </button>
          )
        })}

        <button
          onClick={() => onSectionChange('settings')}
          className={cn(
            'mt-auto flex w-14 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[10px] font-semibold transition-colors',
            activeSection === 'settings'
              ? 'bg-indigo-50 text-indigo-600'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
          )}
        >
          <Settings className="h-5 w-5" />
          <span>Settings</span>
        </button>
      </div>

      {/* List column */}
      <div className="flex w-full flex-col overflow-hidden border-r border-gray-200 sm:w-72 lg:w-80">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-lg font-bold capitalize text-slate-800">{activeSection}</h2>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="rounded-full border-slate-200 bg-slate-50/50 pl-9 text-sm"
            />
          </div>
        </div>

        <div className="scrollbar-hide flex min-h-0 flex-1 flex-col overflow-y-auto">
          {activeSection === 'chats' && loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : activeSection === 'chats' && filteredConversations.length > 0 ? (
            <ScrollArea className="h-full">
              <div className="divide-y divide-slate-100">
                {filteredConversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv)}
                    className={cn(
                      'flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-slate-50',
                      selectedConversation?.id === conv.id && 'bg-slate-50'
                    )}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-indigo-50 font-medium text-indigo-600">
                        {conv.otherParticipant.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-sm font-semibold text-slate-800">
                          {conv.otherParticipant.name}
                        </span>
                        {conv.unreadCount > 0 && (
                          <Badge className="ml-2 bg-red-500 text-[10px]">{conv.unreadCount}</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {conv.lastMessage?.content || 'No messages yet'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                <ListIcon className="h-7 w-7 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-700">{list.title}</p>
              <p className="mt-1 text-xs text-slate-500">{list.hint}</p>
            </div>
          )}
        </div>
      </div>

      {/* Detail / chat area */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50/30">
        {/* Chat viewport */}
        <div className="scrollbar-hide flex min-h-0 flex-1 flex-col overflow-y-auto">
          {!selectedConversation ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center">
              <Inbox className="mb-3 h-16 w-16 text-slate-300" />
              <p className="text-lg font-bold text-slate-700">
                Select a {activeSection === 'settings' ? 'setting' : activeSection.slice(0, -1)}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Choose an item from the {activeSection} list to view details
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center">
              <MessageSquare className="mb-3 h-12 w-12 text-slate-300" />
              <p className="font-medium text-slate-700">No messages yet</p>
              <p className="mt-1 text-sm text-slate-500">Start the conversation!</p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-4 p-4">
                {messages.map(msg => {
                  const isMe = msg.senderId === session?.user?.id
                  return (
                    <div
                      key={msg.id}
                      className={cn('flex gap-3', isMe ? 'flex-row-reverse' : 'flex-row')}
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback
                          className={cn(
                            'text-xs font-medium',
                            isMe
                              ? 'bg-indigo-600 text-white'
                              : 'border border-slate-200 bg-white text-slate-600'
                          )}
                        >
                          {(msg.sender.profile?.name || 'U').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={cn(
                          'max-w-[70%] rounded-2xl p-3.5 text-sm shadow-sm',
                          isMe
                            ? 'rounded-tr-sm bg-indigo-600 text-white'
                            : 'rounded-tl-sm border border-slate-100 bg-white text-slate-800'
                        )}
                      >
                        <p className="leading-relaxed">{renderMentions(msg.content)}</p>
                        <span
                          className={cn(
                            'mt-1.5 block text-[10px] font-medium',
                            isMe ? 'text-indigo-200' : 'text-slate-400'
                          )}
                        >
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {msg.read && isMe && ' • Read'}
                        </span>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Message input */}
        <div className="shrink-0 border-t border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <MentionInput
              placeholder="Type a message..."
              value={inputMessage}
              onChange={setInputMessage}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && !sending) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              disabled={!selectedConversation || sending}
              className="min-h-[40px] flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus-visible:ring-blue-500"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!selectedConversation || sending || !inputMessage.trim()}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors',
                !selectedConversation || sending || !inputMessage.trim()
                  ? 'cursor-not-allowed bg-blue-400'
                  : 'bg-blue-600 hover:bg-blue-700'
              )}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
