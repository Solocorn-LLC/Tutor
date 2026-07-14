/**
 * Ensure a task/assessment `sourceDocument` is student-viewable *inline* before
 * it is deployed to a live session.
 *
 * Almost all Office documents are converted to PDF at upload time. The tail that
 * isn't — an upload where LibreOffice conversion failed, or a legacy asset from
 * before upload-time conversion existed — reaches students as a raw Word/
 * PowerPoint file, which `TaskDocumentCard` can only offer as a download, not an
 * inline preview. This converts such a document to PDF on the server (once,
 * cached by a deterministic key) so students get an inline viewer.
 *
 * Always ends by refreshing the document URLs (the existing deploy behaviour).
 * On ANY failure it falls back to the original document — still downloadable, so
 * this can never make a deploy worse than before.
 */
import { refreshDocumentUrls } from '@/lib/storage/gcs'
import { readFileBuffer, storeFile, fileExists } from '@/lib/storage/service'
import { convertOfficeToPdf } from './office-to-pdf'

const OFFICE_MIMES = new Set([
  'application/msword',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

/** A raw Office document (Word/PowerPoint, modern or legacy) — not yet a PDF. */
export function isOfficeSourceMime(mimeType?: string, fileName?: string): boolean {
  return (!!mimeType && OFFICE_MIMES.has(mimeType)) || /\.(docx?|pptx?)$/i.test(fileName || '')
}

/** Deterministic storage key for the PDF rendered from an Office document. */
export function officeToPdfKey(fileKey: string): string {
  return `${fileKey}.pdf`
}

/** Replace an Office file name's extension with `.pdf`. */
export function pdfFileName(fileName?: string): string {
  return (fileName || 'document').replace(/\.(docx?|pptx?)$/i, '') + '.pdf'
}

interface SourceDoc {
  fileName?: string
  fileUrl?: string
  fileKey?: string
  mimeType?: string
}

export async function ensureViewableSourceDocument<T extends SourceDoc>(doc: T): Promise<T> {
  const record = doc as Record<string, unknown>
  const mimeType = record.mimeType as string | undefined
  const fileName = record.fileName as string | undefined
  const fileKey = record.fileKey as string | undefined
  try {
    if (isOfficeSourceMime(mimeType, fileName) && fileKey) {
      const convertedKey = officeToPdfKey(fileKey)

      // Reuse a previously-rendered PDF if we already made one for this document
      // (cheap metadata check — never download the PDF just to test existence).
      let ready = await fileExists(convertedKey)
      if (!ready) {
        const input = await readFileBuffer(fileKey)
        if (input) {
          const pdf = await convertOfficeToPdf(input, fileName || 'document')
          if (pdf) {
            await storeFile(pdf, convertedKey, 'application/pdf')
            ready = true
            console.info(
              `[ensure-viewable] rendered ${fileKey} → ${convertedKey} (${pdf.length} bytes) for inline student view`
            )
          }
        }
      }

      if (ready) {
        // Point the document at the PDF. fileUrl stays as-is so
        // refreshDocumentUrls re-signs it from the new fileKey below; students
        // render via the durable by-key proxy regardless.
        return refreshDocumentUrls({
          ...record,
          fileKey: convertedKey,
          mimeType: 'application/pdf',
          fileName: pdfFileName(fileName),
        } as unknown as T)
      }
    }
  } catch (err) {
    console.warn(
      '[ensure-viewable] Office→PDF for deploy failed; using the original document:',
      err instanceof Error ? err.message : err
    )
  }
  return refreshDocumentUrls(doc)
}
