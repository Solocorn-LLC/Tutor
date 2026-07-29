'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'

export const DEMO_VIDEO_MAX_UPLOAD_BYTES = 1024 * 1024 * 500 // 500 MB
export const DEMO_VIDEO_ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']

interface UploadInitResponse {
  contentId: string
  uploadUrl?: string | null
  publicUrl?: string | null
  key?: string | null
  uploadHeaders?: Record<string, string> | null
  maxBytes?: number
  message?: string
}

export interface DemoVideoUploadState {
  uploading: boolean
  progress: number
}

export interface UseDemoVideoUploadReturn extends DemoVideoUploadState {
  uploadBlob: (params: {
    sessionId: string
    blob: Blob
    filename: string
    contentType: string
  }) => Promise<boolean>
}

export function useDemoVideoUpload(): UseDemoVideoUploadReturn {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const uploadBlob = useCallback(
    async ({
      sessionId,
      blob,
      filename,
      contentType,
    }: {
      sessionId: string
      blob: Blob
      filename: string
      contentType: string
    }): Promise<boolean> => {
      setUploading(true)
      setProgress(10)

      try {
        const initRes = await fetch(`/api/tutor/classes/${sessionId}/demo-video/upload/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            filename,
            contentType,
            maxBytes: DEMO_VIDEO_MAX_UPLOAD_BYTES,
          }),
        })

        if (!initRes.ok) {
          const data = await initRes.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to initialize upload')
        }

        const init: UploadInitResponse = await initRes.json()
        setProgress(30)

        if (init.uploadUrl) {
          const gcsRes = await fetch(init.uploadUrl, {
            method: 'PUT',
            body: blob,
            headers: {
              'Content-Type': contentType,
              ...(init.uploadHeaders || {}),
            },
          })
          if (!gcsRes.ok) {
            throw new Error('GCS upload failed')
          }
        } else {
          throw new Error(init.message || 'Upload URL not available. GCS may not be configured.')
        }

        setProgress(70)

        const completeRes = await fetch(`/api/content/${init.contentId}/upload-complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            key: init.key,
            url: init.publicUrl,
          }),
        })
        if (!completeRes.ok) {
          const data = await completeRes.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to finalize upload')
        }

        setProgress(85)

        const assignRes = await fetch(`/api/tutor/classes/${sessionId}/demo-video`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ contentId: init.contentId }),
        })
        if (!assignRes.ok) {
          const data = await assignRes.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to assign video to demo class')
        }

        setProgress(100)
        toast.success('Demo video uploaded and assigned.')
        return true
      } catch (err: any) {
        toast.error(err.message || 'Upload failed')
        return false
      } finally {
        setUploading(false)
        setTimeout(() => setProgress(0), 500)
      }
    },
    []
  )

  return { uploading, progress, uploadBlob }
}

export function isDemoVideoContentTypeAllowed(contentType: string): boolean {
  return DEMO_VIDEO_ALLOWED_TYPES.includes(contentType)
}

export function validateDemoVideoFile(file: File): string | null {
  if (!isDemoVideoContentTypeAllowed(file.type)) {
    return 'Please upload an MP4, WebM, or MOV video.'
  }
  if (file.size > DEMO_VIDEO_MAX_UPLOAD_BYTES) {
    return `File size must be under ${formatDemoVideoBytes(DEMO_VIDEO_MAX_UPLOAD_BYTES)}.`
  }
  if (file.size === 0) {
    return 'Selected file is empty.'
  }
  return null
}

export function formatDemoVideoBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
