'use client'

/**
 * TaskDocumentCard — the task document (PDF/image) shown inside the chat-based
 * task flow. It renders full while the chat is empty, then collapses into a
 * pinned, re-expandable "document" card once the student has started chatting,
 * so the whole panel reads as one conversation.
 *
 * Shared by the student Classroom (TaskChatPanel) and the tutor Test-tab
 * preview (TestTaskChat) so the tutor previews exactly what students see.
 */

import { useState } from 'react'
import { FileText, ChevronDown, ChevronRight } from 'lucide-react'
import { PDFViewer } from '@/components/pdf/PDFViewer'
import { cn } from '@/lib/utils'

export interface TaskDocumentSource {
  fileName?: string | null
  fileUrl?: string | null
  fileKey?: string | null
  mimeType?: string | null
}

const ACCENTS = {
  orange: { border: 'border-orange-100', hover: 'hover:bg-orange-50/50', icon: 'text-[#F17623]' },
  violet: { border: 'border-violet-100', hover: 'hover:bg-violet-50/50', icon: 'text-violet-600' },
} as const

export function TaskDocumentCard({
  sourceDocument,
  /** Default open state before the viewer is manually toggled (typically
   *  `!hasSentMessage`): full while the chat is empty, collapsed after. */
  autoOpen,
  accent = 'orange',
}: {
  sourceDocument?: TaskDocumentSource | null
  autoOpen: boolean
  accent?: keyof typeof ACCENTS
}) {
  // Manual toggle overrides the auto (message-driven) state. Deriving the shown
  // state instead of syncing it via an effect keeps it flicker-free.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)

  const rawUrl = sourceDocument?.fileUrl || ''
  const url = sourceDocument?.fileKey
    ? `/api/proxy-file?key=${encodeURIComponent(sourceDocument.fileKey)}`
    : rawUrl
  const loadable = !!sourceDocument?.fileKey || (!!rawUrl && !rawUrl.startsWith('blob:'))
  if (!sourceDocument || !loadable) return null

  const name = sourceDocument.fileName || 'Task document'
  const isPdf =
    sourceDocument.mimeType === 'application/pdf' ||
    (!sourceDocument.mimeType && /\.pdf($|\?|#)/i.test(sourceDocument.fileName || rawUrl))
  const isImage = !!sourceDocument.mimeType?.startsWith('image/')
  const styles = ACCENTS[accent]
  const open = manualOpen ?? autoOpen

  return (
    <div className={cn('shrink-0 border-b bg-white', styles.border)}>
      <button
        type="button"
        onClick={() => setManualOpen(!open)}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-2 px-4 py-2 text-left transition-colors',
          styles.hover
        )}
      >
        <FileText className={cn('h-4 w-4 shrink-0', styles.icon)} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{name}</span>
        <span className="text-xs text-gray-500">{open ? 'Hide' : 'Click to view'}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
        )}
      </button>
      {open && (
        <div className={cn('h-[42vh] max-h-[560px] min-h-[220px] w-full border-t', styles.border)}>
          {isPdf ? (
            <PDFViewer fileUrl={url} className="h-full w-full" />
          ) : isImage ? (
            <div className="flex h-full items-center justify-center bg-slate-50 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <FileText className="h-8 w-8 text-blue-600" />
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-blue-600 underline"
              >
                Open document
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
