import { describe, it, expect } from 'vitest'
import { runAgent } from './runner'
import { guardrailSystemPrompt, GUARDRAILED_TEMPERATURE } from '@/lib/ai/guardrails'
import type { AgentDefinition, GenerateFn } from './types'

function mockGenerate() {
  const calls: { system: string; user: string; temperature?: number }[] = []
  const fn: GenerateFn = async ({ system, user, temperature }) => {
    calls.push({ system, user, temperature })
    return { text: 'ok' }
  }
  return { fn, calls }
}

describe('agent-kit runner', () => {
  it('runs a plain (unguarded) agent with its base prompt and no post-validation', async () => {
    const { fn, calls } = mockGenerate()
    const def: AgentDefinition = {
      id: 't',
      description: '',
      systemPrompt: 'BASE',
      temperature: 0.5,
    }

    const result = await runAgent(def, { message: 'hi' }, { generate: fn })

    expect(result.text).toBe('ok')
    expect(result.guardrail).toBeUndefined()
    expect(calls[0].system).toBe('BASE')
    expect(calls[0].user).toBe('hi')
    expect(calls[0].temperature).toBe(0.5)
  })

  it('prepends the guardrail prompt, forces the guarded temperature, and post-validates', async () => {
    const { fn, calls } = mockGenerate()
    const def: AgentDefinition = {
      id: 'pci',
      description: '',
      systemPrompt: 'BASE',
      guardrailDomain: 'task',
    }

    const result = await runAgent(def, { message: 'hi' }, { generate: fn })

    // canonical guardrail prompt is prepended to the base prompt — no agent can skip it
    expect(calls[0].system.startsWith(guardrailSystemPrompt('task'))).toBe(true)
    expect(calls[0].system).toContain('BASE')
    // guarded generation runs at the low, consistent temperature
    expect(calls[0].temperature).toBe(GUARDRAILED_TEMPERATURE)
    // post-response validator ran and returned a structured result
    expect(result.guardrail).toBeDefined()
    expect(Array.isArray(result.guardrail?.violations)).toBe(true)
    expect(typeof result.guardrail?.hasBlocking).toBe('boolean')
  })

  it('supports a function systemPrompt derived from the input', async () => {
    const { fn, calls } = mockGenerate()
    const def: AgentDefinition = {
      id: 'dyn',
      description: '',
      systemPrompt: input => `Hello ${input.context?.role ?? 'user'}`,
    }

    await runAgent(def, { message: 'x', context: { role: 'tutor' } }, { generate: fn })

    expect(calls[0].system).toBe('Hello tutor')
  })
})
