'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { resolvePublicUrl } from '@/lib/utils'
import { FileText, ImageIcon } from 'lucide-react'
import { PDFThumbnail } from '@/components/pdf/PDFThumbnail'
import { resolveDocDisplayUrl, isDocDisplayable } from '@/lib/storage/doc-url'
import { cn } from '@/lib/utils'

export type ChatMessageSender = 'tutor' | 'ai' | 'student'

export interface ChatMessageBubbleProps {
  sender: ChatMessageSender
  name: string
  content: string
  avatarUrl?: string | null
  timestamp?: Date | string
  isDocument?: boolean
  document?: {
    fileName?: string | null
    fileUrl?: string | null
    fileKey?: string | null
    mimeType?: string | null
  } | null
  onDocumentClick?: () => void
  re?: string
  isClassroom?: boolean
  /** When true, student messages appear on the right (tutor/AI on left). */
  studentOnRight?: boolean
}

export function ChatMessageBubble({
  sender,
  name,
  content,
  avatarUrl,
  timestamp,
  isDocument,
  document,
  onDocumentClick,
  re,
  isClassroom = false,
  studentOnRight = false,
}: ChatMessageBubbleProps) {
  // When studentOnRight is true, student messages are on the right (tutor/AI on left).
  // Otherwise the legacy behavior: tutor/AI on right, student on left.
  const isRight = studentOnRight ? sender === 'student' : sender === 'tutor' || sender === 'ai'
  const isStudent = sender === 'student'
  const showAvatar = !!avatarUrl || !!name

  const resolvedAvatar = resolvePublicUrl(avatarUrl)
  const initial = name.charAt(0).toUpperCase()

  // Document card rendering — wrapped in the same avatar+bubble layout as messages
  const documentCard = (() => {
    if (!isDocument || !document) return null
    const rawUrl = document.fileUrl || ''
    // Durable same-origin URL (streams by key, no expiry). See resolveDocDisplayUrl.
    const docUrl = resolveDocDisplayUrl(document)
    const loadable = isDocDisplayable(document)
    const docName = document.fileName || 'Task document'
    const isPdf =
      document.mimeType === 'application/pdf' ||
      (!document.mimeType && /\.pdf($|\?|#)/i.test(document.fileName || rawUrl))
    const isImage = !!document.mimeType?.startsWith('image/')

    return (
      <button
        type="button"
        onClick={() => loadable && onDocumentClick?.()}
        disabled={!loadable}
        className={cn(
          'max-w-[85%] cursor-pointer rounded-xl border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          isClassroom
            ? 'border-orange-200 bg-orange-50/50 hover:border-orange-300 hover:bg-orange-50'
            : 'border-violet-200 bg-violet-50/50 hover:border-violet-300 hover:bg-violet-50'
        )}
      >
        <div className="flex items-center gap-3">
          {isPdf && loadable ? (
            <div className="shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
              <PDFThumbnail fileUrl={docUrl} fileKey={document.fileKey ?? undefined} width={100} />
            </div>
          ) : isImage ? (
            <div className="flex h-[70px] w-[100px] shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-100">
              <ImageIcon className="h-5 w-5 text-gray-400" />
            </div>
          ) : (
            <div className="flex h-[70px] w-[100px] shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-100">
              <FileText className="h-5 w-5 text-gray-400" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-800">{docName}</p>
            <p className="text-xs text-gray-500">
              {loadable ? 'Click to view document' : 'This document is unavailable. Re-upload it.'}
            </p>
          </div>
        </div>
      </button>
    )
  })()

  return (
    <div className={cn('flex gap-2', isRight ? 'flex-row justify-end' : 'flex-row justify-start')}>
      {/* Avatar */}
      {showAvatar && (
        <div className="flex flex-col items-center gap-1">
          <Avatar className="h-10 w-10 shrink-0 overflow-hidden">
            {resolvedAvatar && <AvatarImage src={resolvedAvatar} alt={name} />}
            <AvatarFallback
              className={cn(
                'text-xs font-medium',
                isStudent
                  ? 'border border-slate-200 bg-white text-slate-600'
                  : isClassroom
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-violet-100 text-violet-700'
              )}
            >
              {initial}
            </AvatarFallback>
          </Avatar>
          {sender === 'ai' && <span className="text-[9px] font-medium text-gray-400">AI</span>}
        </div>
      )}

      {/* Bubble + metadata */}
      <div className={cn('flex max-w-[80%] flex-col', isRight ? 'items-end' : 'items-start')}>
        {/* Name label */}
        <span
          className={cn(
            'mb-0.5 text-[10px] font-medium text-gray-400',
            isRight ? 'text-right' : 'text-left'
          )}
        >
          {name}
        </span>

        {/* Re: reference */}
        {re && (
          <span className="mb-0.5 max-w-full truncate rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
            Re: {re}
          </span>
        )}

        {/* Message bubble or document card */}
        {documentCard ? (
          documentCard
        ) : (
          <div
            className={cn(
              'whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
              isStudent
                ? 'rounded-tl-sm border border-slate-200 bg-white text-slate-800 shadow-sm'
                : isClassroom
                  ? 'rounded-br-sm bg-[#F17623] text-white'
                  : 'rounded-br-sm bg-violet-600 text-white'
            )}
          >
            {content}
          </div>
        )}

        {/* Timestamp */}
        {timestamp && (
          <span className="mt-0.5 text-[10px] text-gray-400">
            {typeof timestamp === 'string'
              ? timestamp
              : timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  )
}
