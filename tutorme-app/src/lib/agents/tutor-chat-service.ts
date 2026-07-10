import crypto from 'crypto'
import { AISecurityManager } from '@/lib/security/ai-sanitization'
import { generateWithFallback } from './orchestrator-llm'
import { buildCompletePrompt, type PromptConfig } from '@/lib/ai/teaching-prompts/prompt-builder'
import { findRelevantConcepts } from '@/lib/ai/subjects'
import { extractWhiteboardItems } from '@/lib/ai/whiteboard-extract'
import { classifyHintType, extractNextSteps } from '@/lib/agents/tutor'
import { withAssessmentIntegrity } from '@/lib/assessment/active-assessment'
import { withTaskPci } from '@/lib/assessment/task-pci-context'
import type { PciSpec } from '@/lib/assessment/pci-spec'

export interface TutorChatInput {
  userId: string
  message: string
  subject?: string
  topic?: string | null
  teachingMode?: 'socratic' | 'direct' | 'lesson' | 'practice'
  teachingAge?: number
  voiceGender?: string
  voiceAccent?: string
  chatHistory?: Array<{ role?: string; content?: string }>
  /**
   * When true, the student has an assessment in progress: the prompt is
   * constrained to procedural-only help (ASMT-15). Callers detect this with
   * `hasActiveAssessment`.
   */
  assessmentActive?: boolean
  /**
   * The current task's PCI (TASK-6), when the student is working on a specific
   * deployed task. Free-text notes and/or the finalized structured spec; the
   * tutor applies them as instructional guidance for THIS task. Loaded by the
   * caller from `builderTask` (persisted at deploy). No-op when absent.
   */
  taskPci?: string | null
  taskPciSpec?: PciSpec | null
}

export interface TutorChatOutput {
  response: string
  provider: string
  latencyMs: number
  hintType?: 'socratic' | 'direct' | 'encouragement' | 'clarification'
  relevantConcepts?: string[]
  suggestedNextSteps?: string[]
  whiteboardItems?: Array<{ type: 'text' | 'formula' | 'example' | 'tip'; content: string }>
}

function sanitizeChatHistory(chatHistory: Array<{ role?: string; content?: string }> = []) {
  return chatHistory.map(msg => ({
    role: msg?.role || 'user',
    content:
      msg?.role === 'user'
        ? AISecurityManager.sanitizeAiInput(String(msg?.content ?? ''))
        : String(msg?.content ?? ''),
  }))
}

/**
 * Canonical tutor chat entrypoint for API routes and UI features.
 * Lives under `lib/agents` so "AI agent" features share one orchestration boundary.
 *
 * NOTE: AI Tutor enrollment/subscription tables have been removed.
 * This function now uses a simplified flow without database checks.
 */
export async function runTutorChat(input: TutorChatInput): Promise<TutorChatOutput> {
  const safeMessage = AISecurityManager.sanitizeAiInput(String(input.message))
  if (!safeMessage) {
    throw new Error('Message is required or invalid after sanitization')
  }

  const safeChatHistory = sanitizeChatHistory(input.chatHistory)

  // AI Tutor enrollment/subscription checks removed - feature deleted
  // Defaulting to FREE tier
  const tier = 'FREE'

  const promptConfig: PromptConfig = {
    language: 'en',
    teachingMode: input.teachingMode || 'socratic',
    personality: 'friendly_mentor',
    subject: input.subject,
    topic: input.topic,
    teachingAge: input.teachingAge,
    voiceGender: input.voiceGender,
    voiceAccent: input.voiceAccent,
    tier: tier as PromptConfig['tier'],
    chatHistory: safeChatHistory.map(msg => ({
      role: msg.role || 'user',
      content: msg.content || '',
    })),
    userMessage: safeMessage,
  }

  // TASK-6: when the student is on a specific task, apply that task's PCI as
  // instructional guidance. Applied to the base prompt first, then the
  // integrity directive is layered on top so it stays first/highest.
  const taskAwarePrompt = withTaskPci(
    buildCompletePrompt(promptConfig),
    input.taskPci,
    input.taskPciSpec
  )

  // ASMT-15: while the student has a live assessment, constrain the tutor to
  // procedural-only help so it can't be used to solve in-progress questions.
  const systemPrompt = withAssessmentIntegrity(taskAwarePrompt, input.assessmentActive === true)

  const aiResponse = await generateWithFallback(systemPrompt, {
    temperature: 0.7,
    maxTokens: 2048,
  })

  const validation = await AISecurityManager.validateAiResponse(aiResponse.content)
  if (!validation.isValid && validation.severity === 'CRITICAL') {
    throw new Error('AI response failed security validation')
  }

  const hintType = classifyHintType(aiResponse.content)
  const relevantConcepts = input.subject
    ? findRelevantConcepts(input.subject, safeMessage)
    : undefined
  const suggestedNextSteps = extractNextSteps(aiResponse.content)
  const whiteboardItems = extractWhiteboardItems(aiResponse.content)

  // AI interaction session tracking removed - feature deleted

  return {
    response: aiResponse.content,
    provider: aiResponse.provider,
    latencyMs: aiResponse.latencyMs,
    hintType,
    relevantConcepts,
    suggestedNextSteps,
    whiteboardItems: whiteboardItems.length > 0 ? whiteboardItems : undefined,
  }
}
