/**
 * Split a document's extracted text into logical sections for creating one
 * task/extension per section. Tries, in order: real page breaks (form feed or
 * "--- Page N ---" markers from PDF extraction), numbered headings at line start
 * (e.g. "1. Title", "2) Title"), then blank-line paragraph groups. Falls back to
 * the whole text as one section. Used when a per-page PDF split isn't available —
 * notably for .docx, whose extracted text carries no page markers, so it would
 * otherwise collapse into a single task.
 */
export function splitDocIntoSections(text: string): string[] {
  const trimmed = (text || '').trim()
  if (!trimmed) return []

  // 1) Real page breaks from PDF/text extraction.
  if (trimmed.includes('\f')) {
    const pages = trimmed
      .split('\f')
      .map(p => p.trim())
      .filter(Boolean)
    if (pages.length > 1) return pages
  }
  if (/--- Page \d+ ---/.test(trimmed)) {
    const pages = trimmed
      .split(/--- Page \d+ ---/)
      .map(p => p.trim())
      .filter(Boolean)
    if (pages.length > 1) return pages
  }

  // 2) Numbered headings at the start of a line ("1. ", "2) ", "3 - "…). Split
  //    BEFORE each heading so the number stays with its section. Guarded so a
  //    short numbered list inside one section doesn't shatter into tiny tasks.
  const numbered = trimmed
    .split(/\n(?=\s{0,3}\d{1,3}[.)]\s+\S)/)
    .map(p => p.trim())
    .filter(Boolean)
  if (numbered.length > 1 && numbered.length <= 60) {
    const avgLen = numbered.reduce((sum, s) => sum + s.length, 0) / numbered.length
    if (avgLen > 60) return numbered
  }

  // 3) Blank-line separated blocks of meaningful length.
  const blocks = trimmed
    .split(/\n\s*\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 50)
  if (blocks.length > 1) return blocks

  // 4) Whole document as a single section.
  return [trimmed]
}
