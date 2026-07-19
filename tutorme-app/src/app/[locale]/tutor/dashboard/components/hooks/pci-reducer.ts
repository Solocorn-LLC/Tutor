/**
 * Pure state machine for the PCI assistant chat. The course builder currently
 * spreads this across ~15 separate useState slices (per-task, per-extension,
 * per-assessment messages / inputs / loading / error / draft / guardrail
 * warnings), which is hard to follow and impossible to test. This consolidates
 * them into one normalized, uniform model + a pure reducer so the logic is
 * unit-tested in isolation; the component wiring is a separate step.
 */

import type { PciMessage } from '@/lib/assessment/pci'

export interface PciGuardrailWarning {
  ruleId: string
  severity: 'info' | 'warning' | 'error'
  message: string
}

/** One PCI conversation (the base task, a task extension, or an assessment). */
export interface PciThread {
  messages: PciMessage[]
  input: string
  loading: boolean
  errorHint: string
  /** Finalized rubric awaiting "Apply to PCI" (empty until the model finalizes). */
  draft: string
  /** Structured form of the finalized rubric (TASK-6), when the model emitted one. */
  draftSpec?: import('@/lib/assessment/pci-spec').PciSpec
  /**
   * Partial structured policy the assistant has captured SO FAR this
   * conversation (may be incomplete; NOT finalized). Drives the live
   * "policy so far" panel. Distinct from `draftSpec` (the finalized mirror).
   */
  specSoFar?: import('@/lib/assessment/pci-spec').PciSpec
  /**
   * "policy so far" fields the tutor corrected inline. These are STICKY: a later
   * model turn (or the server-side fallback extraction) may not overwrite them,
   * so a correction holds until the tutor edits it again. Clearing a field drops
   * it from here so the assistant may re-capture it.
   */
  editedSpecKeys?: string[]
  guardrailWarnings: PciGuardrailWarning[]
}

export function emptyThread(): PciThread {
  return {
    messages: [],
    input: '',
    loading: false,
    errorHint: '',
    draft: '',
    guardrailWarnings: [],
  }
}

/** All PCI threads, keyed uniformly: the base task, extensions by id, assessments by id. */
export interface PciState {
  task: PciThread
  taskExtensions: Record<string, PciThread>
  assessments: Record<string, PciThread>
}

export function initialPciState(): PciState {
  return { task: emptyThread(), taskExtensions: {}, assessments: {} }
}

/** Which thread an action targets. */
export type PciTarget =
  | { kind: 'task' }
  | { kind: 'taskExtension'; id: string }
  | { kind: 'assessment'; id: string }

export type PciAction =
  | { type: 'setInput'; target: PciTarget; input: string }
  | { type: 'loadMessages'; target: PciTarget; messages: PciMessage[] }
  | { type: 'sendStart'; target: PciTarget; userMessage: string }
  | { type: 'sendStartSilent'; target: PciTarget }
  | {
      type: 'sendSuccess'
      target: PciTarget
      assistant: PciMessage
      draft?: string
      spec?: import('@/lib/assessment/pci-spec').PciSpec
      specSoFar?: import('@/lib/assessment/pci-spec').PciSpec
      warnings: PciGuardrailWarning[]
    }
  | { type: 'sendError'; target: PciTarget; hint: string; assistant: PciMessage }
  | { type: 'sendDone'; target: PciTarget }
  | { type: 'clearDraft'; target: PciTarget }
  // Tutor correction of a captured "policy so far" field (empty value clears it).
  | {
      type: 'editSpecSoFar'
      target: PciTarget
      key: keyof import('@/lib/assessment/pci-spec').PciSpec
      value: string
    }
  | { type: 'reset' }

/** Read a thread (returns a fresh empty thread for an unseen extension/assessment). */
export function getThread(state: PciState, target: PciTarget): PciThread {
  if (target.kind === 'task') return state.task
  if (target.kind === 'taskExtension') return state.taskExtensions[target.id] ?? emptyThread()
  return state.assessments[target.id] ?? emptyThread()
}

function setThread(state: PciState, target: PciTarget, thread: PciThread): PciState {
  if (target.kind === 'task') return { ...state, task: thread }
  if (target.kind === 'taskExtension') {
    return { ...state, taskExtensions: { ...state.taskExtensions, [target.id]: thread } }
  }
  return { ...state, assessments: { ...state.assessments, [target.id]: thread } }
}

const patch = (state: PciState, target: PciTarget, p: Partial<PciThread>): PciState =>
  setThread(state, target, { ...getThread(state, target), ...p })

export function pciReducer(state: PciState, action: PciAction): PciState {
  switch (action.type) {
    case 'setInput':
      return patch(state, action.target, { input: action.input })

    case 'loadMessages':
      return patch(state, action.target, { messages: action.messages })

    case 'sendStart':
      // Append the user's message and start loading. The input box is cleared
      // separately (only on a real send, not a quick-action override).
      return patch(state, action.target, {
        messages: [
          ...getThread(state, action.target).messages,
          { role: 'user', content: action.userMessage },
        ],
        loading: true,
      })

    case 'sendStartSilent':
      // Start loading without appending a visible user message. Used for the
      // automatic first-turn summary when the PCI panel is opened.
      return patch(state, action.target, { loading: true })

    case 'sendSuccess': {
      // Append the assistant reply, hold any finalized draft + structured spec,
      // clear the error, record guardrail warnings, and stop loading.
      const cur = getThread(state, action.target)
      // Merge captured-so-far fields; keep prior values if a turn omits them.
      // Tutor-corrected fields are STICKY — the model may not overwrite them, so
      // an inline correction holds until the tutor edits it again.
      let specSoFarPatch: Partial<PciThread> = {}
      if (action.specSoFar) {
        const edited = new Set(cur.editedSpecKeys ?? [])
        const merged: Record<string, string> = { ...(cur.specSoFar ?? {}) }
        for (const [k, v] of Object.entries(action.specSoFar)) {
          if (!edited.has(k)) merged[k] = v
        }
        specSoFarPatch = { specSoFar: merged }
      }
      return patch(state, action.target, {
        messages: [...cur.messages, action.assistant],
        ...(action.draft ? { draft: action.draft } : {}),
        ...(action.spec ? { draftSpec: action.spec } : {}),
        ...specSoFarPatch,
        errorHint: '',
        guardrailWarnings: action.warnings,
        loading: false,
      })
    }

    case 'sendError':
      return patch(state, action.target, {
        messages: [...getThread(state, action.target).messages, action.assistant],
        errorHint: action.hint,
        loading: false,
      })

    case 'sendDone':
      return patch(state, action.target, { loading: false })

    case 'clearDraft':
      return patch(state, action.target, { draft: '', draftSpec: undefined })

    case 'editSpecSoFar': {
      const t = getThread(state, action.target)
      const next = { ...(t.specSoFar ?? {}) }
      const edited = new Set(t.editedSpecKeys ?? [])
      const v = action.value.trim()
      if (v) {
        // Set + protect: this correction is now sticky.
        next[action.key] = v
        edited.add(action.key)
      } else {
        // Cleared: drop the value and un-protect so the assistant may re-capture.
        delete next[action.key]
        edited.delete(action.key)
      }
      return patch(state, action.target, { specSoFar: next, editedSpecKeys: [...edited] })
    }

    case 'reset':
      return initialPciState()

    default:
      return state
  }
}
