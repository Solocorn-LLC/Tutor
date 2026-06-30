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
})
