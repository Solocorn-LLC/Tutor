'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export const DEMO_RECORDING_MAX_MS = 10 * 60 * 1000 // 10 minutes

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'stopped' | 'error'

export interface UseDemoRecorderReturn {
  state: RecorderState
  error: string | null
  recordedBlob: Blob | null
  recordedMimeType: string
  elapsedMs: number
  remainingMs: number
  previewStream: MediaStream | null
  startRecording: () => Promise<void>
  stopRecording: () => void
  reset: () => void
}

export function useDemoRecorder(): UseDemoRecorderReturn {
  const [state, setState] = useState<RecorderState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedMimeType, setRecordedMimeType] = useState<string>('video/webm')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current)
      stopTimeoutRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch {
        // already stopped or inactive
      }
      mediaRecorderRef.current = null
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop())
      cameraStreamRef.current = null
    }
    chunksRef.current = []
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      cleanup()
    }
  }, [cleanup])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    } else {
      cleanup()
      if (isMountedRef.current) {
        setState('stopped')
      }
    }
  }, [cleanup])

  const startRecording = useCallback(async () => {
    cleanup()
    setError(null)
    setRecordedBlob(null)
    setElapsedMs(0)
    setState('requesting')

    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          frameRate: 30,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      })
      cameraStreamRef.current = cameraStream

      const mimeType = selectSupportedMimeType()
      setRecordedMimeType(mimeType)
      const recorder = new MediaRecorder(cameraStream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        // Capture chunks before cleanup() empties the ref.
        const recordedChunks = chunksRef.current.slice()
        cleanup()
        if (!isMountedRef.current) return
        const blob = new Blob(recordedChunks, { type: mimeType })
        setRecordedBlob(blob)
        setState('stopped')
        setPreviewStream(null)
      }

      recorder.onerror = () => {
        cleanup()
        if (!isMountedRef.current) return
        setError('Recording failed. Please try again.')
        setState('error')
        setPreviewStream(null)
      }

      recorder.start(1000) // collect 1-second chunks
      setPreviewStream(cameraStream)
      startTimeRef.current = Date.now()
      setState('recording')

      timerRef.current = setInterval(() => {
        if (!isMountedRef.current) return
        const elapsed = Date.now() - startTimeRef.current
        setElapsedMs(elapsed)
        if (elapsed >= DEMO_RECORDING_MAX_MS) {
          stopRecording()
        }
      }, 1000)

      stopTimeoutRef.current = setTimeout(() => {
        stopRecording()
      }, DEMO_RECORDING_MAX_MS + 1000)
    } catch (err: unknown) {
      cleanup()
      if (!isMountedRef.current) return
      let message = 'Could not start recording.'
      const error = err instanceof Error ? err : null
      if ((error as Error | null)?.name === 'NotAllowedError') {
        message = 'Permission denied. Please allow camera and microphone access and try again.'
      } else if ((error as Error | null)?.name === 'NotFoundError') {
        message = 'No camera or microphone found.'
      } else if (error?.message) {
        message = error.message
      }
      setError(message)
      setState('error')
    }
  }, [cleanup, stopRecording])

  const reset = useCallback(() => {
    cleanup()
    setError(null)
    setRecordedBlob(null)
    setElapsedMs(0)
    setPreviewStream(null)
    setState('idle')
  }, [cleanup])

  const remainingMs = Math.max(0, DEMO_RECORDING_MAX_MS - elapsedMs)

  return {
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
  }
}

function selectSupportedMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return 'video/webm'
}

export function formatRecordingDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
