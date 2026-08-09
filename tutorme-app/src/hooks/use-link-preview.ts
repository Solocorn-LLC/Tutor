'use client'

import { useEffect, useRef, useState } from 'react'
import { detectUrls, isValidPreviewUrl } from '@/lib/link-preview/detect-urls'
import type { LinkPreviewMetadata } from '@/lib/link-preview/types'

export type LinkPreviewState = {
  url: string
  metadata?: LinkPreviewMetadata
  loading: boolean
  error?: string
}

/**
 * Detect URLs in `text` and asynchronously fetch metadata for each one.
 * Results are debounced so typing doesn't spam the API.
 */
export function useLinkPreview(text: string, debounceMs = 600) {
  const [previews, setPreviews] = useState<LinkPreviewState[]>([])
  const cacheRef = useRef<Record<string, LinkPreviewMetadata | 'error' | undefined>>({})
  const abortControllersRef = useRef<Record<string, AbortController>>({})

  useEffect(() => {
    const timer = setTimeout(() => {
      const urls = detectUrls(text).filter(isValidPreviewUrl)
      const urlSet = new Set(urls)

      // Cancel fetches for URLs that no longer appear.
      Object.entries(abortControllersRef.current).forEach(([url, controller]) => {
        if (!urlSet.has(url)) {
          controller.abort()
          delete abortControllersRef.current[url]
        }
      })

      // Clean previews for URLs no longer in text.
      setPreviews(prev => prev.filter(p => urlSet.has(p.url)))

      urls.forEach(url => {
        const cached = cacheRef.current[url]
        if (cached === 'error') return

        if (cached) {
          setPreviews(prev => {
            if (prev.some(p => p.url === url)) return prev
            return [...prev, { url, metadata: cached as LinkPreviewMetadata, loading: false }]
          })
          return
        }

        if (abortControllersRef.current[url]) return

        const controller = new AbortController()
        abortControllersRef.current[url] = controller

        fetch('/api/link-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
          signal: controller.signal,
        })
          .then(async res => {
            delete abortControllersRef.current[url]
            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              throw new Error(body.error || `HTTP ${res.status}`)
            }
            const metadata = (await res.json()) as LinkPreviewMetadata
            cacheRef.current[url] = metadata
            setPreviews(prev => {
              const others = prev.filter(p => p.url !== url)
              return [...others, { url, metadata, loading: false }]
            })
          })
          .catch(err => {
            delete abortControllersRef.current[url]
            if (err instanceof Error && err.name === 'AbortError') return
            cacheRef.current[url] = 'error'
            setPreviews(prev => {
              const others = prev.filter(p => p.url !== url)
              return [
                ...others,
                { url, loading: false, error: err instanceof Error ? err.message : 'Failed' },
              ]
            })
          })
      })
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [text, debounceMs])

  return previews
}
