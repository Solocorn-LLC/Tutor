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
  it('asks the format chooser first on a fresh assessment run', () => {
    expect(nextDmiGate({ ...base })).toBe('format')
  })

  it('never asks the format chooser for a task (assessment-only)', () => {
    expect(nextDmiGate({ ...base, type: 'task' })).toBe('proceed')
  })

  it('skips the format chooser once a spec / kind / skip flag is present', () => {
    expect(nextDmiGate({ ...base, hasQuestionSpec: true })).toBe('proceed')
    expect(nextDmiGate({ ...base, hasDocumentKindOverride: true })).toBe('proceed')
    expect(nextDmiGate({ ...base, skipFormatPrompt: true })).toBe('proceed')
  })

  it('asks the source chooser only after format is resolved and sources disagree', () => {
    expect(nextDmiGate({ ...base, skipFormatPrompt: true, sourcesDisagree: true })).toBe('source')
  })

  it('does not ask the source chooser when the tutor already picked a source', () => {
    expect(
      nextDmiGate({
        ...base,
        skipFormatPrompt: true,
        sourcesDisagree: true,
        contentSource: 'text',
      })
    ).toBe('proceed')
  })

  it('does not ask the source chooser when the sources agree (unedited text)', () => {
    expect(nextDmiGate({ ...base, skipFormatPrompt: true, sourcesDisagree: false })).toBe('proceed')
  })

  it('asks the source chooser for a task with a genuine disagreement', () => {
    expect(nextDmiGate({ ...base, type: 'task', sourcesDisagree: true })).toBe('source')
  })
})

describe('nextDmiGate — ordering invariant (regression guard)', () => {
  // The original loop bug put the source step BEFORE the format step. If both
  // conditions hold at once, the format step MUST win; deferring the source
  // question is what lets multiple-choice papers skip it entirely and is what
  // keeps the chain from ping-ponging source↔format. Do not "simplify" this.
  it('prefers format over source when both would otherwise fire', () => {
    expect(nextDmiGate({ ...base, sourcesDisagree: true })).toBe('format')
  })
})

/**
 * Drives the whole pre-generation chain the way CourseBuilder's dialog handlers
 * do, and asserts it always terminates (never loops) while asking each chooser
 * at most once.
 *
 * Handler model (mirrors CourseBuilder):
 * - format → 'mcq'  : builds locally, does NOT re-invoke the generator (terminal).
 * - format → 'free' : re-invoke with skipFormatPrompt = true.
 * - source → pick   : re-invoke with skipFormatPrompt = true AND the pick set
 *                     (the pick persists via a ref, so later server-driven
 *                     re-invocations keep it too).
 * - proceed         : generation runs; the server may then re-invoke for kind /
 *                     spec, which we simulate as extra steps.
 */
function runChain(opts: {
  type: 'task' | 'assessment'
  sourcesDisagree: boolean
  formatChoice: 'mcq' | 'free'
  sourcePick?: 'document' | 'text'
  /** Simulate the server asking for kind then spec after the first proceed. */
  serverAsks?: Array<'kind' | 'spec'>
}): { seen: DmiGate[]; ended: 'proceed' | 'mcq' } {
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

  for (let step = 0; step < 20; step++) {
    const gate = nextDmiGate(state)
    seen.push(gate)

    if (gate === 'format') {
      if (opts.formatChoice === 'mcq') return { seen, ended: 'mcq' }
      state = { ...state, skipFormatPrompt: true }
      continue
    }
    if (gate === 'source') {
      state = { ...state, skipFormatPrompt: true, contentSource: opts.sourcePick ?? 'text' }
      continue
    }
    // gate === 'proceed' — generation ran. Let the server ask for kind/spec next.
    const next = serverQueue.shift()
    if (!next) return { seen, ended: 'proceed' }
    if (next === 'kind') state = { ...state, hasDocumentKindOverride: true }
    else state = { ...state, hasQuestionSpec: true }
  }
  throw new Error(`chain did not terminate: ${seen.join(' → ')}`)
}

describe('Generate DMI chain — terminates, no loop (regression guard)', () => {
  it('assessment + PDF + edited text, free-response: asks format then source once, then proceeds', () => {
    const { seen, ended } = runChain({
      type: 'assessment',
      sourcesDisagree: true,
      formatChoice: 'free',
      sourcePick: 'text',
    })
    expect(ended).toBe('proceed')
    expect(seen.filter(g => g === 'format')).toHaveLength(1)
    expect(seen.filter(g => g === 'source')).toHaveLength(1)
    expect(seen).toEqual(['format', 'source', 'proceed'])
  })

  it('assessment + PDF + edited text, MULTIPLE CHOICE: never asks the source chooser', () => {
    const { seen, ended } = runChain({
      type: 'assessment',
      sourcesDisagree: true,
      formatChoice: 'mcq',
    })
    expect(ended).toBe('mcq')
    expect(seen).not.toContain('source')
    expect(seen).toEqual(['format'])
  })

  it('assessment free-response through server kind + spec: no re-prompt, source pick persists', () => {
    const { seen, ended } = runChain({
      type: 'assessment',
      sourcesDisagree: true,
      formatChoice: 'free',
      sourcePick: 'document',
      serverAsks: ['kind', 'spec'],
    })
    expect(ended).toBe('proceed')
    expect(seen.filter(g => g === 'format')).toHaveLength(1)
    expect(seen.filter(g => g === 'source')).toHaveLength(1)
    // format, source, proceed(→kind), proceed(→spec), proceed(done)
    expect(seen).toEqual(['format', 'source', 'proceed', 'proceed', 'proceed'])
  })

  it('task + PDF + edited text: asks source once (no format), then proceeds', () => {
    const { seen, ended } = runChain({
      type: 'task',
      sourcesDisagree: true,
      formatChoice: 'free',
      sourcePick: 'text',
    })
    expect(ended).toBe('proceed')
    expect(seen).toEqual(['source', 'proceed'])
  })

  it('assessment, unedited text (sources agree): asks only format, then proceeds', () => {
    const { seen, ended } = runChain({
      type: 'assessment',
      sourcesDisagree: false,
      formatChoice: 'free',
    })
    expect(ended).toBe('proceed')
    expect(seen).toEqual(['format', 'proceed'])
  })
})
