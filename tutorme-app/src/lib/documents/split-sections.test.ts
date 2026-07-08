import { describe, expect, it } from 'vitest'
import { splitDocIntoSections } from './split-sections'

describe('splitDocIntoSections', () => {
  it('returns [] for empty/whitespace input', () => {
    expect(splitDocIntoSections('')).toEqual([])
    expect(splitDocIntoSections('   \n  ')).toEqual([])
  })

  it('splits on form-feed page breaks', () => {
    const out = splitDocIntoSections('first page text\fsecond page text')
    expect(out).toHaveLength(2)
    expect(out[0]).toBe('first page text')
  })

  it('splits on "--- Page N ---" markers', () => {
    const out = splitDocIntoSections('--- Page 1 ---\nalpha\n--- Page 2 ---\nbeta')
    expect(out).toEqual(['alpha', 'beta'])
  })

  it('splits a numbered study doc into one section per heading', () => {
    const doc = [
      '1. AGENT MARKETPLACE INTERFACE',
      'This section describes the marketplace interface in enough detail to matter here.',
      '2. SECOND SECTION TITLE',
      'More descriptive content for the second section that is also reasonably long.',
      '3. THIRD SECTION',
      'Even more content to round out the third section fully and completely here.',
    ].join('\n')
    const out = splitDocIntoSections(doc)
    expect(out).toHaveLength(3)
    expect(out[0]).toContain('1. AGENT MARKETPLACE INTERFACE')
  })

  it('does NOT shatter a short inline numbered list into tiny sections (guard)', () => {
    const doc = 'A short numbered list inside one section.\n1. tiny\n2. tiny'
    expect(splitDocIntoSections(doc)).toHaveLength(1)
  })

  it('falls back to blank-line blocks when there are no numbered headings', () => {
    const doc =
      'Intro paragraph long enough to pass the fifty character block filter easily here.\n\n' +
      'Second paragraph also long enough to be its own separate block for splitting.'
    expect(splitDocIntoSections(doc)).toHaveLength(2)
  })

  it('returns the whole document as one section when nothing splits it', () => {
    const doc = 'Just one short line of prose with no markers.'
    expect(splitDocIntoSections(doc)).toEqual([doc])
  })
})
