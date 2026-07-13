/**
 * The agent loop. Phase 1: compose the system prompt (guardrail prompt +
 * skills + base), call the model, and — for guarded agents — run the
 * post-response validator. Tool execution + hand-offs are Phase 2.
 *
 * The runner reuses the EXISTING guardrails and provider unchanged, so it can't
 * weaken answer-leak protection: every guarded agent gets the canonical guardrail
 * prompt prepended and the validator run, uniformly.
 */
import {
  guardrailSystemPrompt,
  runTaskGuardrails,
  GUARDRAILED_TEMPERATURE,
  type GuardrailRunResult,
} from '@/lib/ai/guardrails'
import type { AgentDefinition, AgentInput, AgentResult, GenerateFn } from './types'
import { defaultGenerate } from './provider-adapter'

export interface RunnerDeps {
  generate: GenerateFn
}

const DEFAULT_DEPS: RunnerDeps = { generate: defaultGenerate }

function resolveBasePrompt(def: AgentDefinition, input: AgentInput): string {
  return typeof def.systemPrompt === 'function' ? def.systemPrompt(input) : def.systemPrompt
}

/** Guardrail prompt (if guarded) + base prompt + active skill instructions. */
function composeSystemPrompt(def: AgentDefinition, input: AgentInput): string {
  const parts: string[] = []
  if (def.guardrailDomain) parts.push(guardrailSystemPrompt(def.guardrailDomain, def.variant))
  parts.push(resolveBasePrompt(def, input))
  for (const skill of def.skills ?? []) parts.push(skill.instructions)
  return parts.join('\n\n')
}

export async function runAgent(
  def: AgentDefinition,
  input: AgentInput,
  deps: RunnerDeps = DEFAULT_DEPS
): Promise<AgentResult> {
  const system = composeSystemPrompt(def, input)
  const temperature = def.guardrailDomain ? GUARDRAILED_TEMPERATURE : (def.temperature ?? 0.7)

  const { text } = await deps.generate({
    system,
    user: input.message,
    temperature,
    maxTokens: def.maxTokens,
  })

  let guardrail: GuardrailRunResult | undefined
  if (def.guardrailDomain === 'task') {
    // Task PCI output is validated as free text. Assessment/DMI output is
    // validated at the structured-payload boundary (findEvaluationLeaks /
    // stripEvaluationLayer), not here — see README, Phase 2.
    guardrail = runTaskGuardrails(text)
  }

  return { agentId: def.id, text, guardrail }
}
