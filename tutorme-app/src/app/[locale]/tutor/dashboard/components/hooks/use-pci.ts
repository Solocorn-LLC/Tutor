'use client'

import { useReducer } from 'react'
import { toast } from 'sonner'
import type { PciMessage, PciAuditRecord } from '@/lib/assessment/pci'
import {
  pciReducer,
  initialPciState,
  getThread,
  type PciState,
  type PciTarget,
  type PciGuardrailWarning,
} from './pci-reducer'

interface PciSourceDoc {
  fileName: string
  fileUrl?: string
  mimeType?: string
  /** Full OCR/extracted text of the uploaded PDF, if available. */
  extractedText?: string
}

/** What the PCI chat needs from the course builder. The PCI conversation STATE
 *  (messages/input/loading/draft/…) lives inside this hook's reducer, so only the
 *  genuinely-external context is passed in. */
interface UsePciDeps {
  loadedTaskId: string | null
  loadedAssessmentId: string | null
  taskBuilder: {
    activeExtensionId: string | null
    extensions: Array<{
      id: string
      content: string
      pci: string
      name: string
      sourceDocument?: PciSourceDoc
    }>
    taskContent: string
    taskPci: string
    title: string
    sourceDocument?: PciSourceDoc
  }
  assessmentBuilder: { taskContent: string; taskPci: string; title: string }
  /**
   * Compact digest of the assessment's DMI (per-question marks + rubric, no
   * answers) so the marking-policy chat builds the policy WITH the actual
   * questions/marks/rubrics in view. Empty when there's no DMI.
   */
  assessmentMarkingScheme?: string
  /**
   * Assessment-only per-type steering for the PCI chat, derived from the DMI
   * question mix + documentKind. Forwarded to the server as `context.variant`
   * to tailor the marking-policy interview (objective / free-response / mixed,
   * plus a study-material note). Omitted/undefined → base prompt, unchanged.
   */
  assessmentPciVariant?: {
    composition?: 'objective' | 'free_response' | 'mixed'
    documentKind?: 'question_paper' | 'study_material'
  }
  /**
   * Task equivalent — task answering is free-form, so only the source
   * (`documentKind`) modifies the prompt (a study-material note). Undefined →
   * base task prompt, unchanged.
   */
  taskPciVariant?: {
    documentKind?: 'question_paper' | 'study_material'
  }
  /** Writes the finalized rubric to the active task/assessment PCI field. */
  setCurrentPci: (source: 'task' | 'assessment', text: string, audit?: PciAuditRecord) => void
  taskSourceDocument?: PciSourceDoc
  currentAssessmentDocument?: PciSourceDoc
  /**
   * Full hierarchical context for task PCI. Sent on the first turn only so the
   * model understands where the task sits in the course and lesson.
   */
  courseContext?: string
  lessonContext?: string
  autoCreateTask: () => { id?: string } | null | undefined
  autoCreateAssessment: () => { id?: string } | null | undefined
  renderPdfToImages: (pdfUrl: string, maxPages?: number) => Promise<string[]>
  pdfPageCache: Map<string, string[]>
}

export function usePci(deps: UsePciDeps) {
  const [pci, dispatch] = useReducer(pciReducer, undefined, initialPciState)

  // The thread for the active task context (base task or its active extension).
  const activeTaskTarget = (): PciTarget =>
    deps.taskBuilder.activeExtensionId
      ? { kind: 'taskExtension', id: deps.taskBuilder.activeExtensionId }
      : { kind: 'task' }

  const setPciInput = (target: PciTarget, input: string) =>
    dispatch({ type: 'setInput', target, input })
  const loadPciMessages = (target: PciTarget, messages: PciMessage[]) =>
    dispatch({ type: 'loadMessages', target, messages })
  const resetPci = () => dispatch({ type: 'reset' })

  const applyTaskPciDraft = () => {
    const target = activeTaskTarget()
    const thread = getThread(pci, target)
    const draft = thread.draft
    if (!draft) return
    // TASK-18 (Data Capture): record the approval — the transcript (tutor's
    // words + the LLM's interpretation/summary), the approved PCI, and its
    // structured form (TASK-6) together.
    const audit: PciAuditRecord = {
      approvedPci: draft,
      spec: thread.draftSpec,
      transcript: thread.messages,
      approvedAt: Date.now(),
    }
    deps.setCurrentPci('task', draft, audit)
    dispatch({ type: 'clearDraft', target })
    toast.success('Rubric applied to PCI')
  }

  const applyAssessmentPciDraft = (assessmentId: string) => {
    const target: PciTarget = { kind: 'assessment', id: assessmentId }
    const thread = getThread(pci, target)
    const draft = thread.draft
    if (!draft) return
    // Persist the structured spec + audit too (parity with tasks), so the
    // finalized assessment PCI carries its machine-readable form to the grader.
    const audit: PciAuditRecord = {
      approvedPci: draft,
      spec: thread.draftSpec,
      transcript: thread.messages,
      approvedAt: Date.now(),
    }
    deps.setCurrentPci('assessment', draft, audit)
    dispatch({ type: 'clearDraft', target })
    toast.success('Rubric applied to PCI')
  }

  const handlePciSend = async (type: 'task' | 'assessment', overrideMessage?: string) => {
    const isTask = type === 'task'
    let taskId = deps.loadedTaskId
    let assessmentId = deps.loadedAssessmentId
    if (isTask && !taskId) taskId = deps.autoCreateTask()?.id ?? deps.loadedTaskId
    if (!isTask && !assessmentId) {
      assessmentId = deps.autoCreateAssessment()?.id ?? deps.loadedAssessmentId
    }

    const target: PciTarget = isTask
      ? activeTaskTarget()
      : { kind: 'assessment', id: assessmentId || '' }
    const thread = getThread(pci, target)
    const input = overrideMessage || thread.input
    if (!input.trim() || thread.loading) return
    const userMessage = input.trim()
    // Only attach the document's rendered page images on the FIRST turn. The
    // model summarises them into the conversation, so resending several MB of
    // base64 images on every later turn (e.g. when the tutor confirms the
    // summary) just bloats the request — which can make the fetch fail outright
    // ("Load failed"). Later turns rely on the text content + conversation.
    const isFirstTurn = thread.messages.length === 0

    // Clear the input box only on a real send (not a quick-action override), then
    // append the user's message + start loading.
    if (!overrideMessage) dispatch({ type: 'setInput', target, input: '' })
    dispatch({ type: 'sendStart', target, userMessage })

    try {
      const { taskBuilder, assessmentBuilder } = deps
      // An active extension generates from its OWN content + PCI, not the parent's.
      const slideContent = isTask
        ? taskBuilder.activeExtensionId
          ? taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)?.content || ''
          : taskBuilder.taskContent
        : assessmentBuilder.taskContent
      const pciText = isTask
        ? taskBuilder.activeExtensionId
          ? taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)?.pci || ''
          : taskBuilder.taskPci
        : assessmentBuilder.taskPci
      const sessionId = isTask
        ? taskId
          ? `pci-task:${taskId}`
          : undefined
        : assessmentId
          ? `pci-assessment:${assessmentId}`
          : undefined
      const activeExt =
        isTask && taskBuilder.activeExtensionId
          ? taskBuilder.extensions.find(e => e.id === taskBuilder.activeExtensionId)
          : null
      const extensionName = activeExt ? activeExt.name : undefined

      const sourceDocData = isTask
        ? activeExt?.sourceDocument || deps.taskSourceDocument || taskBuilder.sourceDocument
        : deps.currentAssessmentDocument
      const sourceDocument = sourceDocData
        ? {
            fileName: sourceDocData.fileName,
            fileUrl: sourceDocData.fileUrl,
            mimeType: sourceDocData.mimeType,
            // Forward the full extracted text on the first turn; later turns rely
            // on the conversation. The server truncates as needed.
            extractedText: isFirstTurn
              ? (sourceDocData.extractedText || '').slice(0, 80000) || undefined
              : undefined,
          }
        : undefined

      // Render an attached PDF's pages (cached) so the model can SEE the
      // document — first turn only (see isFirstTurn above).
      // When we already have extracted text, one page is enough as a layout aid;
      // otherwise render a few pages so the model has some visual signal.
      let pdfPages: string[] | undefined
      if (isFirstTurn && sourceDocData?.mimeType === 'application/pdf' && sourceDocData.fileUrl) {
        const cacheKey = sourceDocData.fileUrl
        const cached = deps.pdfPageCache.get(cacheKey)
        const hasExtractedText = !!(sourceDocData.extractedText || '').trim()
        const pageLimit = hasExtractedText ? 1 : 3
        if (cached) {
          pdfPages = cached.slice(0, pageLimit)
        } else {
          try {
            const rendered = await deps.renderPdfToImages(sourceDocData.fileUrl, pageLimit)
            if (rendered.length > 0) {
              pdfPages = rendered
              deps.pdfPageCache.set(cacheKey, rendered)
            }
          } catch {
            // Vision is best-effort; fall back to text-only on render failure.
          }
        }
      }

      // Abort a hung request after a bound comfortably above the server's worst
      // case (2×45s) so a stuck turn fails cleanly with a retry prompt instead
      // of hanging or surfacing a raw "Load failed".
      const controller = new AbortController()
      const abortTimer = setTimeout(() => controller.abort(), 120_000)
      let response: Response
      try {
        response = await fetch('/api/ai/pci-master', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            message: userMessage,
            sessionId,
            // Prior turns so the model can hold a real conversation (the local /
            // vision provider paths have no server-side memory; ADK keys on
            // sessionId). Capped and lightly truncated to bound the payload.
            history: thread.messages.slice(-10).map(m => ({
              role: m.role,
              content: m.content.slice(0, 4000),
            })),
            context: {
              type,
              title: isTask ? taskBuilder.title : assessmentBuilder.title,
              // Bounded to stay under the server's content limit and keep the
              // request small on every turn.
              content: (slideContent || '').slice(0, 48000),
              // Tiered context is large, so only send it on the first turn.
              courseContext: isFirstTurn
                ? (deps.courseContext || '').slice(0, 50000) || undefined
                : undefined,
              lessonContext: isFirstTurn
                ? (deps.lessonContext || '').slice(0, 30000) || undefined
                : undefined,
              pci: pciText,
              extensionName,
              sourceDocument,
              // The captured "policy so far" — including any fields the tutor
              // corrected inline. Sent back so the model treats these as
              // authoritative and carries them forward (doesn't re-capture a
              // stale value).
              capturedSoFar: thread.specSoFar,
              // The DMI marking scheme (assessment only), so the policy is built
              // with the actual questions/marks/rubrics in view.
              markingScheme:
                !isTask && deps.assessmentMarkingScheme
                  ? deps.assessmentMarkingScheme.slice(0, 12000)
                  : undefined,
              // Per-type steering — selects the prompt addendum for this
              // item's type/source (assessment: question mix + source; task:
              // source only).
              variant: isTask ? deps.taskPciVariant : deps.assessmentPciVariant,
            },
            pdfPages,
          }),
        })
      } finally {
        clearTimeout(abortTimer)
      }
      if (!response.ok) {
        let errorMessage = `Failed to get AI response (${response.status})`
        try {
          const errorBody = await response.json()
          if (errorBody?.error) {
            errorMessage = errorBody.errorId
              ? `${errorBody.error} (Error ID: ${errorBody.errorId})`
              : errorBody.error
          }
        } catch {
          // ignore JSON parse failures
        }
        throw new Error(errorMessage)
      }
      const data = await response.json()
      const warnings: PciGuardrailWarning[] = Array.isArray(data.guardrailWarnings)
        ? data.guardrailWarnings
        : []
      const draft = typeof data.pciDraft === 'string' ? data.pciDraft.trim() : ''
      dispatch({
        type: 'sendSuccess',
        target,
        assistant: { role: 'assistant', content: data.response || 'Unable to respond.' },
        draft: draft || undefined,
        // TASK-6: the structured spec mirror (present only on finalization).
        spec: data.pciSpec || undefined,
        // Running capture for the live "policy so far" panel (may be partial).
        specSoFar: data.pciSpecSoFar || undefined,
        warnings,
      })
    } catch (error) {
      // A rejected fetch (offline, connection reset, request too large) surfaces
      // as a TypeError with a terse, non-actionable message like "Load failed"
      // (Safari) or "Failed to fetch" (Chrome). Translate those into a clear hint.
      const raw = error instanceof Error ? error.message : ''
      const isAbort = error instanceof DOMException && error.name === 'AbortError'
      const isNetworkError =
        error instanceof TypeError ||
        /load failed|failed to fetch|networkerror|network error/i.test(raw)
      const hint = isAbort
        ? 'The assistant took too long to respond — please try again.'
        : isNetworkError
          ? "Couldn't reach the PCI assistant — check your connection and try again."
          : raw || 'Unable to reach the PCI assistant. Please try again.'
      toast.error(`PCI Assistant error: ${hint}`)
      dispatch({
        type: 'sendError',
        target,
        hint,
        assistant: {
          role: 'assistant',
          content: 'Sorry, there was an error processing your request. Please try again.',
        },
      })
    }
  }

  // Tutor correction of a captured "policy so far" field (empty value clears it).
  const editSpecSoFar = (
    target: PciTarget,
    key: keyof import('@/lib/assessment/pci-spec').PciSpec,
    value: string
  ) => dispatch({ type: 'editSpecSoFar', target, key, value })

  return {
    pci,
    handlePciSend,
    applyTaskPciDraft,
    applyAssessmentPciDraft,
    setPciInput,
    loadPciMessages,
    resetPci,
    editSpecSoFar,
  }
}

export type { PciState }
