/**
 * React Hook for Daily.co Video Calls
 * Manages video call state and Daily.co call object
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import DailyIframe, { DailyCall, DailyParticipant } from '@daily-co/daily-js'
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
      })

      call.on('recording-started', () => {
        optionsRef.current.onRecordingStarted?.()
      })

      call.on('recording-stopped', () => {
        optionsRef.current.onRecordingStopped?.()
      })

      call.on('joined-meeting', () => {
        setState(prev => ({ ...prev, isJoined: true, error: null }))
      })

      call.on('left-meeting', () => {
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
      const call = await ensureCall()
      if (!call) {
        const error = new Error('Daily call object not initialized')
        console.error(error)
        setState(prev => ({ ...prev, error: error.message }))
        throw error
      }

      // Don't issue a second join() while one is already in flight or active —
      // Daily rejects it, which surfaces as a spurious "failed to join".
      let meetingState: string | undefined
      try {
        meetingState = call.meetingState()
      } catch {
        meetingState = undefined
      }
      if (meetingState === 'joining-meeting' || meetingState === 'joined-meeting') {
        setState(prev => ({ ...prev, isJoined: true, error: null }))
        return
      }

      try {
        await call.join({
          url,
          token,
          audioSource: false,
          videoSource: false,
        })

        setState(prev => ({
          ...prev,
          isJoined: true,
          isAudioEnabled: false,
          isVideoEnabled: false,
          error: null,
        }))
      } catch (error) {
        console.error('Daily join error:', error)
        const message = error instanceof Error ? error.message : 'Failed to join video call'
        // Tear the errored call object down so the next Retry rebuilds a clean
        // instance instead of re-joining a dead one (which always fails).
        try {
          await call.destroy()
        } catch {
          // ignore destroy errors
        }
        if (globalCallInstance === call) globalCallInstance = null
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

  const toggleAudio = useCallback(() => {
    const call = callRef.current
    if (!call || !state.isJoined) return

    const newState = !state.isAudioEnabled
    call.setLocalAudio(newState)
    setState(prev => ({ ...prev, isAudioEnabled: newState }))
  }, [state.isJoined, state.isAudioEnabled])

  const toggleVideo = useCallback(() => {
    const call = callRef.current
    if (!call || !state.isJoined) return

    const newState = !state.isVideoEnabled
    call.setLocalVideo(newState)
    setState(prev => ({ ...prev, isVideoEnabled: newState }))
  }, [state.isJoined, state.isVideoEnabled])

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
    join,
    leave,
    toggleAudio,
    toggleVideo,
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
