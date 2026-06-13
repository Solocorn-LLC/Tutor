'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { renderMentions } from '@/lib/mentions/render-mentions'
import { cn } from '@/lib/utils'
import { MessageSquare, Search, Send, Loader2, Paperclip, MoreHorizontal, ChevronRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { CommsRole, Conversation, Message } from './types'

interface MessagingPanelProps {
  role: CommsRole
  conversations: Conversation[]
  selectedConversation: Conversation | null
  messages: Message[]
  searchQuery: string
  onSearchChange: (value: string) => void
  onSelectConversation: (conversation: Conversation) => void
  inputMessage: string
  onInputChange: (value: string) => void
  onSend: () => void
  sending: boolean
  loading: boolean
}

export default function MessagingPanel({
  role,
  conversations,
  selectedConversation,
  messages,
  searchQuery,
  onSearchChange,
  onSelectConversation,
  inputMessage,
  onInputChange,
  onSend,
  sending,
  loading,
}: MessagingPanelProps) {
  const { data: session } = useSession()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const filteredConversations = useMemo(
    () => conversations.filter(c => c.otherParticipant.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [conversations, searchQuery]
  )

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)
  const otherRoleLabel = role === 'student' ? 'Tutor' : 'Student'

  const isMe = (msg: Message) => {
    if (role === 'student') {
      return msg.senderId === session?.user?.id
    }
    return msg.senderId === 'me' || msg.sender.profile?.name === 'You'
  }

  const formatTime = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true })
    } catch {
      return dateString
    }
  }

  return (
    <div className="flex h-full w-full overflow-hidden rounded-[20px] border border-[rgba(0,0,0,0.05)] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
      {/* Left navigation rail */}
      <div className="hidden w-16 flex-col items-center border-r border-slate-100 py-4 sm:flex">
        <div className="flex flex-col items-center gap-1 rounded-xl bg-indigo-50 px-3 py-2.5 text-indigo-600">
          <MessageSquare className="h-5 w-5" />
          <span className="text-[10px] font-semibold">Chats</span>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex w-full flex-col border-r border-slate-100 sm:w-72 lg:w-80">
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">Chats</h2>
            {totalUnread > 0 && <Badge className="bg-red-500 text-white">{totalUnread}</Badge>}
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="rounded-full border-slate-200 bg-slate-50/50 pl-9 text-sm"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="px-4 py-12 text-center text-slate-500">
                <MessageSquare className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="text-sm">No conversations yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredConversations.map(conv => {
                  const selected = selectedConversation?.id === conv.id
                  return (
                    <button
                      key={conv.id}
                      onClick={() => onSelectConversation(conv)}
                      className={cn(
                        'flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-slate-50',
                        selected && 'bg-indigo-50/60 hover:bg-indigo-50/80'
                      )}
                    >
                      <Avatar className="h-11 w-11 shrink-0">
                        <AvatarFallback
                          className={cn(
                            'font-semibold',
                            selected ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'
                          )}
                        >
                          {conv.otherParticipant.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn('truncate text-sm font-semibold', selected ? 'text-indigo-900' : 'text-slate-800')}>
                            {conv.otherParticipant.name}
                          </span>
                          {conv.lastMessage && (
                            <span className="shrink-0 text-[10px] text-slate-400">
                              {formatTime(conv.lastMessage.createdAt)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs text-slate-500">
                            {conv.lastMessage?.content || 'No messages yet'}
                          </p>
                          {conv.unreadCount > 0 && (
                            <Badge className="shrink-0 bg-red-500 px-1.5 py-0 text-[10px] text-white">
                              {conv.unreadCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-slate-50/30">
        {selectedConversation ? (
          <>
            <div className="border-b border-slate-100 bg-white p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-indigo-50 font-semibold text-indigo-600">
                      {selectedConversation.otherParticipant.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-base font-bold text-slate-800">
                      {selectedConversation.otherParticipant.name}
                    </h2>
                    <p className="text-xs font-medium text-slate-500">{otherRoleLabel}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {role === 'tutor' && (
                    <Link href={`/tutor/reports/${selectedConversation.otherParticipant.id}`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="hidden border-slate-200 text-slate-600 hover:bg-slate-50 sm:flex"
                      >
                        View Profile
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </Link>
                  )}
                  <Button variant="ghost" size="icon" className="text-slate-500">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 p-3 sm:p-4">
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">
                    <MessageSquare className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                    <p className="font-medium text-slate-700">No messages yet</p>
                    <p className="mt-1 text-sm">Send a message to start the conversation</p>
                  </div>
                ) : (
                  messages.map(msg => {
                    const me = isMe(msg)
                    return (
                      <div key={msg.id} className={cn('flex gap-3', me ? 'flex-row-reverse' : 'flex-row')}>
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback
                            className={cn(
                              'text-xs font-semibold',
                              me ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600'
                            )}
                          >
                            {(msg.sender.profile?.name || 'U').charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div
                          className={cn(
                            'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm sm:max-w-[65%]',
                            me
                              ? 'rounded-tr-sm bg-indigo-600 text-white'
                              : 'rounded-tl-sm border border-slate-100 bg-white text-slate-800'
                          )}
                        >
                          <p className="leading-relaxed">{renderMentions(msg.content)}</p>
                          <span
                            className={cn(
                              'mt-1 block text-[10px] font-medium',
                              me ? 'text-indigo-200' : 'text-slate-400'
                            )}
                          >
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {msg.read && me && ' • Read'}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="border-t border-slate-100 bg-white p-3">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50/50 px-3 py-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full text-slate-500"
                  title="Attach file"
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
                <Input
                  placeholder="Type a message..."
                  value={inputMessage}
                  onChange={e => onInputChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && !sending) {
                      e.preventDefault()
                      onSend()
                    }
                  }}
                  disabled={sending}
                  className="h-auto flex-1 border-0 bg-transparent px-2 py-1 text-sm shadow-none focus-visible:ring-0"
                />
                <Button
                  onClick={onSend}
                  disabled={sending || !inputMessage.trim()}
                  className="h-9 w-9 shrink-0 rounded-full bg-indigo-600 p-0 text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="ml-0.5 h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-slate-500">
            <MessageSquare className="mb-4 h-16 w-16 text-slate-300" />
            <p className="text-lg font-bold text-slate-700">Select a chat</p>
            <p className="mt-1 text-sm">Choose a conversation to start messaging</p>
          </div>
        )}
      </div>
    </div>
  )
}
