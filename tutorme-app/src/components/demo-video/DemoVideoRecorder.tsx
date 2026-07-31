'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { Video, Square, RotateCcw, Upload, AlertCircle } from 'lucide-react'
import { useDemoRecorder, formatRecordingDuration, DEMO_RECORDING_MAX_MS } from './useDemoRecorder'
import { useDemoVideoUpload, formatDemoVideoBytes } from './useDemoVideoUpload'

interface DemoVideoRecorderProps {
  sessionId: string
  onUploaded: () => void
}

export function DemoVideoRecorder({ sessionId, onUploaded }: DemoVideoRecorderProps) {
  const {
    state,
    error,
    recordedBlob,
    recordedMimeType,
    elapsedMs,
    remainingMs,
    previewStream,
    startRecording,
    stopRecording,
    reset,
  } = useDemoRecorder()
  const { uploading, progress, uploadBlob } = useDemoVideoUpload()

  const previewRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = previewRef.current
    if (!video || !previewStream) return
    video.srcObject = previewStream
    video.play().catch(() => {
      // autoplay may be blocked; user can manually play
    })
    return () => {
      video.srcObject = null
    }
  }, [previewStream])

  const previewUrl = useMemo(() => {
    if (!recordedBlob) return null
    return URL.createObjectURL(recordedBlob)
  }, [recordedBlob])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const handleStart = useCallback(async () => {
    await startRecording()
  }, [startRecording])

  const handleUpload = useCallback(async () => {
    if (!recordedBlob) return

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const extension = recordedMimeType.includes('mp4') ? 'mp4' : 'webm'
    const filename = `demo-recording-${timestamp}.${extension}`
    const contentType = recordedMimeType.includes('mp4') ? 'video/mp4' : 'video/webm'

    const ok = await uploadBlob({
      sessionId,
      blob: recordedBlob,
      filename,
      contentType,
    })

    if (ok) {
      reset()
      onUploaded()
    }
  }, [recordedBlob, recordedMimeType, sessionId, uploadBlob, reset, onUploaded])

  if (state === 'error') {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error || 'Recording failed'}</span>
        </div>
        <Button size="sm" variant="outline" onClick={reset} className="gap-1">
          <RotateCcw className="h-3.5 w-3.5" /> Try again
        </Button>
      </div>
    )
  }

  if (state === 'stopped' && recordedBlob && previewUrl) {
    const size = recordedBlob.size
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-900">
            <Video className="h-4 w-4 text-blue-600" />
            Recording complete
          </div>
          <video src={previewUrl} controls className="max-h-[200px] w-full rounded-lg bg-black" />
          <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
            <span>{formatRecordingDuration(elapsedMs)}</span>
            <span>{formatDemoVideoBytes(size)}</span>
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
              className="gap-1 bg-blue-600 text-white hover:bg-blue-700"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? 'Uploading…' : 'Upload recording'}
            </Button>
            <Button size="sm" variant="outline" onClick={reset} disabled={uploading}>
              Discard
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span>Preview the recording, then upload it to assign it to the demo class.</span>
        </div>
      </div>
    )
  }

  const isRecording = state === 'recording'
  const isRequesting = state === 'requesting'

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-black p-1">
        <div className="relative aspect-video max-h-[270px] w-full overflow-hidden rounded-lg bg-slate-900">
          {isRecording && previewStream ? (
            <video ref={previewRef} autoPlay muted playsInline className="h-full w-full" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
              <Video className="h-10 w-10" />
              <span className="text-sm">
                {isRequesting ? 'Waiting for screen share permission…' : 'Preview will appear here'}
              </span>
            </div>
          )}

          {(isRecording || isRequesting) && (
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
              <span
                className={
                  isRecording
                    ? 'h-2 w-2 animate-pulse rounded-full bg-red-500'
                    : 'h-2 w-2 rounded-full bg-yellow-500'
                }
              />
              <span>
                {isRecording
                  ? `${formatRecordingDuration(elapsedMs)} / ${formatRecordingDuration(DEMO_RECORDING_MAX_MS)}`
                  : 'Starting…'}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {!isRecording ? (
          <Button
            size="sm"
            onClick={handleStart}
            disabled={isRequesting || uploading}
            className="gap-1 bg-red-600 text-white hover:bg-red-700"
          >
            <Video className="h-3.5 w-3.5" />
            {isRequesting ? 'Starting…' : 'Start recording'}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={stopRecording}
            disabled={uploading}
            variant="outline"
            className="gap-1 border-red-200 text-red-600 hover:bg-red-50"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop recording
          </Button>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <span>
          Recording automatically stops at 10 minutes. Share your screen, a window, or a tab when
          the browser prompts you.
        </span>
      </div>
    </div>
  )
}
