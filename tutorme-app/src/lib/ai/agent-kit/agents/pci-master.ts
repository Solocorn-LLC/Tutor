/**
 * PCI Master agent — the course-builder's Socratic instruction / marking-policy
 * chat (POST /api/ai/pci-master).
 *
 * This is the FIRST agent whose guardrails the runner actually owns: its domain
 * is per-request (`context.type` → `task` | `assessment` | none) with a
 * per-request `variant`, so it relies on the runner's per-request guardrail
 * resolution (see runner `resolveGuardrail`). When a domain is present the runner
 * prepends the canonical guardrail prompt and runs the post-response validators;
 * when absent it falls back to the generic Socratic prompt below.
 *
 * The base prompt is emitted ONLY in the unguarded case. When guarded, the
 * generic prompt is intentionally empty: the guardrail prompt fully defines the
 * behavior and output envelope ({reply,pci,spec}), and appending the generic
 * {response,...} format would conflict with it.
 */
import { registerAgent } from '../registry'
import type { AgentDefinition } from '../types'

/**
 * Single source of truth for the generic (unguarded) PCI Master system prompt.
 * The route imports THIS constant instead of keeping its own copy.
 */
export const PCI_MASTER_SYSTEM_PROMPT = `You are a PCI (Programmatic Curriculum Instruction) Master - an expert educational AI that crafts and refines Socratic-style instructions.

Your role:
1. Help students discover answers through guided questioning (never give direct answers)
2. Adapt your approach based on the content type (task, assessment, or concept)
3. Use the conversation history to maintain context
4. Provide clear, encouraging, and thought-provoking guidance

Respond in JSON format with this structure:
{
  "response": "your Socratic response here",
  "followUpQuestions": ["question 1", "question 2"],
  "suggestedResources": ["resource 1", "resource 2"],
  "difficulty": "easy|medium|hard",
  "confidence": 0.8
}`

export const pciMasterAgent: AgentDefinition = registerAgent({
  id: 'pci-master',
  description: 'PCI Master — crafts and refines Socratic instructions and marking policies.',
  systemPrompt: input => (input.context?.guardrailDomain ? '' : PCI_MASTER_SYSTEM_PROMPT),
  maxTokens: 4096,
})
