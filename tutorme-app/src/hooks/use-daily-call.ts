/**
 * React Hook for Daily.co Video Calls
 * Manages video call state and Daily.co call object
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import DailyIframe, { DailyCall, DailyParticipant } from '@daily-co/daily-js'
import * as Sentry from '@sentry/nextjs'
import { VideoCallState, VideoParticipant } from '@/lib/video/types'

interface UseDailyCallOptions {
  onParticipantJoined?: (participant: VideoParticipant) => void
  onParticipantLeft?: (participant: VideoParticipant) => void
  onError?: (error: Error) => void
  onRecordingStarted?: () => void
  onRecordingStopped?: () => void
}

// Module-level singleton to prevent duplicate Daily instances
let globalCallInstance: DailyCall | null = null
// The room URL the singleton is currently joined to. Tracked alongside the
// instance so join() can detect a request to switch to a different room (Daily
// can't move one call object between rooms — it must be torn down first).
let globalJoinedUrl: string | null = null
let instanceCount = 0

export function useDailyCall(options: UseDailyCallOptions = {}) {
  const callRef = useRef<DailyCall | null>(globalCallInstance)
  const instanceId = useRef(++instanceCount)

  // Use refs for callbacks to avoid stale closures
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  }, [options])

  const [state, setState] = useState<VideoCallState>({
    isJoined: false,
    isAudioEnabled: false,
    isVideoEnabled: false,
    isScreenSharing: false,
    participants: [],
    error: null,
  })
  // Reflects Daily's actual recording state (driven by recording-started/stopped),
  // so callers can drive auto-record retries and stop recording on leave.
  const [isRecording, setIsRecording] = useState(false)

  // Define updateParticipants before useEffect
  const updateParticipants = useCallback(() => {
    const call = callRef.current
    if (!call) return

    const participantsMap = call.participants()
    const participants = Object.values(participantsMap).map(mapDailyParticipant)

    setState(prev => ({ ...prev, participants }))
  }, [])

  // Attach all Daily event listeners to a freshly created call object.
  const setupCall = useCallback(
    (call: DailyCall) => {
      call.on('participant-joined', event => {
        const participant = mapDailyParticipant(event.participant)
        optionsRef.current.onParticipantJoined?.(participant)
        updateParticipants()
      })

      call.on('participant-updated', () => {
        updateParticipants()
      })

      call.on('participant-left', event => {
        const participant = mapDailyParticipant(event.participant)
        optionsRef.current.onParticipantLeft?.(participant)
        updateParticipants()
      })

      call.on('error', event => {
        setState(prev => ({ ...prev, error: event.errorMsg }))
        optionsRef.current.onError?.(new Error(event.errorMsg))
        Sentry.captureException(new Error(event.errorMsg || 'Daily call error'), {
          tags: { feature: 'live-video', phase: 'in-call' },
          extra: { joinedUrl: globalJoinedUrl },
        })
      })

      // Camera/mic permission or device failures arrive as their own event; the
      // generic 'error' handler never fires for these, so surface a clear,
      // actionable message instead of leaving the user stuck on "Connecting...".
      call.on('camera-error', event => {
        const raw =
          (event as any)?.errorMsg?.errorMsg ??
          (event as any)?.error?.localizedMsg ??
          (event as any)?.errorMsg
        const message =
          typeof raw === 'string' && raw
            ? raw
            : 'Camera or microphone unavailable. Please allow access in your browser and check your devices.'
        setState(prev => ({ ...prev, error: message }))
        optionsRef.current.onError?.(new Error(message))
        Sentry.captureException(new Error(`Daily camera-error: ${message}`), {
          tags: { feature: 'live-video', phase: 'camera-error' },
          extra: { joinedUrl: globalJoinedUrl },
          level: 'warning',
        })
      })

      // A virtual-background processor can fail AFTER updateInputSettings resolves
      // (model can't load, unsupported GPU) — it reports via this event, not the
      // promise. Surface it so a background silently failing becomes visible.
      // Cast: 'video-processor-error' isn't in daily-js's typed DailyEvent union
      // in this version, but the runtime emits it.
      ;(call as any).on('video-processor-error', (event: any) => {
        const msg = event?.errorMsg || event?.error || 'Video background failed to apply.'
        console.warn('[video] video-processor-error:', msg)
        optionsRef.current.onError?.(new Error(String(msg)))
      })

      call.on('recording-started', () => {
        setIsRecording(true)
        optionsRef.current.onRecordingStarted?.()
      })

      call.on('recording-stopped', () => {
        setIsRecording(false)
        optionsRef.current.onRecordingStopped?.()
      })

      call.on('joined-meeting', () => {
        setState(prev => ({ ...prev, isJoined: true, error: null }))
      })

      call.on('left-meeting', () => {
        setIsRecording(false)
        globalJoinedUrl = null
        setState(prev => ({ ...prev, isJoined: false, participants: [] }))
      })
    },
    [updateParticipants]
  )

  // Return a healthy call object, recreating it if the previous one errored or
  // was left. Daily refuses a re-join on an errored/left call object, so reusing
  // the stale singleton is exactly what makes the video keep failing on retry —
  // always hand back a usable instance instead.
  const ensureCall = useCallback(async (): Promise<DailyCall | null> => {
    if (globalCallInstance) {
      let meetingState: string | undefined
      try {
        meetingState = globalCallInstance.meetingState()
      } catch {
        meetingState = undefined
      }
      if (meetingState !== 'error' && meetingState !== 'left-meeting') {
        callRef.current = globalCallInstance
        return globalCallInstance
      }
      try {
        await globalCallInstance.destroy()
      } catch {
        // ignore destroy errors on a stale instance
      }
      globalCallInstance = null
      callRef.current = null
    }

    try {
      const call = DailyIframe.createCallObject()
      globalCallInstance = call
      callRef.current = call
      setupCall(call)
      return call
    } catch (error) {
      console.warn('Failed to create Daily call object:', error)
      return null
    }
  }, [setupCall])

  // Create the call object up front so device pickers etc. have it before join.
  // It persists for the session and is only torn down on an explicit leave or a
  // failed join (so the next attempt starts from a clean instance).
  useEffect(() => {
    void ensureCall()
  }, [ensureCall])

  const join = useCallback(
    async (url: string, token?: string) => {
      // If the singleton is joined/joining a *different* room, tear it down first.
      // Daily can't move one call object between rooms, so without this the join
      // below would no-op and strand the user in the previous room.
      if (globalCallInstance && globalJoinedUrl && globalJoinedUrl !== url) {
        try {
          await globalCallInstance.destroy()
        } catch {
          // ignore destroy errors on the previous-room instance
        }
        globalCallInstance = null
        globalJoinedUrl = null
        callRef.current = null
      }

      const call = await ensureCall()
      if (!call) {
        const error = new Error('Daily call object not initialized')
        console.error(error)
        setState(prev => ({ ...prev, error: error.message }))
        throw error
      }

      // Don't issue a second join() while one is already in flight or active for
      // this same room — Daily rejects it, which surfaces as a spurious failure.
      let meetingState: string | undefined
      try {
        meetingState = call.meetingState()
      } catch {
        meetingState = undefined
      }
      if (meetingState === 'joining-meeting' || meetingState === 'joined-meeting') {
        globalJoinedUrl = url
        setState(prev => ({ ...prev, isJoined: true, error: null }))
        return
      }

      try {
        // Start with camera + mic OFF, but do NOT pass audioSource/videoSource:
        // false — that tells Daily to acquire NO device, so a later
        // setLocalVideo(true) has no camera to turn on (video never appears).
        // startVideoOff/startAudioOff join muted while still acquiring the
        // devices, so toggling the camera on works.
        await call.join({
          url,
          token,
          startVideoOff: true,
          startAudioOff: true,
        })

        globalJoinedUrl = url
        setState(prev => ({
          ...prev,
          isJoined: true,
          isAudioEnabled: false,
          isVideoEnabled: false,
          error: null,
        }))
      } catch (error) {
        console.error('Daily join error:', error)
        // Daily rejects join() with a plain object ({ action, errorMsg, error }),
        // NOT an Error — so `error.message` was empty and users only ever saw the
        // generic fallback. Pull out Daily's real reason (e.g. "Meeting token is
        // invalid", "not allowed", "does not exist") so the actual cause shows.
        const daily = error as {
          errorMsg?: string | { errorMsg?: string }
          error?: { localizedMsg?: string; msg?: string; type?: string }
        }
        const stringified = (() => {
          try {
            const s = JSON.stringify(error)
            return s && s !== '{}' && s !== 'null' ? s : ''
          } catch {
            return ''
          }
        })()
        const dailyMsg =
          (typeof daily?.errorMsg === 'string' && daily.errorMsg) ||
          (typeof daily?.errorMsg === 'object' && daily.errorMsg?.errorMsg) ||
          daily?.error?.localizedMsg ||
          daily?.error?.msg ||
          (error instanceof Error ? error.message : '') ||
          stringified
        // Rooms are private, so joining WITHOUT a token (the server failed to mint
        // one) always fails — that's the single most common cause, so name it
        // plainly instead of the generic message.
        const message = !token
          ? 'No video access token — the server could not create one for this session (check the Daily API key / account).'
          : dailyMsg || 'Failed to join video call'
        Sentry.captureException(error instanceof Error ? error : new Error(message), {
          tags: { feature: 'live-video', phase: 'join' },
          extra: { joinedUrl: url, hasToken: !!token },
        })
        // Tear the errored call object down so the next Retry rebuilds a clean
        // instance instead of re-joining a dead one (which always fails).
        try {
          await call.destroy()
        } catch {
          // ignore destroy errors
        }
        if (globalCallInstance === call) globalCallInstance = null
        globalJoinedUrl = null
        callRef.current = null
        setState(prev => ({ ...prev, error: message }))
        throw error
      }
    },
    [ensureCall]
  )

  const leave = useCallback(async () => {
    const call = callRef.current
    if (!call) return

    try {
      await call.leave()
    } catch {
      // ignore leave errors
    }
    call.destroy()
    globalCallInstance = null
    globalJoinedUrl = null
    callRef.current = null

    setState(prev => ({
      ...prev,
      isJoined: false,
      isAudioEnabled: false,
      isVideoEnabled: false,
      isScreenSharing: false,
      participants: [],
      error: null,
    }))
  }, [])

  const toggleAudio = useCallback(async () => {
    const call = callRef.current
    if (!call || !state.isJoined) return

    const newState = !state.isAudioEnabled
    // If the mic device wasn't acquired yet, setLocalAudio(true) can't unmute a
    // track that doesn't exist — acquire it first via startCamera({ startAudio }).
    if (newState) {
      const local = call.participants()?.local as
        | { tracks?: { audio?: { persistentTrack?: unknown } } }
        | undefined
      if (!local?.tracks?.audio?.persistentTrack) {
        try {
          await (call as unknown as { startCamera: (o: unknown) => Promise<unknown> }).startCamera({
            startAudioOff: false,
            startVideoOff: !state.isVideoEnabled,
          })
        } catch {
          // fall through to setLocalAudio below
        }
      }
    }
    call.setLocalAudio(newState)
    setState(prev => ({ ...prev, isAudioEnabled: newState }))
  }, [state.isJoined, state.isAudioEnabled, state.isVideoEnabled])

  const toggleVideo = useCallback(async () => {
    const call = callRef.current
    if (!call || !state.isJoined) return

    const newState = !state.isVideoEnabled
    // Same as audio: with no camera acquired yet, ask Daily to acquire it before
    // enabling, so the local video track actually appears.
    if (newState) {
      const local = call.participants()?.local as
        | { tracks?: { video?: { persistentTrack?: unknown } } }
        | undefined
      if (!local?.tracks?.video?.persistentTrack) {
        try {
          await (call as unknown as { startCamera: (o: unknown) => Promise<unknown> }).startCamera({
            startVideoOff: false,
            startAudioOff: !state.isAudioEnabled,
          })
        } catch {
          // fall through to setLocalVideo below
        }
      }
    }
    call.setLocalVideo(newState)
    setState(prev => ({ ...prev, isVideoEnabled: newState }))
  }, [state.isJoined, state.isVideoEnabled, state.isAudioEnabled])

  // Virtual background. Applied via Daily's video input processor (segmentation
  // runs client-side; desktop only). Accepts:
  //   'none' | 'blur' | { url } (built-in same-origin image) | { source } (an
  //   uploaded image as an ArrayBuffer). Rejections are surfaced to the caller.
  const setBackground = useCallback(
    async (bg: 'none' | 'blur' | { url: string } | { source: ArrayBuffer }) => {
      const call = callRef.current
      if (!call) return
      let processor
      if (bg === 'none') {
        processor = { type: 'none' as const }
      } else if (bg === 'blur') {
        processor = { type: 'background-blur' as const, config: { strength: 0.6 } }
      } else {
        // Daily reads the image from config.source (a URL/ArrayBuffer). We
        // previously passed config.url, which it ignored — so images silently
        // never applied. Built-ins use an absolute same-origin URL; uploads pass
        // the raw ArrayBuffer.
        const source =
          'source' in bg
            ? bg.source
            : typeof window !== 'undefined'
              ? new URL(bg.url, window.location.origin).href
              : bg.url
        processor = { type: 'background-image' as const, config: { source } }
      }
      await call.updateInputSettings({ video: { processor } })
    },
    []
  )

  const startScreenShare = useCallback(() => {
    const call = callRef.current
    if (!call || !state.isJoined) return

    call.startScreenShare()
    setState(prev => ({ ...prev, isScreenSharing: true }))
  }, [state.isJoined])

  const stopScreenShare = useCallback(() => {
    const call = callRef.current
    if (!call || !state.isJoined) return

    call.stopScreenShare()
    setState(prev => ({ ...prev, isScreenSharing: false }))
  }, [state.isJoined])

  // Start recording
  const startRecording = useCallback(() => {
    const call = callRef.current
    if (!call || !state.isJoined) return

    call.startRecording()
  }, [state.isJoined])

  // Stop recording
  const stopRecording = useCallback(() => {
    const call = callRef.current
    if (!call || !state.isJoined) return

    call.stopRecording()
  }, [state.isJoined])

  return {
    call: callRef.current,
    ...state,
    isRecording,
    join,
    leave,
    toggleAudio,
    toggleVideo,
    setBackground,
    startScreenShare,
    stopScreenShare,
    startRecording,
    stopRecording,
  }
}

function mapDailyParticipant(participant: DailyParticipant): VideoParticipant {
  return {
    id: participant.session_id,
    userId: participant.user_id || participant.session_id,
    name: participant.user_name || 'Anonymous',
    isScreenSharing: participant.screen,
    isAudioEnabled: participant.audio,
    isVideoEnabled: participant.video,
  }
}
