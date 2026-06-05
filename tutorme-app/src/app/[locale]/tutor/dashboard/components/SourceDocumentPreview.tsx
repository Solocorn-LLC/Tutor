import { FileText } from 'lucide-react'

export interface ImportedLearningResource {
  fileName: string
  mimeType: string
  fileUrl: string
  extractedText?: string
  uploadedAt: string
}

function getProxiedFileUrl(fileUrl: string): string {
  // Proxy external URLs so the server can refresh expired GCS signatures
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    return `/api/proxy-file?url=${encodeURIComponent(fileUrl)}`
  }
  return fileUrl
}

export function SourceDocumentPreview({
  sourceDocument,
}: {
  sourceDocument: ImportedLearningResource
}) {
  if (!sourceDocument) return null

  const proxiedUrl = getProxiedFileUrl(sourceDocument.fileUrl)

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
