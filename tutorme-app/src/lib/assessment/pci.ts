/**
 * Pure helpers for PCI (the tutor's marking instructions). The PCI conversation
 * is persisted as a plain "User:/Assistant:" transcript inside a task/assessment's
 * `instructions` field; this parses it back into chat messages. Kept here so it's
 * unit-tested and not buried in the course-builder component.
 */

export interface PciMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * An auditable record of one PCI approval (Task PCI guardrail TASK-18, Data
 * Capture). Captures the three layers the spec wants kept separate: what the
 * tutor said + how the LLM interpreted it (the `transcript`), and the final
 * approved behavior (`approvedPci`). Appended on each "Apply to PCI", so the
 * list is a version history of approvals.
 */
export interface PciAuditRecord {
  /** The approved PCI text applied this time. */
  approvedPci: string
  /** The chat transcript at approval: tutor turns (user) + LLM interpretation/
   *  summary (assistant). */
  transcript: PciMessage[]
  /** Epoch ms when the tutor applied it. */
  approvedAt: number
}

/**
 * Parse a saved PCI transcript ("User: …\nAssistant: …") back into chat messages.
 * Lines with no role prefix continue the current message; leading prose with no
 * prefix is treated as an assistant message (e.g. a finalized rubric applied
 * directly).
 */
export function parsePciTranscript(text: string): PciMessage[] {
  if (!text?.trim()) return []
  const lines = text.split('\n')
  const messages: PciMessage[] = []
  let current: PciMessage | null = null
  for (const line of lines) {
    const trimmed = line.trim()
    const userMatch = trimmed.match(/^User:\s*(.*)$/i)
    const assistantMatch = trimmed.match(/^Assistant:\s*(.*)$/i)
    if (userMatch) {
      if (current) messages.push(current)
      current = { role: 'user', content: userMatch[1] }
      continue
    }
    if (assistantMatch) {
      if (current) messages.push(current)
      current = { role: 'assistant', content: assistantMatch[1] }
      continue
    }
    if (current) {
      current.content = `${current.content}\n${line}`
    } else if (trimmed) {
      current = { role: 'assistant', content: trimmed }
    }
  }
  if (current) messages.push(current)
  return messages
}
