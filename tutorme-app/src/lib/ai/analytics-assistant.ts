/**
 * Analytics Assistant service.
 *
 * Encapsulates the LLM wiring for the live-session Desk → Insights → Analytics
 * chat. It is separate from the generic task/assessment PCI flows and uses the
 * analytics-specific guardrail prompt + a small read-only tool set.
 */

import { chatWithKimi } from '@/lib/ai/kimi'
import {
  ANALYTICS_ASSISTANT_SYSTEM_PROMPT,
  runAnalyticsGuardrails,
  type GuardrailViolation,
} from '@/lib/ai/guardrails'

export interface AnalyticsSessionInfo {
  id: string
  title: string
  scheduledAt: string
  status: string
}

export interface AnalyticsStudentInfo {
  id: string
  name: string
}

export interface AnalyticsLiveSubmission {
  taskId: string
  studentId: string
  submittedAt?: string | number
}

export interface AnalyticsContext {
  sessionId: string
  courseName?: string
  sessions: AnalyticsSessionInfo[]
  students: AnalyticsStudentInfo[]
  liveSubmissions: AnalyticsLiveSubmission[]
}

export interface AnalyticsMessage {
  role: 'user' | 'assistant'
  content: string
}

interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AnalyticsAssistantResult {
  reply: string
  guardrailWarnings: GuardrailViolation[]
}

interface ParsedResponse {
  tool?: string
  args?: Record<string, unknown>
  reply?: string
}

function buildContextBlock(ctx: AnalyticsContext): string {
  const lines: string[] = []
  lines.push(`Session ID: ${ctx.sessionId}`)
  if (ctx.courseName) lines.push(`Course: ${ctx.courseName}`)

  if (ctx.sessions.length > 0) {
    lines.push('Sessions:')
    for (const s of ctx.sessions) {
      const date = new Date(s.scheduledAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      lines.push(`  - ${s.title} (${date}) — ${s.status}`)
    }
  }

  lines.push(`Students enrolled: ${ctx.students.length}`)
  if (ctx.students.length > 0) {
    lines.push(`Student list: ${ctx.students.map(s => `${s.name} (${s.id})`).join(', ')}`)
  }

  const totalTasks = new Set(ctx.liveSubmissions.map(s => s.taskId)).size
  lines.push(`Deployed tasks: ${totalTasks}`)

  if (ctx.liveSubmissions.length > 0) {
    const byStudent = new Map<string, Set<string>>()
    for (const sub of ctx.liveSubmissions) {
      const set = byStudent.get(sub.studentId) ?? new Set<string>()
      if (sub.submittedAt) set.add(sub.taskId)
      byStudent.set(sub.studentId, set)
    }

    lines.push('Per-student task completion:')
    for (const student of ctx.students) {
      const completed = byStudent.get(student.id)?.size ?? 0
      const rate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0
      lines.push(`  - ${student.name}: ${completed}/${totalTasks} (${rate}%)`)
    }
  }

  return lines.join('\n')
}

function parseAssistantResponse(text: string): ParsedResponse | null {
  const cleaned = text.trim()
  let jsonText = cleaned

  // Strip markdown code fences if present.
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i)
  if (fenceMatch) jsonText = fenceMatch[1].trim()

  try {
    const parsed = JSON.parse(jsonText) as ParsedResponse
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    // Try to extract the first JSON object from the text.
    const objectMatch = cleaned.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0]) as ParsedResponse
        if (parsed && typeof parsed === 'object') return parsed
      } catch {
        return null
      }
    }
  }
  return null
}

function executeTool(ctx: AnalyticsContext, tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'answer_question': {
      return 'No tool result needed — answer directly.'
    }
    case 'summarize_session': {
      const totalTasks = new Set(ctx.liveSubmissions.map(s => s.taskId)).size
      const byStudent = new Map<string, Set<string>>()
      for (const sub of ctx.liveSubmissions) {
        const set = byStudent.get(sub.studentId) ?? new Set<string>()
        if (sub.submittedAt) set.add(sub.taskId)
        byStudent.set(sub.studentId, set)
      }
      const totalStudents = ctx.students.length
      const completed = [...byStudent.values()].filter(
        s => s.size === totalTasks && totalTasks > 0
      ).length
      const averageRate =
        totalStudents > 0 && totalTasks > 0
          ? Math.round(
              ([...byStudent.values()].reduce((acc, s) => acc + s.size, 0) /
                (totalStudents * totalTasks)) *
                100
            )
          : 0
      const names = ctx.students.map(s => s.name)
      return `Session summary: ${totalStudents} students, ${totalTasks} deployed tasks. ${completed} students completed all tasks. Average completion rate: ${averageRate}%. Students: ${names.join(', ') || 'none'}.`
    }
    case 'list_low_performers': {
      const threshold = typeof args.threshold === 'number' ? args.threshold : 50
      const totalTasks = new Set(ctx.liveSubmissions.map(s => s.taskId)).size
      const byStudent = new Map<string, Set<string>>()
      for (const sub of ctx.liveSubmissions) {
        const set = byStudent.get(sub.studentId) ?? new Set<string>()
        if (sub.submittedAt) set.add(sub.taskId)
        byStudent.set(sub.studentId, set)
      }
      const low = ctx.students
        .map(s => {
          const completed = byStudent.get(s.id)?.size ?? 0
          const rate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0
          return { name: s.name, rate, completed, totalTasks }
        })
        .filter(s => s.rate < threshold)
      if (low.length === 0) return `No students are below the ${threshold}% completion threshold.`
      return `Students below ${threshold}% completion: ${low
        .map(s => `${s.name} (${s.completed}/${s.totalTasks}, ${s.rate}%)`)
        .join(', ')}.`
    }
    default: {
      return `Unknown tool "${tool}". Available tools: answer_question, summarize_session, list_low_performers.`
    }
  }
}

/**
 * Run the analytics assistant for a tutor conversation.
 *
 * The assistant may call read-only tools up to `maxIterations` times before
 * returning a final reply.
 */
export async function runAnalyticsAssistant(
  ctx: AnalyticsContext,
  messages: AnalyticsMessage[]
): Promise<AnalyticsAssistantResult> {
  const systemMessages: LlmMessage[] = [
    { role: 'system', content: ANALYTICS_ASSISTANT_SYSTEM_PROMPT },
    { role: 'system', content: buildContextBlock(ctx) },
  ]

  const conversation: LlmMessage[] = messages.map(m => ({ role: m.role, content: m.content }))
  const maxIterations = 3

  for (let i = 0; i < maxIterations; i++) {
    const response = await chatWithKimi([...systemMessages, ...conversation], {
      temperature: 0.3,
      maxTokens: 1024,
      usageContext: { feature: 'analytics-assistant' },
    })

    const trimmed = response.trim()
    const warnings = runAnalyticsGuardrails(trimmed).violations
    const parsed = parseAssistantResponse(trimmed)

    if (!parsed) {
      return {
        reply: 'Sorry, I had trouble parsing the response. Please rephrase your question.',
        guardrailWarnings: warnings,
      }
    }

    if (parsed.reply && typeof parsed.reply === 'string') {
      return { reply: parsed.reply, guardrailWarnings: warnings }
    }

    if (parsed.tool && typeof parsed.tool === 'string') {
      const toolResult = executeTool(ctx, parsed.tool, parsed.args ?? {})
      conversation.push({ role: 'assistant', content: trimmed })
      conversation.push({ role: 'user', content: JSON.stringify({ toolResult }) })
      continue
    }

    return {
      reply: 'Sorry, I received an unexpected response. Please try again.',
      guardrailWarnings: warnings,
    }
  }

  return {
    reply: 'I reached the tool-call limit without a final answer. Please try again.',
    guardrailWarnings: [],
  }
}
