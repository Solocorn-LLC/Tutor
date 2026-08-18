/**
 * Course Builder AI Assistant service.
 *
 * Encapsulates the LLM wiring for the context-aware AI Assistant in the Course
 * Builder Desk panel. It works across builder states (edit, test, classroom,
 * first-course, new-course, no-course) and uses state-specific system prompts
 * plus shared guardrails.
 */

import { chatWithKimi } from '@/lib/ai/kimi'
import {
  courseBuilderSystemPrompt,
  runCourseBuilderGuardrails,
  type CourseBuilderMode,
  type GuardrailViolation,
} from '@/lib/ai/guardrails'

export interface CourseBuilderTaskInfo {
  id: string
  title: string
  type: 'task' | 'assessment' | 'homework'
}

export interface CourseBuilderLessonInfo {
  id: string
  title: string
  taskCount: number
  assessmentCount: number
}

export interface CourseBuilderContext {
  mode: CourseBuilderMode
  courseId?: string | null
  courseName?: string
  courseDescription?: string
  /** Published lifecycle state of the course. */
  courseState?: 'creating' | 'unpublished' | 'published' | 'demo' | null
  totalLessons: number
  totalTasks: number
  totalAssessments: number
  lessons: CourseBuilderLessonInfo[]
  loadedItem?: CourseBuilderTaskInfo | null
  tutorCourseCount?: number
  /** True when the tutor has already generated a DMI (questions/marks/answers). */
  hasGeneratedDmi?: boolean
  /** Number of generated DMI questions. */
  dmiQuestionCount?: number
  /** True when the tutor has finalized a PCI (marking policy) for the loaded item. */
  hasCompletedPci?: boolean
}

export interface CourseBuilderMessage {
  role: 'user' | 'assistant'
  content: string
}

interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CourseBuilderAssistantResult {
  reply: string
  guardrailWarnings: GuardrailViolation[]
}

interface ParsedResponse {
  reply?: string
}

function buildContextBlock(ctx: CourseBuilderContext): string {
  const lines: string[] = []

  if (ctx.courseId) {
    lines.push(`Course ID: ${ctx.courseId}`)
  }

  lines.push(`Course: ${ctx.courseName?.trim() || 'Untitled course'}`)

  if (ctx.courseState) {
    lines.push(`Course state: ${ctx.courseState}`)
  }

  if (ctx.courseDescription?.trim()) {
    lines.push(`Course description: ${ctx.courseDescription.trim()}`)
  }

  lines.push(`Builder mode: ${ctx.mode}`)
  lines.push(`Lessons: ${ctx.totalLessons}`)
  lines.push(`Tasks: ${ctx.totalTasks}`)
  lines.push(`Assessments: ${ctx.totalAssessments}`)

  if (ctx.tutorCourseCount !== undefined) {
    lines.push(`Tutor's existing courses: ${ctx.tutorCourseCount}`)
  }

  if (ctx.lessons.length > 0) {
    lines.push('Lesson outline:')
    for (const lesson of ctx.lessons) {
      lines.push(
        `  - ${lesson.title} (${lesson.taskCount} tasks, ${lesson.assessmentCount} assessments)`
      )
    }
  }

  if (ctx.loadedItem) {
    lines.push(
      `Currently loaded item: ${ctx.loadedItem.title} (${ctx.loadedItem.type}, ID: ${ctx.loadedItem.id})`
    )
  }

  if (ctx.hasGeneratedDmi !== undefined) {
    lines.push(`DMI generated: ${ctx.hasGeneratedDmi ? 'yes' : 'no'}`)
  }
  if (typeof ctx.dmiQuestionCount === 'number' && ctx.dmiQuestionCount > 0) {
    lines.push(`DMI questions: ${ctx.dmiQuestionCount}`)
  }
  if (ctx.hasCompletedPci !== undefined) {
    lines.push(`PCI finalized: ${ctx.hasCompletedPci ? 'yes' : 'no'}`)
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

/**
 * Run the course builder AI Assistant for a tutor conversation.
 */
export async function runCourseBuilderAssistant(
  ctx: CourseBuilderContext,
  messages: CourseBuilderMessage[]
): Promise<CourseBuilderAssistantResult> {
  const systemMessages: LlmMessage[] = [
    { role: 'system', content: courseBuilderSystemPrompt(ctx.mode) },
    { role: 'system', content: buildContextBlock(ctx) },
  ]

  const conversation: LlmMessage[] = messages.map(m => ({ role: m.role, content: m.content }))

  const response = await chatWithKimi([...systemMessages, ...conversation], {
    temperature: 0.3,
    maxTokens: 1024,
    usageContext: { feature: 'course-builder-assistant' },
  })

  const trimmed = response.trim()
  const warnings = runCourseBuilderGuardrails(trimmed, messages).violations
  const parsed = parseAssistantResponse(trimmed)

  if (parsed?.reply && typeof parsed.reply === 'string') {
    return { reply: parsed.reply, guardrailWarnings: warnings }
  }

  // If the model returned plain text (not JSON), surface it directly when it looks safe.
  if (trimmed && !trimmed.startsWith('{')) {
    return { reply: trimmed, guardrailWarnings: warnings }
  }

  return {
    reply: 'Sorry, I had trouble parsing the response. Please rephrase your question.',
    guardrailWarnings: warnings,
  }
}
