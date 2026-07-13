import { describe, it, expect } from 'vitest'
import { pciMasterAgent, PCI_MASTER_SYSTEM_PROMPT } from './pci-master'
import { getAgent } from '../registry'
import { runAgent } from '../runner'
import { guardrailSystemPrompt } from '@/lib/ai/guardrails'
import type { GenerateFn } from '../types'

function mockGenerate() {
  const calls: { system: string; user: string; temperature?: number }[] = []
  const fn: GenerateFn = async ({ system, user, temperature }) => {
    calls.push({ system, user, temperature })
    return { text: 'ok' }
  }
  return { fn, calls }
}

function render(
  input: Parameters<Extract<typeof pciMasterAgent.systemPrompt, (i: never) => string>>[0]
) {
  const fn = pciMasterAgent.systemPrompt
  if (typeof fn !== 'function') throw new Error('expected a function systemPrompt')
  return fn(input)
}

describe('pci-master agent', () => {
  it('registers with the expected metadata and no STATIC guardrail domain', () => {
    expect(getAgent('pci-master')).toBe(pciMasterAgent)
    expect(pciMasterAgent.maxTokens).toBe(4096)
    // domain is per-request (context.type), never fixed on the agent
    expect(pciMasterAgent.guardrailDomain).toBeUndefined()
  })

  it('uses the generic Socratic prompt when UNGUARDED', () => {
    expect(render({ message: 'hi', context: {} })).toBe(PCI_MASTER_SYSTEM_PROMPT)
  })

  it('emits an EMPTY base when guarded (guardrail prompt fully replaces it)', () => {
    expect(render({ message: 'hi', context: { guardrailDomain: 'task' } })).toBe('')
  })

  it('through the runner: a task request yields exactly the guardrail prompt (no generic tail)', async () => {
    const { fn, calls } = mockGenerate()
    await runAgent(
      pciMasterAgent,
      { message: 'set marks', context: { guardrailDomain: 'task' } },
      { generate: fn }
    )
    // exactly the guardrail prompt — not "guardrail\n\n" and not guardrail + generic
    expect(calls[0].system).toBe(guardrailSystemPrompt('task'))
    expect(calls[0].system).not.toContain('Respond in JSON format') // generic prompt is absent
  })
})
