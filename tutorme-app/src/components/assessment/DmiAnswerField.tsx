'use client'

import { useState, useMemo, useRef, useLayoutEffect, useCallback } from 'react'
import { DrawingPad } from '@/components/answer/DrawingPad'
import { MathText } from '@/components/answer/MathText'
import { cn, resolvePublicUrl } from '@/lib/utils'
import { toast } from 'sonner'
import { normalizeDmiQuestionType, type DmiQuestionType } from '@/lib/assessment/question-types'
import { Loader2, NotebookPen, ChevronUp, ChevronDown, X } from 'lucide-react'
import type { DMIQuestion } from '@/app/[locale]/tutor/dashboard/components/builder-types'
import {
  parseWrittenAnswer,
  serializeWrittenAnswer,
  type WrittenAnswerValue,
} from '@/lib/paste/answer-attachments'
import { handleRichPaste, uploadPastedImage } from '@/lib/paste/rich-paste'

/**
 * Minimal item shape needed to render a DMI answer input. It deliberately omits
 * the tutor-only answer key / rubric so the same component can be reused for the
 * student classroom and the tutor's Assessment preview tab.
 */
export interface DmiAnswerFieldItem {
  id: string
  questionNumber: number
  questionLabel?: string
  questionText: string
  marks?: number
  questionType?: DmiQuestionType
  options?: string[]
  hotspotImageUrl?: string
  /** Left-side prompts for matching / drag_drop. */
  matchPrompts?: string[]
  /** Right-side bank for matching / drag_drop. */
  matchBank?: string[]
  section?: string
  /** Maximum word count for textual responses; omitted for non-text types. */
  wordLimit?: number | null
}

function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: NonNullable<WrittenAnswerValue['attachments']>[number]
  onRemove: () => void
}) {
  return (
    <div className="relative inline-block rounded-md border border-gray-200 bg-white p-2 align-top">
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 rounded-full border border-gray-200 bg-white p-1 text-gray-500 shadow-sm hover:text-gray-700"
        aria-label="Remove attachment"
      >
        <X className="h-3 w-3" />
      </button>
      {attachment.type === 'image' && attachment.url && (
        <img
          src={attachment.url}
          alt={attachment.alt || 'Pasted image'}
          className="max-h-40 max-w-full rounded"
        />
      )}
      {attachment.type === 'table' && attachment.content && (
        <div
          className="max-w-xs overflow-auto sm:max-w-sm md:max-w-md"
          dangerouslySetInnerHTML={{ __html: attachment.content }}
        />
      )}
      {attachment.type === 'formula' && attachment.content && (
        <div dangerouslySetInnerHTML={{ __html: attachment.content }} />
      )}
    </div>
  )
}

function WrittenAnswer({
  value,
  onValueChange,
  onInteract,
  multiline,
  placeholder,
  baseField,
  wordLimit,
}: {
  value: string
  onValueChange: (next: string) => void
  onInteract: () => void
  multiline: boolean
  placeholder: string
  baseField: string
  wordLimit?: number | null
}) {
  const parsed = parseWrittenAnswer(value)
  const { text, converted, drawing } = parsed
  const attachments = parsed.attachments ?? []
  const [showDraw, setShowDraw] = useState(!!drawing || !!converted)
  const [converting, setConverting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const valueRef = useRef(value)

  useLayoutEffect(() => {
    valueRef.current = value
  }, [value])

  const setValue = useCallback(
    (
      patchOrFn:
        | Partial<WrittenAnswerValue>
        | ((current: WrittenAnswerValue) => Partial<WrittenAnswerValue>)
    ) => {
      const current = parseWrittenAnswer(valueRef.current)
      const patch = typeof patchOrFn === 'function' ? patchOrFn(current) : patchOrFn
      onInteract()
      onValueChange(serializeWrittenAnswer({ ...current, ...patch }))
    },
    [onInteract, onValueChange]
  )

  const wordCount = useMemo(() => {
    if (!text.trim()) return 0
    return text.trim().split(/\s+/).length
  }, [text])

  // Auto-grow the textarea to fit content without a scrollbar.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

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
      setValue({ converted: newText })
      toast.success('Handwriting converted — see the preview below.')
    } catch {
      toast.error('Failed to convert handwriting')
    } finally {
      setConverting(false)
    }
  }

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const handled = await handleRichPaste(e, {
        onImage: async file => {
          try {
            const url = await uploadPastedImage(file)
            setValue(current => ({
              attachments: [...(current.attachments ?? []), { type: 'image', url, alt: file.name }],
            }))
            toast.success('Image attached.')
          } catch {
            toast.error('Failed to upload pasted image.')
          }
        },
        onTable: html => {
          setValue(current => ({
            attachments: [...(current.attachments ?? []), { type: 'table', content: html }],
          }))
        },
        onFormula: svg => {
          setValue(current => ({
            attachments: [...(current.attachments ?? []), { type: 'formula', content: svg }],
          }))
        },
      })
      if (!handled) {
        // Let the browser perform its default plain-text paste.
        return
      }
    },
    [setValue]
  )

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={text}
          onFocus={onInteract}
          onChange={e => setValue({ text: e.target.value })}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={multiline ? 4 : 2}
          className={cn(
            'block w-full resize-none overflow-hidden',
            multiline ? 'min-h-[96px]' : 'min-h-[56px]',
            baseField
          )}
        />
        <span
          className={cn(
            'absolute bottom-1.5 right-2 text-[10px] font-medium tabular-nums',
            wordLimit && wordCount > wordLimit
              ? 'text-red-500'
              : wordLimit && wordCount >= wordLimit * 0.9
                ? 'text-amber-500'
                : 'text-gray-400'
          )}
        >
          {wordCount}
          {typeof wordLimit === 'number' ? ` / ${wordLimit}` : ''} words
        </span>
      </div>

      {converted && (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              Converted handwriting · preview
            </span>
            <button
              type="button"
              onClick={() => setValue({ converted: '' })}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
          <MathText text={converted} className="text-sm text-gray-900" />
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment, idx) => (
            <AttachmentPreview
              key={`${attachment.type}-${idx}`}
              attachment={attachment}
              onRemove={() =>
                setValue({
                  attachments: attachments.filter((_, i) => i !== idx),
                })
              }
            />
          ))}
        </div>
      )}

      {showDraw ? (
        <div className="space-y-1.5">
          <DrawingPad
            value={drawing || undefined}
            onChange={d => setValue({ drawing: d })}
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
          <NotebookPen className="h-3.5 w-3.5" />
          Write or draw
        </button>
      )}
    </div>
  )
}

export function DmiAnswerField({
  item,
  value,
  onValueChange,
  onInteract,
}: {
  item: DmiAnswerFieldItem
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
  const [dragSelected, setDragSelected] = useState<string | null>(null)

  if (type === 'mcq' && options.length > 0) {
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((_opt, i) => {
          const letter = String.fromCharCode(65 + i)
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

  if (type === 'short' || type === 'fill_blank') {
    return (
      <WrittenAnswer
        value={value}
        onValueChange={onValueChange}
        onInteract={onInteract}
        multiline={false}
        placeholder={type === 'fill_blank' ? 'Fill in the blank…' : 'Type your answer…'}
        baseField={baseField}
        wordLimit={item.wordLimit}
      />
    )
  }

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

  if (type === 'ordering' && options.length > 0) {
    let saved: string[] = []
    try {
      const parsed = value ? JSON.parse(value) : []
      if (Array.isArray(parsed)) saved = parsed.filter((v): v is string => typeof v === 'string')
    } catch {
      saved = []
    }
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

  return (
    <WrittenAnswer
      value={value}
      onValueChange={onValueChange}
      onInteract={onInteract}
      multiline
      placeholder="Type your answer…"
      baseField={baseField}
      wordLimit={item.wordLimit}
    />
  )
}

/**
 * Convert a builder DMIQuestion into the shape DmiAnswerField expects.
 * For matching / drag_drop the builder stores `pairs`, while the answer field uses
 * `matchPrompts` / `matchBank`.
 */
export function builderDmiToAnswerFieldItem(item: DMIQuestion): DmiAnswerFieldItem {
  const matchPrompts =
    item.questionType === 'matching' || item.questionType === 'drag_drop'
      ? (item.pairs?.map(p => p.left) ?? [])
      : undefined
  const matchBank =
    item.questionType === 'matching' || item.questionType === 'drag_drop'
      ? Array.from(new Set(item.pairs?.map(p => p.right) ?? []))
      : undefined

  return {
    id: item.id,
    questionNumber: item.questionNumber,
    questionLabel: item.questionLabel,
    questionText: item.questionText,
    marks: item.marks,
    questionType: item.questionType,
    options: item.options,
    hotspotImageUrl: item.hotspotImageUrl,
    matchPrompts,
    matchBank,
    section: item.section,
    wordLimit: item.wordLimit,
  }
}
