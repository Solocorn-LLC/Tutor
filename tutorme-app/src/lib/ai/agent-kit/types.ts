/**
 * agent-kit — a thin, provider-agnostic foundation for the app's AI agents.
 *
 * Design goals (see ./README.md for the full plan):
 *  - Agents are declarative CONFIGS, not framework classes.
 *  - Guardrails are applied uniformly by the runner — no agent can bypass them.
 *  - Tools & skills are typed, registerable units (functions and scripts).
 *  - The model layer is injected, so the runner is pure and testable and reuses
 *    the existing `generateWithFallback` provider (Kimi -> OpenAI) unchanged.
 *
 * Phase 1 (this file + runner/registry/adapter) is ADDITIVE — nothing in prod
 * calls it yet. Tool EXECUTION and agent hand-offs land in later phases.
 */
import type { ZodType } from 'zod'
import type { GuardrailDomain, PciVariant, GuardrailRunResult } from '@/lib/ai/guardrails'

/** Everything a tool/skill may need at call time (extend as the kit grows). */
export interface AgentContext {
  userId?: string
  role?: string
  sessionId?: string
  courseId?: string
}

/**
 * A tool is a typed function the agent can call. It may be a pure function or
 * wrap a deterministic script (e.g. a rubric scorer, a marking-scheme parser).
 */
export interface Tool<TInput = unknown, TOutput = unknown> {
  name: string
  description: string
  /** Zod schema validating the tool input at the boundary. */
  input: ZodType<TInput>
  run: (input: TInput, ctx: AgentContext) => Promise<TOutput> | TOutput
}

/**
 * A skill is a progressive-disclosure bundle: instructions loaded only when
 * relevant, optionally shipping its own tools. (Full loading semantics: Phase 2.)
 */
export interface Skill {
  name: string
  description: string
  /** Markdown instructions injected into the system prompt when the skill is active. */
  instructions: string
  tools?: Tool[]
}

/** How the model is called. Injected so the runner never imports a provider directly. */
export interface GenerateInput {
  system: string
  user: string
  temperature?: number
  maxTokens?: number
}
export type GenerateFn = (input: GenerateInput) => Promise<{ text: string }>

/** A declarative agent definition. Ported agents are just values of this shape. */
export interface AgentDefinition {
  id: string
  description: string
  /** Base system prompt — static, or derived from the input/context. */
  systemPrompt: string | ((input: AgentInput) => string)
  /**
   * When set, the runner PREPENDS the canonical guardrail prompt for this domain
   * and runs the post-response guardrail validators. This is how every guarded
   * agent gets answer-leak protection uniformly.
   */
  guardrailDomain?: GuardrailDomain
  variant?: PciVariant
  /** Sampling temperature. Ignored (forced to GUARDRAILED_TEMPERATURE) when guarded. */
  temperature?: number
  maxTokens?: number
  tools?: Tool[]
  skills?: Skill[]
}

export interface AgentInput {
  message: string
  context?: AgentContext
}

export interface AgentResult {
  agentId: string
  text: string
  /** Present only for guarded agents — the post-response validator outcome. */
  guardrail?: GuardrailRunResult
}
