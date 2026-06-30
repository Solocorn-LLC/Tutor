import { describe, it, expect } from 'vitest'
import { resolveMarkingBasis } from './marking-basis'

describe('resolveMarkingBasis (TASK-10/19 safe failure)', () => {
  it('has no basis when PCI, rubric, and model answer are all empty/whitespace', () => {
    expect(resolveMarkingBasis({ pci: '', rubric: '   ', modelAnswer: null }).hasBasis).toBe(false)
    expect(resolveMarkingBasis({}).hasBasis).toBe(false)
  })

  it('has a basis when any one part is present', () => {
    expect(resolveMarkingBasis({ pci: 'award method marks' }).hasBasis).toBe(true)
    expect(resolveMarkingBasis({ rubric: '2 for working' }).hasBasis).toBe(true)
    expect(resolveMarkingBasis({ modelAnswer: '42' }).hasBasis).toBe(true)
  })

  it('returns trimmed parts', () => {
    const b = resolveMarkingBasis({ pci: '  p  ', rubric: ' r ', modelAnswer: ' m ' })
    expect(b).toMatchObject({ pci: 'p', rubric: 'r', modelAnswer: 'm', hasBasis: true })
  })
})
