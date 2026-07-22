'use client'

/**
 * PciQuestionnaire — a guided, structured way to author a marking policy (PCI).
 *
 * Renders the fixed PciSpec fields as editable rows, can AI-prefill them from
 * the paper/context (the tutor reviews & edits), and saves the result as the
 * PCI. It writes the same free-text PCI the grader consumes (via pciSpecToText)
 * plus the structured spec, so it complements the chat rather than replacing it.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { HelpCircle, Loader2, Sparkles, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { PCI_SPEC_FIELDS, pciSpecToText, type PciSpec } from '@/lib/assessment/pci-spec'
import { EXAM_BOARDS } from '@/lib/assessment/marking-scheme'
import { cn } from '@/lib/utils'

/**
 * Per-field help: a plain-language explanation plus a set of ready-to-use
 * examples the tutor can drop straight into the box. `placeholder` is a single
 * concrete example shown inside the empty field ("fill with examples").
 */
const FIELD_HELP: Record<
  keyof PciSpec,
  { explain: string; examples: string[]; placeholder: string }
> = {
  instructionalContentReference: {
    explain:
      'Which lesson content or material this policy is about — so the AI knows what it is marking against.',
    examples: [
      'Chapter 3: Quadratic equations — worksheet Q1–Q10',
      'The photosynthesis diagram on slide 12',
      'Unit 2 vocabulary list (weeks 3–4)',
      'Reading comprehension passage: "The Gift of the Magi"',
    ],
    placeholder: 'e.g. Chapter 3: Quadratic equations — worksheet Q1–Q10',
  },
  triggerEvent: {
    explain: 'What moment this policy kicks in — the event the AI should react to.',
    examples: [
      'When the student submits an answer',
      'When the student asks for a hint',
      'After the student’s second incorrect attempt',
      'When the student shows their working',
    ],
    placeholder: 'e.g. When the student submits an answer',
  },
  evaluationLogic: {
    explain: 'How answers should be judged — the marking logic. This is the heart of the policy.',
    examples: [
      'Award method marks even if the final answer is wrong.',
      'Accept any value within ±0.1 and equivalent fractions.',
      'Require correct units — deduct 1 mark if missing.',
      'Mark against the IB mark scheme; one mark per valid point, max 4.',
      'Accept synonyms and correct spelling variants.',
    ],
    placeholder: 'e.g. Award method marks even if the final answer is wrong',
  },
  correctResponseBehavior: {
    explain: 'What the AI should do when the student gets it right.',
    examples: [
      'Confirm briefly and move to the next question.',
      'Praise, then ask a short follow-up to check depth.',
      'Mark it correct and reveal the model answer.',
    ],
    placeholder: 'e.g. Confirm briefly and move to the next question',
  },
  incorrectResponseBehavior: {
    explain: 'What the AI should do on a wrong answer — hint and let them retry, or reveal.',
    examples: [
      'Give a hint pointing at the first wrong step; don’t reveal the answer.',
      'Ask a guiding question, then let them retry.',
      'Explain the misconception, then show the correct method.',
    ],
    placeholder: 'e.g. Give a hint about the first wrong step; don’t reveal the answer',
  },
  partialUnderstandingBehavior: {
    explain: 'How to handle answers that are partly right — your partial-credit policy.',
    examples: [
      'Award marks for each correct step reached.',
      'Acknowledge what’s right, then probe the missing part.',
      'Give half marks if the method is right but the arithmetic is wrong.',
    ],
    placeholder: 'e.g. Award marks for each correct step; probe the missing part',
  },
  noResponseBehavior: {
    explain: 'What to do when the student leaves it blank or says “I don’t know”.',
    examples: [
      'Offer a starting hint if left blank; never mark blank as simply wrong.',
      'Ask a simpler lead-in question to get them started.',
      'Encourage an attempt before giving any help.',
    ],
    placeholder: 'e.g. Offer a starting hint if left blank',
  },
  explanationRules: {
    explain: 'Whether and how the AI should explain its reasoning to the student.',
    examples: [
      'Explain step by step after an attempt, no more than 3 sentences.',
      'Only explain once the student has tried it themselves.',
      'Use the same method taught in the lesson, not shortcuts.',
    ],
    placeholder: 'e.g. Explain step by step after an attempt, max 3 sentences',
  },
  retryPolicy: {
    explain: 'How many attempts the student gets before the answer is revealed.',
    examples: [
      'Allow up to 2 retries before revealing the answer.',
      'Unlimited retries, with a new hint each time.',
      'One retry, then move on.',
    ],
    placeholder: 'e.g. Allow up to 2 retries before revealing the answer',
  },
  answerRevealPolicy: {
    explain: 'When (or whether) the correct answer is shown to the student.',
    examples: [
      'Reveal the answer only after the final attempt.',
      'Never reveal the answer — keep giving hints.',
      'Show the model answer once they get it right.',
      'Reveal after 2 incorrect attempts, then explain why.',
    ],
    placeholder: 'e.g. Reveal the answer only after the final attempt',
  },
  instructionalTone: {
    explain: 'The voice and manner the AI should use with the student.',
    examples: [
      'Encouraging and patient.',
      'Concise and businesslike.',
      'Warm — use the student’s name and celebrate progress.',
    ],
    placeholder: 'e.g. Encouraging and patient',
  },
}

/**
 * A help affordance shown next to a field label. Opens its explanation + example
 * list on click, or when the cursor rests on it for 2 seconds. Clicking an
 * example drops it straight into the field.
 */
function FieldHelp({
  explain,
  examples,
  disabled,
  onUse,
}: {
  explain: string
  examples: string[]
  disabled: boolean
  onUse: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
  }
  useEffect(() => () => clearTimer(), [])

  return (
    <span
      className="relative inline-flex shrink-0"
      onMouseEnter={() => {
        clearTimer()
        // Reveal after the cursor rests on the icon for 2 seconds.
        hoverTimer.current = setTimeout(() => setOpen(true), 2000)
      }}
      onMouseLeave={() => {
        clearTimer()
        setOpen(false)
      }}
    >
      <button
        type="button"
        aria-label="Help and examples for this field"
        aria-expanded={open}
        onClick={() => {
          clearTimer()
          setOpen(o => !o)
        }}
        className="text-slate-600 transition-colors hover:text-indigo-600"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border border-slate-200 bg-white p-2.5 text-[11px] shadow-lg">
          <p className="mb-1.5 leading-snug text-slate-600">{explain}</p>
          <p className="mb-1 font-semibold text-slate-500">
            {disabled ? 'Examples:' : 'Examples (click one to use it):'}
          </p>
          <ul className="space-y-1">
            {examples.map((ex, i) => (
              <li key={i}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onUse(ex)
                    setOpen(false)
                  }}
                  className="w-full rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-left leading-snug text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-slate-50"
                >
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  )
}

/** A per-question digest of the official marking scheme (DMI) — the policy-
 *  bearing bits only (no answers), used to inform the AI prefill. */
export interface MarkingSchemeDigestRow {
  label?: string
  marks?: number
  rubric?: string
  responseType?: string
  hasVariants?: boolean
}

interface PciQuestionnaireProps {
  source: 'task' | 'assessment'
  title?: string
  content?: string
  currentPci?: string
  /** Distilled marking scheme from the "Edit marks & answers" modal, if any. */
  markingScheme?: MarkingSchemeDigestRow[]
  /** Upload a marking-scheme file — populates the DMI (marks & answers) exactly
   *  as the "Edit marks & answers" modal does. When provided, the Guided form
   *  shows an upload control and auto-prefills the PCI once the DMI is filled. */
  onUploadMarkingScheme?: (file: File) => Promise<void>
  markingSchemeLoading?: boolean
  /** Board & Subject (Model A: category is the source of truth, shared with
   *  Course details). Subject is a course category from the catalog; Board is
   *  the examBody, auto-derived from the subject but overridable. */
  board?: string
  subject?: string
  categoryOptions?: string[]
  onExamContextChange?: (patch: { category?: string; board?: string }) => void
  canEdit: boolean
  onSave: (specText: string, spec: PciSpec) => void
  onClose: () => void
}

export function PciQuestionnaire({
  source,
  title,
  content,
  currentPci,
  markingScheme,
  onUploadMarkingScheme,
  markingSchemeLoading,
  board,
  subject,
  categoryOptions,
  onExamContextChange,
  canEdit,
  onSave,
  onClose,
}: PciQuestionnaireProps) {
  const [spec, setSpec] = useState<PciSpec>({})
  const [prefilling, setPrefilling] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // Set right after an upload so the auto-prefill fires once the DMI (and thus
  // the markingScheme prop) has repopulated from the parsed scheme.
  const [awaitingSchemePrefill, setAwaitingSchemePrefill] = useState(false)

  const setField = (key: keyof PciSpec, value: string) =>
    setSpec(prev => {
      const next = { ...prev }
      if (value.trim()) next[key] = value
      else delete next[key]
      return next
    })

  const prefill = useCallback(async () => {
    setPrefilling(true)
    try {
      const res = await fetch('/api/ai/pci-spec-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: source,
          title,
          content,
          pci: currentPci,
          markingScheme: markingScheme?.length ? markingScheme : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Could not prefill from the paper')
        return
      }
      const suggested = (data?.spec ?? {}) as PciSpec
      // Merge suggestions over anything the tutor already typed, but never blank
      // out a field they filled that the model omitted.
      setSpec(prev => ({ ...prev, ...suggested }))
      const count = Object.keys(suggested).length
      toast.success(
        count > 0 ? `Prefilled ${count} field${count === 1 ? '' : 's'}` : 'Nothing to prefill yet'
      )
    } catch {
      toast.error('Could not reach the AI. Please try again.')
    } finally {
      setPrefilling(false)
    }
  }, [source, title, content, currentPci, markingScheme])

  // After an upload, the parent repopulates the DMI → the markingScheme prop
  // grows → auto-prefill the PCI from the freshly-parsed scheme.
  useEffect(() => {
    if (awaitingSchemePrefill && (markingScheme?.length ?? 0) > 0) {
      setAwaitingSchemePrefill(false)
      void prefill()
    }
  }, [awaitingSchemePrefill, markingScheme, prefill])

  const handleUpload = async (file: File) => {
    if (!onUploadMarkingScheme) return
    try {
      await onUploadMarkingScheme(file)
      // Fill the DMI first, then let the effect prefill the PCI from it.
      setAwaitingSchemePrefill(true)
    } catch {
      // The upload hook surfaces its own errors.
    }
  }

  const handleSave = () => {
    const text = pciSpecToText(spec)
    if (!text.trim()) {
      toast.error('Fill at least one field before saving')
      return
    }
    onSave(text, spec)
  }

  const filledCount = Object.keys(spec).length

  return (
    <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-indigo-900">Guided marking policy</span>
        <div className="flex items-center gap-2">
          {canEdit && onUploadMarkingScheme && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf,text/plain,.txt"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) void handleUpload(file)
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={markingSchemeLoading || prefilling}
                className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-60"
                title="Upload a marking scheme — fills marks & answers, then the policy"
              >
                {markingSchemeLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                Upload marking scheme
              </button>
            </>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => prefill()}
              disabled={prefilling}
              className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-60"
            >
              {prefilling ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {markingScheme?.length ? 'Prefill from marking scheme' : 'Prefill from paper'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-medium text-slate-500 hover:text-slate-700"
          >
            Close
          </button>
        </div>
      </div>

      <p className="mb-2 text-[11px] leading-snug text-slate-500">
        Policy only — keep answers, marks, and per-question rubric in the{' '}
        {source === 'assessment' ? 'marking scheme' : 'policy'}. Leave anything you don&rsquo;t want
        to specify blank.
        {markingScheme?.length ? (
          <>
            {' '}
            Prefill reads your loaded marking scheme ({markingScheme.length} question
            {markingScheme.length === 1 ? '' : 's'}) and distils its award conventions into policy.
          </>
        ) : onUploadMarkingScheme ? (
          <>
            {' '}
            Have the official marking scheme? <span className="font-medium">Upload</span> it — it
            fills the marks &amp; answers, then prefills this policy automatically.
          </>
        ) : null}
      </p>

      {onExamContextChange && (
        <div
          className={cn(
            'mb-3 grid gap-2 rounded-md border border-slate-200 bg-white/70 p-2',
            // Board (AP, IB, SAT…) applies to assessments only; tasks show subject alone.
            source === 'assessment' ? 'grid-cols-2' : 'grid-cols-1'
          )}
        >
          {source === 'assessment' && (
            <div>
              <label
                htmlFor={`pci-board-${source}`}
                className="block text-[11px] font-medium text-slate-700"
              >
                Board
              </label>
              <select
                id={`pci-board-${source}`}
                value={board ?? ''}
                disabled={!canEdit}
                onChange={e => onExamContextChange({ board: e.target.value })}
                className="mt-0.5 w-full rounded-md border border-gray-300 p-1.5 text-[11px] text-gray-900"
              >
                <option value="">—</option>
                {EXAM_BOARDS.map(b => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label
              htmlFor={`pci-subject-${source}`}
              className="block text-[11px] font-medium text-slate-700"
            >
              Subject / category
            </label>
            <input
              id={`pci-subject-${source}`}
              list={`pci-subject-list-${source}`}
              value={subject ?? ''}
              disabled={!canEdit}
              onChange={e => onExamContextChange({ category: e.target.value })}
              placeholder="Search the catalog…"
              className="mt-0.5 w-full rounded-md border border-gray-300 p-1.5 text-[11px] text-gray-900"
            />
            <datalist id={`pci-subject-list-${source}`}>
              {(categoryOptions ?? []).map(c => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <p className="col-span-2 text-[10px] leading-snug text-slate-600">
            Shared with Course details — set it here for a new course, or it shows the published
            course&rsquo;s category. Board auto-fills from the subject; override if needed.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {PCI_SPEC_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <div className="flex items-center justify-between gap-1">
              <label
                htmlFor={`pci-field-${source}-${key}`}
                className="block text-[11px] font-medium text-slate-700"
              >
                {label}
              </label>
              <FieldHelp
                explain={FIELD_HELP[key].explain}
                examples={FIELD_HELP[key].examples}
                disabled={!canEdit}
                onUse={value => setField(key, value)}
              />
            </div>
            <textarea
              id={`pci-field-${source}-${key}`}
              value={spec[key] ?? ''}
              readOnly={!canEdit}
              onChange={e => setField(key, e.target.value)}
              placeholder={FIELD_HELP[key].placeholder}
              rows={1}
              className="mt-0.5 min-h-[32px] w-full resize-y rounded-md border border-gray-300 p-1.5 text-[11px] text-gray-900 placeholder:text-slate-500"
            />
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500">
            {filledCount} field{filledCount === 1 ? '' : 's'} set
          </span>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Save to PCI
          </button>
        </div>
      )}
    </div>
  )
}
