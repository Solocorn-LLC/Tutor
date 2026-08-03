'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import { toast } from 'sonner'
import { extractQuestionRef } from '@/lib/assessment/marking-scheme'
import { generateId } from '../builder-utils'
import type { DMIQuestion, DMIVersion } from '../builder-types'

/** What the DMI editing handlers need from the course builder. Lifted into a hook
 *  so these question/version mutations live outside the 11k-line component. */
interface DmiEditorDeps {
  taskDmiItems: DMIQuestion[]
  assessmentDmiItems: DMIQuestion[]
  setTaskDmiItems: Dispatch<SetStateAction<DMIQuestion[]>>
  setAssessmentDmiItems: Dispatch<SetStateAction<DMIQuestion[]>>
  setTaskDmiVersions: Dispatch<SetStateAction<DMIVersion[]>>
  setAssessmentDmiVersions: Dispatch<SetStateAction<DMIVersion[]>>
  testPciViewMode: string
}

export function useDmiEditor(deps: DmiEditorDeps) {
  // Whether the badge's inline board/subject editor is open.
  const [editingExamContext, setEditingExamContext] = useState(false)

  // The DMI version edits target: the one selected in Test mode, else the latest.
  const activeVersionId = () =>
    deps.testPciViewMode.startsWith('dmi_') ? deps.testPciViewMode.slice('dmi_'.length) : null

  // Apply a transform to the active version's items (or the whole version for
  // metadata patches), leaving other versions untouched.
  const editActiveVersion =
    (transform: (v: DMIVersion) => DMIVersion) =>
    (vs: DMIVersion[]): DMIVersion[] => {
      if (vs.length === 0) return vs
      const targetId = activeVersionId() ?? vs[vs.length - 1].id
      return vs.map(v => (v.id === targetId ? transform(v) : v))
    }

  const setItemsAndVersions = (
    source: 'task' | 'assessment',
    items: SetStateAction<DMIQuestion[]>,
    versions: SetStateAction<DMIVersion[]>
  ) => {
    if (source === 'task') {
      deps.setTaskDmiItems(items)
      deps.setTaskDmiVersions(versions)
    } else {
      deps.setAssessmentDmiItems(items)
      deps.setAssessmentDmiVersions(versions)
    }
  }

  // Apply a per-question edit (marks / answer / rubric) to the live items and the
  // active version (so it persists with the course).
  const applyDmiEdit = (
    source: 'task' | 'assessment',
    itemId: string,
    patch: Partial<DMIQuestion>
  ) => {
    // ASMT-5: when the tutor edits the answer/variants, record provenance so a
    // later uploaded marking scheme won't overwrite the tutor's answer.
    const touchesAnswer = 'answer' in patch || 'acceptableVariants' in patch
    const effectivePatch: Partial<DMIQuestion> =
      touchesAnswer && !('answerProvenance' in patch)
        ? { ...patch, answerProvenance: 'tutor_edited' }
        : patch
    const editItems = (arr: DMIQuestion[]) =>
      arr.map(q => (q.id === itemId ? { ...q, ...effectivePatch } : q))
    setItemsAndVersions(
      source,
      editItems,
      editActiveVersion(v => ({ ...v, items: editItems(v.items) }))
    )
  }

  // Backfill questionLabel (the paper's real reference, e.g. "1(a)") from the
  // question text for DMIs generated before references were preserved — so old
  // assessments match an uploaded marking scheme. Only fills missing labels;
  // never overwrites an existing one.
  const reextractRefs = (source: 'task' | 'assessment') => {
    const items = source === 'task' ? deps.taskDmiItems : deps.assessmentDmiItems
    const fixItem = (q: DMIQuestion): DMIQuestion => {
      if (q.questionLabel) return q
      const ref = extractQuestionRef(q.questionText)
      return ref ? { ...q, questionLabel: ref } : q
    }
    const fixed = items.map(fixItem)
    const updated = fixed.reduce((n, q, i) => (q === items[i] ? n : n + 1), 0)
    if (updated === 0) {
      toast.info('No question numbers to re-detect — already set, or none found in the text.')
      return
    }
    setItemsAndVersions(
      source,
      fixed,
      editActiveVersion(v => ({ ...v, items: v.items.map(fixItem) }))
    )
    toast.success(
      `Re-detected ${updated} question number${updated === 1 ? '' : 's'} from the question text.`
    )
  }

  // Remove a DMI question (e.g. a row appended from a marking scheme that the
  // tutor doesn't want) from the live items and the active version.
  const removeDmiItem = (source: 'task' | 'assessment', itemId: string) => {
    const dropItem = (arr: DMIQuestion[]) => arr.filter(q => q.id !== itemId)
    setItemsAndVersions(
      source,
      dropItem,
      editActiveVersion(v => ({ ...v, items: dropItem(v.items) }))
    )
  }

  // Add a new DMI question via the PCI chat (or other callers). Appends to the
  // live items and the active version, assigning a stable id and the next
  // question number.
  const addDmiItem = (source: 'task' | 'assessment', partial: Partial<DMIQuestion>) => {
    const currentItems = source === 'task' ? deps.taskDmiItems : deps.assessmentDmiItems
    const nextNumber =
      currentItems.length > 0 ? Math.max(...currentItems.map(q => q.questionNumber ?? 0)) + 1 : 1
    const newItem: DMIQuestion = {
      id: `q-${generateId()}`,
      questionNumber: nextNumber,
      questionText: partial.questionText?.trim() || `Question ${nextNumber}`,
      answer: partial.answer?.trim() || '',
      questionType: (partial.questionType as DMIQuestion['questionType']) ?? 'short',
      marks: typeof partial.marks === 'number' && partial.marks >= 0 ? partial.marks : 1,
      rubric: partial.rubric,
      acceptableVariants: partial.acceptableVariants,
      options: partial.options,
      pairs: partial.pairs,
      answerProvenance: 'tutor_edited',
    }
    const addItem = (arr: DMIQuestion[]) => [...arr, newItem]
    setItemsAndVersions(
      source,
      addItem,
      editActiveVersion(v => ({ ...v, items: addItem(v.items) }))
    )
  }

  // Persist the examining-body / subject badge onto the active DMI version (it
  // saves & reloads with the course). Only touches version metadata, never the
  // questions.
  const setExamContext = (
    source: 'task' | 'assessment',
    patch: { examBody?: string; subject?: string }
  ) => {
    const editVersions = editActiveVersion(v => ({ ...v, ...patch }))
    if (source === 'task') deps.setTaskDmiVersions(editVersions)
    else deps.setAssessmentDmiVersions(editVersions)
  }

  return {
    applyDmiEdit,
    reextractRefs,
    removeDmiItem,
    addDmiItem,
    setExamContext,
    editingExamContext,
    setEditingExamContext,
  }
}
