import { describe, it, expect } from 'vitest'
import { parsePciTranscript } from './pci'

describe('parsePciTranscript', () => {
  it('parses a User/Assistant transcript into messages', () => {
    expect(parsePciTranscript('User: mark by method\nAssistant: ok, M1 A1')).toEqual([
      { role: 'user', content: 'mark by method' },
      { role: 'assistant', content: 'ok, M1 A1' },
    ])
  })

  it('appends unprefixed continuation lines to the current message', () => {
    expect(parsePciTranscript('Assistant: line one\nline two\nline three')).toEqual([
      { role: 'assistant', content: 'line one\nline two\nline three' },
    ])
  })

  it('treats leading unprefixed prose as an assistant message (applied rubric)', () => {
    expect(parsePciTranscript('Award 1 mark per valid point, max 4.')).toEqual([
      { role: 'assistant', content: 'Award 1 mark per valid point, max 4.' },
    ])
  })

  it('is case-insensitive on the role prefix', () => {
    expect(parsePciTranscript('user: hi\nASSISTANT: hello')).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
  })

  it('returns [] for empty/whitespace', () => {
    expect(parsePciTranscript('')).toEqual([])
    expect(parsePciTranscript('   \n  ')).toEqual([])
  })
})
