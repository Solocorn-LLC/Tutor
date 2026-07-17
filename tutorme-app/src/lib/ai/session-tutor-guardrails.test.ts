import { describe, it, expect } from 'vitest'
import {
  sanitizeSessionTutorMessage,
  checkSessionTutorInputGuardrails,
  applySessionTutorOutputGuardrails,
  MAX_MESSAGE_LENGTH,
  MAX_REPLY_LENGTH,
} from './session-tutor-guardrails'

describe('session-tutor guardrails', () => {
  describe('sanitizeSessionTutorMessage', () => {
    it('trims whitespace and collapses internal whitespace', () => {
      expect(sanitizeSessionTutorMessage('  hello   world  ')).toBe('hello world')
    })

    it('strips control characters', () => {
      expect(sanitizeSessionTutorMessage('hello\x00world\x1F')).toBe('hello world')
    })

    it('truncates to the maximum allowed length', () => {
      const long = 'a'.repeat(MAX_MESSAGE_LENGTH + 100)
      expect(sanitizeSessionTutorMessage(long)).toHaveLength(MAX_MESSAGE_LENGTH)
    })
  })

  describe('checkSessionTutorInputGuardrails', () => {
    it('allows general session advice', () => {
      const result = checkSessionTutorInputGuardrails(
        'How should I pace this task for a struggling student?',
        {}
      )
      expect(result.blocked).toBe(false)
      expect(result.response).toBe('')
    })

    it('blocks instructions to send messages to students', () => {
      const result = checkSessionTutorInputGuardrails(
        'Send this explanation to the whole class in the chat',
        {}
      )
      expect(result.blocked).toBe(true)
      expect(result.rule).toBe('NO_AUTO_STUDENT_MESSAGE')
    })

    it('blocks auto-grade instructions', () => {
      const result = checkSessionTutorInputGuardrails('Auto-grade all submissions now', {})
      expect(result.blocked).toBe(true)
      expect(result.rule).toBe('NO_AUTO_ACTION')
    })

    it('blocks requests for sensitive data', () => {
      const result = checkSessionTutorInputGuardrails('What is my credit card number?', {})
      expect(result.blocked).toBe(true)
      expect(result.rule).toBe('NO_SENSITIVE_DATA')
    })
  })

  describe('applySessionTutorOutputGuardrails', () => {
    it('passes through normal replies unchanged', () => {
      const result = applySessionTutorOutputGuardrails(
        'Try asking the student to explain their reasoning.',
        {}
      )
      expect(result.reply).toBe('Try asking the student to explain their reasoning.')
      expect(result.violations).toHaveLength(0)
    })

    it('truncates replies that exceed the maximum length', () => {
      const long = 'a'.repeat(MAX_REPLY_LENGTH + 100)
      const result = applySessionTutorOutputGuardrails(long, {})
      expect(result.reply.length).toBeLessThan(long.length)
      expect(result.reply.endsWith('[Response truncated]')).toBe(true)
      expect(result.violations.some(v => v.ruleId === 'OUTPUT-LENGTH')).toBe(true)
    })

    it('flags claims that a message was sent to students', () => {
      const result = applySessionTutorOutputGuardrails('I have sent the hint to the class.', {})
      expect(result.violations.some(v => v.ruleId === 'NO_STUDENT_SEND_CLAIM')).toBe(true)
      expect(result.reply).toContain('Nothing is sent to students unless you send it')
    })
  })
})
