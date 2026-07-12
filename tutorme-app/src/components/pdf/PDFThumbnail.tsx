'use client'

import { useState, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import 'react-pdf/dist/esm/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface PDFThumbnailProps {
  fileUrl: string
  fileKey?: string
  className?: string
  width?: number
  onLoadSuccess?: () => void
  onLoadError?: () => void
}

function getProxiedPdfUrl(fileUrl: string, fileKey?: string): string {
  if (fileKey && /^(documents|assets|resources)\//.test(fileKey)) {
    return `/api/proxy-file?key=${encodeURIComponent(fileKey)}`
  }
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    return `/api/proxy-file?url=${encodeURIComponent(fileUrl)}`
  }
  return fileUrl
}

export function PDFThumbnail({
  fileUrl,
  fileKey,
  className = '',
  width = 120,
  onLoadSuccess,
  onLoadError,
}: PDFThumbnailProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const handleLoadSuccess = useCallback(() => {
    setLoading(false)
    onLoadSuccess?.()
  }, [onLoadSuccess])

  const handleLoadError = useCallback(() => {
    setLoading(false)
    setError(true)
    onLoadError?.()
  }, [onLoadError])

  if (!fileUrl && !fileKey) return null

  const proxiedUrl = getProxiedPdfUrl(fileUrl, fileKey)

  return (
    <div className={`relative overflow-hidden rounded-lg bg-white ${className}`}>
      {loading && (
        <div
          className="flex items-center justify-center bg-gray-100"
          style={{ width, height: width * 1.4 }}
        >
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
        </div>
      )}
      {error ? (
        <div
          className="flex items-center justify-center bg-gray-100"
          style={{ width, height: width * 1.4 }}
        >
          <span className="text-xs text-gray-400">PDF</span>
        </div>
      ) : (
        <Document
          file={proxiedUrl}
          onLoadSuccess={handleLoadSuccess}
          onLoadError={handleLoadError}
          loading={null}
          error={null}
        >
          <Page
            pageNumber={1}
            width={width}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="shadow-sm"
          />
        </Document>
      )}
    </div>
  )
}
