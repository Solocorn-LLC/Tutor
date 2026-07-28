/**
 * Shared grading logic for the chat-based TASK flow.
 *
 * Used by:
 *   - POST /api/student/assignments/[taskId]/task-chat  (live student flow)
 *   - POST /api/tutor/task-chat-preview                   (tutor test-mode preview)
 *
 * Keeping the prompt, model settings, guardrails, and parsing in one place
 * guarantees that the Test tab behaves identically to the live student flow.
 */

import { ASK_SYSTEM_PROMPT } from '@/lib/ai/task-chat-prompts'
import { generateWithKimi } from '@/lib/ai/kimi'
import { runTaskGuardrails } from '@/lib/ai/guardrails'
import { gradeAnswerAgainstBasis, renderGradingSpec } from '@/lib/grading/pci-grader'
import { AISecurityManager } from '@/lib/security/ai-sanitization'

const MAX_ANSWERS = 12
const MAX_ANSWER_LEN = 3000
const MAX_QUESTION = 800
const MAX_HISTORY_TURNS = 6

export interface TaskChatTask {
  taskId: string
  title: string
  content?: string | null
  pci?: string | null
  pciSpec?: unknown
}

export interface TaskChatAnswerResponse {
  answer: string
  response: string
  score: number | null
}

export interface TaskChatCompleteResult {
  mode: 'complete'
  responses: TaskChatAnswerResponse[]
  hasBasis: boolean
  aiUnavailable: boolean
  /** aiFeedback payload ready for taskSubmission.aiFeedback. */
  aiFeedback: {
    generatedAt: string
    provider: 'kimi'
    items: Array<{ questionId: string; explanation: string }>
  }
  /** Answers keyed by 1-based index, ready for taskSubmission.answers. */
  answersRecord: Record<string, string>
  /** Average score over numeric scores, or null when none were gradable. */
  avgScore: number | null
}

export interface TaskChatAskInput {
  task: TaskChatTask
  question: string
  priorAnswers?: string[]
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface TaskChatAskResult {
  mode: 'ask'
  answer: string
}

export function sanitizeTaskChatAnswers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(a =>
      String(a ?? '')
        .trim()
        .slice(0, MAX_ANSWER_LEN)
    )
    .filter(Boolean)
    .slice(0, MAX_ANSWERS)
}

export function buildTaskContext(task: TaskChatTask): string {
  return `${task.title}\n\n${task.content ?? ''}`.trim().slice(0, 4000)
}

export async function gradeTaskChatComplete(
  task: TaskChatTask,
  answers: string[]
): Promise<TaskChatCompleteResult> {
  const specText = renderGradingSpec(task.pciSpec)
  const taskContext = buildTaskContext(task)

  const responses: TaskChatAnswerResponse[] = []
  let anyBasis = false
  let anyUnavailable = false

  for (const answer of answers) {
    const result = await gradeAnswerAgainstBasis({
      pci: task.pci,
      specText,
      questionText: taskContext,
      studentAnswer: answer,
    })
    anyBasis = anyBasis || result.hasBasis
    anyUnavailable = anyUnavailable || result.aiUnavailable

    const response = !result.hasBasis
      ? "Your answer's recorded — your tutor hasn't set a marking policy for this task yet, so I can't check it here."
      : result.aiUnavailable
        ? "Your answer's recorded, but the assistant is unavailable right now — try asking again in a moment."
        : result.feedback || 'Thanks — noted.'

    responses.push({ answer, response, score: result.score })
  }

  const graded = responses.map(r => r.score).filter((s): s is number => typeof s === 'number')
  const avgScore = graded.length
    ? Math.round(graded.reduce((a, b) => a + b, 0) / graded.length)
    : null

  const answersRecord: Record<string, string> = {}
  answers.forEach((a, i) => {
    answersRecord[String(i + 1)] = a
  })

  const aiFeedback = {
    generatedAt: new Date().toISOString(),
    provider: 'kimi' as const,
    items: responses.map((r, i) => ({
      questionId: String(i + 1),
      explanation: r.response,
    })),
  }

  return {
    mode: 'complete',
    responses,
    hasBasis: anyBasis,
    aiUnavailable: anyUnavailable && !anyBasis,
    aiFeedback,
    answersRecord,
    avgScore,
  }
}

export async function gradeTaskChatAsk(input: TaskChatAskInput): Promise<TaskChatAskResult> {
  const { task, question, priorAnswers = [], history = [] } = input
  const q = AISecurityManager.sanitizeAiInput(question.trim()).slice(0, MAX_QUESTION)
  if (!q) {
    throw new Error('A non-empty question is required')
  }

  const specText = renderGradingSpec(task.pciSpec)
  const taskContext = buildTaskContext(task)
  const pci = (task.pci ?? '').trim()

  if (!pci && !specText) {
    return {
      mode: 'ask',
      answer:
        "Your tutor hasn't set a marking policy for this task, so I can't explain it reliably — please ask your tutor directly.",
    }
  }

  const trimmedHistory = history.slice(-MAX_HISTORY_TURNS)
  const historyBlock = trimmedHistory.length
    ? `Conversation so far:\n${trimmedHistory
        .map(
          t =>
            `${t.role === 'assistant' ? 'Tutor' : 'Student'}: ${AISecurityManager.sanitizeAiInput(String(t.content)).slice(0, 800)}`
        )
        .join('\n')}\n\n`
    : ''

  const safePriorAnswers = priorAnswers
    .map(a => AISecurityManager.sanitizeAiInput(String(a)).slice(0, 800))
    .filter(Boolean)

  const answersBlock = safePriorAnswers.length
    ? `The student's answers to this task:\n${safePriorAnswers.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\n`
    : ''
  const specBlock = specText ? `Structured marking guidance (PCI):\n${specText}\n\n` : ''
  const prompt = `Tutor's marking policy (PCI):\n${pci.slice(0, 2000)}\n\n${specBlock}Task:\n${taskContext}\n\n${answersBlock}${historyBlock}The student's follow-up:\n${q}`

  let answer: string
  try {
    answer = await generateWithKimi(prompt, {
      systemPrompt: ASK_SYSTEM_PROMPT,
      temperature: 0.4,
      maxTokens: 400,
      timeoutMs: 30000,
    })
  } catch (aiErr) {
    console.warn('[task-chat-grader] Kimi call failed:', aiErr)
    throw new Error('The tutor assistant is unavailable right now. Please try again.')
  }

  answer = answer.trim().slice(0, 1500)
  if (!answer) {
    throw new Error('Could not generate an answer.')
  }

  const guardrail = runTaskGuardrails(answer, {
    sourceContent: [pci, specText].filter(Boolean).join('\n'),
  })
  if (guardrail.violations.length > 0) {
    console.warn(
      '[task-chat-grader] guardrail warnings:',
      guardrail.violations.map(v => `${v.ruleId} ${v.severity}`).join(', ')
    )
  }

  return { mode: 'ask', answer }
}
