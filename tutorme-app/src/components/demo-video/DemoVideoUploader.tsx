'use client'

import { useCallback, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Upload, X, Film, AlertCircle } from 'lucide-react'

const MAX_UPLOAD_BYTES = 1024 * 1024 * 500 // 500 MB
const ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']

interface DemoVideoUploaderProps {
  sessionId: string
  onUploaded: () => void
}

interface UploadInitResponse {
  contentId: string
  uploadUrl?: string | null
  publicUrl?: string | null
  key?: string | null
  uploadHeaders?: Record<string, string> | null
  maxBytes?: number
  message?: string
}

export function DemoVideoUploader({ sessionId, onUploaded }: DemoVideoUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Please upload an MP4, WebM, or MOV video.'
    }
    const maxBytes = Math.min(file.size > 0 ? MAX_UPLOAD_BYTES : MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES)
    if (file.size > maxBytes) {
      return `File size must be under ${formatBytes(MAX_UPLOAD_BYTES)}.`
    }
    if (file.size === 0) {
      return 'Selected file is empty.'
    }
    return null
  }

  const handleFileSelect = useCallback((file: File | null) => {
    if (!file) {
      setSelectedFile(null)
      return
    }
    const error = validateFile(file)
    if (error) {
      toast.error(error)
      setSelectedFile(null)
      return
    }
    setSelectedFile(file)
    setProgress(0)
  }, [])

  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      toast.error('Please select a video file.')
      return
    }

    setUploading(true)
    setProgress(10)

    try {
      const initRes = await fetch(`/api/tutor/classes/${sessionId}/demo-video/upload/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: selectedFile.type,
          maxBytes: MAX_UPLOAD_BYTES,
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
          body: selectedFile,
          headers: {
            'Content-Type': selectedFile.type,
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
      setSelectedFile(null)
      onUploaded()
    } catch (err: any) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      setTimeout(() => setProgress(0), 500)
    }
  }, [selectedFile, sessionId, onUploaded])

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={e => handleFileSelect(e.target.files?.[0] ?? null)}
      />

      {!selectedFile ? (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 transition-colors hover:border-blue-400 hover:bg-blue-50',
            uploading && 'opacity-60'
          )}
        >
          <Upload className="h-8 w-8 text-slate-400" />
          <span className="text-sm font-medium text-slate-600">Click to upload a video</span>
          <span className="text-xs text-slate-400">
            MP4, WebM, MOV · max {formatBytes(MAX_UPLOAD_BYTES)}
          </span>
        </button>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
              <Film className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{selectedFile.name}</p>
              <p className="text-xs text-slate-500">{formatBytes(selectedFile.size)}</p>
            </div>
            <button
              onClick={() => !uploading && handleFileSelect(null)}
              disabled={uploading}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {uploading && progress > 0 && (
            <div className="mt-3 space-y-1">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-slate-500">Uploading… {progress}%</p>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={handleUpload}
              disabled={uploading}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {uploading ? 'Uploading…' : 'Upload video'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleFileSelect(null)}
              disabled={uploading}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <span>Uploaded videos will be shown to students when they enter the demo class.</span>
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
