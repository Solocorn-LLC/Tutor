import { describe, it, expect } from 'vitest'
import {
  pciReducer,
  initialPciState,
  getThread,
  emptyThread,
  type PciState,
  type PciTarget,
} from './pci-reducer'

const task: PciTarget = { kind: 'task' }
const ext: PciTarget = { kind: 'taskExtension', id: 'e1' }
const asmt: PciTarget = { kind: 'assessment', id: 'a1' }

describe('pciReducer', () => {
  it('starts empty and getThread is safe for unseen ids', () => {
    const s = initialPciState()
    expect(getThread(s, task)).toEqual(emptyThread())
    expect(getThread(s, ext)).toEqual(emptyThread())
    expect(getThread(s, asmt)).toEqual(emptyThread())
  })

  it('setInput / loadMessages target the right thread only', () => {
    let s = initialPciState()
    s = pciReducer(s, { type: 'setInput', target: task, input: 'hi' })
    s = pciReducer(s, { type: 'setInput', target: asmt, input: 'yo' })
    s = pciReducer(s, {
      type: 'loadMessages',
      target: task,
      messages: [{ role: 'assistant', content: 'rubric' }],
    })
    expect(getThread(s, task).input).toBe('hi')
    expect(getThread(s, task).messages).toEqual([{ role: 'assistant', content: 'rubric' }])
    expect(getThread(s, asmt).input).toBe('yo')
    expect(getThread(s, asmt).messages).toEqual([]) // untouched
  })

  it('sendStart appends the user msg and sets loading (input cleared separately)', () => {
    let s = pciReducer(initialPciState(), { type: 'setInput', target: ext, input: 'draft text' })
    s = pciReducer(s, { type: 'sendStart', target: ext, userMessage: 'mark by method' })
    const t = getThread(s, ext)
    expect(t.messages).toEqual([{ role: 'user', content: 'mark by method' }])
    expect(t.loading).toBe(true)
    expect(t.input).toBe('draft text') // sendStart does not clear; the caller clears on a real send
  })

  it('sendSuccess appends assistant, holds draft, sets warnings, clears error, stops loading', () => {
    let s = pciReducer(initialPciState(), { type: 'sendStart', target: task, userMessage: 'q' })
    s = pciReducer(s, {
      type: 'sendSuccess',
      target: task,
      assistant: { role: 'assistant', content: 'a' },
      draft: 'FINAL RUBRIC',
      warnings: [{ ruleId: 'R1', severity: 'warning', message: 'check' }],
    })
    const t = getThread(s, task)
    expect(t.messages).toEqual([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a' },
    ])
    expect(t.draft).toBe('FINAL RUBRIC')
    expect(t.guardrailWarnings).toHaveLength(1)
    expect(t.errorHint).toBe('')
    expect(t.loading).toBe(false)
  })

  it('sendSuccess without a draft does not overwrite an existing draft', () => {
    let s = pciReducer(initialPciState(), { type: 'sendStart', target: task, userMessage: 'q' })
    s = pciReducer(s, {
      type: 'sendSuccess',
      target: task,
      assistant: { role: 'assistant', content: 'a1' },
      draft: 'KEEP ME',
      warnings: [],
    })
    s = pciReducer(s, { type: 'sendStart', target: task, userMessage: 'q2' })
    s = pciReducer(s, {
      type: 'sendSuccess',
      target: task,
      assistant: { role: 'assistant', content: 'a2' },
      warnings: [], // no draft this turn
    })
    expect(getThread(s, task).draft).toBe('KEEP ME')
  })

  it('sendError records the hint + an assistant message and stops loading', () => {
    let s = pciReducer(initialPciState(), { type: 'sendStart', target: asmt, userMessage: 'q' })
    s = pciReducer(s, {
      type: 'sendError',
      target: asmt,
      hint: 'network down',
      assistant: { role: 'assistant', content: 'error' },
    })
    const t = getThread(s, asmt)
    expect(t.errorHint).toBe('network down')
    expect(t.loading).toBe(false)
    expect(t.messages.at(-1)).toEqual({ role: 'assistant', content: 'error' })
  })

  it('clearDraft empties only the draft (after Apply to PCI)', () => {
    let s = pciReducer(initialPciState(), {
      type: 'sendSuccess',
      target: task,
      assistant: { role: 'assistant', content: 'a' },
      draft: 'D',
      warnings: [],
    })
    s = pciReducer(s, { type: 'clearDraft', target: task })
    expect(getThread(s, task).draft).toBe('')
    expect(getThread(s, task).messages).toHaveLength(1) // messages untouched
  })

  it('reset returns a fresh empty state (blank-slate)', () => {
    let s = pciReducer(initialPciState(), { type: 'setInput', target: task, input: 'x' })
    s = pciReducer(s, { type: 'setInput', target: asmt, input: 'y' })
    expect(pciReducer(s, { type: 'reset' })).toEqual(initialPciState())
  })

  it('is immutable — does not mutate the previous state', () => {
    const s0: PciState = initialPciState()
    const s1 = pciReducer(s0, { type: 'setInput', target: task, input: 'hi' })
    expect(s0.task.input).toBe('') // original untouched
    expect(s1).not.toBe(s0)
  })

  it('sendSuccess holds a structured spec; clearDraft clears draft and spec (TASK-6)', () => {
    let s = pciReducer(initialPciState(), { type: 'sendStart', target: task, userMessage: 'q' })
    s = pciReducer(s, {
      type: 'sendSuccess',
      target: task,
      assistant: { role: 'assistant', content: 'a' },
      draft: 'RUBRIC',
      spec: { evaluationLogic: 'Exact match' },
      warnings: [],
    })
    expect(getThread(s, task).draftSpec).toEqual({ evaluationLogic: 'Exact match' })
    s = pciReducer(s, { type: 'clearDraft', target: task })
    expect(getThread(s, task).draft).toBe('')
    expect(getThread(s, task).draftSpec).toBeUndefined()
  })

  // ── "policy so far" panel: cumulative capture + sticky tutor edits ──────────

  it('sendSuccess accumulates specSoFar across turns (keeps fields a turn omits)', () => {
    let s = pciReducer(initialPciState(), {
      type: 'sendSuccess',
      target: asmt,
      assistant: { role: 'assistant', content: 'a1' },
      specSoFar: { evaluationLogic: 'method marks' },
      warnings: [],
    })
    s = pciReducer(s, {
      type: 'sendSuccess',
      target: asmt,
      assistant: { role: 'assistant', content: 'a2' },
      specSoFar: { retryPolicy: 'two tries' }, // this turn omits evaluationLogic
      warnings: [],
    })
    expect(getThread(s, asmt).specSoFar).toEqual({
      evaluationLogic: 'method marks',
      retryPolicy: 'two tries',
    })
  })

  it('editSpecSoFar sets a field and marks it edited; clearing removes + un-marks it', () => {
    let s = pciReducer(initialPciState(), {
      type: 'editSpecSoFar',
      target: task,
      key: 'instructionalTone',
      value: '  warm and patient  ',
    })
    expect(getThread(s, task).specSoFar).toEqual({ instructionalTone: 'warm and patient' })
    expect(getThread(s, task).editedSpecKeys).toEqual(['instructionalTone'])

    s = pciReducer(s, { type: 'editSpecSoFar', target: task, key: 'instructionalTone', value: '' })
    expect(getThread(s, task).specSoFar).toEqual({})
    expect(getThread(s, task).editedSpecKeys).toEqual([])
  })

  it('a tutor edit is STICKY — a later model turn cannot overwrite it, but updates other fields', () => {
    let s = pciReducer(initialPciState(), {
      type: 'editSpecSoFar',
      target: asmt,
      key: 'retryPolicy',
      value: 'one try only',
    })
    // The model returns a different retryPolicy AND a new field.
    s = pciReducer(s, {
      type: 'sendSuccess',
      target: asmt,
      assistant: { role: 'assistant', content: 'a' },
      specSoFar: { retryPolicy: 'three tries', noResponseBehavior: 'give a hint' },
      warnings: [],
    })
    const t = getThread(s, asmt)
    expect(t.specSoFar?.retryPolicy).toBe('one try only') // protected
    expect(t.specSoFar?.noResponseBehavior).toBe('give a hint') // non-edited field updated
  })

  it('clearing an edited field un-protects it so the assistant may re-capture it', () => {
    let s = pciReducer(initialPciState(), {
      type: 'editSpecSoFar',
      target: task,
      key: 'evaluationLogic',
      value: 'exact match',
    })
    s = pciReducer(s, { type: 'editSpecSoFar', target: task, key: 'evaluationLogic', value: '' })
    // After clearing, a model turn can capture it again.
    s = pciReducer(s, {
      type: 'sendSuccess',
      target: task,
      assistant: { role: 'assistant', content: 'a' },
      specSoFar: { evaluationLogic: 'accept equivalents' },
      warnings: [],
    })
    expect(getThread(s, task).specSoFar?.evaluationLogic).toBe('accept equivalents')
  })
})
