import { describe, it, expect } from 'vitest'
import { resolveDocPaneVisibility } from './doc-pane-visibility'

describe('resolveDocPaneVisibility — no document (the anti-deadlock invariant)', () => {
  it('always shows the text editor and hides the preview when there is no document', () => {
    expect(resolveDocPaneVisibility({ hasDocument: false })).toEqual({
      textVisible: true,
      pdfVisible: false,
    })
  })

  it('ignores a stale "text hidden" preference when there is no document', () => {
    // Regression: a document was loaded (view switched to Document), then removed.
    // The leftover savedTextVisible=false must NOT hide the editor.
    expect(
      resolveDocPaneVisibility({
        hasDocument: false,
        savedTextVisible: false,
        savedPdfVisible: true,
      })
    ).toEqual({ textVisible: true, pdfVisible: false })
  })
})

describe('resolveDocPaneVisibility — document present', () => {
  it('defaults to the document view when no preference is saved', () => {
    expect(resolveDocPaneVisibility({ hasDocument: true })).toEqual({
      textVisible: false,
      pdfVisible: true,
    })
  })

  it('honours a saved Text-only preference', () => {
    expect(
      resolveDocPaneVisibility({
        hasDocument: true,
        savedTextVisible: true,
        savedPdfVisible: false,
      })
    ).toEqual({ textVisible: true, pdfVisible: false })
  })

  it('honours a saved Split preference (both panes)', () => {
    expect(
      resolveDocPaneVisibility({
        hasDocument: true,
        savedTextVisible: true,
        savedPdfVisible: true,
      })
    ).toEqual({ textVisible: true, pdfVisible: true })
  })

  it('honours a saved Document-only preference', () => {
    expect(
      resolveDocPaneVisibility({
        hasDocument: true,
        savedTextVisible: false,
        savedPdfVisible: true,
      })
    ).toEqual({ textVisible: false, pdfVisible: true })
  })

  it('falls back per-pane when only one preference is stored', () => {
    expect(resolveDocPaneVisibility({ hasDocument: true, savedTextVisible: true })).toEqual({
      textVisible: true,
      pdfVisible: true, // pdf defaults to true when unset
    })
    expect(resolveDocPaneVisibility({ hasDocument: true, savedPdfVisible: false })).toEqual({
      textVisible: false, // text defaults to false when unset
      pdfVisible: false,
    })
  })
})

/**
 * Equivalence check: the helper must reproduce the exact inline derivation it
 * replaced in CourseBuilder, for every combination of (hasDocument, item loaded,
 * saved prefs). If this ever drifts, the component and the tests disagree.
 */
describe('resolveDocPaneVisibility — matches the original inline derivation', () => {
  const inlineText = (hasDoc: boolean, loaded: boolean, map: boolean | undefined): boolean =>
    !hasDoc ? true : loaded ? (map ?? false) : false

  const inlinePdf = (hasDoc: boolean, loaded: boolean, map: boolean | undefined): boolean =>
    !hasDoc ? false : loaded ? (map ?? true) : true

  it('agrees across all input combinations', () => {
    const bools = [true, false]
    const maybe: Array<boolean | undefined> = [true, false, undefined]
    for (const hasDoc of bools) {
      for (const loaded of bools) {
        for (const textMap of maybe) {
          for (const pdfMap of maybe) {
            const savedTextVisible = loaded ? textMap : undefined
            const savedPdfVisible = loaded ? pdfMap : undefined
            const got = resolveDocPaneVisibility({
              hasDocument: hasDoc,
              savedTextVisible,
              savedPdfVisible,
            })
            expect(got.textVisible).toBe(inlineText(hasDoc, loaded, textMap))
            expect(got.pdfVisible).toBe(inlinePdf(hasDoc, loaded, pdfMap))
          }
        }
      }
    }
  })
})
