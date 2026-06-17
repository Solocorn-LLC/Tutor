/**
 * Temporary diagnostic: verify the PDF split-and-store pipeline end-to-end
 * (create multi-page PDF -> store -> download via readFileBuffer -> split into pages
 * -> store each page -> confirm each page is retrievable). Cleans up after itself.
 *
 * Gated behind ALLOW_PUBLIC_TEST_ENDPOINTS=true (404 otherwise).
 * GET /api/public/split-test
 */

import { NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { storeFile, readFileBuffer, removeFile } from '@/lib/storage/service'
import { splitPdfBufferIntoPages } from '@/lib/documents/split-pdf'

export async function GET() {
  const isProd = process.env.NODE_ENV === 'production'
  if (isProd && process.env.ALLOW_PUBLIC_TEST_ENDPOINTS !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const stamp = Date.now()
  const userId = `split-test-${stamp}`
  const sourceKey = `documents/${userId}/source.pdf`
  const createdKeys: string[] = []

  try {
    // 1) Build a 3-page PDF
    const doc = await PDFDocument.create()
    for (let i = 0; i < 3; i++) {
      const page = doc.addPage([300, 300])
      page.drawText(`Page ${i + 1}`, { x: 50, y: 150, size: 24 })
    }
    const sourceBytes = Buffer.from(await doc.save())

    // 2) Store the source
    const stored = await storeFile(sourceBytes, sourceKey, 'application/pdf')
    createdKeys.push(stored.key)

    // 3) Download it back (exercises readFileBuffer / GCS download)
    const downloaded = await readFileBuffer(stored.key)
    const downloadOk = !!downloaded && downloaded.length > 0

    // 4) Split into pages + store each
    const { pageCount, pages } = await splitPdfBufferIntoPages(downloaded as Buffer, {
      userId,
      fileName: 'split-test.pdf',
    })
    pages.forEach(p => createdKeys.push(p.key))

    // 5) Confirm each page is retrievable + is a valid 1-page PDF
    const perPage = []
    for (const p of pages) {
      const buf = await readFileBuffer(p.key)
      let pageCountOfPart = -1
      if (buf) {
        try {
          pageCountOfPart = (await PDFDocument.load(buf)).getPageCount()
        } catch {
          pageCountOfPart = -1
        }
      }
      perPage.push({
        page: p.pageNumber,
        url: p.url,
        storedBytes: buf?.length ?? 0,
        isSinglePagePdf: pageCountOfPart === 1,
      })
    }

    const allGood =
      downloadOk && pageCount === 3 && perPage.every(p => p.storedBytes > 0 && p.isSinglePagePdf)

    return NextResponse.json({
      status: allGood ? 'ok' : 'incomplete',
      sourceUrlSample: stored.url,
      downloadOk,
      pageCount,
      perPage,
    })
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  } finally {
    // Cleanup all test objects
    for (const k of createdKeys) {
      await removeFile(k).catch(() => {})
    }
  }
}
