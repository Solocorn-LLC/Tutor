'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import 'react-pdf/dist/esm/Page/TextLayer.css'
import { FloatingZoomPill } from './FloatingZoomPill'
import { resolveDocDisplayUrl } from '@/lib/storage/doc-url'
import { cn } from '@/lib/utils'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface PDFViewerProps {
  fileUrl: string
  /** GCS object key. When present, the file is fetched by key (server downloads
   *  via the service account) — immune to signed-URL expiry, so documents
   *  uploaded long ago still load even after their signed URL has expired. */
  fileKey?: string
  className?: string
  defaultScale?: number
  onHidePreview?: () => void
  /** When true, the PDF page is scaled to fit the container width on load,
   *  with the zoom slider operating relative to this fit scale (100% = fit). */
  fitToWidth?: boolean
  /** When true, the PDF page is scaled to fit entirely within the container
   *  (both width and height), centered with padding. For Task PDFs only. */
  fitToScreen?: boolean
}

function getProxiedPdfUrl(fileUrl: string, fileKey?: string): string {
  // Resolve to a durable same-origin URL — streams by object key (via the
  // service account, no signed URL), recovering the key from the stored URL when
  // no fileKey was persisted, so old documents still load after their signature
  // expires. See resolveDocDisplayUrl.
  return resolveDocDisplayUrl({ fileUrl, fileKey })
}

export function PDFViewer({
  fileUrl,
  fileKey,
  className = '',
  defaultScale = 1.0,
  onHidePreview,
  fitToWidth = false,
  fitToScreen = false,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [scale, setScale] = useState<number>(defaultScale)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [useFallback, setUseFallback] = useState<boolean>(false)
  const [pdfData, setPdfData] = useState<string | ArrayBuffer | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Fit-to-width state
  const [fitScale, setFitScale] = useState<number | null>(null)
  const [pageNaturalWidth, setPageNaturalWidth] = useState<number | null>(null)
  const [pageNaturalHeight, setPageNaturalHeight] = useState<number | null>(null)
  const hasSetInitialScaleRef = useRef(false)

  // Detect blob URLs immediately — they are client-side only and break after refresh
  const isBlobUrl = typeof fileUrl === 'string' && fileUrl.startsWith('blob:')

  // Calculate fit-to-width scale from container and page dimensions
  const calculateFitScale = useCallback(() => {
    if (!fitToWidth || !scrollContainerRef.current || !pageNaturalWidth) return
    const containerWidth = scrollContainerRef.current.clientWidth
    // Account for horizontal padding (px-4 = 16px each side)
    const padding = 32
    const availableWidth = Math.max(containerWidth - padding, 100)
    const newFitScale = availableWidth / pageNaturalWidth
    setFitScale(Math.max(0.2, Math.min(2.0, newFitScale)))
  }, [fitToWidth, pageNaturalWidth])

  // Calculate fit-to-screen scale (for Tasks - fits both width and height)
  const calculateFitToScreenScale = useCallback(() => {
    if (!fitToScreen || !scrollContainerRef.current || !pageNaturalWidth || !pageNaturalHeight)
      return
    const containerWidth = scrollContainerRef.current.clientWidth
    const containerHeight = scrollContainerRef.current.clientHeight
    // Account for padding (doubled from current standard)
    const horizontalPadding = 32
    const verticalPadding = 64 // doubled top padding, equal bottom padding
    const availableWidth = Math.max(containerWidth - horizontalPadding, 100)
    const availableHeight = Math.max(containerHeight - verticalPadding, 100)
    const scaleX = availableWidth / pageNaturalWidth
    const scaleY = availableHeight / pageNaturalHeight
    const newFitScale = Math.min(scaleX, scaleY)
    setFitScale(Math.max(0.2, Math.min(2.0, newFitScale)))
  }, [fitToScreen, pageNaturalWidth, pageNaturalHeight])

  // Recalculate fit scale when container resizes
  useEffect(() => {
    if (!scrollContainerRef.current) return
    if (!fitToWidth && !fitToScreen) return
    const el = scrollContainerRef.current
    const ro = new ResizeObserver(() => {
      if (fitToWidth) calculateFitScale()
      if (fitToScreen) calculateFitToScreenScale()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fitToWidth, fitToScreen, calculateFitScale, calculateFitToScreenScale])

  // Set initial scale to fit scale once calculated
  useEffect(() => {
    if ((fitToWidth || fitToScreen) && fitScale !== null && !hasSetInitialScaleRef.current) {
      setScale(fitScale)
      hasSetInitialScaleRef.current = true
    }
  }, [fitToWidth, fitToScreen, fitScale])

  // Fetch PDF through proxy so expired GCS URLs get refreshed server-side.
  // A durable fileKey is enough on its own — the by-key proxy streams the
  // object directly — so don't require a (possibly empty/expired) fileUrl.
  const hasKey = typeof fileKey === 'string' && /^(documents|assets|resources)\//.test(fileKey)
  useEffect(() => {
    if ((!fileUrl && !hasKey) || isBlobUrl) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setPdfData(null)
    hasSetInitialScaleRef.current = false
    setFitScale(null)
    setPageNaturalWidth(null)

    const fetchPdf = async () => {
      try {
        const proxiedUrl = getProxiedPdfUrl(fileUrl, fileKey)
        const res = await fetch(proxiedUrl)
        if (!res.ok) {
          let message = `Failed to fetch (${res.status})`
          if ((res.headers.get('content-type') || '').includes('application/json')) {
            const body = await res.json().catch(() => null)
            if (body?.code === 'NoSuchKey' || res.status === 404) {
              message =
                'This document could not be found in storage. It may have been deleted — remove it and re-upload the file.'
            } else if (body?.code === 'ExpiredToken' || body?.code === 'AccessDenied') {
              message = "This document's storage link has expired and could not be refreshed."
            } else if (body?.error) {
              message = body.error
            }
          }
          throw new Error(message)
        }
        const buffer = await res.arrayBuffer()
        if (!cancelled) {
          setPdfData(buffer)
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('PDF fetch error:', err)
          setError(err.message || 'Failed to fetch')
          setLoading(false)
        }
      }
    }

    fetchPdf()
    return () => {
      cancelled = true
    }
  }, [fileUrl, fileKey, hasKey, isBlobUrl])

  // Always render every page in a continuous scroll view, regardless of length.
  const isScrollMode = numPages > 0

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

  // Called when a Page loads — gives us the natural page dimensions
  const onPageLoadSuccess = useCallback(
    (page: pdfjs.PDFPageProxy) => {
      const viewport = page.getViewport({ scale: 1 })
      setPageNaturalWidth(viewport.width)
      setPageNaturalHeight(viewport.height)
      if (fitToWidth) calculateFitScale()
      if (fitToScreen) calculateFitToScreenScale()
    },
    [fitToWidth, fitToScreen, calculateFitScale, calculateFitToScreenScale]
  )

  const changeScale = useCallback((deltaOrValue: number, absolute = false) => {
    setScale(prev => {
      if (absolute) {
        return Math.max(0.2, Math.min(2.0, Math.round(deltaOrValue * 100) / 100))
      }
      const next = Math.round((prev + deltaOrValue) * 100) / 100
      return Math.max(0.2, Math.min(2.0, next))
    })
  }, [])

  if (useFallback) {
    return (
      <iframe
        src={getProxiedPdfUrl(fileUrl, fileKey)}
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

      {/* Document pages */}
      {!error && !isBlobUrl && pdfData && (
        <div
          ref={scrollContainerRef}
          className={`relative flex-1 overflow-y-auto ${loading ? 'hidden' : 'block'}`}
        >
          {/* Floating zoom pill - fixed position, does not scroll with content */}
          {!loading && !error && numPages > 0 && (
            <div className="pointer-events-none absolute bottom-2 right-2 z-50">
              <div className="pointer-events-auto">
                <FloatingZoomPill
                  scale={scale}
                  onScaleChange={newScale => changeScale(newScale, true)}
                  minScale={0.2}
                  maxScale={2.0}
                  defaultScale={defaultScale}
                  fitScale={fitScale}
                  onHidePreview={onHidePreview}
                  containerRef={scrollContainerRef}
                  fixed
                />
              </div>
            </div>
          )}
          <Document
            file={pdfData}
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
                  className={cn(
                    'flex justify-center px-4',
                    fitToScreen ? 'min-h-full items-center py-8' : 'mb-4 pt-4 last:pb-4'
                  )}
                >
                  <Page
                    pageNumber={index + 1}
                    renderTextLayer
                    renderAnnotationLayer
                    scale={scale}
                    className="shadow-lg"
                    onLoadSuccess={index === 0 ? onPageLoadSuccess : undefined}
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
              <div
                className={cn(
                  'flex items-center justify-center px-4',
                  fitToScreen ? 'min-h-full py-8' : 'min-h-full py-4'
                )}
              >
                <Page
                  pageNumber={pageNumber}
                  renderTextLayer
                  renderAnnotationLayer
                  scale={scale}
                  className="shadow-lg"
                  onLoadSuccess={onPageLoadSuccess}
                  loading={
                    <div className="flex h-[600px] w-[600px] items-center justify-center bg-white">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
                    </div>
                  }
                />
              </div>
            )}
          </Document>
        </div>
      )}
    </div>
  )
}
