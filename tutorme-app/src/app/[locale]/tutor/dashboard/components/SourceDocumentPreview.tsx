import { FileText } from 'lucide-react'
import { resolveDocDisplayUrl } from '@/lib/storage/doc-url'

export interface ImportedLearningResource {
  fileName: string
  mimeType: string
  fileUrl: string
  /** Durable GCS object key; when absent the key is recovered from fileUrl. */
  fileKey?: string
  extractedText?: string
  uploadedAt: string
}

export function SourceDocumentPreview({
  sourceDocument,
}: {
  sourceDocument: ImportedLearningResource
}) {
  if (!sourceDocument) return null

  // Durable same-origin URL — streams by key (no signed URL, never expires),
  // recovering the key from fileUrl when none was persisted. See resolveDocDisplayUrl.
  const proxiedUrl = resolveDocDisplayUrl(sourceDocument)

  if (sourceDocument.mimeType === 'application/pdf') {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs font-medium">Uploaded document</p>
        <div className="overflow-hidden rounded border">
          <iframe
            src={
              proxiedUrl.includes('#')
                ? `${proxiedUrl}&toolbar=0&navpanes=0`
                : `${proxiedUrl}#toolbar=0&navpanes=0`
            }
            title={sourceDocument.fileName}
            className="h-64 w-full"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs font-medium">Uploaded document</p>
      <div className="flex items-center gap-2 rounded border bg-white p-3">
        <FileText className="h-5 w-5 text-blue-600" />
        <a
          href={proxiedUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-600 underline"
        >
          Open {sourceDocument.fileName}
        </a>
      </div>
    </div>
  )
}
