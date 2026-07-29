import { describe, it, expect } from 'vitest'
import { nextDmiGate, type DmiGate, type DmiGateInput } from './dmi-generate-gate'

const base: DmiGateInput = {
  type: 'assessment',
  hasQuestionSpec: false,
  hasDocumentKindOverride: false,
  skipFormatPrompt: false,
  contentSource: undefined,
  sourcesDisagree: false,
}

describe('nextDmiGate — single step', () => {
  it('proceeds straight to generation on a fresh assessment run (no format step)', () => {
    expect(nextDmiGate({ ...base })).toBe('proceed')
  })

  it('proceeds for a task', () => {
    expect(nextDmiGate({ ...base, type: 'task' })).toBe('proceed')
  })

  it('asks the source chooser when the PDF and typed text disagree and no pick yet', () => {
    expect(nextDmiGate({ ...base, sourcesDisagree: true })).toBe('source')
  })

  it('proceeds once a source pick has been made, even if the sources disagree', () => {
    expect(nextDmiGate({ ...base, sourcesDisagree: true, contentSource: 'text' })).toBe('proceed')
    expect(nextDmiGate({ ...base, sourcesDisagree: true, contentSource: 'document' })).toBe(
      'proceed'
    )
  })

  it('proceeds when the sources agree (no chooser needed)', () => {
    expect(nextDmiGate({ ...base, sourcesDisagree: false })).toBe('proceed')
  })

  it('asks the source chooser for a task too (source step is type-agnostic)', () => {
    expect(nextDmiGate({ ...base, type: 'task', sourcesDisagree: true })).toBe('source')
  })
})

/**
 * The generator re-invokes itself after each dialog. With the format step gone,
 * the only dialog is the source chooser, and after the pick the server may still
 * ask for kind / question-spec (each of which just re-runs → 'proceed'). This
 * guards against a re-introduced loop: the chain must terminate at 'proceed'.
 */
function runChain(opts: {
  type: 'task' | 'assessment'
  sourcesDisagree: boolean
  sourcePick?: 'document' | 'text'
  /** Extra server round-trips after the first proceed (kind / spec). */
  serverAsks?: Array<'kind' | 'spec'>
}): { seen: DmiGate[]; ended: 'proceed' } {
  let state: DmiGateInput = {
    type: opts.type,
    hasQuestionSpec: false,
    hasDocumentKindOverride: false,
    skipFormatPrompt: false,
    contentSource: undefined,
    sourcesDisagree: opts.sourcesDisagree,
  }
  const seen: DmiGate[] = []
  const serverQueue = [...(opts.serverAsks ?? [])]
  for (let i = 0; i < 12; i++) {
    const gate = nextDmiGate(state)
    seen.push(gate)
    if (gate === 'source') {
      state = { ...state, contentSource: opts.sourcePick ?? 'text' }
      continue
    }
    // gate === 'proceed' — generation ran. Let the server ask kind/spec next.
    const next = serverQueue.shift()
    if (!next) return { seen, ended: 'proceed' }
    if (next === 'kind') state = { ...state, hasDocumentKindOverride: true }
    else state = { ...state, hasQuestionSpec: true }
  }
  throw new Error(`chain did not terminate: ${seen.join(' → ')}`)
}

describe('Generate DMI chain — terminates, no loop (regression guard)', () => {
  it('assessment + PDF + edited text: asks source once, then proceeds', () => {
    const { seen, ended } = runChain({
      type: 'assessment',
      sourcesDisagree: true,
      sourcePick: 'text',
    })
    expect(ended).toBe('proceed')
    expect(seen.filter(g => g === 'source')).toHaveLength(1)
    expect(seen).toEqual(['source', 'proceed'])
  })

  it('assessment through server kind + spec: source pick persists, no re-prompt', () => {
    const { seen, ended } = runChain({
      type: 'assessment',
      sourcesDisagree: true,
      sourcePick: 'document',
      serverAsks: ['kind', 'spec'],
    })
    expect(ended).toBe('proceed')
    expect(seen.filter(g => g === 'source')).toHaveLength(1)
    // source, proceed(→kind), proceed(→spec), proceed(done)
    expect(seen).toEqual(['source', 'proceed', 'proceed', 'proceed'])
  })

  it('agreeing sources: proceeds immediately with no dialog', () => {
    const { seen, ended } = runChain({ type: 'assessment', sourcesDisagree: false })
    expect(ended).toBe('proceed')
    expect(seen).toEqual(['proceed'])
  })
})
