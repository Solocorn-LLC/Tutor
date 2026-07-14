/**
 * Which panes the Task / Assessment builder content view shows: the text editor,
 * the document preview, or both (split).
 *
 * The one invariant that matters for tutors: when there is NO document there is
 * nothing to preview, so the text editor is always shown and the preview hidden.
 * A stale per-item view preference — e.g. left over from a document that was
 * later removed — must never hide the editor and strand the tutor with no way to
 * type. Once a document is present, the saved preference applies, defaulting to
 * the document view.
 *
 * Pure + framework-free so the rule is unit-tested directly, away from the giant
 * CourseBuilder component. Both builders (task and assessment) route through it.
 */

export interface DocPaneVisibility {
  textVisible: boolean
  pdfVisible: boolean
}

export interface DocPaneVisibilityInput {
  /** A document (PDF / image / file) is attached to the active item. */
  hasDocument: boolean
  /**
   * The tutor's saved per-item preference for the text pane, or `undefined` when
   * none is saved (no item loaded, or the item has no stored preference).
   */
  savedTextVisible?: boolean
  /** The saved per-item preference for the document pane, or `undefined`. */
  savedPdfVisible?: boolean
}

export function resolveDocPaneVisibility({
  hasDocument,
  savedTextVisible,
  savedPdfVisible,
}: DocPaneVisibilityInput): DocPaneVisibility {
  // No document → the text editor is always available; nothing to preview.
  if (!hasDocument) {
    return { textVisible: true, pdfVisible: false }
  }
  // Document present → saved preference wins, defaulting to the document view.
  return {
    textVisible: savedTextVisible ?? false,
    pdfVisible: savedPdfVisible ?? true,
  }
}
