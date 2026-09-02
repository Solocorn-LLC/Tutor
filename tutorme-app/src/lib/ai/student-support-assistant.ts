/**
 * Student Support AI Assistant service.
 *
 * Encapsulates the LLM wiring for the student-facing support assistant in the
 * Help page. It answers platform questions only and returns a plain-text reply
 * plus any guardrail warnings.
 */

import { chatWithKimi } from '@/lib/ai/kimi'
import {
  studentSupportSystemPrompt,
  runStudentSupportGuardrails,
  type GuardrailViolation,
} from '@/lib/ai/guardrails'

export interface SupportMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StudentSupportAssistantResult {
  reply: string
  guardrailWarnings: GuardrailViolation[]
}

interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Run the student support AI assistant for a conversation.
 */
export async function runStudentSupportAssistant(
  messages: SupportMessage[]
): Promise<StudentSupportAssistantResult> {
  const systemMessages: LlmMessage[] = [{ role: 'system', content: studentSupportSystemPrompt() }]

  const conversation: LlmMessage[] = messages.map(m => ({ role: m.role, content: m.content }))

  const response = await chatWithKimi([...systemMessages, ...conversation], {
    temperature: 0.4,
    maxTokens: 1024,
    usageContext: { feature: 'student-support-assistant' },
  })

  const trimmed = response.trim()
  const warnings = runStudentSupportGuardrails(trimmed, messages).violations

  // Try to extract the reply from a JSON object.
  try {
    const parsed = JSON.parse(trimmed) as { reply?: string }
    if (parsed && typeof parsed.reply === 'string') {
      return { reply: parsed.reply, guardrailWarnings: warnings }
    }
  } catch {
    // Not valid JSON; fall through.
  }

  // If the model returned plain text, surface it directly.
  if (trimmed) {
    return { reply: trimmed, guardrailWarnings: warnings }
  }

  return {
    reply: 'Sorry, I had trouble generating a response. Please rephrase your question.',
    guardrailWarnings: warnings,
  }
}
