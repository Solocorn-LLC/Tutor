/**
 * Input/output guardrails for the tutor-facing Session AI.
 *
 * These are deterministic safety layers around the LLM:
 *  - Validate and sanitize the request.
 *  - Block obviously unsafe instructions before they reach the model.
 *  - Post-process the model reply to catch any remaining "auto-send" claims.
 */

import { z } from 'zod'
import type { SessionTutorContext } from './session-tutor-prompts'

export interface SessionTutorHistoryMessage {
  role: 'tutor' | 'ai'
  content: string
}

export const MAX_MESSAGE_LENGTH = 2_000
export const MAX_HISTORY_MESSAGES = 50
export const MAX_REPLY_LENGTH = 4_000

export const SessionTutorContextSchema = z.object({
  taskName: z.string().max(200).optional(),
  courseName: z.string().max(200).optional(),
  taskId: z.string().max(100).optional(),
  enrolledStudents: z.number().int().min(0).max(10_000).optional(),
  currentDate: z.string().max(100).optional(),
  sessionNumber: z.number().int().min(1).max(10_000).optional(),
  attendance: z.string().max(50).optional(),
  taskContent: z.string().max(100_000).optional(),
  taskPci: z.string().max(100_000).optional(),
  taskPciSpec: z.record(z.string(), z.string()).nullable().optional(),
  extensionName: z.string().max(200).nullable().optional(),
})

export const SessionTutorRequestSchema = z.object({
  message: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  context: SessionTutorContextSchema.default({}),
  history: z
    .array(
      z.object({
        role: z.enum(['tutor', 'ai']),
        content: z.string().max(5_000),
      })
    )
    .max(MAX_HISTORY_MESSAGES)
    .default([]),
})

export function sanitizeSessionTutorMessage(input: string): string {
  return input
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH)
}

const DIRECT_TO_STUDENT_PATTERNS = [
  /\b(send|post|broadcast|relay|forward|share)\s+(?:this|that|it|the\s+message|your\s+(?:response|answer|reply))\b.*?\s+(?:to|with|in|into)\s+(?:the\s+)?(?:whole\s+)?(?:student|class|chat|everyone|all)\b/i,
  /\b(send|post|broadcast|relay|forward|share)\s+(?:to|with)\s+(?:the\s+)?(?:whole\s+)?(?:student|class|chat|everyone|all)\b/i,
  /\b(tell|ask|write to)\s+(?:the\s+)?(?:whole\s+)?(?:student|class|everyone|all)\b/i,
  /\bpost\s+(?:this|that|it)\s+in\s+(?:the\s+)?chat\b/i,
]

const AUTO_ACTION_PATTERNS = [
  /\b(auto[- ]?grade|grade\s+(?:all|everyone|submissions|answers)|mark\s+(?:all|everyone|submissions))\b/i,
  /\b(reveal|show|display)\s+(?:the\s+)?(?:answer|answers|rubric|mark scheme|solution|solutions)\s+(?:to\s+(?:the\s+)?(?:student|class|everyone|all)|in\s+(?:the\s+)?chat)\b/i,
]

const HARMFUL_PATTERNS = [
  /\b(credit[- ]?card|cvv|payment|ssn|social security|password|secret key|api key)\b/i,
]

export interface InputGuardrailResult {
  blocked: boolean
  response: string
  rule?: string
}

export function checkSessionTutorInputGuardrails(
  message: string,
  _context: SessionTutorContext
): InputGuardrailResult {
  for (const re of DIRECT_TO_STUDENT_PATTERNS) {
    if (re.test(message)) {
      return {
        blocked: true,
        rule: 'NO_AUTO_STUDENT_MESSAGE',
        response: `I can't send messages to students for you. If you'd like, I can draft a message for you to review and send yourself — just let me know what you want to say.`,
      }
    }
  }

  for (const re of AUTO_ACTION_PATTERNS) {
    if (re.test(message)) {
      return {
        blocked: true,
        rule: 'NO_AUTO_ACTION',
        response: `I can't automatically grade submissions or reveal answers to students. I can suggest how to apply the task's PCI, or draft a tutor-only explanation for you to use.`,
      }
    }
  }

  for (const re of HARMFUL_PATTERNS) {
    if (re.test(message)) {
      return {
        blocked: true,
        rule: 'NO_SENSITIVE_DATA',
        response:
          "I can't help with payment details or sensitive personal data. Let me know how I can assist with this session.",
      }
    }
  }

  return { blocked: false, response: '' }
}

export interface GuardrailViolation {
  ruleId: string
  message: string
  severity: 'warning' | 'error'
}

export interface OutputGuardrailResult {
  reply: string
  violations: GuardrailViolation[]
}

const OUTPUT_STUDENT_SEND_PATTERNS = [
  /\b(I\s+(?:have\s+)?sent|I\s+will\s+send|I\s+sent|message\s+sent|posted\s+(?:to|in)\s+(?:the\s+)?(?:chat|class|students))\b/i,
  /\b(student|class|everyone|all)\s+(?:will\+?see|will\s+receive|saw|received)\s+(?:this|that|it|the\s+message)\b/i,
]

const OUTPUT_INDIVIDUAL_FEEDBACK_PATTERNS = [
  /\b(the correct answer is|your answer is wrong|your answer is incorrect|student \d+ answered|student \d+ got|student \d+ is correct|student \d+ is wrong|test student \d+ answered)\b/i,
]

const OUTPUT_META_COMMENTARY_PATTERNS = [
  /\b(individual feedback|correction of answers|feedback or correction)\b.*\b(as per the guidelines|according to the guidelines|has not been given|was not provided|is not provided)\b/i,
  /\bI (?:am|have been) (?:instructed|told|asked) not? to\b/i,
  /\bPlease note that .* (?:not|never) (?:give|provide|offer|share)\b/i,
]

export function applySessionTutorOutputGuardrails(
  raw: string,
  _context: SessionTutorContext
): OutputGuardrailResult {
  const violations: GuardrailViolation[] = []
  let reply = raw.trim()

  if (reply.length > MAX_REPLY_LENGTH) {
    reply = reply.slice(0, MAX_REPLY_LENGTH) + '\n\n[Response truncated]'
    violations.push({
      ruleId: 'OUTPUT-LENGTH',
      message: `Response exceeded ${MAX_REPLY_LENGTH} characters and was truncated.`,
      severity: 'warning',
    })
  }

  for (const re of OUTPUT_STUDENT_SEND_PATTERNS) {
    if (re.test(reply)) {
      violations.push({
        ruleId: 'NO_STUDENT_SEND_CLAIM',
        message: 'Output claims a message was sent to students; advisor-only mode forbids that.',
        severity: 'warning',
      })
      reply +=
        '\n\n_Reminder: I can only draft messages for you. Nothing is sent to students unless you send it._'
      break
    }
  }

  for (const re of OUTPUT_INDIVIDUAL_FEEDBACK_PATTERNS) {
    if (re.test(reply)) {
      violations.push({
        ruleId: 'NO_INDIVIDUAL_FEEDBACK',
        message:
          'Output gives individual feedback in a classroom summary context; summaries should be class-level only.',
        severity: 'warning',
      })
      reply +=
        '\n\n_Reminder: In classroom summaries, describe class-level patterns rather than addressing individual students._'
      break
    }
  }

  for (const re of OUTPUT_META_COMMENTARY_PATTERNS) {
    if (re.test(reply)) {
      violations.push({
        ruleId: 'NO_META_COMMENTARY',
        message:
          'Output contains meta-commentary about instructions or guidelines; summaries should state findings directly.',
        severity: 'warning',
      })
      reply = reply
        .replace(re, '')
        .replace(/\n{2,}/g, '\n')
        .trim()
      break
    }
  }

  return { reply, violations }
}
