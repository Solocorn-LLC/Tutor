'use client'

/**
 * Functional direct-message chat, embedded in the Communications page's
 * "Messaging" tab. Reads the real conversation list from /api/conversations
 * (each 1-on-1 booking opens a student↔tutor thread), lets you open a thread and
 * send messages. Replaces the old static MessagingPanel placeholder.
 */

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MentionInput } from '@/components/mentions/MentionInput'
import { renderMentions } from '@/lib/mentions/render-mentions'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { MessageSquare, Send, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    profile: { name: string | null; avatarUrl: string | null } | null
  }
  createdAt: string
  read: boolean
}

function roleLabel(role?: string | null): string {
  if (!role) return ''
  const r = role.toString().toUpperCase()
  return r.charAt(0) + r.slice(1).toLowerCase()
}

export default function Messenger() {
  const { data: session } = useSession()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchConversations()
  }, [])

  useEffect(() => {
    if (selectedConversation) fetchMessages(selectedConversation.id)
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

  if (loading) {
    return (
      <div className="flex h-full min-h-[320px] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-[420px] grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Conversations list */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[rgba(0,0,0,0.06)] bg-white shadow-sm lg:col-span-1">
        <div className="p-4 pb-3">
          <h2 className="flex items-center justify-between text-base font-bold text-slate-800">
            Conversations
            {totalUnread > 0 && <Badge className="bg-red-500">{totalUnread}</Badge>}
          </h2>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search messages..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="border-slate-200 bg-slate-50/50 pl-9 text-sm"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full">
            <div className="divide-y divide-slate-100">
              {filteredConversations.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <MessageSquare className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                  <p className="text-sm">No conversations yet</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Book (or accept) a 1-on-1 and the other person shows up here.
                  </p>
                </div>
              ) : (
                filteredConversations.map(conv => (
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
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[rgba(0,0,0,0.06)] bg-white shadow-sm lg:col-span-2">
        {selectedConversation ? (
          <>
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-indigo-50 font-medium text-indigo-600">
                    {selectedConversation.otherParticipant.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    {selectedConversation.otherParticipant.name}
                  </h2>
                  {roleLabel(selectedConversation.otherParticipant.role) && (
                    <p className="text-xs font-medium text-slate-500">
                      {roleLabel(selectedConversation.otherParticipant.role)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col bg-slate-50/30 p-0">
              <ScrollArea className="min-h-0 flex-1 p-4">
                <div className="space-y-4">
                  {messages.length === 0 ? (
                    <div className="py-12 text-center text-slate-500">
                      <MessageSquare className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                      <p className="font-medium text-slate-700">No messages yet</p>
                      <p className="mt-1 text-sm">Start the conversation!</p>
                    </div>
                  ) : (
                    messages.map(msg => {
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
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <div className="border-t border-slate-100 bg-white p-4">
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
                    disabled={sending}
                    className="flex-1 rounded-xl border-slate-200 bg-slate-50/50"
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={sending || !inputMessage.trim()}
                    className="h-10 w-10 shrink-0 rounded-xl bg-indigo-600 p-0 text-white hover:bg-indigo-700"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="ml-0.5 h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center bg-slate-50/30 text-slate-500">
            <MessageSquare className="mb-4 h-16 w-16 text-slate-300" />
            <p className="text-lg font-bold text-slate-700">Select a conversation</p>
            <p className="mt-1 text-sm">Choose a conversation from the list to start messaging</p>
          </div>
        )}
      </div>
    </div>
  )
}
