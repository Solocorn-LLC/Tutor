'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Compass, X, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface Step {
  title: string
  body: string
  /** Optional example bullets shown under the body. */
  bullets?: string[]
  /** data-pci-anchor value of the control this step points at, for the spotlight
   *  highlight. Resolved within the nearest [data-pci-container]. */
  anchor?: string
}

/**
 * Steps for a TASK (no DMI — purely a marking policy) vs an ASSESSMENT (marking
 * policy PLUS an answer key built from the DMI / an uploaded marking scheme).
 * Deliberately avoids any "Apply to PCI" button — the reliable save path is the
 * "Current marking policy → Edit" box.
 */
function buildSteps(kind: 'task' | 'assessment'): Step[] {
  const noun = kind === 'assessment' ? 'assessment' : 'task'
  const shared: Step[] = [
    {
      title: 'What PCI is',
      body: `PCI is your marking instruction for this ${noun} — how you want answers marked, not the questions themselves. It guides the AI's grading suggestions.`,
    },
    {
      title: "You're on the PCI tab",
      body: `Everything for marking this ${noun} lives here (the Brain icon). No PCI means the AI has no marking policy to follow.`,
    },
    {
      title: 'Skim the quick tip',
      body: 'Open “What is PCI & what to ask” at the top of this tab for examples of the kinds of rules worth setting.',
      anchor: 'guidance',
    },
    {
      title: 'Chat your marking rules',
      body: 'Use the assistant box at the bottom (“Ask the PCI assistant…”). Tell it, in plain words, how answers should be marked. For example:',
      anchor: 'chat-input',
      bullets: [
        'Award method marks even if the final answer is wrong.',
        'Accept any value within ±0.1, and equivalent fractions.',
        'Require correct units — deduct 1 mark if missing.',
        'Mark to IB / AP / Cambridge mark schemes.',
        'One mark per valid point, maximum 4.',
      ],
    },
    {
      title: 'Review the rubric',
      body: 'The assistant replies with a finalized rubric. Read it, and keep chatting to refine it until it matches how you mark.',
      anchor: 'chat-input',
    },
    {
      title: 'Save it as your marking policy',
      body: 'In “Current marking policy (PCI)”, click Edit, paste or refine the rubric, then Done. That saved text is exactly what the AI grader uses.',
      anchor: 'edit-pci',
    },
  ]

  if (kind === 'task') {
    return [
      ...shared,
      {
        title: "You're set",
        body: 'This PCI now guides AI grading for this task. Tasks don’t need an answer key — the policy is enough. Repeat for each lesson’s task.',
      },
    ]
  }

  return [
    ...shared,
    {
      title: 'Build the answer key (DMI)',
      body: 'Assessments also need an answer key. On the assessment content, click Generate DMI to extract the questions and answers.',
      anchor: 'generate-dmi',
    },
    {
      title: 'Verify marks & answers',
      body: 'Open “Edit marks & answers” to check each question’s marks and correct answers before it goes live.',
      anchor: 'edit-marks',
    },
    {
      title: 'Optional: upload a marking scheme',
      body: 'In that editor, use “Upload marking scheme” to auto-fill every answer from your marking-scheme PDF.',
    },
    {
      title: "You're set",
      body: 'PCI (the policy) and the DMI (the answer key) together drive grading. Repeat for each assessment.',
    },
  ]
}

/**
 * A collapsible floating guide that walks a tutor through building the PCI for
 * the current task/assessment, first step to last. Collapsed state is
 * remembered (localStorage) so it's available in every lesson without nagging.
 */
export function PciWalkthrough({ kind }: { kind: 'task' | 'assessment' }) {
  const steps = useMemo(() => buildSteps(kind), [kind])
  const storageKey = 'pci-walkthrough:collapsed'

  const [collapsed, setCollapsed] = useState(false)
  const [step, setStep] = useState(0)
  const [hydrated, setHydrated] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)

  // Restore the tutor's collapse preference on mount (default: expanded the
  // first time so they discover it). Avoids an SSR/client mismatch by only
  // reading after mount.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(storageKey) === '1')
    } catch {
      /* ignore */
    }
    setHydrated(true)
  }, [])

  const persistCollapsed = (next: boolean) => {
    setCollapsed(next)
    try {
      localStorage.setItem(storageKey, next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  // Clamp the step if the step set changes (task ↔ assessment).
  useEffect(() => {
    setStep(s => Math.min(s, steps.length - 1))
  }, [steps.length])

  // Spotlight: outline the control the current step points at (resolved within
  // this PCI container so task/assessment anchors never cross) and scroll it into
  // view. Uses outline (not border/ring) so it never shifts layout. Restores the
  // element's prior inline styles on step change / collapse / unmount.
  useEffect(() => {
    if (collapsed) return
    const anchor = steps[step]?.anchor
    if (!anchor) return
    const container = cardRef.current?.closest('[data-pci-container]')
    const el = container?.querySelector<HTMLElement>(`[data-pci-anchor="${anchor}"]`)
    if (!el) return

    const prev = {
      outline: el.style.outline,
      outlineOffset: el.style.outlineOffset,
      borderRadius: el.style.borderRadius,
      boxShadow: el.style.boxShadow,
      transition: el.style.transition,
    }
    el.style.transition = 'box-shadow 200ms ease'
    el.style.outline = '2px solid #2563eb'
    el.style.outlineOffset = '3px'
    if (!el.style.borderRadius) el.style.borderRadius = '10px'
    el.style.boxShadow = '0 0 0 6px rgba(37, 99, 235, 0.12)'
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })

    return () => {
      el.style.outline = prev.outline
      el.style.outlineOffset = prev.outlineOffset
      el.style.borderRadius = prev.borderRadius
      el.style.boxShadow = prev.boxShadow
      el.style.transition = prev.transition
    }
  }, [step, collapsed, steps])

  if (!hydrated) return null

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => persistCollapsed(false)}
        className="absolute bottom-4 left-4 z-30 inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-lg transition-colors hover:bg-blue-50"
        title="Open the PCI walkthrough"
      >
        <Compass className="h-3.5 w-3.5" />
        PCI guide
      </button>
    )
  }

  const current = steps[step]
  const isFirst = step === 0
  const isLast = step === steps.length - 1

  return (
    <div
      ref={cardRef}
      className="absolute bottom-4 left-4 z-30 w-[300px] overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.18)]"
    >
      <div className="flex items-center gap-2 bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] px-3 py-2 text-white">
        <Compass className="h-4 w-4" />
        <span className="text-sm font-semibold">
          PCI walkthrough{kind === 'assessment' ? ' · assessment' : ' · task'}
        </span>
        <button
          type="button"
          onClick={() => persistCollapsed(true)}
          className="ml-auto rounded-full p-0.5 text-white/80 hover:bg-white/20 hover:text-white"
          title="Collapse"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 py-3">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-blue-500">
          Step {step + 1} of {steps.length}
        </div>
        <p className="text-sm font-semibold text-slate-800">{current.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">{current.body}</p>
        {current.bullets && (
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
            {current.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
        <div className="flex items-center gap-1">
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === step ? 'w-4 bg-blue-600' : 'w-1.5 bg-slate-200 hover:bg-slate-300'
              )}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={isFirst}
            onClick={() => setStep(s => Math.max(0, s - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </Button>
          {isLast ? (
            <Button
              type="button"
              size="sm"
              className="h-7 bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-500"
              onClick={() => persistCollapsed(true)}
            >
              <Check className="mr-0.5 h-3.5 w-3.5" />
              Done
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setStep(s => Math.min(steps.length - 1, s + 1))}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
