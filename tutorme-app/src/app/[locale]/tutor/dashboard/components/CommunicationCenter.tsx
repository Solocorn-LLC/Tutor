'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  useFilteredMessages,
  useMessageStats,
  useSearchQuery,
  useFilter,
  useSelectedMessage,
  useSelectedMessages,
  useShowMultiSelect,
  useShowCompose,
  useShowTemplates,
  useShowAnnouncement,
  useShowQuickRepliesManager,
  useShowAnalytics,
  useShowFilters,
  useReplyText,
  useShowAIReplies,
  useAiReplies,
  useIsRecordingVoice,
  useVoiceRecordingDuration,
  useIsScheduling,
  useScheduledDate,
  useScheduledTime,
  useShowThread,
  useThreadMessages,
  useTypingIndicators,
  usePresenceStatus,
  useIsWebSocketConnected,
  useComposeTo,
  useComposeSubject,
  useComposeMessage,
  useComposeAttachments,
  useSelectedLabels,
  useComposePriority,
  useTemplates,
  useQuickReplies,
  useLabels,
  useCommunicationActions,
  type Message,
  type Attachment,
  type MessageTemplate,
  type QuickReply,
  type AIReply,
  type Label as LabelType,
  type PresenceStatus,
  type TypingIndicator,
} from '@/stores/communication-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { format, isAfter } from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  MessageSquare,
  Send,
  Search,
  Filter,
  Star,
  Clock,
  MoreVertical,
  Plus,
  Sparkles,
  Mail,
  Megaphone,
  ChevronRight,
  Archive,
  Trash2,
  Reply,
  Forward,
  Bookmark,
  Smile,
  Paperclip,
  Mic,
  Bot,
  Check,
  CheckCheck,
  MicOff,
  Pause,
  Play,
  X,
  CalendarDays,
  Tag,
  BarChart3,
  Zap,
  Globe,
  Users,
  FileText,
  Image as ImageIcon,
  Download,
  Hash,
  Settings,
  Volume2,
  Loader2,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Bell,
  Eye,
  EyeOff,
  Copy,
  Edit3,
  Trash,
  Radio,
  Wifi,
  WifiOff,
} from 'lucide-react'

// ============================================
// MOCK DATA GENERATORS
// ============================================

const generateAIReplies = (messageContent: string): AIReply[] => [
  {
    id: '1',
    text: "I'd be happy to help! Let me explain that concept in more detail during our next session.",
    tone: 'friendly',
  },
  {
    id: '2',
    text: "Thank you for reaching out. Here's a resource that might help: [link]",
    tone: 'formal',
  },
  {
    id: '3',
    text: 'No problem at all! This is a common question. The key is to remember that...',
    tone: 'casual',
  },
  {
    id: '4',
    text: "I understand your frustration. Let's work through this together step by step.",
    tone: 'empathetic',
  },
]

// ============================================
// MAIN COMPONENT
// ============================================

export function CommunicationCenter() {
  const router = useRouter()

  // Zustand store selectors - granular subscriptions for optimized re-renders
  const filteredMessages = useFilteredMessages()
  const stats = useMessageStats()
  const searchQuery = useSearchQuery()
  const filter = useFilter()
  const selectedMessage = useSelectedMessage()
  const selectedMessages = useSelectedMessages()
  const showMultiSelect = useShowMultiSelect()
  const showCompose = useShowCompose()
  const showTemplates = useShowTemplates()
  const showAnnouncement = useShowAnnouncement()
  const showQuickRepliesManager = useShowQuickRepliesManager()
  const showAnalytics = useShowAnalytics()
  const showFilters = useShowFilters()
  const replyText = useReplyText()
  const showAIReplies = useShowAIReplies()
  const aiReplies = useAiReplies()
  const isRecordingVoice = useIsRecordingVoice()
  const voiceRecordingDuration = useVoiceRecordingDuration()
  const isScheduling = useIsScheduling()
  const scheduledDate = useScheduledDate()
  const scheduledTime = useScheduledTime()
  const showThread = useShowThread()
  const threadMessages = useThreadMessages()
  const typingIndicators = useTypingIndicators()
  const presenceStatus = usePresenceStatus()
  const isWebSocketConnected = useIsWebSocketConnected()
  const composeTo = useComposeTo()
  const composeSubject = useComposeSubject()
  const composeMessage = useComposeMessage()
  const composeAttachments = useComposeAttachments()
  const selectedLabels = useSelectedLabels()
  const composePriority = useComposePriority()
  const templates = useTemplates()
  const quickReplies = useQuickReplies()
  const labels = useLabels()

  // Store actions
  const actions = useCommunicationActions()

  // Local state for UI
  const [calendarOpen, setCalendarOpen] = useState(false)

  // Refs
  const voiceRecorderRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Real-time WebSocket connection is managed by the store/actions

  // filteredMessages and stats are already computed by store selectors

  // ============================================
  // HANDLERS
  // ============================================

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours < 1) return 'Just now'
    if (hours < 24) return `${hours}h ago`
    return date.toLocaleDateString()
  }

  const handleReply = () => {
    if (!replyText.trim() && composeAttachments.length === 0) return

    const newMessage: Message = {
      id: `reply-${Date.now()}`,
      studentId: selectedMessage?.studentId || '',
      studentName: 'You',
      subject: `Re: ${selectedMessage?.subject}`,
      content: replyText,
      timestamp: new Date().toISOString(),
      isRead: true,
      isStarred: false,
      priority: 'normal',
      type: 'message',
      parentId: selectedMessage?.id,
      attachments: composeAttachments,
    }

    actions.addMessage(newMessage)
    toast.success(isScheduling ? 'Message scheduled!' : 'Reply sent!')
    actions.setReplyText('')
    actions.clearComposeAttachments()
    actions.setShowAIReplies(false)
    actions.setIsScheduling(false)
    actions.setScheduledDate(undefined)
  }

  const handleAIAssist = () => {
    if (!selectedMessage) return
    const suggestions = generateAIReplies(selectedMessage.content)
    actions.setAiReplies(suggestions)
    actions.setShowAIReplies(true)
  }

  const handleUseTemplate = (template: MessageTemplate) => {
    actions.setReplyText(template.content)
    actions.setShowTemplates(false)
  }

  const handleUseQuickReply = (quickReply: QuickReply) => {
    actions.setReplyText(quickReply.content)
  }

  const handleVoiceRecord = () => {
    if (isRecordingVoice) {
      // Stop recording
      actions.setIsRecordingVoice(false)
      if (voiceRecorderRef.current) {
        clearInterval(voiceRecorderRef.current)
      }
      toast.success(`Voice message recorded (${voiceRecordingDuration}s)`)
      actions.setVoiceRecordingDuration(0)
    } else {
      // Start recording
      actions.setIsRecordingVoice(true)
      actions.setVoiceRecordingDuration(0)
      voiceRecorderRef.current = setInterval(() => {
        actions.incrementVoiceDuration()
      }, 1000)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      const newAttachment: Attachment = {
        id: `att-${Date.now()}-${Math.random()}`,
        name: file.name,
        type: file.type.startsWith('image/')
          ? 'image'
          : file.type.includes('pdf')
            ? 'pdf'
            : 'document',
        url: URL.createObjectURL(file),
        size: file.size,
      }
      actions.addComposeAttachment(newAttachment)
    })

    toast.success(`${files.length} file(s) attached`)
  }

  const handleToggleMessageSelection = (messageId: string) => {
    actions.toggleMessageSelection(messageId)
  }

  const handleSelectAll = () => {
    if (selectedMessages.size === filteredMessages.length) {
      actions.setSelectedMessages(new Set())
    } else {
      actions.setSelectedMessages(new Set(filteredMessages.map(m => m.id)))
    }
  }

  const handleBulkAction = (action: 'read' | 'unread' | 'star' | 'archive' | 'delete') => {
    switch (action) {
      case 'read':
        actions.bulkMarkAsRead(selectedMessages)
        break
      case 'unread':
        actions.bulkMarkAsUnread(selectedMessages)
        break
      case 'star':
        actions.bulkToggleStar(selectedMessages)
        break
      case 'archive':
        actions.bulkArchive(selectedMessages)
        break
      case 'delete':
        actions.bulkDelete(selectedMessages)
        break
    }

    actions.setSelectedMessages(new Set())
    actions.setShowMultiSelect(false)
    toast.success(`Messages ${action}ed`)
  }

  const handleAddLabel = (messageId: string, labelId: string) => {
    actions.addLabelToMessage(messageId, labelId)
  }

  const handleTranslate = (message: Message) => {
    // Mock translation
    actions.translateMessage(message.id, `[Translated] ${message.content}`, 'zh-CN')
    toast.success('Message translated')
  }

  const handleViewThread = (message: Message) => {
    actions.setSelectedMessage(message)
    actions.setThreadMessages([message])
    actions.setShowThread(true)
  }

  const getPresenceIndicator = (studentId: string) => {
    const status = presenceStatus[studentId]
    if (!status) return null

    return (
      <span
        className={cn(
          'absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-white',
          status.status === 'online' && 'bg-green-500',
          status.status === 'away' && 'bg-yellow-500',
          status.status === 'offline' && 'bg-gray-400'
        )}
      />
    )
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-base">Communication Center</CardTitle>
            {stats.unread > 0 && (
              <Badge variant="destructive" className="text-xs">
                {stats.unread}
              </Badge>
            )}
            {/* WebSocket connection indicator */}
            <div
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
                isWebSocketConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              )}
            >
              {isWebSocketConnected ? (
                <Wifi className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              {isWebSocketConnected ? 'Live' : 'Offline'}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => actions.setShowAnalytics(true)}>
              <BarChart3 className="mr-1 h-4 w-4" />
              Analytics
            </Button>
            <Button variant="ghost" size="sm" onClick={() => actions.setShowAnnouncement(true)}>
              <Megaphone className="mr-1 h-4 w-4" />
              Announce
            </Button>
            <Button size="sm" onClick={() => actions.setShowCompose(true)}>
              <Plus className="mr-1 h-4 w-4" />
              New
            </Button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search messages, labels, courses..."
              value={searchQuery}
              onChange={e => actions.setSearchQuery(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <Popover open={showFilters} onOpenChange={actions.setShowFilters}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Filter className="mr-1 h-4 w-4" />
                Filter
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" variant="panel">
              <div className="space-y-4">
                <h4 className="font-medium">Filter Messages</h4>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex flex-wrap gap-2">
                    {['all', 'unread', 'starred', 'high', 'scheduled'].map(f => (
                      <Button
                        key={f}
                        variant={filter === f ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => actions.setFilter(f as any)}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Labels</Label>
                  <div className="flex flex-wrap gap-1">
                    {labels.map(label => (
                      <Badge
                        key={label.id}
                        variant="outline"
                        className={cn('cursor-pointer', label.color)}
                      >
                        {label.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant={showMultiSelect ? 'default' : 'outline'}
            size="sm"
            className="h-9"
            onClick={() => {
              actions.setShowMultiSelect(!showMultiSelect)
              actions.setSelectedMessages(new Set())
            }}
          >
            <Check className="mr-1 h-4 w-4" />
            Select
          </Button>
        </div>

        {/* Bulk Actions Bar */}
        {showMultiSelect && selectedMessages.size > 0 && (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-blue-50 p-2">
            <span className="text-sm text-blue-700">{selectedMessages.size} selected</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => handleBulkAction('read')}>
                <Check className="mr-1 h-4 w-4" />
                Read
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleBulkAction('star')}>
                <Star className="mr-1 h-4 w-4" />
                Star
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleBulkAction('archive')}>
                <Archive className="mr-1 h-4 w-4" />
                Archive
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600"
                onClick={() => handleBulkAction('delete')}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        )}

        {/* Typing Indicators */}
        {typingIndicators.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
            <div className="flex -space-x-1">
              {typingIndicators.slice(0, 3).map((t, i) => (
                <div
                  key={i}
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-blue-100 text-xs"
                >
                  {t.userName[0]}
                </div>
              ))}
            </div>
            <span>{typingIndicators[0].userName} is typing...</span>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="space-y-1 px-4 pb-4">
            {filteredMessages.length === 0 ? (
              <div className="py-8 text-center">
                <Mail className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-500">No messages found</p>
              </div>
            ) : (
              filteredMessages.map(message => (
                <div
                  key={message.id}
                  onClick={() => !showMultiSelect && actions.setSelectedMessage(message)}
                  className={cn(
                    'relative cursor-pointer rounded-lg border p-3 transition-all hover:shadow-md',
                    !message.isRead ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white',
                    message.priority === 'high' && !message.isRead && 'border-l-4 border-l-red-500',
                    selectedMessages.has(message.id) && 'ring-2 ring-blue-500',
                    message.isScheduled && 'border-yellow-200 bg-yellow-50'
                  )}
                >
                  {/* Multi-select checkbox */}
                  {showMultiSelect && (
                    <div className="absolute left-3 top-3">
                      <Checkbox
                        checked={selectedMessages.has(message.id)}
                        onCheckedChange={() => handleToggleMessageSelection(message.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                  )}

                  <div className={cn('flex items-start gap-3', showMultiSelect && 'pl-8')}>
                    {/* Avatar with presence */}
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback
                          className={cn(
                            'text-xs',
                            message.type === 'system' ? 'bg-gray-200' : 'bg-blue-100 text-blue-700'
                          )}
                        >
                          {message.studentName
                            .split(' ')
                            .map(n => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      {message.type !== 'system' && getPresenceIndicator(message.studentId)}
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Header row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'text-sm font-medium',
                              !message.isRead && 'text-blue-900'
                            )}
                          >
                            {message.studentName}
                          </span>
                          {message.isStarred && (
                            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                          )}
                          {message.priority === 'high' && (
                            <Badge variant="destructive" className="px-1 py-0 text-xs">
                              High
                            </Badge>
                          )}
                          {message.isScheduled && (
                            <Badge variant="outline" className="bg-yellow-50 text-xs">
                              <Clock className="mr-1 h-3 w-3" />
                              Scheduled
                            </Badge>
                          )}
                          {message.replyCount && message.replyCount > 0 && (
                            <Badge variant="outline" className="text-xs">
                              <MessageCircle className="mr-1 h-3 w-3" />
                              {message.replyCount}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">
                          {formatTime(message.timestamp)}
                        </span>
                      </div>

                      {/* Subject & Content */}
                      <p
                        className={cn(
                          'truncate text-sm',
                          !message.isRead ? 'font-medium text-gray-900' : 'text-gray-600'
                        )}
                      >
                        {message.subject}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {message.voiceUrl ? '🎤 Voice message' : message.content}
                      </p>

                      {/* Labels */}
                      {message.labels && message.labels.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {message.labels.map(labelId => {
                            const label = labels.find(l => l.id === labelId)
                            if (!label) return null
                            return (
                              <Badge
                                key={labelId}
                                variant="outline"
                                className={cn('text-xs', label.color)}
                              >
                                {label.name}
                              </Badge>
                            )
                          })}
                        </div>
                      )}

                      {/* Attachments indicator */}
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                          <Paperclip className="h-3 w-3" />
                          {message.attachments.length} attachment(s)
                        </div>
                      )}

                      {/* Read receipt */}
                      {message.isRead && message.readAt && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                          <CheckCheck className="h-3 w-3" />
                          Read {formatTime(message.readAt)}
                        </div>
                      )}
                    </div>

                    {/* Unread indicator */}
                    {!message.isRead && (
                      <div className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Quick Stats Footer */}
        <div className="flex items-center justify-between border-t bg-gray-50 p-3 text-xs text-gray-500">
          <div className="flex gap-3">
            <span>{stats.total} total</span>
            <span>•</span>
            <span>{stats.unread} unread</span>
            <span>•</span>
            <span>{stats.todayMessages} today</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => router.push('/tutor/messages')}
          >
            Open Full Center
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </CardContent>

      {/* ============================================
          MESSAGE DETAIL DIALOG
          ============================================ */}
      <Dialog
        open={!!selectedMessage && !showThread}
        onOpenChange={() => actions.setSelectedMessage(null)}
      >
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
          {selectedMessage && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-blue-100 text-blue-700">
                          {selectedMessage.studentName
                            .split(' ')
                            .map(n => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      {getPresenceIndicator(selectedMessage.studentId)}
                    </div>
                    <div>
                      <DialogTitle className="text-lg">{selectedMessage.subject}</DialogTitle>
                      <p className="text-sm text-gray-500">
                        From: {selectedMessage.studentName} •{' '}
                        {formatTime(selectedMessage.timestamp)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        actions.toggleMessageStar(selectedMessage.id)
                      }}
                    >
                      <Star
                        className={cn(
                          'h-4 w-4',
                          selectedMessage.isStarred && 'fill-yellow-500 text-yellow-500'
                        )}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleTranslate(selectedMessage)}
                    >
                      <Globe className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Archive className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              <ScrollArea className="my-4 flex-1">
                <div className="space-y-4">
                  {/* Original message */}
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="whitespace-pre-wrap text-gray-800">{selectedMessage.content}</p>
                    {selectedMessage.translatedContent && (
                      <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3">
                        <p className="text-sm text-blue-800">{selectedMessage.translatedContent}</p>
                        <p className="mt-1 text-xs text-blue-500">
                          Translated from {selectedMessage.translatedFrom}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Voice message player */}
                  {selectedMessage.voiceUrl && (
                    <div className="flex items-center gap-3 rounded-lg bg-purple-50 p-4">
                      <Button size="icon" variant="outline">
                        <Play className="h-4 w-4" />
                      </Button>
                      <div className="h-2 flex-1 rounded-full bg-purple-200">
                        <div className="h-full w-1/3 rounded-full bg-purple-500" />
                      </div>
                      <span className="text-sm text-purple-700">
                        {selectedMessage.voiceDuration}s
                      </span>
                    </div>
                  )}

                  {/* Attachments */}
                  {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Attachments</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedMessage.attachments.map(att => (
                          <div
                            key={att.id}
                            className="flex items-center gap-2 rounded-lg border bg-white p-2"
                          >
                            {att.type === 'image' ? (
                              <ImageIcon className="h-4 w-4" />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                            <span className="text-sm">{att.name}</span>
                            <span className="text-xs text-gray-500">
                              ({formatFileSize(att.size)})
                            </span>
                            <Button size="icon" variant="ghost" className="h-6 w-6">
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Thread button */}
                  {selectedMessage.replyCount && selectedMessage.replyCount > 0 && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => handleViewThread(selectedMessage)}
                    >
                      <MessageCircle className="mr-2 h-4 w-4" />
                      View Thread ({selectedMessage.replyCount} replies)
                    </Button>
                  )}

                  {/* Label management */}
                  <div className="flex flex-wrap gap-2">
                    {labels.map(label => (
                      <Button
                        key={label.id}
                        variant={selectedMessage.labels?.includes(label.id) ? 'default' : 'outline'}
                        size="sm"
                        className={cn(
                          'text-xs',
                          selectedMessage.labels?.includes(label.id) && label.color
                        )}
                        onClick={() => handleAddLabel(selectedMessage.id, label.id)}
                      >
                        <Tag className="mr-1 h-3 w-3" />
                        {label.name}
                      </Button>
                    ))}
                  </div>

                  {/* AI Assistant */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAIAssist}
                        className="gap-2"
                      >
                        <Sparkles className="h-4 w-4 text-purple-500" />
                        AI Reply Assistant
                      </Button>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => actions.setShowTemplates(true)}
                        >
                          <Bookmark className="mr-1 h-4 w-4" />
                          Templates
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => actions.setShowQuickRepliesManager(true)}
                        >
                          <Zap className="mr-1 h-4 w-4" />
                          Quick Replies
                        </Button>
                      </div>
                    </div>

                    {/* Quick Replies */}
                    <div className="mb-3 flex flex-wrap gap-2">
                      {quickReplies.slice(0, 4).map(qr => (
                        <Button
                          key={qr.id}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => handleUseQuickReply(qr)}
                        >
                          {qr.title}
                        </Button>
                      ))}
                    </div>

                    {showAIReplies && (
                      <div className="mb-4 space-y-2">
                        <p className="text-xs text-gray-500">AI-suggested replies:</p>
                        {aiReplies.map(reply => (
                          <button
                            key={reply.id}
                            onClick={() => actions.setReplyText(reply.text)}
                            className="w-full rounded-lg border border-purple-200 bg-purple-50 p-3 text-left transition-colors hover:bg-purple-100"
                          >
                            <div className="mb-1 flex items-center gap-2">
                              <Bot className="h-3 w-3 text-purple-500" />
                              <span className="text-xs font-medium capitalize text-purple-700">
                                {reply.tone}
                              </span>
                            </div>
                            <p className="text-sm text-gray-800">{reply.text}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>

              {/* Reply Box */}
              <div className="space-y-3 border-t pt-4">
                {/* Attachments preview */}
                {composeAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {composeAttachments.map(att => (
                      <div
                        key={att.id}
                        className="flex items-center gap-1 rounded bg-gray-100 p-2 text-sm"
                      >
                        <span>{att.name}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={() => actions.removeComposeAttachment(att.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Voice recording indicator */}
                {isRecordingVoice && (
                  <div className="flex items-center gap-3 rounded-lg bg-red-50 p-3">
                    <div className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
                    <span className="text-red-700">Recording... {voiceRecordingDuration}s</span>
                    <Button size="sm" variant="destructive" onClick={handleVoiceRecord}>
                      <MicOff className="mr-1 h-4 w-4" />
                      Stop
                    </Button>
                  </div>
                )}

                {/* Scheduling indicator */}
                {isScheduling && scheduledDate && (
                  <div className="flex items-center gap-3 rounded-lg bg-yellow-50 p-3">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <span className="text-yellow-700">
                      Scheduled for: {format(scheduledDate, 'PPP')} at {scheduledTime}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        actions.setIsScheduling(false)
                        actions.setScheduledDate(undefined)
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                <Textarea
                  placeholder="Type your reply..."
                  value={replyText}
                  onChange={e => actions.setReplyText(e.target.value)}
                  className="min-h-[100px]"
                />
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <Button variant="ghost" size="icon">
                      <Smile className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleVoiceRecord}
                      className={cn(isRecordingVoice && 'text-red-500')}
                    >
                      <Mic className="h-4 w-4" />
                    </Button>
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <CalendarDays className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={scheduledDate}
                          onSelect={date => {
                            actions.setScheduledDate(date)
                            actions.setIsScheduling(true)
                            setCalendarOpen(false)
                          }}
                          disabled={date => isAfter(new Date(), date)}
                        />
                        {scheduledDate && (
                          <div className="border-t p-3">
                            <Label>Time</Label>
                            <Input
                              type="time"
                              value={scheduledTime}
                              onChange={e => actions.setScheduledTime(e.target.value)}
                              className="mt-1"
                            />
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Button
                    onClick={handleReply}
                    disabled={!replyText.trim() && composeAttachments.length === 0}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {isScheduling ? 'Schedule' : 'Send'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ============================================
          THREAD VIEW DIALOG
          ============================================ */}
      <Dialog open={showThread} onOpenChange={actions.setShowThread}>
        <DialogContent className="max-h-[90vh] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Message Thread
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[500px]">
            <div className="space-y-4 py-4">
              {threadMessages.map((msg, index) => (
                <div
                  key={msg.id}
                  className={cn('flex gap-3', msg.studentName === 'You' ? 'flex-row-reverse' : '')}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback
                      className={cn(
                        'text-xs',
                        msg.studentName === 'You'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      )}
                    >
                      {msg.studentName
                        .split(' ')
                        .map(n => n[0])
                        .join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      'max-w-[80%] rounded-lg p-3',
                      msg.studentName === 'You'
                        ? 'bg-green-100 text-green-900'
                        : 'bg-gray-100 text-gray-900'
                    )}
                  >
                    <p className="text-sm">{msg.content}</p>
                    <p className="mt-1 text-xs text-gray-500">{formatTime(msg.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* ============================================
          COMPOSE DIALOG
          ============================================ */}
      <Dialog open={showCompose} onOpenChange={actions.setShowCompose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
            <DialogDescription>Send a message to your students</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>To</Label>
              <Input
                placeholder="Search students..."
                value={composeTo}
                onChange={e => actions.setComposeTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                placeholder="Enter subject..."
                value={composeSubject}
                onChange={e => actions.setComposeSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <div className="flex gap-2">
                {(['low', 'normal', 'high'] as const).map(p => (
                  <Button
                    key={p}
                    variant={composePriority === p ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => actions.setComposePriority(p)}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Labels</Label>
              <div className="flex flex-wrap gap-2">
                {labels.map(label => (
                  <Button
                    key={label.id}
                    variant={selectedLabels.includes(label.id) ? 'default' : 'outline'}
                    size="sm"
                    className={cn('text-xs', selectedLabels.includes(label.id) && label.color)}
                    onClick={() => actions.toggleSelectedLabel(label.id)}
                  >
                    {label.name}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                placeholder="Type your message..."
                className="min-h-[150px]"
                value={composeMessage}
                onChange={e => actions.setComposeMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="modal-secondary" onClick={() => actions.setShowCompose(false)}>
              Cancel
            </Button>
            <Button
              variant="modal-primary"
              onClick={() => {
                toast.success('Message sent!')
                actions.setShowCompose(false)
                actions.resetComposeForm()
              }}
            >
              <Send className="mr-2 h-4 w-4" />
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================
          TEMPLATES DIALOG
          ============================================ */}
      <Dialog open={showTemplates} onOpenChange={actions.setShowTemplates}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Message Templates</DialogTitle>
            <DialogDescription>Quick insert saved responses</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[300px]">
            <div className="space-y-2 py-4">
              {templates.map(template => (
                <button
                  key={template.id}
                  onClick={() => handleUseTemplate(template)}
                  className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{template.title}</span>
                    <Badge variant="outline" className="text-xs capitalize">
                      {template.category}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-gray-500">{template.content}</p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* ============================================
          QUICK REPLIES MANAGER DIALOG
          ============================================ */}
      <Dialog open={showQuickRepliesManager} onOpenChange={actions.setShowQuickRepliesManager}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Quick Replies</DialogTitle>
            <DialogDescription>Manage your quick response shortcuts</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[300px]">
            <div className="space-y-2 py-4">
              {quickReplies.map(qr => (
                <div
                  key={qr.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <span className="font-medium">{qr.title}</span>
                    {qr.shortcut && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        {qr.shortcut}
                      </Badge>
                    )}
                    <p className="truncate text-sm text-gray-500">{qr.content}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        actions.setReplyText(qr.content)
                        actions.setShowQuickRepliesManager(false)
                      }}
                    >
                      Use
                    </Button>
                    <Button size="icon" variant="ghost" className="text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="modal-secondary" onClick={() => actions.setShowQuickRepliesManager(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================
          ANNOUNCEMENT DIALOG
          ============================================ */}
      <Dialog open={showAnnouncement} onOpenChange={actions.setShowAnnouncement}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              Broadcast Announcement
            </DialogTitle>
            <DialogDescription>
              Send an announcement to all students or specific courses
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Recipients</Label>
              <select className="w-full rounded-lg border px-3 py-2">
                <option>All Students</option>
                <option>Advanced Mathematics</option>
                <option>Physics 101</option>
                <option>English Literature</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input placeholder="Announcement title..." />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea placeholder="Your announcement..." className="min-h-[150px]" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="schedule" className="rounded" />
              <Label htmlFor="schedule" className="cursor-pointer text-sm">
                Schedule for later
              </Label>
            </div>
          </div>
          <DialogFooter className="gap-3">
            <Button variant="modal-secondary" onClick={() => actions.setShowAnnouncement(false)}>
              Cancel
            </Button>
            <Button variant="modal-primary" onClick={() => {
              toast.success('Announcement broadcasted!')
              actions.setShowAnnouncement(false)
            }}>
              <Megaphone className="mr-2 h-4 w-4" />
              Broadcast
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================
          ANALYTICS DIALOG
          ============================================ */}
      <Dialog open={showAnalytics} onOpenChange={actions.setShowAnalytics}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Communication Analytics
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4 md:grid-cols-4">
            <div className="rounded-lg bg-blue-50 p-4 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-gray-600">Total Messages</p>
            </div>
            <div className="rounded-lg bg-red-50 p-4 text-center">
              <p className="text-2xl font-bold">{stats.unread}</p>
              <p className="text-sm text-gray-600">Unread</p>
            </div>
            <div className="rounded-lg bg-yellow-50 p-4 text-center">
              <p className="text-2xl font-bold">{stats.unreadHighPriority}</p>
              <p className="text-sm text-gray-600">High Priority</p>
            </div>
            <div className="rounded-lg bg-green-50 p-4 text-center">
              <p className="text-2xl font-bold">{stats.responseTime}</p>
              <p className="text-sm text-gray-600">Avg Response</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <h4 className="mb-2 font-medium">Message Distribution</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-20 text-sm">Today</span>
                  <div className="h-4 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${(stats.todayMessages / stats.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm">{stats.todayMessages}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 text-sm">With Files</span>
                  <div className="h-4 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-purple-500"
                      style={{ width: `${(stats.withAttachments / stats.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm">{stats.withAttachments}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 text-sm">Scheduled</span>
                  <div className="h-4 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-yellow-500"
                      style={{ width: `${(stats.scheduled / stats.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm">{stats.scheduled}</span>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
