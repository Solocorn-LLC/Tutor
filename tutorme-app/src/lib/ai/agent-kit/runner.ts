/**
 * The agent loop.
 *
 * Phase 1: compose the system prompt (guardrail prompt + skills + base), call the
 * model, and — for guarded agents — run the post-response validator.
 * Phase 2: a provider-agnostic ReAct/JSON tool loop (the model requests a tool as
 * JSON; the runner validates the input with the tool's Zod schema, runs it, and
 * feeds the result back), plus structured assessment/DMI post-validation.
 *
 * Reuses the EXISTING guardrails + provider unchanged, so answer-leak protection
 * can't be weakened: every guarded agent gets the canonical guardrail prompt and
 * the validator — uniformly, including on the final tool-loop answer.
 */
import {
  guardrailSystemPrompt,
  runTaskGuardrails,
  runAssessmentGuardrails,
  GUARDRAILED_TEMPERATURE,
  type GuardrailRunResult,
  type GuardrailDomain,
  type PciVariant,
} from '@/lib/ai/guardrails'
import type { AgentDefinition, AgentInput, AgentResult, GenerateFn, Tool } from './types'
import { defaultGenerate } from './provider-adapter'

export interface RunnerDeps {
  generate: GenerateFn
}

const DEFAULT_DEPS: RunnerDeps = { generate: defaultGenerate }
const MAX_TOOL_ITERATIONS = 5

function resolveBasePrompt(def: AgentDefinition, input: AgentInput): string {
  return typeof def.systemPrompt === 'function' ? def.systemPrompt(input) : def.systemPrompt
}

/**
 * Resolve the effective guardrail domain/variant for THIS call: a per-request
 * override on `input.context` wins over the agent's static definition. This is
 * what lets one agent (e.g. pci-master) serve requests whose domain varies.
 */
function resolveGuardrail(
  def: AgentDefinition,
  input: AgentInput
): { domain?: GuardrailDomain; variant?: PciVariant } {
  return {
    domain: input.context?.guardrailDomain ?? def.guardrailDomain,
    variant: input.context?.variant ?? def.variant,
  }
}

/** Guardrail prompt (if guarded) + base prompt + active skill instructions. */
function composeSystemPrompt(
  def: AgentDefinition,
  input: AgentInput,
  domain: GuardrailDomain | undefined,
  variant: PciVariant | undefined
): string {
  const parts: string[] = []
  if (domain) parts.push(guardrailSystemPrompt(domain, variant))
  parts.push(resolveBasePrompt(def, input))
  for (const skill of def.skills ?? []) parts.push(skill.instructions)
  return parts.join('\n\n')
}

function collectTools(def: AgentDefinition): Tool[] {
  const tools: Tool[] = [...(def.tools ?? [])]
  for (const skill of def.skills ?? []) tools.push(...(skill.tools ?? []))
  return tools
}

function toolProtocol(tools: Tool[]): string {
  const list = tools.map(t => `- ${t.name}: ${t.description}`).join('\n')
  return [
    'You have tools. To call one, reply with ONLY a JSON object:',
    '  {"tool": "<name>", "input": { ... }}',
    'When you have the final answer, reply with ONLY:',
    '  {"final": "<answer>"}',
    'Available tools:',
    list,
  ].join('\n')
}

function tryParseJson(text: string): Record<string, unknown> | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** ReAct/JSON tool loop — provider-agnostic (no native function-calling needed). */
async function runToolLoop(
  def: AgentDefinition,
  input: AgentInput,
  baseSystem: string,
  temperature: number,
  deps: RunnerDeps
): Promise<string> {
  const tools = collectTools(def)
  const byName = new Map(tools.map(t => [t.name, t]))
  const system = `${baseSystem}\n\n${toolProtocol(tools)}`
  const ctx = input.context ?? {}
  let transcript = input.message

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const { text } = await deps.generate({
      system,
      user: transcript,
      temperature,
      maxTokens: def.maxTokens,
    })
    const parsed = tryParseJson(text)
    if (!parsed) return text // the model answered in plain text
    if (typeof parsed.final === 'string') return parsed.final
    if (typeof parsed.tool !== 'string') return text

    const tool = byName.get(parsed.tool)
    if (!tool) {
      transcript += `\n\n[system] Tool "${parsed.tool}" does not exist. Available: ${tools.map(t => t.name).join(', ')}.`
      continue
    }
    const validation = tool.input.safeParse(parsed.input)
    if (!validation.success) {
      transcript += `\n\n[system] Invalid input for "${tool.name}": ${validation.error.message}`
      continue
    }
    const result = await tool.run(validation.data, ctx)
    transcript += `\n\n[system] Tool "${tool.name}" returned: ${JSON.stringify(result)}`
  }

  // Out of iterations — force a final answer with no further tool calls.
  const { text } = await deps.generate({
    system: baseSystem,
    user: `${transcript}\n\n[system] Provide your final answer now.`,
    temperature,
    maxTokens: def.maxTokens,
  })
  return text
}

/** Post-response guardrails, applied to the final answer regardless of tool use. */
function runPostGuardrails(
  domain: GuardrailDomain | undefined,
  text: string
): GuardrailRunResult | undefined {
  if (domain === 'task') return runTaskGuardrails(text)
  if (domain === 'assessment') {
    // Assessment/DMI output is structured — parse it and run the leak validator.
    const parsed = tryParseJson(text)
    if (!parsed) return undefined
    try {
      return runAssessmentGuardrails(
        parsed as unknown as Parameters<typeof runAssessmentGuardrails>[0]
      )
    } catch {
      return undefined
    }
  }
  return undefined
}

export async function runAgent(
  def: AgentDefinition,
  input: AgentInput,
  deps: RunnerDeps = DEFAULT_DEPS
): Promise<AgentResult> {
  const { domain, variant } = resolveGuardrail(def, input)
  const system = composeSystemPrompt(def, input, domain, variant)
  const temperature = domain ? GUARDRAILED_TEMPERATURE : (def.temperature ?? 0.7)

  const text =
    collectTools(def).length > 0
      ? await runToolLoop(def, input, system, temperature, deps)
      : (
          await deps.generate({
            system,
            user: input.message,
            temperature,
            maxTokens: def.maxTokens,
          })
        ).text

  return { agentId: def.id, text, guardrail: runPostGuardrails(domain, text) }
}
