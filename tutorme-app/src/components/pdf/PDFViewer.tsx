'use client'

import { useState, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import 'react-pdf/dist/esm/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface PDFViewerProps {
  fileUrl: string
  className?: string
  defaultScale?: number
  hidePageNavigation?: boolean
  onHidePreview?: () => void
}

/** Maximum pages to render in scroll-all mode before switching to single-page pagination. */
const MAX_SCROLL_PAGES = 20

export function PDFViewer({
  fileUrl,
  className = '',
  defaultScale = 1.25,
  hidePageNavigation = false,
  onHidePreview,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [scale, setScale] = useState<number>(defaultScale)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [useFallback, setUseFallback] = useState<boolean>(false)

  // Detect blob URLs immediately — they are client-side only and break after refresh
  const isBlobUrl = typeof fileUrl === 'string' && fileUrl.startsWith('blob:')

  const isScrollMode = numPages > 0 && numPages <= MAX_SCROLL_PAGES

  const onDocumentLoadSuccess = useCallback(({ numPages: total }: { numPages: number }) => {
    setNumPages(total)
    setPageNumber(1)
    setLoading(false)
    setError(null)
  }, [])

  const onDocumentLoadError = useCallback((err: Error) => {
    console.error('PDF load error:', err)
    setError(err.message || 'Failed to load PDF')
    setLoading(false)
  }, [])

  const changePage = useCallback(
    (delta: number) => {
      setPageNumber(prev => Math.max(1, Math.min(numPages, prev + delta)))
    },
    [numPages]
  )

  const changeScale = useCallback((delta: number) => {
    setScale(prev => {
      const next = Math.round((prev + delta) * 100) / 100
      return Math.max(0.5, Math.min(3.0, next))
    })
  }, [])

  if (useFallback) {
    return (
      <iframe
        src={fileUrl}
        title="PDF Document"
        className={`h-full w-full border-0 ${className}`}
      />
    )
  }

  return (
    <div className={`flex h-full w-full flex-col overflow-hidden bg-gray-100 ${className}`}>
      {/* Blob URL error — file was not properly persisted */}
      {isBlobUrl && (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="max-w-md text-sm text-red-600">
            This document was not properly saved. The file reference is a temporary browser URL that
            becomes invalid after refreshing. Please remove this document and re-upload it.
          </p>
        </div>
      )}

      {/* Loading state */}
      {loading && !isBlobUrl && (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          <span className="text-sm text-gray-600">Loading PDF…</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && !isBlobUrl && (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="max-w-md text-sm text-red-600">Failed to load PDF: {error}</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setError(null)
                setLoading(true)
                setUseFallback(false)
              }}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Retry
            </button>
            <button
              onClick={() => setUseFallback(true)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Open in Fallback Viewer
            </button>
          </div>
        </div>
      )}

      {/* Toolbar — zoom + page navigation */}
      {!loading && !error && numPages > 0 && (
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white px-2">
          <div className="flex items-center gap-1.5">
            {!hidePageNavigation && (
              <>
                <button
                  onClick={() => changePage(-1)}
                  disabled={pageNumber <= 1}
                  className="rounded px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:text-gray-400"
                >
                  ← Prev
                </button>
                <span className="min-w-[80px] text-center text-xs text-gray-600">
                  Page {pageNumber} of {numPages}
                </span>
                <button
                  onClick={() => changePage(1)}
                  disabled={pageNumber >= numPages}
                  className="rounded px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:text-gray-400"
                >
                  Next →
                </button>
              </>
            )}
          </div>

          <div className="flex w-full items-center justify-end">
            <button
              onClick={() => changeScale(-0.25)}
              disabled={scale <= 0.5}
              className="rounded px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:text-gray-400"
            >
              −
            </button>
            <span className="min-w-[48px] text-center text-xs text-gray-600">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => changeScale(0.25)}
              disabled={scale >= 3.0}
              className="rounded px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:text-gray-400"
            >
              +
            </button>
            {onHidePreview && (
              <button
                onClick={onHidePreview}
                className="ml-2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-gray-100 hover:text-slate-700"
                title="Hide Preview"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Document pages */}
      {!error && !isBlobUrl && (
        <div className={`flex-1 overflow-y-auto ${loading ? 'hidden' : 'block'}`}>
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={null}
            error={null}
          >
            {isScrollMode ? (
              // Scrollable multi-page view (safe for small PDFs)
              Array.from(new Array(numPages), (_, index) => (
                <div
                  key={`page_${index + 1}`}
                  className="mb-4 flex justify-center px-4 pt-4 last:pb-4"
                >
                  <Page
                    pageNumber={index + 1}
                    renderTextLayer
                    renderAnnotationLayer
                    scale={scale}
                    className="shadow-lg"
                    loading={
                      <div className="flex h-[600px] w-[600px] items-center justify-center bg-white">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
                      </div>
                    }
                  />
                </div>
              ))
            ) : (
              // Single-page pagination view (for large PDFs or while loading)
              <div className="flex justify-center px-4 py-4">
                <Page
                  pageNumber={pageNumber}
                  renderTextLayer
                  renderAnnotationLayer
                  scale={scale}
                  className="shadow-lg"
                  loading={
                    <div className="flex h-[600px] w-[600px] items-center justify-center bg-white">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
                    </div>
                  }
                />
              </div>
            )}
          </Document>

          {/* Warning for large documents forced into pagination mode */}
          {!isScrollMode && numPages > MAX_SCROLL_PAGES && (
            <div className="py-3 text-center text-xs text-amber-700">
              Large document ({numPages} pages). Use the Prev/Next buttons above to navigate pages.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
