/**
 * Section derivation for assessments (Assessment guardrail ASMT-4).
 *
 * Questions carry an optional `section` tag (the paper heading they fall under).
 * These pure helpers group the flat question list into `DMISection`s and compute
 * the paper's total marks — the canonical source of truth for section structure,
 * so the model/version never drift from the items.
 */

/** Default marks for a question with no explicit allocation (matches grading). */
const DEFAULT_MARKS = 1

export interface SectionableItem {
  id: string
  section?: string | null
  marks?: number | null
}

export interface DerivedSection {
  id: string
  title: string
  marks: number
  questionIds: string[]
}

function itemMarks(it: SectionableItem): number {
  return typeof it.marks === 'number' && it.marks > 0 ? it.marks : DEFAULT_MARKS
}

/** Total marks across all questions (each unmarked question counts as 1). */
export function deriveTotalMarks(items: SectionableItem[]): number {
  return items.reduce((sum, it) => sum + itemMarks(it), 0)
}

/**
 * Group questions into sections by their `section` tag, in first-appearance
 * order, summing each section's marks. Returns [] when no question is tagged
 * (an unsectioned paper).
 */
export function deriveSections(items: SectionableItem[]): DerivedSection[] {
  const order: string[] = []
  const byTitle = new Map<string, DerivedSection>()
  for (const it of items) {
    const title = (it.section ?? '').trim()
    if (!title) continue
    let sec = byTitle.get(title)
    if (!sec) {
      sec = { id: `sec-${order.length + 1}`, title, marks: 0, questionIds: [] }
      byTitle.set(title, sec)
      order.push(title)
    }
    sec.questionIds.push(it.id)
    sec.marks += itemMarks(it)
  }
  return order.map(t => byTitle.get(t) as DerivedSection)
}

/**
 * ASMT-4 section-structure consistency: a paper should be either fully
 * sectioned or not sectioned at all. Returns true when the sectioning is
 * partial (some questions tagged, some not) — an inconsistency worth flagging.
 */
export function hasPartialSectioning(items: SectionableItem[]): boolean {
  let tagged = 0
  for (const it of items) {
    if ((it.section ?? '').trim()) tagged++
  }
  return tagged > 0 && tagged < items.length
}
