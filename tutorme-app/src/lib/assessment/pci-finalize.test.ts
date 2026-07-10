import { describe, expect, it } from 'vitest'
import { signalsPciFinalize } from './pci-finalize'

describe('signalsPciFinalize', () => {
  it('matches explicit finalize intent', () => {
    for (const msg of [
      'finalize it',
      'Please finalise the rubric',
      'apply the rubric',
      'apply it',
      'lock it in',
      'approve the marking policy',
      'save the pci',
      'use this rubric as the final',
    ]) {
      expect(signalsPciFinalize(msg)).toBe(true)
    }
  })

  it('does NOT fire on generic agreement / confirm-summary words', () => {
    for (const msg of [
      'yes, it is correct',
      "yes that's right",
      'looks good',
      'sounds good',
      'confirmed',
      'agreed',
      'go ahead',
      'that is correct, continue',
      'ok',
    ]) {
      expect(signalsPciFinalize(msg)).toBe(false)
    }
  })

  it('handles empty / non-string safely', () => {
    expect(signalsPciFinalize('')).toBe(false)
    expect(signalsPciFinalize(undefined as unknown as string)).toBe(false)
  })
})
