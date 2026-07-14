import { describe, it, expect } from 'vitest'
import { isOfficeSourceMime, officeToPdfKey, pdfFileName } from './ensure-viewable'

describe('isOfficeSourceMime', () => {
  it('matches Word/PowerPoint mime types (modern + legacy)', () => {
    for (const m of [
      'application/msword',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]) {
      expect(isOfficeSourceMime(m)).toBe(true)
    }
  })

  it('matches by file extension when the mime is missing/generic', () => {
    expect(isOfficeSourceMime(undefined, 'paper.docx')).toBe(true)
    expect(isOfficeSourceMime(undefined, 'deck.pptx')).toBe(true)
    expect(isOfficeSourceMime('application/octet-stream', 'notes.DOC')).toBe(true)
    expect(isOfficeSourceMime('application/octet-stream', 'old.ppt')).toBe(true)
  })

  it('does NOT match already-viewable types', () => {
    expect(isOfficeSourceMime('application/pdf', 'x.pdf')).toBe(false)
    expect(isOfficeSourceMime('image/png', 'x.png')).toBe(false)
    expect(isOfficeSourceMime(undefined, 'x.pdf')).toBe(false)
    expect(isOfficeSourceMime(undefined, undefined)).toBe(false)
    // xlsx is intentionally out of scope (rarely diagrammatic).
    expect(isOfficeSourceMime(undefined, 'sheet.xlsx')).toBe(false)
  })
})

describe('officeToPdfKey', () => {
  it('derives a deterministic sibling key in the same namespace', () => {
    expect(officeToPdfKey('documents/abc123.docx')).toBe('documents/abc123.docx.pdf')
    // Deterministic → repeated deploys resolve to the same cached PDF.
    expect(officeToPdfKey('documents/abc123.docx')).toBe(officeToPdfKey('documents/abc123.docx'))
  })
})

describe('pdfFileName', () => {
  it('swaps the Office extension for .pdf', () => {
    expect(pdfFileName('Homework 3.docx')).toBe('Homework 3.pdf')
    expect(pdfFileName('slides.PPTX')).toBe('slides.pdf')
    expect(pdfFileName('legacy.doc')).toBe('legacy.pdf')
  })
  it('appends .pdf when there is no recognised extension', () => {
    expect(pdfFileName('document')).toBe('document.pdf')
    expect(pdfFileName(undefined)).toBe('document.pdf')
  })
})
