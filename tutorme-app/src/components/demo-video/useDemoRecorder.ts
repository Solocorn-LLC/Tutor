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
  const displayStreamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
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
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach(track => track.stop())
      displayStreamRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop())
      micStreamRef.current = null
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
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      })
      displayStreamRef.current = displayStream

      // Also try to capture microphone audio. If it fails, continue with display audio only.
      let micStream: MediaStream | null = null
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        micStreamRef.current = micStream
      } catch {
        micStream = null
      }

      const combinedTracks: MediaStreamTrack[] = [
        ...displayStream.getVideoTracks(),
        ...displayStream.getAudioTracks(),
      ]
      if (micStream) {
        combinedTracks.push(...micStream.getAudioTracks())
      }

      const combinedStream = new MediaStream(combinedTracks)

      const mimeType = selectSupportedMimeType()
      setRecordedMimeType(mimeType)
      const recorder = new MediaRecorder(combinedStream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        cleanup()
        if (!isMountedRef.current) return
        const blob = new Blob(chunksRef.current, { type: mimeType })
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
      setPreviewStream(combinedStream)
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
    } catch (err: any) {
      cleanup()
      if (!isMountedRef.current) return
      let message = 'Could not start recording.'
      if (err?.name === 'NotAllowedError') {
        message = 'Permission denied. Please allow screen recording and try again.'
      } else if (err?.name === 'NotFoundError') {
        message = 'No screen or audio source found.'
      } else if (err?.message) {
        message = err.message
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
