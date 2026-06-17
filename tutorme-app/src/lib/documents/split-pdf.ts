/**
 * Split a multi-page PDF (as a Buffer) into one single-page PDF per page and store
 * each page via the unified storage service. Shared by the tutor split endpoint and
 * its diagnostic so both exercise identical code.
 */

import { PDFDocument } from 'pdf-lib'
import { storeFile } from '@/lib/storage/service'

export interface SplitPage {
  pageNumber: number
  url: string
  key: string
  name: string
}

export interface SplitResult {
  pageCount: number
  pages: SplitPage[]
}

export const DEFAULT_MAX_SPLIT_PAGES = 200

/**
 * @throws Error with `.code` of 'INVALID_PDF' | 'EMPTY_PDF' | 'TOO_MANY_PAGES'
 */
export async function splitPdfBufferIntoPages(
  buffer: Buffer,
  opts: { userId: string; fileName?: string; maxPages?: number }
): Promise<SplitResult> {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_SPLIT_PAGES

  let sourceDoc: PDFDocument
  try {
    sourceDoc = await PDFDocument.load(buffer)
  } catch {
    const err = new Error('File is not a valid PDF') as Error & { code?: string }
    err.code = 'INVALID_PDF'
    throw err
  }

  const pageCount = sourceDoc.getPageCount()
  if (pageCount === 0) {
    const err = new Error('PDF has no pages') as Error & { code?: string }
    err.code = 'EMPTY_PDF'
    throw err
  }
  if (pageCount > maxPages) {
    const err = new Error(
      `Document has too many pages (${pageCount}); maximum is ${maxPages}`
    ) as Error & { code?: string }
    err.code = 'TOO_MANY_PAGES'
    throw err
  }

  const base = String(opts.fileName || 'document')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 50)
  const stamp = Date.now()

  const pages: SplitPage[] = []
  for (let i = 0; i < pageCount; i++) {
    const pageDoc = await PDFDocument.create()
    const [copied] = await pageDoc.copyPages(sourceDoc, [i])
    pageDoc.addPage(copied)
    const pageBytes = Buffer.from(await pageDoc.save())

    const storeKey = `documents/${opts.userId}/${base}_page_${i + 1}_${stamp}.pdf`
    const result = await storeFile(pageBytes, storeKey, 'application/pdf')
    pages.push({
      pageNumber: i + 1,
      url: result.url,
      key: result.key,
      name: `${base}_page_${i + 1}.pdf`,
    })
  }

  return { pageCount, pages }
}
