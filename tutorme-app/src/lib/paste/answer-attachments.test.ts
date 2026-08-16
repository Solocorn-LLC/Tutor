import { describe, it, expect } from 'vitest'
import { parseWrittenAnswer, serializeWrittenAnswer } from './answer-attachments'

describe('parseWrittenAnswer / serializeWrittenAnswer', () => {
  it('returns empty text for empty input', () => {
    expect(parseWrittenAnswer('')).toEqual({ text: '' })
  })

  it('treats plain text as typed text', () => {
    expect(parseWrittenAnswer('hello world')).toEqual({ text: 'hello world' })
  })

  it('treats a bare data URL as a drawing', () => {
    const drawing = 'data:image/png;base64,abc'
    expect(parseWrittenAnswer(drawing)).toEqual({ text: '', drawing })
  })

  it('parses legacy JSON with text, converted and drawing', () => {
    const value = JSON.stringify({
      text: 'typed',
      converted: '$x$',
      drawing: 'data:image/png;base64,abc',
    })
    expect(parseWrittenAnswer(value)).toEqual({
      text: 'typed',
      converted: '$x$',
      drawing: 'data:image/png;base64,abc',
    })
  })

  it('parses attachments and filters invalid entries', () => {
    const value = JSON.stringify({
      text: 'answer',
      attachments: [
        { type: 'image', url: 'https://example.com/img.png', alt: 'img' },
        { type: 'table', content: '<table><tr><td>A</td></tr></table>' },
        { type: 'formula', content: '<svg></svg>' },
        { type: 'bad', content: 'ignored' },
      ],
    })
    expect(parseWrittenAnswer(value).attachments).toHaveLength(3)
    expect(parseWrittenAnswer(value).attachments?.[0].type).toBe('image')
  })

  it('serializes plain text without JSON', () => {
    expect(serializeWrittenAnswer({ text: 'just text' })).toBe('just text')
  })

  it('serializes to JSON when attachments are present', () => {
    const payload = {
      text: 'answer',
      attachments: [{ type: 'formula', content: '<svg></svg>' }] as const,
    }
    const serialized = serializeWrittenAnswer(payload)
    const parsed = JSON.parse(serialized)
    expect(parsed.text).toBe('answer')
    expect(parsed.attachments).toHaveLength(1)
    expect(parsed.attachments[0].type).toBe('formula')
  })

  it('round-trips through parse and serialize', () => {
    const original = {
      text: 'typed',
      converted: '',
      drawing: '',
      attachments: [{ type: 'image', url: 'https://example.com/img.png', alt: 'img' }] as const,
    }
    const roundTrip = parseWrittenAnswer(serializeWrittenAnswer(original))
    expect(roundTrip).toEqual(original)
  })
})
