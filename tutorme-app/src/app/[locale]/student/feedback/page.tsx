'use client'

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  Suspense,
  Fragment,
  type ComponentProps,
} from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DrawingPad } from '@/components/answer/DrawingPad'
import { MathText } from '@/components/answer/MathText'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSocket } from '@/hooks/use-socket'
import { toast } from 'sonner'
import { cn, resolvePublicUrl } from '@/lib/utils'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import {
  MessageSquare,
  Send,
  Bell,
  Loader2,
  NotebookPen,
  Layout,
  ArrowLeft,
  LogOut,
  FileText,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Folder,
  Video,
  Plus,
  Minus,
  Presentation,
  Pencil,
  Lock,
  Flag,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { EnhancedWhiteboard } from '@/components/class/enhanced-whiteboard'
import { motion, AnimatePresence, useDragControls } from 'framer-motion'
import { useVideoOverlayStore } from '@/stores/video-overlay-store'
import type {
  LiveTask,
  LiveTaskPoll,
  LiveTaskQuestion,
  LiveTaskDmiItem,
  ChatMessage,
} from '@/lib/socket'
import { normalizeDmiQuestionType, DMI_QUESTION_TYPE_LABELS } from '@/lib/assessment/question-types'
import { TaskAiHelper } from './TaskAiHelper'
import {
  TestTaskChat,
  type TestTaskChatState,
  type TestTaskChatMsg,
} from '@/app/[locale]/tutor/dashboard/components/TestTaskChat'
import { TaskDocumentCard } from '@/components/task/TaskDocumentCard'

/** Group deployed task directory items into base tasks and their extensions. */
interface GroupableTask {
  id: string
  itemId?: string
  title: string
  parentId?: string | null
  isExtension?: boolean
}
function groupTasksByParent(tasks: GroupableTask[]) {
  const baseTasks: GroupableTask[] = []
  const extMap = new Map<string, GroupableTask[]>()
  for (const t of tasks) {
    if (t.parentId && t.isExtension) {
      const arr = extMap.get(t.parentId) || []
      arr.push(t)
      extMap.set(t.parentId, arr)
    } else {
      baseTasks.push(t)
    }
  }
  return { baseTasks, extMap }
}

type WhiteboardPages = NonNullable<ComponentProps<typeof EnhancedWhiteboard>['pages']>
type WhiteboardPage = WhiteboardPages[number]

const createDefaultWhiteboardPages = (): WhiteboardPages => [
  {
    id: 'page-1',
    name: 'Page 1',
    strokes: [],
    texts: [],
    shapes: [],
    formulas: [],
    graphs: [],
    backgroundColor: '#ffffff',
    backgroundStyle: 'solid',
  },
]

function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase()
  return '#' + '00000'.substring(0, 6 - c.length) + c
}

interface SessionSummary {
  id: string
  title: string
  subject: string
  scheduledAt: string
  status: string
}

function WifiSignal({ connected, error }: { connected: boolean; error: boolean }) {
  const color = error ? 'text-red-500' : connected ? 'text-emerald-500' : 'text-amber-400'

  return (
    <div className="relative flex items-center justify-center">
      <style jsx>{`
        @keyframes wifi-bar {
          0%,
          100% {
            opacity: 0.25;
          }
          50% {
            opacity: 1;
          }
        }
        .wifi-bar {
          animation: wifi-bar 1.2s ease-in-out infinite;
        }
        .wifi-bar-1 {
          animation-delay: 0s;
        }
        .wifi-bar-2 {
          animation-delay: 0.3s;
        }
        .wifi-bar-3 {
          animation-delay: 0.6s;
        }
        .wifi-dot {
          animation-delay: 0.9s;
        }
      `}</style>
      <svg
        className={cn('h-4 w-4', color)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1.5 8.5a15 15 0 0 1 21 0" className="wifi-bar wifi-bar-3" />
        <path d="M5 12.5a11 11 0 0 1 14 0" className="wifi-bar wifi-bar-2" />
        <path d="M8.5 16.5a7 7 0 0 1 7 0" className="wifi-bar wifi-bar-1" />
        <path d="M12 20h.01" className="wifi-bar wifi-dot" />
      </svg>
    </div>
  )
}

interface ClassroomControlsPanelProps {
  followTutor: boolean
  setFollowTutor: (value: boolean) => void
  isConnected: boolean
  error: string | Error | null
  roomUrl: string | null | undefined
  token: string | null | undefined
  twoWay?: boolean
  openVideoOverlay: (opts: {
    roomUrl: string
    token?: string | null
    autoRecord: boolean
    twoWay?: boolean
  }) => void
  setShowDirectoryPanel: (value: boolean) => void
}

function ClassroomControlsPanel({
  followTutor,
  setFollowTutor,
  isConnected,
  error,
  roomUrl,
  token,
  twoWay,
  openVideoOverlay,
  setShowDirectoryPanel,
}: ClassroomControlsPanelProps) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const dragControls = useDragControls()

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div className="pointer-events-none absolute bottom-4 right-4">
        <motion.div
          drag
          dragControls={dragControls}
          dragListener={false}
          dragMomentum={false}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={() => setTimeout(() => setIsDragging(false), 50)}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            'pointer-events-auto relative w-96 cursor-default select-none overflow-hidden rounded-2xl border border-white/10 bg-[rgba(31,41,51,0.60)] shadow-2xl backdrop-blur-xl',
            open ? 'p-3' : ''
          )}
        >
          {/* Header / drag handle */}
          <button
            type="button"
            className={cn(
              'relative flex w-full cursor-grab items-center active:cursor-grabbing',
              open ? 'h-8 rounded-t-xl border-b border-white/10 px-2' : 'h-10 px-3'
            )}
            onPointerDown={e => dragControls.start(e)}
            onClick={() => {
              if (isDragging) return
              setOpen(v => !v)
            }}
          >
            <span className="w-4 shrink-0" aria-hidden="true" />
            <span className="mx-auto text-xs font-semibold text-white">Controls</span>
            <WifiSignal connected={isConnected} error={!!error} />
          </button>

          {/* Controls */}
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                key="controls-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setFollowTutor(!followTutor)}
                      className={cn(
                        'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors',
                        followTutor
                          ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                          : 'bg-white/10 text-white hover:bg-white/20'
                      )}
                    >
                      <div
                        className={cn(
                          'h-2 w-2 rounded-full',
                          followTutor ? 'animate-pulse bg-white' : 'bg-white/40'
                        )}
                      />
                      {followTutor ? 'Following Tutor' : 'Follow Tutor'}
                    </button>

                    <div className="flex h-9 items-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white">
                      <div
                        className={cn(
                          'h-2 w-2 rounded-full',
                          isConnected ? 'bg-emerald-500' : error ? 'bg-red-500' : 'bg-amber-400'
                        )}
                      />
                      {isConnected ? 'Connected' : error ? 'Disconnected' : 'Connecting'}
                    </div>

                    <button
                      type="button"
                      disabled={!roomUrl}
                      onClick={() => {
                        if (!roomUrl) return
                        openVideoOverlay({ roomUrl, token, autoRecord: false, twoWay })
                      }}
                      className="flex h-9 w-full items-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Video className="h-4 w-4" />
                      Video
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowDirectoryPanel(true)}
                      className="flex h-9 w-full items-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/20"
                    >
                      <Folder className="h-4 w-4" />
                      Directory
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => router.push('/student/dashboard')}
                      className="flex h-9 w-full items-center gap-2 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/20"
                    >
                      <LogOut className="h-4 w-4" />
                      Leave session
                    </button>

                    <button
                      type="button"
                      className="flex h-9 w-full items-center gap-2 rounded-lg bg-red-500/20 px-3 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/30"
                    >
                      <Flag className="h-4 w-4" />
                      Flag
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}

/**
 * Renders the answer input for a single DMI item according to its questionType.
 * Answers are stored as plain strings in `taskAnswers` (choice/matching/ordering/
 * drag_drop/hotspot store JSON). hotspot falls back to free-text when its item
 * has no image; long answer is always free-text.
 */
/**
 * Split a stored answer into its three independent parts. Backward compatible:
 * - plain text                       -> { text, converted: '', drawing: '' }
 * - a bare PNG data URL              -> { drawing }            (legacy drawn-only)
 * - {"text","converted","drawing"}   -> typed + converted-handwriting + drawing
 */
function parseWrittenAnswer(value: string): { text: string; converted: string; drawing: string } {
  if (!value) return { text: '', converted: '', drawing: '' }
  if (value.startsWith('data:image')) return { text: '', converted: '', drawing: value }
  if (value.startsWith('{')) {
    try {
      const o = JSON.parse(value) as { text?: unknown; converted?: unknown; drawing?: unknown }
      if (
        o &&
        (typeof o.text === 'string' ||
          typeof o.drawing === 'string' ||
          typeof o.converted === 'string')
      ) {
        return {
          text: String(o.text ?? ''),
          converted: String(o.converted ?? ''),
          drawing: String(o.drawing ?? ''),
        }
      }
    } catch {
      // not JSON — treat as plain text below
    }
  }
  return { text: value, converted: '', drawing: '' }
}

/** Pure typed text stays a plain string (so it auto-grades); anything from the
 *  handwriting (converted text / drawing) makes it JSON. */
function serializeWrittenAnswer(text: string, converted: string, drawing: string): string {
  if (converted || drawing) return JSON.stringify({ text, converted, drawing })
  return text
}

/**
 * A free-response answer. The keyboard box is for TYPED text only. Separately,
 * the student can hand-write on the drawing pad and press "Convert handwriting →
 * text": the transcription goes to the PREVIEW (rendered), never the keyboard
 * box. The two are independent.
 */
function WrittenAnswer({
  value,
  onValueChange,
  onInteract,
  multiline,
  placeholder,
  baseField,
}: {
  value: string
  onValueChange: (next: string) => void
  onInteract: () => void
  multiline: boolean
  placeholder: string
  baseField: string
}) {
  const { text, converted, drawing } = parseWrittenAnswer(value)
  const [showDraw, setShowDraw] = useState(!!drawing || !!converted)
  const [converting, setConverting] = useState(false)
  const update = (nextText: string, nextConverted: string, nextDrawing: string) => {
    onInteract()
    onValueChange(serializeWrittenAnswer(nextText, nextConverted, nextDrawing))
  }

  // Convert the handwriting → text/LaTeX and put it in the PREVIEW (the
  // `converted` field). The keyboard text box is never touched. Convert always
  // transcribes the WHOLE current drawing and REPLACES the preview, so erasing
  // part of the handwriting and re-converting shrinks the result instead of
  // duplicating it (an incremental append could never un-say erased strokes).
  const convertHandwriting = async () => {
    if (!drawing || converting) return
    setConverting(true)
    try {
      const res = await fetch('/api/ai/handwriting-to-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ image: drawing }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Could not read the handwriting. Try writing more clearly.')
        return
      }
      const newText = String(data?.text ?? '').trim()
      if (!newText) {
        toast.info('No handwriting to convert.')
        return
      }
      update(text, newText, drawing)
      toast.success('Handwriting converted — see the preview below.')
    } catch {
      toast.error('Failed to convert handwriting')
    } finally {
      setConverting(false)
    }
  }

  return (
    <div className="space-y-1.5">
      {/* Keyboard input — TYPED text only. Never receives handwriting. */}
      <textarea
        value={text}
        onFocus={onInteract}
        onChange={e => update(e.target.value, converted, drawing)}
        placeholder={placeholder}
        rows={multiline ? 4 : 2}
        className={`${multiline ? 'min-h-[96px]' : 'min-h-[56px]'} resize-y ${baseField}`}
      />

      {/* Preview — the converted handwriting, rendered (math via LaTeX). */}
      {converted && (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              Converted handwriting · preview
            </span>
            <button
              type="button"
              onClick={() => update(text, '', drawing)}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
          <MathText text={converted} className="text-sm text-gray-900" />
        </div>
      )}

      {showDraw ? (
        <div className="space-y-1.5">
          <DrawingPad
            value={drawing || undefined}
            onChange={d => update(text, converted, d)}
            onInteract={onInteract}
          />
          {drawing && (
            <button
              type="button"
              onClick={convertHandwriting}
              disabled={converting}
              className="inline-flex items-center gap-1 rounded-full border border-[#F17623] bg-[#FFF4EC] px-3 py-1 text-xs font-semibold text-[#9a4a12] transition-colors hover:bg-[#ffe9d8] disabled:opacity-60"
            >
              {converting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {converting ? 'Converting…' : 'Convert handwriting → text'}
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowDraw(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#F17623] bg-[#FFF4EC] px-3 py-1 text-xs font-semibold text-[#9a4a12] transition-colors hover:bg-[#ffe9d8]"
        >
          {/* Paper-and-pen icon signals this is for handwriting, not just drawing. */}
          <NotebookPen className="h-3.5 w-3.5" />
          Write or draw
        </button>
      )}
    </div>
  )
}

function DmiAnswerField({
  item,
  value,
  onValueChange,
  onInteract,
}: {
  item: LiveTaskDmiItem
  value: string
  onValueChange: (next: string) => void
  onInteract: () => void
}) {
  const type = normalizeDmiQuestionType(item.questionType)
  const options =
    item.options && item.options.length > 0
      ? item.options
      : type === 'true_false'
        ? ['True', 'False']
        : []
  const baseField =
    'w-full rounded-md border border-gray-200 bg-white p-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#F17623] focus:outline-none'
  // Tap-to-place selection for drag_drop (touch fallback for native drag).
  const [dragSelected, setDragSelected] = useState<string | null>(null)

  // Multiple choice — clickable LETTER chips (a–e). The full option text is read
  // on the Classroom side; the student just selects the letter, which is stored.
  if (type === 'mcq' && options.length > 0) {
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((_opt, i) => {
          const letter = String.fromCharCode(65 + i) // A, B, C, …
          const selected = value === letter
          return (
            <button
              key={letter}
              type="button"
              onClick={() => {
                onInteract()
                onValueChange(letter)
              }}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                selected
                  ? 'border-[#F17623] bg-[#F17623] text-white'
                  : 'border-gray-300 text-gray-700 hover:border-[#F17623] hover:text-[#F17623]'
              )}
            >
              {letter}
            </button>
          )
        })}
      </div>
    )
  }

  // True / False — radios.
  if (type === 'true_false' && options.length > 0) {
    return (
      <div className="space-y-1.5">
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-2 text-sm text-gray-800">
            <input
              type="radio"
              name={`dmi-${item.id}`}
              checked={value === opt}
              onChange={() => {
                onInteract()
                onValueChange(opt)
              }}
              className="h-4 w-4 accent-[#F17623]"
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    )
  }

  // Multi-select choice — checkboxes; answer stored as a JSON array string.
  if (type === 'multiple_response' && options.length > 0) {
    let selected: string[] = []
    try {
      const parsed = value ? JSON.parse(value) : []
      if (Array.isArray(parsed)) selected = parsed.filter((v): v is string => typeof v === 'string')
    } catch {
      selected = []
    }
    const toggle = (opt: string) => {
      onInteract()
      const next = selected.includes(opt) ? selected.filter(o => o !== opt) : [...selected, opt]
      onValueChange(JSON.stringify(next))
    }
    return (
      <div className="space-y-1.5">
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
              className="h-4 w-4 accent-[#F17623]"
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    )
  }

  // Short answer & fill-in-the-blank — single-line input. Choice types with no
  // options provided fall back here so the student is never stuck.
  // Short / fill-in answers — type OR draw (maths working, symbols, diagrams).
  if (type === 'short' || type === 'fill_blank') {
    return (
      <WrittenAnswer
        value={value}
        onValueChange={onValueChange}
        onInteract={onInteract}
        multiline={false}
        placeholder={type === 'fill_blank' ? 'Fill in the blank…' : 'Type your answer…'}
        baseField={baseField}
      />
    )
  }

  // mcq / multiple_response that arrived without options → plain text input.
  if (type === 'mcq' || type === 'multiple_response') {
    return (
      <input
        type="text"
        value={value}
        onFocus={onInteract}
        onChange={e => {
          onInteract()
          onValueChange(e.target.value)
        }}
        placeholder="Type your answer…"
        className={baseField}
      />
    )
  }

  // Hotspot — the student clicks a point on an image. The answer is stored as a
  // JSON point { x, y } in 0–1 image fractions; the correct regions are the
  // tutor-facing answer key and are never drawn here. Falls back to free-text
  // when no image is available.
  if (type === 'hotspot') {
    const imageUrl = resolvePublicUrl(item.hotspotImageUrl)
    if (imageUrl) {
      let point: { x: number; y: number } | null = null
      try {
        const parsed = value ? JSON.parse(value) : null
        if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') point = parsed
      } catch {
        point = null
      }
      const onPick = (e: React.MouseEvent<HTMLImageElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        if (!rect.width || !rect.height) return
        const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
        onInteract()
        onValueChange(JSON.stringify({ x, y }))
      }
      return (
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Click the correct spot on the image.</p>
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Hotspot"
              onClick={onPick}
              className="max-h-[320px] max-w-full cursor-crosshair rounded-md border border-gray-200"
            />
            {point && (
              <span
                className="pointer-events-none absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#F17623] shadow"
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
              />
            )}
          </div>
        </div>
      )
    }
  }

  // Drag and drop — draggable item chips placed into target bins. Reuses pairs
  // (left = item, right = correct target). Supports native HTML5 drag AND a
  // tap-to-place fallback (select an item, then tap a bin) for touch devices.
  // Answer is stored as a JSON map of item -> chosen target.
  if (type === 'drag_drop' && item.matchPrompts && item.matchPrompts.length > 0) {
    const dndItems = item.matchPrompts
    const targets = item.matchBank ?? []
    let placement: Record<string, string> = {}
    try {
      const parsed = value ? JSON.parse(value) : {}
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) placement = parsed
    } catch {
      placement = {}
    }
    const place = (it: string, target: string) => {
      onInteract()
      setDragSelected(null)
      onValueChange(JSON.stringify({ ...placement, [it]: target }))
    }
    const unplace = (it: string) => {
      onInteract()
      const next = { ...placement }
      delete next[it]
      onValueChange(JSON.stringify(next))
    }
    const unplaced = dndItems.filter(it => !placement[it])
    const chip =
      'rounded-md border px-2 py-1 text-xs transition-colors cursor-grab active:cursor-grabbing'
    return (
      <div className="space-y-3">
        {/* Source tray */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            const it = e.dataTransfer.getData('text/plain')
            if (it) unplace(it)
          }}
          className="flex min-h-[40px] flex-wrap gap-2 rounded-md border border-dashed border-gray-300 p-2"
        >
          {unplaced.length === 0 ? (
            <span className="text-xs text-gray-400">All items placed</span>
          ) : (
            unplaced.map(it => (
              <button
                key={it}
                type="button"
                draggable
                onDragStart={e => e.dataTransfer.setData('text/plain', it)}
                onClick={() => setDragSelected(prev => (prev === it ? null : it))}
                className={cn(
                  chip,
                  dragSelected === it
                    ? 'border-[#F17623] bg-[#F17623]/10 text-[#9a4a12]'
                    : 'border-gray-200 bg-gray-50 text-gray-700'
                )}
              >
                {it}
              </button>
            ))
          )}
        </div>
        {/* Target bins */}
        <div className="grid grid-cols-2 gap-2">
          {targets.map(t => (
            <div
              key={t}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                const it = e.dataTransfer.getData('text/plain')
                if (it) place(it, t)
              }}
              onClick={() => {
                if (dragSelected) place(dragSelected, t)
              }}
              className={cn(
                'min-h-[56px] rounded-md border p-2',
                dragSelected
                  ? 'cursor-pointer border-[#F17623]/50 bg-[#F17623]/5'
                  : 'border-gray-200'
              )}
            >
              <p className="mb-1 text-[11px] font-semibold text-gray-500">{t}</p>
              <div className="flex flex-wrap gap-1.5">
                {dndItems
                  .filter(it => placement[it] === t)
                  .map(it => (
                    <button
                      key={it}
                      type="button"
                      draggable
                      onDragStart={e => e.dataTransfer.setData('text/plain', it)}
                      onClick={e => {
                        e.stopPropagation()
                        unplace(it)
                      }}
                      className={cn(chip, 'border-[#F17623]/40 bg-[#F17623]/10 text-[#9a4a12]')}
                      title="Remove"
                    >
                      {it} ✕
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Matching — show each left prompt with a dropdown of the (sorted) right
  // values. The answer is stored as a JSON map of left -> chosen right.
  if (type === 'matching' && item.matchPrompts && item.matchPrompts.length > 0) {
    const prompts = item.matchPrompts
    const rightBank = (item.matchBank ?? []).slice().sort((a, b) => a.localeCompare(b))
    let answerMap: Record<string, string> = {}
    try {
      const parsed = value ? JSON.parse(value) : {}
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) answerMap = parsed
    } catch {
      answerMap = {}
    }
    const setMatch = (left: string, right: string) => {
      onInteract()
      onValueChange(JSON.stringify({ ...answerMap, [left]: right }))
    }
    return (
      <div className="space-y-2">
        {prompts.map(left => (
          <div key={left} className="flex items-center gap-2 text-sm">
            <span className="flex-1 text-gray-800">{left}</span>
            <span className="shrink-0 text-gray-300">→</span>
            <select
              value={answerMap[left] ?? ''}
              onFocus={onInteract}
              onChange={e => setMatch(left, e.target.value)}
              className={`w-44 shrink-0 ${baseField}`}
            >
              <option value="">Choose…</option>
              {rightBank.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    )
  }

  // Ordering / ranking — reorder the provided items with up/down controls.
  // The answer is stored as a JSON array of the items in the chosen order.
  if (type === 'ordering' && options.length > 0) {
    let saved: string[] = []
    try {
      const parsed = value ? JSON.parse(value) : []
      if (Array.isArray(parsed)) saved = parsed.filter((v): v is string => typeof v === 'string')
    } catch {
      saved = []
    }
    // Start from any saved order, then append any options not yet placed so the
    // list always shows every item exactly once even if options changed.
    const current = saved.filter(o => options.includes(o))
    for (const o of options) if (!current.includes(o)) current.push(o)
    const move = (i: number, dir: -1 | 1) => {
      const j = i + dir
      if (j < 0 || j >= current.length) return
      onInteract()
      const next = [...current]
      ;[next[i], next[j]] = [next[j], next[i]]
      onValueChange(JSON.stringify(next))
    }
    return (
      <ol className="space-y-1.5">
        {current.map((opt, i) => (
          <li
            key={opt}
            className="flex items-center gap-2 rounded-md border border-gray-200 p-2 text-sm text-gray-800"
          >
            <span className="w-5 shrink-0 text-center text-xs font-semibold text-gray-400">
              {i + 1}
            </span>
            <span className="flex-1">{opt}</span>
            <button
              type="button"
              aria-label="Move up"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Move down"
              onClick={() => move(i, 1)}
              disabled={i === current.length - 1}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ol>
    )
  }

  // Long answer + hotspot (still needs image+regions) and any interactive type
  // that arrives without its data → free-response (type OR draw).
  return (
    <WrittenAnswer
      value={value}
      onValueChange={onValueChange}
      onInteract={onInteract}
      multiline
      placeholder="Type your answer…"
      baseField={baseField}
    />
  )
}

export default function StudentFeedbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <StudentFeedbackContent />
    </Suspense>
  )
}

function StudentFeedbackContent() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionIdFromQuery = searchParams.get('sessionId')

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(sessionIdFromQuery)
  const [tasks, setTasks] = useState<LiveTask[]>([])
  const [liveHomework, setLiveHomework] = useState<LiveTask[]>([])
  const [selectedDirectoryItem, setSelectedDirectoryItem] = useState<LiveTask | null>(null)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  // Per-question answers the student types in the task viewer, keyed by DMI item id.
  const [taskAnswers, setTaskAnswers] = useState<Record<string, string>>({})
  const [requestingSessionId, setRequestingSessionId] = useState<string | null>(null)
  const [showDirectoryPanel, setShowDirectoryPanel] = useState(false)
  const [activeTab, setActiveTab] = useState<'task' | 'tutor-board'>('task')
  const [rightPanelTab, setRightPanelTab] = useState<
    'lessons' | 'dmi' | 'interactions' | 'my-board'
  >('interactions')
  const [unseenTaskIds, setUnseenTaskIds] = useState<string[]>([])
  const [unseenHomeworkIds, setUnseenHomeworkIds] = useState<string[]>([])
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>({})
  const [chatInput, setChatInput] = useState('')
  const [viewerZoom, setViewerZoom] = useState(1)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  // Restored state + tutor messages for the live chat-task flow (mirrors Test mode).
  const [taskChatInitial, setTaskChatInitial] = useState<TestTaskChatState | undefined>(undefined)

  // Clear restored chat state synchronously when the active task changes so the
  // TestTaskChat component remounts with a blank slate while the new task's
  // prior submission is being fetched. Without this, the previous task's messages
  // can survive into the newly deployed task because TestTaskChat only uses its
  // initialState prop on first mount.
  useLayoutEffect(() => {
    setTaskChatInitial(undefined)
  }, [activeTaskId])
  const [taskChatIncoming, setTaskChatIncoming] = useState<TestTaskChatMsg[]>([])
  const [sessionContext, setSessionContext] = useState<{
    topic: string | null
    objectives: string[] | null
    roomUrl: string | null
    token: string | null
    twoWay: boolean
    tutorId: string | null
    tutorUsername: string
    courseCategory: string
    courseId: string | null
    courseName: string | null
    variantName: string | null
    scheduleName: string | null
    status: string | null
    startedAt: string | null
    scheduledAt: string | null
    endedAt: string | null
  } | null>(null)
  const [sessionTimer, setSessionTimer] = useState<string>('')
  const [myBoardPages, setMyBoardPages] = useState<WhiteboardPage[]>(createDefaultWhiteboardPages)
  const [myBoardPageIndex, setMyBoardPageIndex] = useState(0)
  const [tutorBoardPages, setTutorBoardPages] = useState<WhiteboardPage[]>(
    createDefaultWhiteboardPages
  )
  const [tutorBoardPageIndex, setTutorBoardPageIndex] = useState(0)
  const saveBoardsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boardSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Right Panel state
  const [rightPanelWidth, setRightPanelWidth] = useState(380)
  const [rightPanelResizing, setRightPanelResizing] = useState(false)
  const rightResizeStartX = useRef(0)
  const rightResizeStartW = useRef(380)

  // The right panel keeps a consistent base width across tabs; students can drag
  // the resize handle to adjust it for convenience.
  const EXPANDED_PANEL_BONUS = 300

  // Assets state
  const [selectedReport, setSelectedReport] = useState<any | null>(null)
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [courseAssets, setCourseAssets] = useState<any[]>([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [studentDirectory, setStudentDirectory] = useState<Record<string, Record<string, any>>>({})

  const [directoryLoading, setDirectoryLoading] = useState(true)
  const [directoryError, setDirectoryError] = useState<string | null>(null)
  const [directoryWarnings, setDirectoryWarnings] = useState<string[]>([])
  const [foldersOpen, setFoldersOpen] = useState<Record<string, boolean>>({
    tasks: true,
    assessments: true,
    homework: true,
    materials: true,
    reports: true,
    recordedSessions: true,
  })

  useEffect(() => {
    const loadDirectory = async () => {
      setDirectoryLoading(true)
      setDirectoryError(null)
      setDirectoryWarnings([])
      try {
        const res = await fetch('/api/student/directory', {
          credentials: 'include',
          cache: 'no-store',
        })
        if (res.ok) {
          const data = await res.json()
          setStudentDirectory(data.directory || {})

          // Surface partial backend errors as warnings, not fatal
          if (data.errors && data.errors.length > 0) {
            console.error('Directory partial errors:', data.errors)
            setDirectoryWarnings(data.errors)
          }

          // Open all top-level and second-level folders by default
          const newFoldersOpen: Record<string, boolean> = {
            tasks: true,
            assessments: true,
            homework: true,
            materials: true,
            reports: true,
            recordedSessions: true,
          }

          const sessionTasks: LiveTask[] = []

          if (data.directory) {
            Object.keys(data.directory).forEach(tutor => {
              newFoldersOpen[`tutor_${tutor}`] = true
              Object.keys(data.directory[tutor]).forEach(category => {
                newFoldersOpen[`cat_${tutor}_${category}`] = true

                // Extract tasks for the current active session
                const catTasks = data.directory[tutor][category].tasks || []
                catTasks.forEach((t: any) => {
                  if (selectedSessionId && t.sessionId === selectedSessionId) {
                    try {
                      const parsed =
                        typeof t.content === 'string' ? JSON.parse(t.content) : t.content
                      // Make sure we use the formatted title (s1, s2 etc)
                      parsed.title = t.title
                      sessionTasks.push(parsed as LiveTask)
                    } catch (e) {
                      console.error('Failed to parse task content', e)
                    }
                  }
                })
              })
            })
          }
          setFoldersOpen(newFoldersOpen)

          // Pre-populate tasks if we joined late
          if (sessionTasks.length > 0) {
            setTasks(prev => {
              const newTasks = [...prev]
              sessionTasks.forEach(st => {
                if (!newTasks.some(pt => pt.id === st.id)) {
                  newTasks.push(st)
                }
              })
              return newTasks
            })
          }
        } else {
          const errorData = await res.json().catch(() => ({}))
          const msg = errorData.detail || errorData.error || res.statusText || `HTTP ${res.status}`
          console.error('Directory load failed:', msg)
          setDirectoryError(msg)
        }
      } catch (err: any) {
        console.error('Failed to load student directory:', err)
        setDirectoryError(err?.message || 'Network error')
      } finally {
        setDirectoryLoading(false)
      }
    }
    loadDirectory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!rightPanelResizing) return
    const onMove = (e: MouseEvent) => {
      const delta = rightResizeStartX.current - e.clientX
      const newW = Math.max(280, Math.min(600, rightResizeStartW.current + delta))
      setRightPanelWidth(newW)
    }
    const onUp = () => setRightPanelResizing(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [rightPanelResizing])

  useEffect(() => {
    const loadAssets = async () => {
      setAssetsLoading(true)
      try {
        const res = await fetch('/api/student/resources', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setCourseAssets(data.resources || [])
        }
      } catch (err) {
        console.error('Failed to load assets:', err)
      } finally {
        setAssetsLoading(false)
      }
    }
    loadAssets()
  }, [])

  // Students don't call /api/class/rooms (tutor-only); sessionId comes from URL or socket
  useEffect(() => {
    if (sessionIdFromQuery) {
      setSelectedSessionId(sessionIdFromQuery)
    }
  }, [sessionIdFromQuery])

  // Session timer
  useEffect(() => {
    if (!sessionContext) {
      setSessionTimer('')
      return
    }
    const updateTimer = () => {
      const now = Date.now()
      if (sessionContext.status === 'active' && sessionContext.startedAt) {
        const started = new Date(sessionContext.startedAt).getTime()
        const elapsed = Math.max(0, now - started)
        const mins = Math.floor(elapsed / 60000)
        const secs = Math.floor((elapsed % 60000) / 1000)
        setSessionTimer(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`)
      } else if (sessionContext.status === 'scheduled' && sessionContext.scheduledAt) {
        const scheduled = new Date(sessionContext.scheduledAt).getTime()
        const diff = scheduled - now
        if (diff > 0) {
          const mins = Math.floor(diff / 60000)
          const secs = Math.floor((diff % 60000) / 1000)
          setSessionTimer(
            `Starts in ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
          )
        } else {
          setSessionTimer('Starting soon')
        }
      } else if (sessionContext.status === 'ended' && sessionContext.endedAt) {
        const ended = new Date(sessionContext.endedAt).getTime()
        const elapsed = Math.max(0, now - ended)
        const mins = Math.floor(elapsed / 60000)
        const secs = Math.floor((elapsed % 60000) / 1000)
        setSessionTimer(
          `Ended ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')} ago`
        )
      } else {
        setSessionTimer(sessionContext.status || '')
      }
    }
    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [sessionContext])

  const socketOptions = useMemo(() => {
    if (!selectedSessionId || !session?.user?.id) return undefined
    return {
      roomId: selectedSessionId,
      userId: session.user.id,
      name: session.user.name || 'Student',
      role: 'student' as const,
      onRoomState: (state: { tasks?: LiveTask[]; whiteboardData?: any }) => {
        if (state.tasks) {
          setTasks(state.tasks)
        }
        const tutorBoard = state?.whiteboardData?.tutorBoard
        if (tutorBoard?.pages && Array.isArray(tutorBoard.pages)) {
          setTutorBoardPages(tutorBoard.pages)
        }
        if (typeof tutorBoard?.pageIndex === 'number') {
          setTutorBoardPageIndex(tutorBoard.pageIndex)
        }
      },
    }
  }, [selectedSessionId, session?.user?.id, session?.user?.name])

  const { socket, error, isConnected } = useSocket(socketOptions)

  useEffect(() => {
    setTasks([])
    setActiveTaskId(null)
    setUnseenTaskIds([])
    setQuestionDrafts({})
    setMyBoardPages(createDefaultWhiteboardPages())
    setMyBoardPageIndex(0)
    setTutorBoardPages(createDefaultWhiteboardPages())
    setTutorBoardPageIndex(0)
    setChatMessages([])
    setTaskChatInitial(undefined)
    setTaskChatIncoming([])
  }, [selectedSessionId])

  // Refs to track notification IDs for tasks/homework so we can mark them as read
  const taskNotifMap = useRef<Map<string, string>>(new Map())
  const hwNotifMap = useRef<Map<string, string>>(new Map())

  // Load persistent notifications on mount to populate counters
  useEffect(() => {
    async function loadNotifications() {
      try {
        const res = await fetch('/api/notifications?unread=true&limit=100', {
          credentials: 'include',
        })
        if (!res.ok) return
        const data = await res.json()
        const notifications = data.notifications || []
        const taskIds: string[] = []
        const hwIds: string[] = []

        for (const n of notifications) {
          // Only count notifications for the current session
          const notifSessionId = n.data?.roomId || n.data?.sessionId
          if (notifSessionId && notifSessionId !== selectedSessionId) continue

          const deployType = n.data?.deployType
          if (deployType === 'task' || deployType === 'assessment') {
            const taskId = n.data?.taskId || n.data?.itemId
            if (taskId) {
              taskNotifMap.current.set(taskId, n.notificationId)
              if (!taskIds.includes(taskId)) taskIds.push(taskId)
            }
          } else if (deployType === 'homework') {
            const hwId = n.data?.homeworkId || n.data?.itemId
            if (hwId) {
              hwNotifMap.current.set(hwId, n.notificationId)
              if (!hwIds.includes(hwId)) hwIds.push(hwId)
            }
          }
        }

        if (taskIds.length > 0) {
          setUnseenTaskIds(prev => [...new Set([...prev, ...taskIds])])
        }
        if (hwIds.length > 0) {
          setUnseenHomeworkIds(prev => [...new Set([...prev, ...hwIds])])
        }
      } catch (e) {
        console.error('Failed to load notifications:', e)
      }
    }
    loadNotifications()
  }, [selectedSessionId])

  // Fetch CSRF token helper
  const getCsrfToken = useCallback(async () => {
    try {
      const res = await fetch('/api/csrf', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      return data?.token ?? null
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    if (!selectedSessionId) return
    let cancelled = false
    const loadSession = async () => {
      try {
        const csrfToken = await getCsrfToken()
        const res = await fetch(`/api/class/rooms/${selectedSessionId}/join`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          console.error('Join API error:', res.status, err)
          toast.error(err.error || `Failed to join session (${res.status})`)
          return
        }
        const data = await res.json()
        if (cancelled) return
        setSessionContext({
          topic: data?.session?.topic ?? null,
          objectives: Array.isArray(data?.session?.objectives)
            ? data.session.objectives
            : data?.session?.objectives
              ? [data.session.objectives]
              : null,
          roomUrl: data?.roomUrl ?? null,
          token: data?.token ?? null,
          twoWay: !!data?.twoWay || (data?.session?.maxStudents ?? 0) <= 2,
          tutorId: data?.session?.tutorId ?? null,
          tutorUsername: data?.session?.tutor?.profile?.name || 'Tutor',
          courseCategory: data?.session?.category || 'General',
          courseId: data?.session?.courseId ?? null,
          courseName: data?.session?.course?.name ?? null,
          variantName: data?.session?.variantName ?? null,
          scheduleName: data?.session?.scheduleName ?? null,
          status: data?.session?.status ?? null,
          startedAt: data?.session?.startedAt ?? null,
          scheduledAt: data?.session?.scheduledAt ?? null,
          endedAt: data?.session?.endedAt ?? null,
        })
        // The server issues a room URL even when it couldn't mint a video token
        // (private rooms need one). Surface that reason up front instead of the
        // cryptic Daily "Failed to join video call" the student hits on click.
        if (data?.videoError) {
          toast.error(data.videoError)
        }
      } catch (err: any) {
        console.error('Join request failed:', err)
        toast.error(err?.message || 'Failed to load live session')
      }
    }
    loadSession()
    return () => {
      cancelled = true
    }
  }, [selectedSessionId, getCsrfToken])

  useEffect(() => {
    if (!socket) return
    const handleChatMessage = (message: ChatMessage) => {
      setChatMessages(prev => [...prev.slice(-19), message])
    }
    socket.on('chat_message', handleChatMessage)
    return () => {
      socket.off('chat_message', handleChatMessage)
    }
  }, [socket])

  useEffect(() => {
    if (!socket || !selectedSessionId) return
    const handleSessionEnded = (data: { sessionId: string; reason?: string }) => {
      if (data.sessionId !== selectedSessionId) return
      setSessionContext(prev =>
        prev ? { ...prev, status: 'ended', endedAt: new Date().toISOString() } : prev
      )
      toast.info('This session has ended.')
    }
    socket.on('session:ended', handleSessionEnded)
    return () => {
      socket.off('session:ended', handleSessionEnded)
    }
  }, [socket, selectedSessionId])

  useEffect(() => {
    if (!selectedSessionId || typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(`feedback-whiteboards:${selectedSessionId}`)
      if (!stored) return
      const parsed = JSON.parse(stored) as {
        my?: { pages?: WhiteboardPage[]; pageIndex?: number }
        tutor?: { pages?: WhiteboardPage[]; pageIndex?: number }
      }
      if (parsed.my?.pages) setMyBoardPages(parsed.my.pages)
      if (typeof parsed.my?.pageIndex === 'number') setMyBoardPageIndex(parsed.my.pageIndex)
      if (parsed.tutor?.pages) setTutorBoardPages(parsed.tutor.pages)
      if (typeof parsed.tutor?.pageIndex === 'number')
        setTutorBoardPageIndex(parsed.tutor.pageIndex)
    } catch {
      // Ignore malformed cache.
    }
  }, [selectedSessionId])

  useEffect(() => {
    if (!selectedSessionId || typeof window === 'undefined') return
    if (saveBoardsTimeoutRef.current) clearTimeout(saveBoardsTimeoutRef.current)
    saveBoardsTimeoutRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(
          `feedback-whiteboards:${selectedSessionId}`,
          JSON.stringify({
            my: { pages: myBoardPages, pageIndex: myBoardPageIndex },
            tutor: { pages: tutorBoardPages, pageIndex: tutorBoardPageIndex },
          })
        )
      } catch {
        // Ignore write errors (storage quota, etc).
      }
    }, 250)
    return () => {
      if (saveBoardsTimeoutRef.current) clearTimeout(saveBoardsTimeoutRef.current)
    }
  }, [selectedSessionId, myBoardPages, myBoardPageIndex, tutorBoardPages, tutorBoardPageIndex])

  // Push a full snapshot of the student's own board (all pages + the active page)
  // to the tutor whenever it changes. Per-stroke deltas only reach the tutor when
  // the student draws, so without this the tutor never sees newly added blank pages
  // or page switches. Debounced so rapid drawing coalesces into one update.
  useEffect(() => {
    if (!socket || !selectedSessionId) return
    if (boardSyncTimeoutRef.current) clearTimeout(boardSyncTimeoutRef.current)
    boardSyncTimeoutRef.current = setTimeout(() => {
      socket.emit('student:whiteboard:update', {
        roomId: selectedSessionId,
        board: {
          pages: myBoardPages,
          pageIndex: myBoardPageIndex,
          updatedAt: Date.now(),
        },
      })
    }, 300)
    return () => {
      if (boardSyncTimeoutRef.current) clearTimeout(boardSyncTimeoutRef.current)
    }
  }, [socket, selectedSessionId, myBoardPages, myBoardPageIndex])

  const [followTutor, setFollowTutor] = useState<boolean>(true)
  const openVideoOverlay = useVideoOverlayStore(s => s.openOverlay)

  // On join, request latest tutor + student board snapshots (fast hydration).
  useEffect(() => {
    if (!socket || !selectedSessionId) return
    socket.emit('whiteboard:state:request', { roomId: selectedSessionId, target: 'tutorBoard' })
    socket.emit('whiteboard:state:request', {
      roomId: selectedSessionId,
      target: 'studentBoard',
      studentId: session?.user?.id,
    })
  }, [socket, selectedSessionId, session?.user?.id])

  useEffect(() => {
    if (!selectedSessionId || typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(`student-follow-tutor:${selectedSessionId}`)
      if (raw === '0') setFollowTutor(false)
      if (raw === '1') setFollowTutor(true)
    } catch {
      // ignore
    }
  }, [selectedSessionId])

  useEffect(() => {
    if (!selectedSessionId || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        `student-follow-tutor:${selectedSessionId}`,
        followTutor ? '1' : '0'
      )
    } catch {
      // ignore
    }
  }, [selectedSessionId, followTutor])

  // Sync Student state to Tutor (always, so tutor monitor can track presence)
  useEffect(() => {
    if (!socket || !selectedSessionId) return
    const payload = {
      activeTab,
      activeTaskId,
    }
    socket.emit('student:state_sync', { roomId: selectedSessionId, payload })
  }, [socket, selectedSessionId, activeTab, activeTaskId])

  // Track real interaction recency so we can report a live engagement signal to
  // the tutor's Monitor (instead of a static placeholder).
  const lastInteractionRef = useRef<number>(Date.now())
  useEffect(() => {
    if (typeof window === 'undefined') return
    const bump = () => {
      lastInteractionRef.current = Date.now()
    }
    const events: (keyof WindowEventMap)[] = [
      'pointerdown',
      'pointermove',
      'keydown',
      'wheel',
      'touchstart',
    ]
    events.forEach(e => window.addEventListener(e, bump, { passive: true }))
    return () => events.forEach(e => window.removeEventListener(e, bump))
  }, [])

  // Periodically emit an activity_ping with a behaviour-derived engagement score
  // and the student's current activity, so the tutor's Monitor reflects reality.
  useEffect(() => {
    if (!socket || !selectedSessionId) return
    const computeAndEmit = () => {
      const hidden = typeof document !== 'undefined' && document.hidden
      const idleMs = Date.now() - lastInteractionRef.current
      // Engagement: full when recently active and focused; decays while idle, and
      // is low when the tab isn't focused.
      let engagement: number
      if (hidden) engagement = 20
      else if (idleMs < 20_000) engagement = 100
      else if (idleMs < 60_000) engagement = 75
      else if (idleMs < 120_000) engagement = 50
      else if (idleMs < 300_000) engagement = 30
      else engagement = 10
      const onBoard = activeTab === 'tutor-board' || rightPanelTab === 'my-board'
      const activity = hidden
        ? 'Away (tab not focused)'
        : onBoard
          ? 'On the whiteboard'
          : activeTaskId
            ? 'Working on a task'
            : idleMs > 60_000
              ? 'Idle'
              : 'Active'
      socket.emit('activity_ping', { roomId: selectedSessionId, engagement, activity })
    }
    computeAndEmit()
    const id = setInterval(computeAndEmit, 12_000)
    const onVis = () => computeAndEmit()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [socket, selectedSessionId, activeTab, activeTaskId, rightPanelTab])

  useEffect(() => {
    if (!socket) return

    const handleTaskDeployed = (task: LiveTask) => {
      if (task.source === 'homework') {
        setLiveHomework(prev => {
          const exists = prev.some(item => item.id === task.id)
          if (exists) {
            return prev.map(item => (item.id === task.id ? { ...item, ...task } : item))
          }
          return [...prev, task]
        })
        setUnseenHomeworkIds(prev => (prev.includes(task.id) ? prev : [...prev, task.id]))
        toast.success(`New homework assigned: ${task.title}`)
      } else {
        setTasks(prev => {
          const exists = prev.some(item => item.id === task.id)
          if (exists) {
            return prev.map(item => (item.id === task.id ? { ...item, ...task } : item))
          }
          return [...prev, task]
        })
        setUnseenTaskIds(prev => (prev.includes(task.id) ? prev : [...prev, task.id]))
        toast.success(`New task deployed: ${task.title}`)
      }
    }

    const handleTaskUpdated = (payload: { task: LiveTask }) => {
      setTasks(prev => prev.map(item => (item.id === payload.task.id ? payload.task : item)))
    }

    const handleTaskSequence = (payload: { taskId: string; sequence: number }) => {
      setTasks(prev =>
        prev.map(item => {
          if (item.id === payload.taskId && !item.title.includes(`(s${payload.sequence})`)) {
            return { ...item, title: `${item.title} (s${payload.sequence})` }
          }
          return item
        })
      )
    }

    const handleInsightReceived = (payload: {
      type: string
      payload: { activeTab?: string; activeTaskId?: string | null }
    }) => {
      if (payload.type === 'tutor:state_sync') {
        if (!followTutor) return
        const state = payload.payload
        if (state.activeTab === 'whiteboards') {
          setActiveTab('tutor-board')
        } else if (state.activeTab === 'classroom') {
          setActiveTab('task')
        }
        // Only follow tutor to a task if it has been deployed in this session
        if (state.activeTaskId) {
          const isDeployed = tasks.some(t => t.id === state.activeTaskId)
          if (isDeployed) {
            setActiveTaskId(state.activeTaskId)
          }
        }
      }
    }

    const handleStudentDirectMessage = (payload: { targetStudentId: string; message: string }) => {
      if (payload.targetStudentId === session?.user?.id) {
        toast.message('Tutor Message', {
          description: payload.message,
          duration: 10000,
        })
      }
    }

    const handleHomeworkReceived = (hw: LiveTask) => {
      setLiveHomework(prev => {
        const exists = prev.some(item => item.id === hw.id)
        if (exists) {
          return prev.map(item => (item.id === hw.id ? { ...item, ...hw } : item))
        }
        return [...prev, hw]
      })
      setUnseenHomeworkIds(prev => (prev.includes(hw.id) ? prev : [...prev, hw.id]))
      toast.success(`New homework assigned: ${hw.title}`)
    }

    const handleTutorWhiteboardUpdate = (board: {
      pages?: any[]
      pageIndex?: number
      updatedAt?: number
    }) => {
      if (board?.pages && Array.isArray(board.pages)) {
        setTutorBoardPages(board.pages)
      }
      if (typeof board?.pageIndex === 'number') {
        setTutorBoardPageIndex(board.pageIndex)
      }
    }

    const handleWhiteboardStateResponse = (payload: any) => {
      if (!payload || payload.roomId !== selectedSessionId) return
      if (payload.target === 'tutorBoard' || payload.target === 'all') {
        const board = payload.tutorBoard
        if (board?.pages && Array.isArray(board.pages)) setTutorBoardPages(board.pages)
        if (typeof board?.pageIndex === 'number') setTutorBoardPageIndex(board.pageIndex)
      }
      if (payload.target === 'studentBoard' || payload.target === 'all') {
        const board = payload.studentBoard
        if (board?.pages && Array.isArray(board.pages)) setMyBoardPages(board.pages)
        if (typeof board?.pageIndex === 'number') setMyBoardPageIndex(board.pageIndex)
      }
    }

    socket.on('task:deployed', handleTaskDeployed)
    socket.on('task:updated', handleTaskUpdated)
    socket.on('task:deployed:sequence', handleTaskSequence)
    socket.on('insight:receive', handleInsightReceived)
    socket.on('student:direct_message', handleStudentDirectMessage)
    socket.on('homework:received', handleHomeworkReceived)
    socket.on('tutor:whiteboard:update', handleTutorWhiteboardUpdate)
    socket.on('whiteboard:state:response', handleWhiteboardStateResponse)

    return () => {
      socket.off('task:deployed', handleTaskDeployed)
      socket.off('task:updated', handleTaskUpdated)
      socket.off('task:deployed:sequence', handleTaskSequence)
      socket.off('insight:receive', handleInsightReceived)
      socket.off('student:direct_message', handleStudentDirectMessage)
      socket.off('homework:received', handleHomeworkReceived)
      socket.off('tutor:whiteboard:update', handleTutorWhiteboardUpdate)
      socket.off('whiteboard:state:response', handleWhiteboardStateResponse)
    }
  }, [socket, followTutor, selectedSessionId])

  useEffect(() => {
    if (!activeTaskId && tasks.length > 0) {
      setActiveTaskId(tasks[0].id)
    }
  }, [activeTaskId, tasks])

  const activeTask =
    tasks.find(task => task.id === activeTaskId) ||
    (selectedDirectoryItem?.id === activeTaskId ? selectedDirectoryItem : null) ||
    null
  // A deployed TASK has no DMI — the student answers it by chatting (new flow).
  // Assessments/DMI-bearing items keep the structured answer flow.
  const isChatTask =
    !!activeTask &&
    activeTask.source === 'task' &&
    !(Array.isArray(activeTask.dmiItems) && activeTask.dmiItems.length > 0)

  // Restore a prior chat-task submission so a returning student sees their answers,
  // the AI feedback, and any follow-ups — then they can continue asking questions.
  useEffect(() => {
    if (!activeTaskId || !isChatTask) {
      setTaskChatInitial(undefined)
      return
    }
    let active = true
    fetch(`/api/student/assignments/${activeTaskId}`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!active) return
        if (data?.alreadySubmitted) {
          const answersObj =
            data.existingAnswers && typeof data.existingAnswers === 'object'
              ? (data.existingAnswers as Record<string, string>)
              : {}
          const answers = Object.keys(answersObj)
            .sort((a, b) => Number(a) - Number(b))
            .map(k => String(answersObj[k]))
          const aiItems: Array<{ explanation?: string }> = data.existingAiFeedback?.items ?? []
          const followUps: Array<{ question?: string; answer?: string }> = Array.isArray(
            data.existingFollowUps
          )
            ? data.existingFollowUps
            : []
          const restored: TestTaskChatMsg[] = []
          answers.forEach(a =>
            restored.push({ role: 'student', content: a, timestamp: Date.now() })
          )
          aiItems.forEach((it, i) =>
            restored.push({
              role: 'ai',
              content: it.explanation ?? '',
              re: answers[i],
              timestamp: Date.now(),
            })
          )
          followUps.forEach(f => {
            if (f.question)
              restored.push({ role: 'student', content: f.question, timestamp: Date.now() })
            if (f.answer) restored.push({ role: 'ai', content: f.answer, timestamp: Date.now() })
          })
          setTaskChatInitial({ messages: restored, draft: '', completed: restored.length > 0 })
        } else {
          setTaskChatInitial({ messages: [], draft: '', completed: false })
        }
      })
      .catch(() => {
        if (active) setTaskChatInitial({ messages: [], draft: '', completed: false })
      })
    return () => {
      active = false
    }
  }, [activeTaskId, isChatTask])

  // Listen for tutor task-chat messages and inject them into the student's chat.
  useEffect(() => {
    if (!socket || !activeTaskId) return
    const handleTaskChatMessage = (msg: TestTaskChatMsg & { taskId?: string }) => {
      if (msg.taskId && msg.taskId !== activeTaskId) return
      setTaskChatIncoming(prev => [...prev, msg])
    }
    socket.on('task:chat_message', handleTaskChatMessage)
    return () => {
      socket.off('task:chat_message', handleTaskChatMessage)
    }
  }, [socket, activeTaskId])

  // Clear cross-task message relay when the active chat task changes.
  useEffect(() => {
    setTaskChatIncoming([])
  }, [activeTaskId])

  const currentSession = sessions.find(s => s.id === selectedSessionId) || null
  const isScheduled = currentSession?.status === 'scheduled'
  const isPassedSession =
    isScheduled &&
    currentSession?.scheduledAt &&
    new Date(currentSession.scheduledAt).getTime() + 2 * 60 * 60 * 1000 < Date.now()

  // While a session is live, the Directory should focus the student on the active
  // course only — other courses are greyed out and locked so they can't open the
  // wrong folder/task/assessment. This lifts automatically when the session ends.
  const activeCourseId = sessionContext?.courseId ?? null
  const isSessionLive =
    !!activeCourseId && sessionContext?.status !== 'ended' && !sessionContext?.endedAt

  const feedbackPolls = activeTask?.polls ?? []
  const feedbackQuestions = activeTask?.questions ?? []

  // Count polls/questions this student hasn't answered yet (and that are still
  // open), so the Interact tab can badge how many need a response. A closed
  // poll/question no longer counts — there's nothing the student can do.
  const myId = session?.user?.id
  const unansweredInteractCount =
    feedbackPolls.filter(p => p.status !== 'closed' && !p.responses.some(r => r.studentId === myId))
      .length +
    feedbackQuestions.filter(
      q =>
        (q as { status?: string }).status !== 'closed' &&
        !q.responses.some(r => r.studentId === myId)
    ).length

  let latestInteractionType: 'poll' | 'question' | null = null
  let maxCreatedAt = 0

  feedbackPolls.forEach(p => {
    if (p.createdAt > maxCreatedAt) {
      maxCreatedAt = p.createdAt
      latestInteractionType = 'poll'
    }
  })

  feedbackQuestions.forEach(q => {
    if (q.createdAt > maxCreatedAt) {
      maxCreatedAt = q.createdAt
      latestInteractionType = 'question'
    }
  })

  const interactionsTitle =
    latestInteractionType === 'poll'
      ? 'Interactions: Poll'
      : latestInteractionType === 'question'
        ? 'Interactions: Question'
        : 'Interactions'

  const handleRequestMaterials = async (sessionId: string) => {
    setRequestingSessionId(sessionId)
    try {
      const res = await fetch(`/api/student/sessions/${sessionId}/request-materials`, {
        method: 'POST',
      })
      if (res.ok) {
        toast.success('Material request sent to tutor.')
      } else {
        toast.error('Failed to send request.')
      }
    } catch {
      toast.error('An error occurred while sending request.')
    } finally {
      setRequestingSessionId(null)
    }
  }

  const markNotificationsRead = useCallback(async (notifIds: string[]) => {
    if (notifIds.length === 0) return
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notificationIds: notifIds }),
      })
      if (!res.ok) console.error('Failed to mark notifications as read')
    } catch (e) {
      console.error('Error marking notifications as read:', e)
    }
  }, [])

  const handleSelectDirectoryItem = useCallback(
    (item: any) => {
      // Handle live tasks / homework (LiveTask objects from socket)
      if (item.source === 'task' || item.source === 'assessment' || item.source === 'homework') {
        setSelectedDirectoryItem(item)
        setActiveTaskId(item.id)
        setUnseenTaskIds(prev => prev.filter(id => id !== item.id))
        setUnseenHomeworkIds(prev => prev.filter(id => id !== item.id))
        const notifId = taskNotifMap.current.get(item.id) || hwNotifMap.current.get(item.id)
        if (notifId) {
          void markNotificationsRead([notifId])
          taskNotifMap.current.delete(item.id)
          hwNotifMap.current.delete(item.id)
        }
        setShowDirectoryPanel(false)
        return
      }
      if (
        item.type === 'task' ||
        item.type === 'assessment' ||
        item.type === 'homework' ||
        item.type === 'asset' ||
        item.type === 'recording'
      ) {
        try {
          const parsed = typeof item.content === 'string' ? JSON.parse(item.content) : item.content
          parsed.title = item.title
          parsed.id = item.itemId || item.id // Use itemId or fallback to id
          parsed.courseName = item.courseName

          setSelectedDirectoryItem(parsed)
          setActiveTaskId(parsed.id)
          setUnseenTaskIds(prev => prev.filter(id => id !== parsed.id))
          setUnseenHomeworkIds(prev => prev.filter(id => id !== parsed.id))
          const notifId = taskNotifMap.current.get(parsed.id) || hwNotifMap.current.get(parsed.id)
          if (notifId) {
            void markNotificationsRead([notifId])
            taskNotifMap.current.delete(parsed.id)
            hwNotifMap.current.delete(parsed.id)
          }
          setShowDirectoryPanel(false)
        } catch (e) {
          console.error('Failed to parse task content', e)
        }
      }
    },
    [markNotificationsRead]
  )

  const handleSelectTask = (taskId: string) => {
    setActiveTaskId(taskId)
    // Selecting a task must reveal the viewer — otherwise a student on the
    // "Tutor Board" tab clicks a task and nothing visibly happens.
    setActiveTab('task')
    setUnseenTaskIds(prev => prev.filter(id => id !== taskId))
    const notifId = taskNotifMap.current.get(taskId)
    if (notifId) {
      void markNotificationsRead([notifId])
      taskNotifMap.current.delete(taskId)
    }
    setShowDirectoryPanel(false)
  }

  const handlePollVote = (poll: LiveTaskPoll, value: number) => {
    if (!socket || !selectedSessionId || !activeTask) return
    socket.emit('insight:respond', {
      roomId: selectedSessionId,
      taskId: activeTask.id,
      type: 'poll',
      insightId: poll.id,
      value,
    })
  }

  const handleQuestionSend = (question: LiveTaskQuestion) => {
    const draft = questionDrafts[question.id]?.trim()
    if (!draft || !socket || !selectedSessionId || !activeTask) return
    socket.emit('insight:respond', {
      roomId: selectedSessionId,
      taskId: activeTask.id,
      type: 'question',
      insightId: question.id,
      answer: draft,
    })
    setQuestionDrafts(prev => ({ ...prev, [question.id]: '' }))
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-gray-50">
      <div className="flex h-full w-full min-w-0 flex-1 flex-col bg-gray-50/50">
        <div className="w-full px-4 pt-2">
          <div className="flex w-full flex-col gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-2 shadow-[0_8px_20px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push('/student/dashboard')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              {sessionContext && (
                <div className="flex min-w-0 flex-col">
                  <div className="flex min-w-0 items-center gap-2">
                    <h1 className="truncate text-sm font-semibold text-[#1F2933]">
                      {sessionContext.courseName
                        ? `${sessionContext.courseName}${sessionContext.variantName ? ` — ${sessionContext.variantName}` : ''}`
                        : sessionContext.courseCategory || 'Live Class'}
                    </h1>
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                        sessionContext.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : sessionContext.status === 'scheduled'
                            ? 'bg-amber-100 text-amber-700'
                            : sessionContext.status === 'ended'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-gray-100 text-gray-600'
                      )}
                    >
                      {sessionContext.status === 'active'
                        ? '● Live'
                        : sessionContext.status === 'scheduled'
                          ? '⏳ Scheduled'
                          : sessionContext.status === 'ended'
                            ? '■ Ended'
                            : sessionContext.status || 'Unknown'}
                    </span>
                    {sessionTimer && (
                      <span className="shrink-0 font-mono text-xs text-slate-500">
                        {sessionTimer}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {[sessionContext.scheduleName, `with ${sessionContext.tutorUsername}`]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-1 items-center justify-end gap-3">
              <WifiSignal connected={isConnected} error={!!error} />
            </div>
          </div>

          {sessionContext && (sessionContext.topic || sessionContext.objectives) && (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2 text-sm text-blue-900">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {sessionContext.topic && (
                  <span>
                    <span className="font-semibold">Lesson:</span> {sessionContext.topic}
                  </span>
                )}
              </div>
              {sessionContext.objectives && sessionContext.objectives.length > 0 && (
                <div className="mt-1 text-xs text-blue-800">
                  <span className="font-semibold">Objectives:</span>{' '}
                  {sessionContext.objectives.map((obj, idx) => (
                    <span key={idx}>
                      {idx + 1}) {obj}{' '}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <ClassroomControlsPanel
          followTutor={followTutor}
          setFollowTutor={setFollowTutor}
          isConnected={isConnected}
          error={error}
          roomUrl={sessionContext?.roomUrl}
          token={sessionContext?.token}
          twoWay={sessionContext?.twoWay}
          openVideoOverlay={openVideoOverlay}
          setShowDirectoryPanel={setShowDirectoryPanel}
        />

        {/* Content Wrapper */}
        <div className="relative flex w-full flex-1 items-stretch gap-4 overflow-hidden px-4 pb-4 pt-2">
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col overflow-hidden',
              rightPanelResizing ? 'transition-none' : 'transition-all duration-500 ease-out'
            )}
          >
            <Tabs
              value={activeTab}
              onValueChange={v => setActiveTab(v as 'task' | 'tutor-board')}
              className="flex h-full min-h-0 flex-1 flex-col"
            >
              <div className="flex shrink-0 items-start pt-0">
                <TabsList
                  className={cn(
                    'grid h-[52px] w-full grid-cols-2 gap-2 border-0 bg-transparent p-0 shadow-none transition-opacity',
                    followTutor && 'pointer-events-none opacity-40'
                  )}
                  title={followTutor ? 'Unfollow tutor to switch tabs manually' : undefined}
                >
                  <TabsTrigger
                    value="task"
                    className="flex items-center justify-center gap-2 rounded-full border-0 px-4 py-2.5 text-sm font-semibold shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all data-[state=inactive]:bg-white data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#F97316] data-[state=active]:to-[#EA580C] data-[state=active]:text-white data-[state=inactive]:text-[#1F2933] data-[state=active]:shadow-[0_12px_26px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.25)]"
                  >
                    <Presentation className="h-4 w-4" />
                    Classroom
                  </TabsTrigger>
                  <TabsTrigger
                    value="tutor-board"
                    className="flex items-center justify-center gap-2 rounded-full border-0 px-4 py-2.5 text-sm font-semibold shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all data-[state=inactive]:bg-white data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#2563EB] data-[state=active]:to-[#1D4ED8] data-[state=active]:text-white data-[state=inactive]:text-[#1F2933] data-[state=active]:shadow-[0_12px_26px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.25)]"
                  >
                    <Pencil className="h-4 w-4" />
                    Tutor Board
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Buffer between mode selector and classroom view */}
              <div className="shrink-0 px-4 pb-3" />

              <TabsContent
                value="task"
                padding="none"
                className="flex h-full min-h-0 flex-1 flex-col outline-none"
              >
                {/* Classroom viewer */}
                <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border-2 border-[rgba(241,118,35,0.5)] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)] transition-all duration-200 hover:shadow-[0_12px_32px_rgba(31,41,51,0.14)]">
                  <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-center">
                    <span className="rounded-b-md bg-[rgba(241,118,35,0.5)] px-3 py-0.5 text-[11px] font-medium text-white">
                      Classroom
                    </span>
                  </div>

                  <div className="flex-1 overflow-hidden p-4 pt-6">
                    {activeTask ? (
                      isChatTask && activeTaskId ? (
                        <div className="h-full w-full">
                          <TestTaskChat
                            key={activeTaskId}
                            mode="test-student"
                            questionText={`${activeTask.title}\n\n${activeTask.content}`}
                            sourceDocument={activeTask.sourceDocument}
                            initialState={taskChatInitial}
                            incomingMessages={taskChatIncoming}
                            studentAvatarUrl={session?.user?.image}
                            onGrade={body =>
                              fetchWithCsrf(`/api/student/assignments/${activeTaskId}/task-chat`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(body),
                              })
                            }
                            onBroadcast={msg => {
                              if (!socket || !selectedSessionId) return
                              socket.emit('task:chat_message', {
                                roomId: selectedSessionId,
                                taskId: activeTaskId,
                                role: 'student',
                                content: msg.content,
                                name: session?.user?.name || 'Student',
                                timestamp: Date.now(),
                              })
                            }}
                            onComplete={answers => {
                              if (!socket || !selectedSessionId || !activeTaskId) return
                              const record: Record<string, string> = {}
                              answers.forEach((a, i) => {
                                record[String(i + 1)] = a
                              })
                              socket.emit('task:complete', {
                                roomId: selectedSessionId,
                                taskId: activeTaskId,
                                answers: record,
                                aiHandled: true,
                              })
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          className="h-full w-full overflow-y-auto"
                          style={{ zoom: viewerZoom } as React.CSSProperties}
                        >
                          <h3 className="mb-3 text-base font-semibold text-gray-900">
                            {activeTask.title}
                          </h3>

                          {activeTask.content && (
                            <div className="mb-4 whitespace-pre-wrap text-sm text-gray-700">
                              {activeTask.content}
                            </div>
                          )}

                          {/* For a chat task the document lives inside the chat panel
                              (it collapses into a pinned card after the first message),
                              so only render the standalone viewer for non-chat tasks. */}
                          {!isChatTask && activeTask.sourceDocument && (
                            // Same renderer the chat flow uses (via TaskDocumentCard),
                            // in its non-collapsible mode — one code path for the PDF/
                            // image viewer and the "document unavailable" fallback.
                            <div className="mb-4 h-[55vh] w-full">
                              <TaskDocumentCard
                                sourceDocument={activeTask.sourceDocument}
                                alwaysOpen
                              />
                            </div>
                          )}

                          {/* The questions + answer inputs live in the right-hand
                              Assessment tab (single source of truth). Here we just
                              point the student to it so a question-only task isn't
                              blank. */}
                          {Array.isArray(activeTask.dmiItems) && activeTask.dmiItems.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setRightPanelTab('dmi')}
                              className="flex w-full items-center justify-between gap-2 rounded-lg border border-[rgba(241,118,35,0.4)] bg-[rgba(241,118,35,0.06)] px-3 py-2.5 text-left text-sm font-medium text-[#9a4a12] transition-colors hover:bg-[rgba(241,118,35,0.12)]"
                            >
                              <span>
                                {activeTask.dmiItems.length} question
                                {activeTask.dmiItems.length === 1 ? '' : 's'} to answer — open the
                                Assessment tab
                              </span>
                              <ChevronRight className="h-4 w-4 shrink-0" />
                            </button>
                          )}

                          {!isChatTask &&
                            !activeTask.content &&
                            !activeTask.sourceDocument &&
                            !(
                              Array.isArray(activeTask.dmiItems) && activeTask.dmiItems.length > 0
                            ) && (
                              <p className="text-sm text-gray-500">
                                This task has no content to display.
                              </p>
                            )}
                        </div>
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-gray-400">
                        Select a task from the Lessons tab to open it.
                      </div>
                    )}
                  </div>

                  {/* Floating zoom controls */}
                  <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1 rounded-full bg-white/90 p-1 shadow-md backdrop-blur-sm">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full text-slate-600 hover:bg-slate-100"
                      onClick={() => setViewerZoom(z => Math.min(2, z + 0.1))}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full text-slate-600 hover:bg-slate-100"
                      onClick={() => setViewerZoom(z => Math.max(0.5, z - 0.1))}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Input row — the tutor-chat + socket "Task Complete". Hidden for
                    chat tasks, which use the in-viewer TestTaskChat instead. */}
                {!isChatTask && (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="relative flex-1">
                      <Input
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            if (chatInput.trim() && socket) {
                              socket.emit('chat_message', { text: chatInput.trim() })
                              setChatInput('')
                            }
                          }
                        }}
                        className="h-11 w-full rounded-xl border-slate-200 pr-10 text-sm focus-visible:ring-[rgba(241,118,35,0.5)]"
                      />
                      <Button
                        size="icon"
                        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg bg-slate-400 text-white hover:bg-slate-500 disabled:opacity-30"
                        disabled={!chatInput.trim() || !socket}
                        onClick={() => {
                          if (chatInput.trim() && socket) {
                            socket.emit('chat_message', { text: chatInput.trim() })
                            setChatInput('')
                          }
                        }}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      className="h-11 rounded-xl bg-[#F17623] px-5 text-sm font-semibold text-white hover:bg-[#d9651a]"
                      disabled={!activeTaskId || !socket}
                      onClick={() => {
                        if (!activeTaskId || !socket || !selectedSessionId) return
                        // Include any typed answers so the tutor's Insights can see
                        // each student's responses, not just a completion tick.
                        const answers = (activeTask?.dmiItems ?? []).reduce(
                          (acc, item) => {
                            const a = taskAnswers[item.id]
                            if (a && a.trim()) acc[item.id] = a.trim()
                            return acc
                          },
                          {} as Record<string, string>
                        )
                        // Wait for the server's acknowledgement so we report a
                        // TRUE result. If the payload is dropped (e.g. too large
                        // with drawings) the ack never arrives → show a real error
                        // instead of a false "submitted".
                        socket
                          .timeout(20000)
                          .emit(
                            'task:complete',
                            { roomId: selectedSessionId, taskId: activeTaskId, answers },
                            (err: unknown, resp?: { ok?: boolean; error?: string }) => {
                              if (err || !resp?.ok) {
                                toast.error(
                                  resp?.error ||
                                    'Submission did not go through. If you added drawings, try clearing some and resubmit.'
                                )
                                return
                              }
                              toast.success('Task submitted')
                            }
                          )
                      }}
                    >
                      Task Complete
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent
                value="tutor-board"
                padding="none"
                className="flex h-full min-h-0 flex-1 flex-col outline-none"
              >
                {/* Tutor Board viewer */}
                <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border-2 border-[#2563EB] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)] transition-all duration-200 hover:shadow-[0_12px_32px_rgba(31,41,51,0.14)]">
                  <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-center">
                    <span className="rounded-b-md bg-[#2563EB] px-3 py-0.5 text-[11px] font-medium text-white">
                      Tutor Board
                    </span>
                  </div>
                  <div className="flex-1 overflow-hidden pt-5">
                    <EnhancedWhiteboard
                      readOnly
                      pages={tutorBoardPages}
                      currentPageIndex={tutorBoardPageIndex}
                      onPagesChange={setTutorBoardPages}
                      onPageIndexChange={setTutorBoardPageIndex}
                      socket={socket}
                      roomId={selectedSessionId ?? undefined}
                      filterByUserId={sessionContext?.tutorId ?? undefined}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Persistent Right Panel */}
          <div
            className={cn(
              'relative flex h-full shrink-0 flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.08)]',
              rightPanelResizing ? 'transition-none' : 'transition-all duration-500 ease-out'
            )}
            style={{
              // Narrow width for Lessons/Interact (380px), expanded for Assessment/My Board (680px)
              width:
                rightPanelWidth +
                (rightPanelTab === 'lessons' || rightPanelTab === 'interactions'
                  ? 0
                  : EXPANDED_PANEL_BONUS),
            }}
          >
            {/* Resize handle — available on every tab so students can widen or
                narrow the panel for convenience. */}
            <div
              className="absolute bottom-0 left-0 top-0 z-10 flex w-3 cursor-col-resize items-center justify-center bg-slate-100/50 hover:bg-blue-500/30 active:bg-blue-500/50"
              onMouseDown={e => {
                setRightPanelResizing(true)
                rightResizeStartX.current = e.clientX
                rightResizeStartW.current = rightPanelWidth
              }}
              title="Drag to resize"
            >
              <div className="h-8 w-0.5 rounded-full bg-slate-300" />
            </div>

            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="flex w-full items-center gap-2 rounded-lg bg-gray-100 p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRightPanelTab('lessons')}
                  className={cn(
                    'relative h-8 min-w-0 flex-1 rounded-md px-3 text-xs font-medium transition-all',
                    rightPanelTab === 'lessons'
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-500 hover:bg-white hover:text-gray-900'
                  )}
                >
                  Lessons
                  {unseenTaskIds.length > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-semibold text-white">
                      {unseenTaskIds.length}
                    </span>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRightPanelTab('interactions')}
                  className={cn(
                    'relative h-8 min-w-0 flex-1 rounded-md px-3 text-xs font-medium transition-all',
                    rightPanelTab === 'interactions'
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-500 hover:bg-white hover:text-gray-900'
                  )}
                >
                  Interact
                  {unansweredInteractCount > 0 && (
                    <span
                      className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-semibold text-white"
                      title={`${unansweredInteractCount} unanswered`}
                    >
                      {unansweredInteractCount}
                    </span>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setRightPanelTab(prev => (prev === 'dmi' ? 'interactions' : 'dmi'))
                  }
                  className={cn(
                    'h-8 min-w-0 flex-1 rounded-md px-3 text-xs font-medium transition-all',
                    rightPanelTab === 'dmi'
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-500 hover:bg-white hover:text-gray-900'
                  )}
                >
                  Assessment
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setRightPanelTab(prev => (prev === 'my-board' ? 'interactions' : 'my-board'))
                  }
                  className={cn(
                    'h-8 min-w-0 flex-1 rounded-md px-3 text-xs font-medium transition-all',
                    rightPanelTab === 'my-board'
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-500 hover:bg-white hover:text-gray-900'
                  )}
                >
                  My Board
                </Button>
              </div>
            </div>

            <div
              className={cn(
                'flex-1',
                // Only the whiteboard (My Board) needs a fixed, non-scrolling
                // canvas; every other tab — including a long DMI/Assessment —
                // must scroll.
                rightPanelTab === 'my-board' ? 'overflow-hidden' : 'overflow-y-auto p-4'
              )}
            >
              {rightPanelTab === 'lessons' ? (
                <div className="space-y-2">
                  {tasks.length === 0 && (
                    <p className="text-sm text-gray-500">No tasks deployed yet.</p>
                  )}
                  {[...tasks].reverse().map(task => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => handleSelectTask(task.id)}
                      onDoubleClick={() => {
                        handleSelectTask(task.id)
                        // Double-clicking an assessment (or any task that carries
                        // DMI questions) jumps straight to its answer inputs in
                        // the Assessment tab.
                        if (task.source === 'assessment' || (task.dmiItems?.length ?? 0) > 0) {
                          setRightPanelTab('dmi')
                        }
                      }}
                      className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                        activeTaskId === task.id
                          ? 'border-blue-200 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-100 hover:bg-blue-50/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-900">{task.title}</span>
                        {unseenTaskIds.includes(task.id) && (
                          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] text-white">
                            New
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        Deployed {new Date(task.deployedAt).toLocaleTimeString()}
                      </span>
                    </button>
                  ))}
                </div>
              ) : rightPanelTab === 'dmi' ? (
                <div className="space-y-4">
                  {activeTask?.dmiItems && activeTask.dmiItems.length > 0 ? (
                    <div className="space-y-3">
                      {activeTask.dmiItems.map((item, idx) => {
                        const qType = normalizeDmiQuestionType(item.questionType)
                        // Section heading (ASMT-4): show it once, before the first
                        // question of each section.
                        const prevSection =
                          idx > 0 ? activeTask.dmiItems?.[idx - 1]?.section : undefined
                        const showSection = !!item.section && item.section !== prevSection
                        return (
                          <Fragment key={item.id}>
                            {showSection && (
                              <div className="mt-1 border-b border-indigo-100 pb-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                                {item.section}
                              </div>
                            )}
                            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                              <div className="mb-2 flex items-start justify-between gap-2">
                                <p className="text-sm font-medium text-gray-800">
                                  {/* The label is usually self-numbered ("Question 1(a)"); only
                                    prepend the counter for older free-text questions. */}
                                  {/^\s*(?:question\b|\d)/i.test(item.questionText)
                                    ? item.questionText
                                    : `${(item.questionLabel ?? item.questionNumber) ? `${item.questionLabel ?? item.questionNumber}. ` : ''}${item.questionText}`}
                                </p>
                                <div className="flex shrink-0 items-center gap-1">
                                  {typeof item.marks === 'number' && item.marks > 0 && (
                                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
                                      {item.marks} {item.marks === 1 ? 'mark' : 'marks'}
                                    </span>
                                  )}
                                  {qType !== 'long' && (
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                                      {DMI_QUESTION_TYPE_LABELS[qType]}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <DmiAnswerField
                                item={item}
                                value={taskAnswers[item.id] ?? ''}
                                // Once the student starts working, stop auto-following
                                // the tutor so their navigation can't yank the student
                                // away from what they're answering.
                                onInteract={() => setFollowTutor(false)}
                                onValueChange={next =>
                                  setTaskAnswers(prev => ({ ...prev, [item.id]: next }))
                                }
                              />
                            </div>
                          </Fragment>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      {activeTask ? 'This task has no questions to answer.' : ''}
                    </p>
                  )}
                  {/* Ask the AI tutor about this task — applies the task's PCI
                      (TASK-6). Integrity is enforced server-side (ASMT-15). */}
                  {activeTask && (
                    <TaskAiHelper
                      taskId={activeTaskId}
                      subject={sessionContext?.courseCategory || 'General'}
                    />
                  )}
                </div>
              ) : rightPanelTab === 'my-board' ? (
                <div className="flex h-full min-h-0 flex-col overflow-hidden">
                  <EnhancedWhiteboard
                    pages={myBoardPages}
                    currentPageIndex={myBoardPageIndex}
                    onPagesChange={setMyBoardPages}
                    onPageIndexChange={setMyBoardPageIndex}
                    socket={socket}
                    roomId={selectedSessionId ?? undefined}
                    userId={session?.user?.id ?? undefined}
                    // "My Board" shows only this student's own strokes (not the tutor's or
                    // other students'), so scope incoming deltas to this user.
                    filterByUserId={session?.user?.id ?? undefined}
                    userName={session?.user?.name || 'Student'}
                    userColor={stringToColor(session?.user?.id || '')}
                  />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="mb-2 border-b border-gray-100 pb-2">
                    <h2 className="text-base font-bold text-gray-900">{interactionsTitle}</h2>
                  </div>
                  {!activeTask && (
                    <p className="text-sm text-gray-500">Select a task to see feedback prompts.</p>
                  )}
                  {activeTask && (
                    <div className="space-y-6">
                      {feedbackPolls.length > 0 && (
                        <div className="space-y-3">
                          {feedbackPolls.map(poll => {
                            const selectedValue = poll.responses.find(
                              response => response.studentId === session?.user?.id
                            )?.value
                            // Once answered (or the tutor closed it) the vote is
                            // locked — you can't change your answer.
                            const answered = selectedValue !== undefined
                            const locked = poll.status === 'closed' || answered
                            return (
                              <div key={poll.id} className="rounded-lg border bg-white p-4">
                                <p className="text-sm font-medium text-gray-900">{poll.question}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {(
                                    poll.optionLabels ??
                                    poll.options.map((_, i) => String.fromCharCode(65 + i))
                                  ).map((label, i) => (
                                    <Button
                                      key={`${poll.id}-${i}`}
                                      variant={selectedValue === i ? 'default' : 'outline'}
                                      size="sm"
                                      disabled={locked}
                                      onClick={() => handlePollVote(poll, i)}
                                    >
                                      {label}
                                    </Button>
                                  ))}
                                </div>
                                {locked && (
                                  <p className="mt-2 text-xs text-gray-500">
                                    {answered ? 'Answer submitted — locked' : 'Poll closed'}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {feedbackQuestions.length > 0 && (
                        <div className="space-y-3">
                          {feedbackQuestions.map(question => {
                            const myAnswer = question.responses.find(
                              r => r.studentId === session?.user?.id
                            )?.answer
                            const answered = myAnswer !== undefined
                            const closed = (question as { status?: string }).status === 'closed'
                            return (
                              <div key={question.id} className="rounded-lg border bg-white p-4">
                                <p className="text-sm font-medium text-gray-900">
                                  {question.prompt}
                                </p>
                                {answered ? (
                                  // Your answer is locked once submitted.
                                  <div className="mt-3">
                                    <div className="rounded-md border bg-gray-50 p-2 text-sm text-gray-700">
                                      {myAnswer}
                                    </div>
                                    <p className="mt-1 text-xs text-gray-500">
                                      Answer submitted — locked
                                    </p>
                                  </div>
                                ) : closed ? (
                                  <p className="mt-3 text-xs text-gray-500">Question closed</p>
                                ) : (
                                  <div className="mt-3">
                                    <AutoTextarea
                                      placeholder="Type your answer..."
                                      className="min-h-[72px]"
                                      value={questionDrafts[question.id] || ''}
                                      onChange={event =>
                                        setQuestionDrafts(prev => ({
                                          ...prev,
                                          [question.id]: event.target.value,
                                        }))
                                      }
                                    />
                                    <div className="mt-2 flex justify-end">
                                      <Button
                                        size="sm"
                                        onClick={() => handleQuestionSend(question)}
                                        disabled={!questionDrafts[question.id]?.trim()}
                                      >
                                        Send
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {feedbackPolls.length === 0 && feedbackQuestions.length === 0 && (
                        <p className="text-sm text-gray-500">
                          Waiting for tutor insights to appear here.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <Sheet open={showDirectoryPanel} onOpenChange={setShowDirectoryPanel}>
            <SheetContent side="right" className="w-[340px] sm:w-[380px]">
              <SheetHeader>
                <SheetTitle>Directory</SheetTitle>
              </SheetHeader>
              <ScrollArea className="mt-4 h-[calc(100vh-140px)]">
                <div className="space-y-1">
                  {directoryLoading ? (
                    <div className="flex justify-center px-2 py-8">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                    </div>
                  ) : directoryError ? (
                    <div className="rounded-lg bg-red-50 px-2 py-4 text-center">
                      <p className="text-xs font-medium text-red-700">Failed to load directory</p>
                      <p className="mt-1 text-[11px] text-red-600">{directoryError}</p>
                    </div>
                  ) : Object.keys(studentDirectory).length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-slate-500">
                      No enrolled courses found.
                    </div>
                  ) : (
                    <>
                      {directoryWarnings.length > 0 && (
                        <div className="mb-2 rounded-md bg-amber-50 p-2">
                          <p className="text-[11px] font-medium text-amber-800">
                            Some items couldn&apos;t load:
                          </p>
                          {directoryWarnings.map((w, i) => (
                            <p key={i} className="text-[10px] text-amber-700">
                              {w}
                            </p>
                          ))}
                        </div>
                      )}
                      {Object.entries(studentDirectory).map(([tutorUsername, coursesDict]) => {
                        const tutorKey = `tutor_${tutorUsername}`
                        const isTutorOpen = foldersOpen[tutorKey]

                        return (
                          <div key={tutorUsername}>
                            <button
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
                              onClick={() =>
                                setFoldersOpen(prev => ({ ...prev, [tutorKey]: !prev[tutorKey] }))
                              }
                            >
                              {isTutorOpen ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                              )}
                              <Folder
                                className="h-4 w-4 shrink-0 text-slate-400"
                                fill="currentColor"
                              />
                              <span className="truncate text-sm font-medium text-slate-700">
                                {tutorUsername}
                              </span>
                            </button>

                            {isTutorOpen && (
                              <div className="mt-1 flex flex-col gap-1 pl-4">
                                {Object.entries(coursesDict).map(([courseName, courseData]) => {
                                  const catKey = `cat_${tutorUsername}_${courseName}`
                                  const isCatOpen = foldersOpen[catKey]
                                  // Lock every course except the live session's own course
                                  // while the session is running, so students can't open the
                                  // wrong folder/task/assessment mid-class.
                                  const courseLocked =
                                    isSessionLive &&
                                    (courseData as { courseId?: string }).courseId !==
                                      activeCourseId

                                  return (
                                    <div key={courseName}>
                                      <button
                                        disabled={courseLocked}
                                        title={
                                          courseLocked
                                            ? 'Locked during the live session — available when the session ends'
                                            : undefined
                                        }
                                        className={cn(
                                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5',
                                          courseLocked
                                            ? 'cursor-not-allowed opacity-40'
                                            : 'hover:bg-slate-100'
                                        )}
                                        onClick={() => {
                                          if (courseLocked) return
                                          setFoldersOpen(prev => ({
                                            ...prev,
                                            [catKey]: !prev[catKey],
                                          }))
                                        }}
                                      >
                                        {isCatOpen && !courseLocked ? (
                                          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                                        ) : (
                                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                                        )}
                                        <Folder
                                          className="h-4 w-4 shrink-0 text-indigo-400"
                                          fill="currentColor"
                                        />
                                        <span className="truncate text-sm font-medium text-slate-700">
                                          {courseName}
                                        </span>
                                        {courseLocked && (
                                          <Lock className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400" />
                                        )}
                                      </button>

                                      {isCatOpen && !courseLocked && (
                                        <div className="mt-1 flex flex-col gap-1 pl-4">
                                          {/* 1. Tasks */}
                                          <div>
                                            <button
                                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
                                              onClick={() =>
                                                setFoldersOpen(prev => ({
                                                  ...prev,
                                                  tasks: !prev.tasks,
                                                }))
                                              }
                                            >
                                              {foldersOpen.tasks ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                                              )}
                                              <Folder
                                                className="h-4 w-4 shrink-0 text-blue-400"
                                                fill="currentColor"
                                              />
                                              <span className="text-sm font-medium text-slate-700">
                                                Tasks
                                              </span>
                                              {unseenTaskIds.length > 0 && (
                                                <span className="ml-auto rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] text-white">
                                                  {unseenTaskIds.length}
                                                </span>
                                              )}
                                            </button>
                                            {foldersOpen.tasks && (
                                              <div className="mt-1 flex flex-col gap-0.5 pl-6">
                                                {(() => {
                                                  const { baseTasks, extMap } = groupTasksByParent(
                                                    courseData.tasks || []
                                                  )
                                                  if (baseTasks.length === 0) {
                                                    return (
                                                      <span className="px-2 py-1 text-xs text-slate-500">
                                                        Empty folder
                                                      </span>
                                                    )
                                                  }
                                                  return baseTasks
                                                    .slice()
                                                    .reverse()
                                                    .map(task => (
                                                      <Fragment key={task.id}>
                                                        <button
                                                          onClick={() =>
                                                            handleSelectDirectoryItem(task)
                                                          }
                                                          className={cn(
                                                            'group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                                                            activeTaskId ===
                                                              (task.itemId || task.id)
                                                              ? 'bg-blue-50 font-medium text-blue-700'
                                                              : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                                                          )}
                                                        >
                                                          <FileText className="h-3.5 w-3.5 shrink-0" />
                                                          <span className="truncate">
                                                            {task.title}
                                                          </span>
                                                          {unseenTaskIds.includes(
                                                            task.itemId || task.id
                                                          ) && (
                                                            <div className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                                                          )}
                                                        </button>
                                                        {extMap
                                                          .get(task.itemId || task.id)
                                                          ?.slice()
                                                          .reverse()
                                                          .map(ext => (
                                                            <button
                                                              key={ext.id}
                                                              onClick={() =>
                                                                handleSelectDirectoryItem(ext)
                                                              }
                                                              className={cn(
                                                                'group flex items-center gap-2 rounded-md py-1.5 pl-6 pr-2 text-left text-sm transition-colors',
                                                                activeTaskId ===
                                                                  (ext.itemId || ext.id)
                                                                  ? 'bg-blue-50 font-medium text-blue-700'
                                                                  : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                                                              )}
                                                            >
                                                              <FileText className="h-3.5 w-3.5 shrink-0" />
                                                              <span className="truncate">
                                                                {ext.title}
                                                              </span>
                                                              {unseenTaskIds.includes(
                                                                ext.itemId || ext.id
                                                              ) && (
                                                                <div className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                                                              )}
                                                            </button>
                                                          ))}
                                                      </Fragment>
                                                    ))
                                                })()}
                                              </div>
                                            )}
                                          </div>

                                          {/* 2. Assessments */}
                                          <div>
                                            <button
                                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
                                              onClick={() =>
                                                setFoldersOpen(prev => ({
                                                  ...prev,
                                                  assessments: !prev.assessments,
                                                }))
                                              }
                                            >
                                              {foldersOpen.assessments ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                                              )}
                                              <Folder
                                                className="h-4 w-4 shrink-0 text-purple-400"
                                                fill="currentColor"
                                              />
                                              <span className="text-sm font-medium text-slate-700">
                                                Assessments
                                              </span>
                                            </button>
                                            {foldersOpen.assessments && (
                                              <div className="mt-1 flex flex-col gap-0.5 pl-6">
                                                {(!courseData.assessments ||
                                                  courseData.assessments.length === 0) && (
                                                  <span className="px-2 py-1 text-xs text-slate-500">
                                                    Empty folder
                                                  </span>
                                                )}
                                                {courseData.assessments &&
                                                  [...courseData.assessments]
                                                    .reverse()
                                                    .map(task => (
                                                      <button
                                                        key={task.id}
                                                        onClick={() =>
                                                          handleSelectDirectoryItem(task)
                                                        }
                                                        className={cn(
                                                          'group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                                                          activeTaskId === (task.itemId || task.id)
                                                            ? 'bg-purple-50 font-medium text-purple-700'
                                                            : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                                                        )}
                                                      >
                                                        <FileText className="h-3.5 w-3.5 shrink-0 text-purple-400" />
                                                        <span className="truncate">
                                                          {task.title}
                                                        </span>
                                                      </button>
                                                    ))}
                                              </div>
                                            )}
                                          </div>

                                          {/* Materials — documents/resources the
                                              tutor deployed in a live session. */}
                                          <div>
                                            <button
                                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
                                              onClick={() =>
                                                setFoldersOpen(prev => ({
                                                  ...prev,
                                                  materials: !prev.materials,
                                                }))
                                              }
                                            >
                                              {foldersOpen.materials ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                                              )}
                                              <Folder
                                                className="h-4 w-4 shrink-0 text-amber-400"
                                                fill="currentColor"
                                              />
                                              <span className="text-sm font-medium text-slate-700">
                                                Materials
                                              </span>
                                            </button>
                                            {foldersOpen.materials && (
                                              <div className="mt-1 flex flex-col gap-0.5 pl-6">
                                                {(!courseData.materials ||
                                                  courseData.materials.length === 0) && (
                                                  <span className="px-2 py-1 text-xs text-slate-500">
                                                    Empty folder
                                                  </span>
                                                )}
                                                {courseData.materials &&
                                                  [...courseData.materials].reverse().map(task => (
                                                    <button
                                                      key={task.id}
                                                      onClick={() =>
                                                        handleSelectDirectoryItem(task)
                                                      }
                                                      className={cn(
                                                        'group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                                                        activeTaskId === (task.itemId || task.id)
                                                          ? 'bg-amber-50 font-medium text-amber-700'
                                                          : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                                                      )}
                                                    >
                                                      <FileText className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                                                      <span className="truncate">{task.title}</span>
                                                    </button>
                                                  ))}
                                              </div>
                                            )}
                                          </div>

                                          {/* 3. Homework */}
                                          <div>
                                            <button
                                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
                                              onClick={() => {
                                                setFoldersOpen(prev => ({
                                                  ...prev,
                                                  homework: !prev.homework,
                                                }))
                                                // Mark homework as seen when folder is opened
                                                setUnseenHomeworkIds([])
                                                const hwNotifIds = Array.from(
                                                  hwNotifMap.current.values()
                                                )
                                                if (hwNotifIds.length > 0) {
                                                  void markNotificationsRead(hwNotifIds)
                                                  hwNotifMap.current.clear()
                                                }
                                              }}
                                            >
                                              {foldersOpen.homework ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                                              )}
                                              <Folder
                                                className="h-4 w-4 shrink-0 text-emerald-400"
                                                fill="currentColor"
                                              />
                                              <span className="text-sm font-medium text-slate-700">
                                                Homework
                                              </span>
                                              {unseenHomeworkIds.length > 0 && (
                                                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">
                                                  {unseenHomeworkIds.length}
                                                </span>
                                              )}
                                            </button>
                                            {foldersOpen.homework && (
                                              <div className="mt-1 flex flex-col gap-0.5 pl-6">
                                                {(!courseData.homework ||
                                                  courseData.homework.length === 0) &&
                                                  liveHomework.length === 0 && (
                                                    <span className="px-2 py-1 text-xs text-slate-500">
                                                      Empty folder
                                                    </span>
                                                  )}
                                                {/* Directory homework */}
                                                {courseData.homework &&
                                                  [...courseData.homework].reverse().map(task => (
                                                    <button
                                                      key={task.id}
                                                      onClick={() =>
                                                        handleSelectDirectoryItem(task)
                                                      }
                                                      className={cn(
                                                        'group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                                                        activeTaskId === (task.itemId || task.id)
                                                          ? 'bg-emerald-50 font-medium text-emerald-700'
                                                          : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                                                      )}
                                                    >
                                                      <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                                      <span className="truncate">{task.title}</span>
                                                    </button>
                                                  ))}
                                                {/* Live homework from socket */}
                                                {liveHomework.map(hw => (
                                                  <button
                                                    key={hw.id}
                                                    onClick={() => handleSelectDirectoryItem(hw)}
                                                    className={cn(
                                                      'group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                                                      activeTaskId === hw.id
                                                        ? 'bg-emerald-50 font-medium text-emerald-700'
                                                        : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                                                    )}
                                                  >
                                                    <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                                    <span className="truncate">{hw.title}</span>
                                                    {unseenHomeworkIds.includes(hw.id) && (
                                                      <div className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                                    )}
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </div>

                                          {/* 4. Reports */}
                                          <div>
                                            <button
                                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
                                              onClick={() =>
                                                setFoldersOpen(prev => ({
                                                  ...prev,
                                                  reports: !prev.reports,
                                                }))
                                              }
                                            >
                                              {foldersOpen.reports ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                                              )}
                                              <Folder
                                                className="h-4 w-4 shrink-0 text-orange-400"
                                                fill="currentColor"
                                              />
                                              <span className="text-sm font-medium text-slate-700">
                                                Reports
                                              </span>
                                            </button>
                                            {foldersOpen.reports && (
                                              <div className="mt-1 flex flex-col gap-0.5 pl-6">
                                                {(!courseData.reports ||
                                                  courseData.reports.length === 0) && (
                                                  <div className="flex flex-col gap-2 px-2 py-2">
                                                    <span className="text-xs text-slate-500">
                                                      No reports yet.
                                                    </span>
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      className="h-7 w-full justify-start text-xs"
                                                      onClick={async () => {
                                                        const cId =
                                                          sessionContext?.courseId ||
                                                          searchParams?.get('courseId') ||
                                                          courseData.tasks?.[0]?.courseId ||
                                                          courseData.recordedSessions?.[0]?.courseId
                                                        if (!cId) {
                                                          toast.error(
                                                            'Could not determine course. Please try again.'
                                                          )
                                                          return
                                                        }
                                                        try {
                                                          const res = await fetch(
                                                            '/api/student/reports/request',
                                                            {
                                                              method: 'POST',
                                                              headers: {
                                                                'Content-Type': 'application/json',
                                                              },
                                                              body: JSON.stringify({
                                                                courseId: cId,
                                                                type: 'master',
                                                              }),
                                                            }
                                                          )
                                                          if (res.ok)
                                                            toast.success(
                                                              'Report request sent to tutor'
                                                            )
                                                          else
                                                            toast.error('Failed to request report')
                                                        } catch (e) {
                                                          toast.error('An error occurred')
                                                        }
                                                      }}
                                                    >
                                                      Request Report
                                                    </Button>
                                                  </div>
                                                )}
                                                {courseData.reports &&
                                                  [...courseData.reports]
                                                    .reverse()
                                                    .map(
                                                      (report: {
                                                        id: string
                                                        title?: string
                                                        status?: string
                                                        score?: number
                                                        content?: any
                                                        createdAt?: string
                                                      }) => (
                                                        <button
                                                          key={report.id}
                                                          onClick={() => {
                                                            setSelectedReport(report)
                                                            setReportModalOpen(true)
                                                          }}
                                                          className="flex w-full items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-100"
                                                        >
                                                          <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                          <span className="truncate text-xs font-medium text-slate-600">
                                                            {report.title}
                                                          </span>
                                                        </button>
                                                      )
                                                    )}
                                              </div>
                                            )}
                                          </div>

                                          {/* 5. Recorded Sessions */}
                                          <div>
                                            <button
                                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
                                              onClick={() =>
                                                setFoldersOpen(prev => ({
                                                  ...prev,
                                                  recordedSessions: !prev.recordedSessions,
                                                }))
                                              }
                                            >
                                              {foldersOpen.recordedSessions ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                                              )}
                                              <Folder
                                                className="h-4 w-4 shrink-0 text-rose-400"
                                                fill="currentColor"
                                              />
                                              <span className="text-sm font-medium text-slate-700">
                                                Recorded sessions
                                              </span>
                                            </button>
                                            {foldersOpen.recordedSessions && (
                                              <div className="mt-1 flex flex-col gap-0.5 pl-6">
                                                {(!courseData.recordedSessions ||
                                                  courseData.recordedSessions.length === 0) && (
                                                  <span className="px-2 py-1 text-xs text-slate-500">
                                                    Empty folder
                                                  </span>
                                                )}
                                                {courseData.recordedSessions &&
                                                  [...courseData.recordedSessions]
                                                    .reverse()
                                                    .map(session => (
                                                      <button
                                                        key={session.id}
                                                        onClick={() =>
                                                          handleSelectDirectoryItem(session)
                                                        }
                                                        className={cn(
                                                          'group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                                                          activeTaskId ===
                                                            (session.itemId || session.id)
                                                            ? 'bg-rose-50 font-medium text-rose-700'
                                                            : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                                                        )}
                                                      >
                                                        <Video className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                                                        <span className="truncate">
                                                          {session.title}
                                                        </span>
                                                      </button>
                                                    ))}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </>
                  )}
                  {/* Legacy Assets Mapping - Fallback to Course Category root for now */}
                  {courseAssets.length > 0 && (
                    <div className="mt-4 flex flex-col gap-0.5">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Shared Assets
                      </div>
                      {assetsLoading ? (
                        <span className="flex items-center gap-2 px-2 py-1 text-xs text-slate-500">
                          <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                        </span>
                      ) : (
                        courseAssets.map(asset => (
                          <a
                            key={asset.resourceId}
                            href={asset.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                            title={asset.name}
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">{asset.name}</span>
                          </a>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>

          {/* Report Modal */}
          <Dialog open={reportModalOpen} onOpenChange={setReportModalOpen}>
            <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-indigo-600" />
                  {selectedReport?.title}
                </DialogTitle>
                <DialogDescription>
                  Sent on{' '}
                  {selectedReport?.deployedAt
                    ? new Date(selectedReport.deployedAt).toLocaleDateString()
                    : 'Unknown date'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                {selectedReport?.content?.strengths &&
                  selectedReport.content.strengths.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-green-700">
                        Strengths
                      </h4>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                        {selectedReport.content.strengths.map((s: string, i: number) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                {selectedReport?.content?.weaknesses &&
                  selectedReport.content.weaknesses.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-amber-700">
                        Areas for Improvement
                      </h4>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                        {selectedReport.content.weaknesses.map((s: string, i: number) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                {selectedReport?.content?.overallComments && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-indigo-700">
                      Tutor Comments
                    </h4>
                    <div className="rounded-lg bg-indigo-50 p-4 text-sm text-gray-800">
                      {selectedReport.content.overallComments}
                    </div>
                  </div>
                )}

                {selectedReport?.content?.score !== undefined &&
                  selectedReport.content.score !== null && (
                    <div className="flex items-center justify-between border-t pt-4">
                      <span className="font-semibold text-gray-700">Overall Score</span>
                      <span className="text-xl font-bold text-indigo-600">
                        {selectedReport.content.score}%
                      </span>
                    </div>
                  )}
              </div>
              <div className="flex justify-end px-0 pb-0 pt-2">
                <Button variant="outline" onClick={() => setReportModalOpen(false)}>
                  Close
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  )
}
