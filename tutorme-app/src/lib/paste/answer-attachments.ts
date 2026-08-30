export interface WrittenAnswerAttachment {
  type: 'image' | 'table' | 'formula'
  url?: string
  /** Durable storage key for the uploaded image; used to refresh expired signed URLs. */
  key?: string
  alt?: string
  content?: string
}

export interface WrittenAnswerValue {
  text: string
  converted?: string
  drawing?: string
  attachments?: WrittenAnswerAttachment[]
}

function isValidAttachment(v: unknown): v is WrittenAnswerAttachment {
  if (!v || typeof v !== 'object') return false
  const t = (v as Record<string, unknown>).type
  return t === 'image' || t === 'table' || t === 'formula'
}

export function parseWrittenAnswer(value: string): WrittenAnswerValue {
  if (!value) return { text: '' }
  if (value.startsWith('data:image')) return { text: '', drawing: value }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const hasKnownField =
        typeof parsed.text === 'string' ||
        typeof parsed.drawing === 'string' ||
        typeof parsed.converted === 'string'
      if (hasKnownField) {
        return {
          text: String(parsed.text ?? ''),
          converted: typeof parsed.converted === 'string' ? parsed.converted : '',
          drawing: typeof parsed.drawing === 'string' ? parsed.drawing : '',
          attachments: Array.isArray(parsed.attachments)
            ? parsed.attachments.filter(isValidAttachment)
            : undefined,
        }
      }
    }
  } catch {
    // not JSON — treat as plain text below
  }
  return { text: value }
}

export function serializeWrittenAnswer(value: WrittenAnswerValue): string {
  const { text, converted, drawing, attachments } = value
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0
  if (!converted && !drawing && !hasAttachments) return text

  const payload: Record<string, unknown> = { text }
  if (converted) payload.converted = converted
  if (drawing) payload.drawing = drawing
  if (hasAttachments) payload.attachments = attachments
  return JSON.stringify(payload)
}
