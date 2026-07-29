'use client'

import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Upload, X, Film, AlertCircle } from 'lucide-react'
import {
  useDemoVideoUpload,
  validateDemoVideoFile,
  formatDemoVideoBytes,
} from './useDemoVideoUpload'

interface DemoVideoUploaderProps {
  sessionId: string
  onUploaded: () => void
}

export function DemoVideoUploader({ sessionId, onUploaded }: DemoVideoUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const { uploading, progress, uploadBlob } = useDemoVideoUpload()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((file: File | null) => {
    if (!file) {
      setSelectedFile(null)
      return
    }
    const error = validateDemoVideoFile(file)
    if (error) {
      toast.error(error)
      setSelectedFile(null)
      return
    }
    setSelectedFile(file)
  }, [])

  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      toast.error('Please select a video file.')
      return
    }

    const ok = await uploadBlob({
      sessionId,
      blob: selectedFile,
      filename: selectedFile.name,
      contentType: selectedFile.type,
    })

    if (ok) {
      setSelectedFile(null)
      onUploaded()
    }
  }, [selectedFile, sessionId, uploadBlob, onUploaded])

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
            MP4, WebM, MOV · max {formatDemoVideoBytes(1024 * 1024 * 500)}
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
              <p className="text-xs text-slate-500">{formatDemoVideoBytes(selectedFile.size)}</p>
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
