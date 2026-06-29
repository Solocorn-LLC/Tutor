'use client'

import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { toast } from 'sonner'
import {
  applySchemeMatches,
  deriveExamContext,
  type SchemeMatchInput,
} from '@/lib/assessment/marking-scheme'
import type { DMIQuestion, DMIVersion } from '../builder-types'

/** What the marking-scheme upload needs from the course builder. Kept as an
 *  explicit dependency object so the (large, async) logic lives in its own hook
 *  instead of inside the 11k-line CourseBuilder component. */
interface MarkingSchemeDeps {
  taskDmiItems: DMIQuestion[]
  assessmentDmiItems: DMIQuestion[]
  setTaskDmiItems: Dispatch<SetStateAction<DMIQuestion[]>>
  setAssessmentDmiItems: Dispatch<SetStateAction<DMIQuestion[]>>
  taskDmiVersions: DMIVersion[]
  assessmentDmiVersions: DMIVersion[]
  setTaskDmiVersions: Dispatch<SetStateAction<DMIVersion[]>>
  setAssessmentDmiVersions: Dispatch<SetStateAction<DMIVersion[]>>
  testPciViewMode: string
  /** Active task builder PCI context (base PCI + extensions). */
  taskBuilder: {
    taskPci: string
    activeExtensionId: string | null
    extensions: Array<{ id: string; pci: string }>
  }
  assessmentBuilder: { taskPci: string }
  /** Course category used to derive the default board/subject badge. */
  designatedFolder?: string | null
  courseName?: string | null
  /** Persist a detected board/subject onto the active DMI version. */
  setExamContext: (
    source: 'task' | 'assessment',
    patch: { examBody?: string; subject?: string }
  ) => void
}

export function useMarkingScheme(deps: MarkingSchemeDeps) {
  const [markingSchemeLoading, setMarkingSchemeLoading] = useState(false)
  const markingSchemeInputRef = useRef<HTMLInputElement | null>(null)
  // IDs of rows just appended from a marking scheme, briefly highlighted so the
  // tutor can spot the new questions among the existing ones.
  const [recentlyAddedRowIds, setRecentlyAddedRowIds] = useState<Set<string>>(new Set())
  const dmiRowsRef = useRef<HTMLDivElement | null>(null)

  // Extract selectable text from an uploaded marking-scheme PDF (or .txt).
  const extractMarkingSchemeText = async (file: File): Promise<string> => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      try {
        return await file.text()
      } catch {
        return ''
      }
    }
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdfjs = await import('pdfjs-dist')
      if (typeof window !== 'undefined') {
        const opts = (pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } }).GlobalWorkerOptions
        if (opts && !opts.workerSrc) opts.workerSrc = '/pdf.worker.min.mjs'
      }
      const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise
      const parts: string[] = []
      for (let i = 1; i <= Math.min(40, doc.numPages); i++) {
        const page = await doc.getPage(i)
        const tc = await page.getTextContent()
        const pageText = (tc.items as Array<{ str?: string }>)
          .map(it => it.str ?? '')
          .join(' ')
          .replace(/[ \t]+/g, ' ')
          .trim()
        if (pageText) parts.push(pageText)
      }
      return parts.join('\n\n')
    } catch (e) {
      console.error('Marking scheme PDF extraction failed:', e)
      return ''
    }
  }

  // Render an uploaded marking-scheme PDF's pages to JPEG data URLs for the
  // vision path — used when text extraction comes back sparse (scanned or
  // image-flattened PDFs), so image-based schemes still autopopulate.
  const renderMarkingSchemePages = async (file: File): Promise<string[]> => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf || typeof window === 'undefined') return []
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdfjs = await import('pdfjs-dist')
      const opts = (pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } }).GlobalWorkerOptions
      if (opts && !opts.workerSrc) opts.workerSrc = '/pdf.worker.min.mjs'
      const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise
      const pages: string[] = []
      const max = Math.min(8, doc.numPages) // endpoint caps pdfPages at 8
      for (let i = 1; i <= max; i++) {
        const page = await doc.getPage(i)
        const base = page.getViewport({ scale: 1 })
        const scale = Math.min(2, 1400 / base.width)
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        await page.render({ canvasContext: ctx, viewport }).promise
        pages.push(canvas.toDataURL('image/jpeg', 0.72))
      }
      return pages
    } catch (e) {
      console.error('Marking scheme PDF render failed:', e)
      return []
    }
  }

  // Parse an uploaded marking scheme and fill each question's answer, accepted
  // variants, marks and marking guidance by matching question references; appends
  // questions the scheme covers that the DMI was missing. Falls back to the vision
  // path when the PDF has little extractable text (scanned schemes).
  const handleMarkingSchemeFile = async (file: File, source: 'task' | 'assessment') => {
    const items = source === 'task' ? deps.taskDmiItems : deps.assessmentDmiItems
    if (items.length === 0) return
    setMarkingSchemeLoading(true)
    try {
      toast.info('Reading the marking scheme…')
      // Match on the paper's REAL question reference (e.g. "1(a)") via refKey.
      const questions = items.map(it => ({
        ref: String(it.questionLabel ?? it.questionNumber ?? ''),
        label: it.questionText,
      }))
      // Badge board/subject hint (the model still verifies against the scheme).
      const examVersions = source === 'task' ? deps.taskDmiVersions : deps.assessmentDmiVersions
      const activeExamVerId = deps.testPciViewMode.startsWith('dmi_')
        ? deps.testPciViewMode.slice('dmi_'.length)
        : null
      const activeExamVer =
        examVersions.find(v => v.id === activeExamVerId) ?? examVersions[examVersions.length - 1]
      const derivedExam = deriveExamContext(deps.designatedFolder, deps.courseName)
      const examBody = activeExamVer?.examBody ?? derivedExam.examBody
      const examSubject = activeExamVer?.subject ?? derivedExam.subject
      // The tutor's PCI for this context (active extension's PCI, else base).
      const pciText = (
        source === 'task'
          ? deps.taskBuilder.activeExtensionId
            ? deps.taskBuilder.extensions.find(e => e.id === deps.taskBuilder.activeExtensionId)
                ?.pci
            : deps.taskBuilder.taskPci
          : deps.assessmentBuilder.taskPci
      )?.trim()
      const hint = { examBody, subject: examSubject, pci: pciText || undefined }
      const content = (await extractMarkingSchemeText(file)).slice(0, 80000).trim()

      let body: {
        questions: typeof questions
        content?: string
        pdfPages?: string[]
        examBody?: string
        subject?: string
        pci?: string
      }
      if (content.length >= 200) {
        body = { questions, content, ...hint }
      } else {
        // Sparse text → try the vision path (scanned / image-based PDF).
        toast.info('Scanned scheme detected — reading the pages…')
        const pdfPages = await renderMarkingSchemePages(file)
        if (pdfPages.length > 0) {
          body = { questions, pdfPages, ...hint }
        } else if (content.length >= 20) {
          body = { questions, content, ...hint }
        } else {
          toast.error('Could not read the marking scheme. Upload a clearer PDF or a .txt file.')
          return
        }
      }

      const res = await fetch('/api/ai/parse-marking-scheme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        toast.error(e?.error || 'Failed to parse the marking scheme')
        return
      }
      const data = await res.json()
      // Adopt the detected board/subject — only for fields the tutor hasn't set.
      const detectPatch: { examBody?: string; subject?: string } = {}
      if (!activeExamVer?.examBody && typeof data?.detectedExamBody === 'string') {
        detectPatch.examBody = data.detectedExamBody
      }
      if (!activeExamVer?.subject && typeof data?.detectedSubject === 'string') {
        detectPatch.subject = data.detectedSubject
      }
      if (detectPatch.examBody || detectPatch.subject) {
        deps.setExamContext(source, detectPatch)
        toast.info(
          `Detected ${[detectPatch.examBody, detectPatch.subject].filter(Boolean).join(' · ')} from the scheme`
        )
      }
      const matches: SchemeMatchInput[] = Array.isArray(data?.matches) ? data.matches : []
      if (matches.length === 0) {
        toast.error('No answers could be matched from that marking scheme.')
        return
      }

      // Pure split: patches for existing rows + new rows for missing references.
      const { patchedItems, newRows, filled, applyToVersionItems } = applySchemeMatches(
        items,
        matches
      )
      if (filled === 0 && newRows.length === 0) {
        toast.error(
          "Couldn't line up the marking scheme with these questions — the question numbers didn't match. Check that the scheme covers the same questions."
        )
        return
      }
      // Commit to the live items + the active DMI version (persists with course).
      const activeVersionId = deps.testPciViewMode.startsWith('dmi_')
        ? deps.testPciViewMode.slice('dmi_'.length)
        : null
      const patchVersions = (vs: DMIVersion[]) => {
        if (vs.length === 0) return vs
        const targetId = activeVersionId ?? vs[vs.length - 1].id
        return vs.map(v => (v.id === targetId ? { ...v, items: applyToVersionItems(v.items) } : v))
      }
      if (source === 'task') {
        deps.setTaskDmiItems(patchedItems)
        deps.setTaskDmiVersions(patchVersions)
      } else {
        deps.setAssessmentDmiItems(patchedItems)
        deps.setAssessmentDmiVersions(patchVersions)
      }
      // Highlight + scroll to the freshly-appended rows so they're easy to find.
      if (newRows.length > 0) {
        const ids = new Set(newRows.map(r => r.id))
        setRecentlyAddedRowIds(ids)
        setTimeout(() => {
          dmiRowsRef.current?.scrollTo({ top: dmiRowsRef.current.scrollHeight, behavior: 'smooth' })
        }, 120)
        setTimeout(() => setRecentlyAddedRowIds(new Set()), 6000)
      }
      const addedNote =
        newRows.length > 0
          ? `; added ${newRows.length} new question${newRows.length === 1 ? '' : 's'} the scheme covered`
          : ''
      toast.success(
        `Filled ${filled} of ${questions.length} answers (with variants & marks)${addedNote} from the marking scheme.`
      )
    } catch (err) {
      console.error('Marking scheme parse failed:', err)
      toast.error('Failed to read the marking scheme')
    } finally {
      setMarkingSchemeLoading(false)
    }
  }

  return {
    markingSchemeLoading,
    markingSchemeInputRef,
    recentlyAddedRowIds,
    dmiRowsRef,
    handleMarkingSchemeFile,
  }
}
