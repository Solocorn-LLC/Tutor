'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MentionInput } from '@/components/mentions/MentionInput'
import { renderMentions } from '@/lib/mentions/render-mentions'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MessageSquare, Send, Loader2, Users, Bell, Search, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface Conversation {
  id: string
  otherParticipant: {
    id: string
    name: string
    avatarUrl: string | null
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

export default function CommunicationCenterPage() {
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

  // Load messages when conversation selected
  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id)
    }
  }, [selectedConversation])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/conversations', {
        credentials: 'include',
      })
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
        // Update last message in conversations list
        setConversations(prev =>
          prev.map(c =>
            c.id === selectedConversation.id
              ? {
                  ...c,
                  lastMessage: {
                    content,
                    createdAt: new Date().toISOString(),
                    read: true,
                    senderId: 'me',
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
      <div className="flex h-screen w-full items-center justify-center bg-[#FFFFFF]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#FFFFFF] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 min-h-[52px] shrink-0">
        <div className="flex h-full w-full items-center justify-between gap-2 rounded-2xl border border-[#E5E7EB] bg-white p-1.5 px-4 shadow-[0_8px_20px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-slate-800">Messages</h1>
          </div>
        </div>
      </div>

      <div className="grid h-[600px] grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Conversations List */}
        <div className="flex flex-col overflow-hidden rounded-[20px] border border-[rgba(0,0,0,0.05)] bg-[#FFFFFF] shadow-[0_8px_24px_rgba(0,0,0,0.10)] transition-shadow duration-200 hover:shadow-[0_18px_60px_rgba(0,0,0,0.14)] lg:col-span-1">
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
          <div className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full">
              <div className="divide-y divide-slate-100">
                {filteredConversations.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <MessageSquare className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                    <p className="text-sm">No conversations yet</p>
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
                            <Badge className="ml-2 bg-red-500 text-[10px]">
                              {conv.unreadCount}
                            </Badge>
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

        {/* Chat Area */}
        <div className="flex flex-col overflow-hidden rounded-[20px] border border-[rgba(0,0,0,0.05)] bg-[#FFFFFF] shadow-[0_8px_24px_rgba(0,0,0,0.10)] transition-shadow duration-200 hover:shadow-[0_18px_60px_rgba(0,0,0,0.14)] lg:col-span-2">
          {selectedConversation ? (
            <>
              <div className="border-b border-slate-100 p-4">
                <div className="flex items-center justify-between">
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
                      <p className="text-xs font-medium text-slate-500">Student</p>
                    </div>
                  </div>
                  <Link href={`/tutor/reports/${selectedConversation.otherParticipant.id}`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      View Profile
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="flex flex-1 flex-col bg-slate-50/30 p-0">
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {messages.length === 0 ? (
                      <div className="py-12 text-center text-slate-500">
                        <MessageSquare className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                        <p className="font-medium text-slate-700">No messages yet</p>
                        <p className="mt-1 text-sm">Start the conversation!</p>
                      </div>
                    ) : (
                      messages.map(msg => {
                        const isMe = msg.senderId === 'me' || msg.sender.profile?.name === 'You'
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
            <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/30 text-slate-500">
              <MessageSquare className="mb-4 h-16 w-16 text-slate-300" />
              <p className="text-lg font-bold text-slate-700">Select a conversation</p>
              <p className="mt-1 text-sm">Choose a conversation from the list to start messaging</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
