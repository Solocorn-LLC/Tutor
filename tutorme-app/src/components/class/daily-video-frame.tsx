'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useDailyCall } from '@/hooks/use-daily-call'
import {
  AlertTriangle,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Settings2,
  Upload,
  Users,
  Video,
  VideoOff,
  Wifi,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { VIDEO_BACKGROUNDS } from '@/lib/video/backgrounds'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DailyVideoFrameProps {
  roomUrl: string
  token?: string | null
  className?: string
  autoRecord?: boolean
  floating?: boolean
  /** Tutor view: students don't broadcast video, so show them as avatar tiles
   *  (not video). Student view stays full-bleed video of the broadcaster. */
  isTutor?: boolean
  /** 1-on-1 session: both people transmit, so render the OTHER participant's
   *  video for both roles (symmetric two-way) instead of the tutor→students
   *  broadcast layout, and let the student toggle their camera. */
  twoWay?: boolean
  /** Optional: re-mint a fresh access token and re-enter. Wired to Retry so a
   *  join that failed on an EXPIRED token (e.g. after a long idle) can recover —
   *  a plain retry would just replay the same dead token. Falls back to a local
   *  retry when not provided. */
  onRefreshToken?: () => void | Promise<void>
}

export function DailyVideoFrame({
  roomUrl,
  token,
  className,
  autoRecord,
  floating = false,
  isTutor = false,
  twoWay = false,
  onRefreshToken,
}: DailyVideoFrameProps) {
  const {
    call,
    isJoined,
    error: joinError,
    join,
    leave,
    toggleAudio,
    toggleVideo,
    setBackground,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    startScreenShare,
    stopScreenShare,
    startRecording,
    stopRecording,
    isRecording,
    participants,
  } = useDailyCall()
  const joinedRef = useRef(false)
  const recordingRef = useRef(false)
  const [joinAttempt, setJoinAttempt] = useState(0)

  useEffect(() => {
    if (!roomUrl || joinedRef.current) return
    joinedRef.current = true
    let cancelled = false
    const doJoin = async () => {
      try {
        await join(roomUrl, token || undefined)
      } catch {
        if (!cancelled) {
          joinedRef.current = false
        }
      }
    }
    doJoin()
    return () => {
      cancelled = true
      joinedRef.current = false
      recordingRef.current = false
    }
  }, [roomUrl, token, join, leave, joinAttempt])

  // Auto-start cloud recording for the tutor. Daily can reject a startRecording()
  // issued too early (room not fully ready), so retry until Daily confirms via the
  // recording-started event (isRecording) instead of relying on one fragile timeout.
  useEffect(() => {
    if (!isJoined || !autoRecord || isRecording || !call) return
    let cancelled = false
    let attempts = 0
    let timer: ReturnType<typeof setTimeout>
    const attempt = () => {
      if (cancelled) return
      attempts += 1
      try {
        startRecording()
      } catch (err) {
        console.error('Failed to auto-start recording', err)
      }
      if (attempts < 5) {
        timer = setTimeout(attempt, 4000)
      }
    }
    timer = setTimeout(attempt, 1500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isJoined, autoRecord, isRecording, call, startRecording])

  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null)
  // Camera/mic errors after joining (e.g. permission denied when turning the
  // camera on) land in `joinError` but were only shown on the pre-join screen.
  // Track a dismissal so we can surface them in-call too, re-showing on a new one.
  const [errorDismissed, setErrorDismissed] = useState(false)
  useEffect(() => {
    if (joinError) setErrorDismissed(false)
  }, [joinError])
  const [devicesOpen, setDevicesOpen] = useState(false)
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([])
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([])
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([])
  const [audioInputId, setAudioInputId] = useState<string>('')
  const [videoInputId, setVideoInputId] = useState<string>('')
  const [audioOutputId, setAudioOutputId] = useState<string>('')
  const [isRefreshingDevices, setIsRefreshingDevices] = useState(false)
  // Selected virtual background id: 'none' | 'blur' | a wallpaper url | 'custom'.
  const [background, setBackgroundId] = useState<string>('none')
  const [applyingBackground, setApplyingBackground] = useState(false)
  const [backgroundOpen, setBackgroundOpen] = useState(false)
  // The tutor's uploaded image, kept as a data URL for the thumbnail + to persist
  // and re-apply across sessions.
  const [customBg, setCustomBg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const reappliedRef = useRef(false)

  // Virtual backgrounds are a desktop-only Daily feature; on touch/mobile the
  // processor won't apply, so we tell the tutor rather than fail silently.
  const isMobileDevice =
    typeof navigator !== 'undefined' &&
    (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches))

  const applyBackground = async (
    value: 'none' | 'blur' | { url: string } | { source: ArrayBuffer },
    id: string,
    customDataUrl?: string
  ) => {
    setApplyingBackground(true)
    try {
      await setBackground(value)
      setBackgroundId(id)
      // Persist the choice so it survives rejoin (background used to reset on
      // every join). Custom images are stored as a data URL (passed in, since
      // customBg state may not have flushed yet on first upload).
      try {
        if (id === 'none' || id === 'blur') {
          localStorage.setItem('tutor-video-bg', JSON.stringify({ type: id }))
        } else if (id === 'custom' && customDataUrl) {
          localStorage.setItem(
            'tutor-video-bg',
            JSON.stringify({ type: 'custom', dataUrl: customDataUrl })
          )
        } else if (id !== 'custom') {
          localStorage.setItem('tutor-video-bg', JSON.stringify({ type: 'builtin', url: id }))
        }
      } catch {
        /* storage may be unavailable */
      }
    } catch (err) {
      console.warn('[video] background effect failed:', err)
      toast.error(
        isMobileDevice
          ? 'Virtual backgrounds are available on desktop only.'
          : "Backgrounds aren't supported on this device/browser."
      )
    } finally {
      setApplyingBackground(false)
    }
  }

  // Read an uploaded image, apply it, and remember it as the custom background.
  const handleUploadBackground = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image is too large (max 5 MB).')
      return
    }
    const buf = await file.arrayBuffer()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = reject
      r.readAsDataURL(file)
    })
    setCustomBg(dataUrl)
    await applyBackground({ source: buf }, 'custom', dataUrl)
  }

  // Re-apply the tutor's saved background once, after joining (so it's active
  // before they turn their camera on). Desktop only.
  useEffect(() => {
    if (!isTutor || isMobileDevice || !isJoined || !call || reappliedRef.current) return
    reappliedRef.current = true
    let saved: { type?: string; url?: string; dataUrl?: string } | null = null
    try {
      const raw = localStorage.getItem('tutor-video-bg')
      saved = raw ? JSON.parse(raw) : null
    } catch {
      saved = null
    }
    if (!saved || saved.type === 'none') return
    void (async () => {
      try {
        if (saved.type === 'blur') {
          await setBackground('blur')
          setBackgroundId('blur')
        } else if (saved.type === 'builtin' && saved.url) {
          await setBackground({ url: saved.url })
          setBackgroundId(saved.url)
        } else if (saved.type === 'custom' && saved.dataUrl) {
          const buf = await (await fetch(saved.dataUrl)).arrayBuffer()
          setCustomBg(saved.dataUrl)
          await setBackground({ source: buf })
          setBackgroundId('custom')
        }
      } catch {
        /* ignore reapply failures */
      }
    })()
  }, [isTutor, isMobileDevice, isJoined, call, setBackground])

  useEffect(() => {
    if (!call) return
    const handler = (e: any) => {
      const id = e?.activeSpeaker?.peerId || e?.activeSpeaker?.session_id || null
      setActiveSpeakerId(id)
    }
    call.on('active-speaker-change', handler)
    return () => {
      call.off('active-speaker-change', handler)
    }
  }, [call])

  const refreshDevices = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return
    setIsRefreshingDevices(true)
    try {
      const first = await navigator.mediaDevices.enumerateDevices()
      const hasLabels = first.some(d => !!d.label)
      if (!hasLabels) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
          stream.getTracks().forEach(t => t.stop())
        } catch {}
      }

      const list = await navigator.mediaDevices.enumerateDevices()
      const audIn = list.filter(d => d.kind === 'audioinput')
      const vidIn = list.filter(d => d.kind === 'videoinput')
      const audOut = list.filter(d => d.kind === 'audiooutput')

      setAudioInputs(audIn)
      setVideoInputs(vidIn)
      setAudioOutputs(audOut)

      if (!audioInputId && audIn[0]?.deviceId) setAudioInputId(audIn[0].deviceId)
      if (!videoInputId && vidIn[0]?.deviceId) setVideoInputId(vidIn[0].deviceId)
      if (!audioOutputId && audOut[0]?.deviceId) setAudioOutputId(audOut[0].deviceId)
    } finally {
      setIsRefreshingDevices(false)
    }
  }

  useEffect(() => {
    if (!devicesOpen) return
    void refreshDevices()
  }, [devicesOpen])

  useEffect(() => {
    if (!call) return
    const fn = (call as any).setInputDevicesAsync || (call as any).setInputDevices
    if (!fn) return
    if (!audioInputId && !videoInputId) return
    Promise.resolve(
      fn.call(call, {
        audioDeviceId: audioInputId || undefined,
        videoDeviceId: videoInputId || undefined,
      })
    ).catch(() => {})
  }, [call, audioInputId, videoInputId])

  useEffect(() => {
    if (!call) return
    const fn = (call as any).setOutputDevice || (call as any).setAudioOutputDevice
    if (!fn) return
    if (!audioOutputId) return
    Promise.resolve(fn.call(call, audioOutputId)).catch(() => {})
  }, [call, audioOutputId])

  const dailyParticipants = useMemo(() => {
    if (!call) return []
    const map = call.participants() as Record<string, any>
    return Object.values(map)
  }, [call, participants])

  const localParticipant = useMemo(
    () => dailyParticipants.find((p: any) => p?.local),
    [dailyParticipants]
  )

  const remoteParticipants = useMemo(
    () => dailyParticipants.filter((p: any) => !p?.local),
    [dailyParticipants]
  )

  const screenShareParticipant = useMemo(() => {
    for (const p of dailyParticipants) {
      const state = (p as any)?.tracks?.screenVideo?.state
      if (state === 'playable') return p
    }
    return null
  }, [dailyParticipants])

  // The full-bleed tile is whoever is actually broadcasting: a screen share, else
  // the first remote participant WITH a live camera (e.g. the tutor), else any
  // remote, else self. Preferring a video-bearing participant keeps a student's
  // full-screen view on the broadcaster instead of a blank avatar.
  const remoteWithVideo = useMemo(
    () => remoteParticipants.find((p: any) => p?.tracks?.video?.state === 'playable'),
    [remoteParticipants]
  )
  const mainTile =
    screenShareParticipant ?? remoteWithVideo ?? remoteParticipants[0] ?? localParticipant ?? null

  // Self-view: your own camera, shown as a small picture-in-picture (both roles).
  const selfHasVideo = (localParticipant as any)?.tracks?.video?.state === 'playable'

  const [frame, setFrame] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const resizeRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originW: number
    originH: number
  } | null>(null)

  useEffect(() => {
    if (!floating) return
    if (frame) return
    const parent = outerRef.current?.parentElement
    if (!parent) return
    setFrame({ x: 0, y: 0, w: parent.clientWidth, h: parent.clientHeight })
  }, [floating, frame])

  useEffect(() => {
    if (!floating || !frame) return
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      const resize = resizeRef.current
      const parent = outerRef.current?.parentElement
      if (!parent) return

      if (drag && e.pointerId === drag.pointerId) {
        const dx = e.clientX - drag.startX
        const dy = e.clientY - drag.startY
        const maxX = Math.max(0, parent.clientWidth - frame.w)
        const maxY = Math.max(0, parent.clientHeight - frame.h)
        setFrame(prev => {
          if (!prev) return prev
          const nextX = Math.max(0, Math.min(maxX, drag.originX + dx))
          const nextY = Math.max(0, Math.min(maxY, drag.originY + dy))
          return { ...prev, x: nextX, y: nextY }
        })
      }

      if (resize && e.pointerId === resize.pointerId) {
        const dx = e.clientX - resize.startX
        const dy = e.clientY - resize.startY
        setFrame(prev => {
          if (!prev) return prev
          const minW = 360
          const minH = 240
          const maxW = Math.max(minW, parent.clientWidth - prev.x)
          const maxH = Math.max(minH, parent.clientHeight - prev.y)
          const nextW = Math.max(minW, Math.min(maxW, resize.originW + dx))
          const nextH = Math.max(minH, Math.min(maxH, resize.originH + dy))
          return { ...prev, w: nextW, h: nextH }
        })
      }
    }
    const onUp = (e: PointerEvent) => {
      if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null
      if (resizeRef.current?.pointerId === e.pointerId) resizeRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [floating, frame])

  const handleLeave = useCallback(() => {
    // Stop cloud recording before tearing down so it finalizes promptly instead of
    // running until the room expires.
    if (isRecording) {
      try {
        stopRecording()
      } catch (err) {
        console.error('Failed to stop recording on leave', err)
      }
    }
    leave()
    joinedRef.current = false
    recordingRef.current = false
    setActiveSpeakerId(null)
  }, [leave, isRecording, stopRecording])

  useEffect(() => {
    const fn = () => handleLeave()
    window.addEventListener('tutorme:daily-video-leave', fn)
    return () => window.removeEventListener('tutorme:daily-video-leave', fn)
  }, [handleLeave])

  // Closing the tab / navigating away doesn't hit the Leave button, so stop the
  // cloud recording on pagehide too — otherwise it runs until the room expires.
  useEffect(() => {
    if (!isRecording) return
    const stop = () => {
      try {
        stopRecording()
      } catch (err) {
        console.error('Failed to stop recording on page hide', err)
      }
    }
    window.addEventListener('pagehide', stop)
    return () => window.removeEventListener('pagehide', stop)
  }, [isRecording, stopRecording])

  const canSendVideo = localParticipant?.permissions?.canSendVideo !== false

  if (!roomUrl) {
    return (
      <div className={`flex items-center justify-center bg-gray-900 text-white ${className || ''}`}>
        <p className="text-sm">No video room available</p>
      </div>
    )
  }

  if (!isJoined) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 bg-gray-900 text-white ${className || ''}`}
      >
        {joinError ? (
          <>
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <p className="max-w-xs text-center text-sm text-red-400">{joinError}</p>
            {/^(camera|microphone|permission|not allowed|notallowed|denied|device)/i.test(
              joinError
            ) && (
              <p className="max-w-xs text-center text-xs text-white/60">
                Allow camera &amp; microphone access from your browser&apos;s address bar, then
                retry.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                joinedRef.current = false
                // Prefer a fresh token (recovers from an expired one); fall back
                // to a local retry when the parent can't re-mint.
                if (onRefreshToken) void onRefreshToken()
                else setJoinAttempt(v => v + 1)
              }}
              className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
            >
              Retry
            </button>
          </>
        ) : (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <span className="text-sm">Connecting...</span>
          </>
        )}
      </div>
    )
  }

  return (
    <div
      ref={outerRef}
      // In overlay mode (floating=false) the frame must FILL its parent so the
      // full-bleed `absolute inset-0` video has a real height to expand into —
      // without h-full the container is auto-height and the video collapses.
      className={floating && frame ? 'absolute' : 'relative h-full w-full'}
      style={
        floating && frame
          ? { left: frame.x, top: frame.y, width: frame.w, height: frame.h }
          : undefined
      }
    >
      <div
        className={`relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-black ${className || ''}`}
      >
        {/* In-call camera/mic error (e.g. permission denied when enabling the
            camera) — previously only visible on the pre-join screen. */}
        {joinError && !errorDismissed && (
          <div className="absolute inset-x-0 top-0 z-40 flex items-start gap-2 bg-red-600/95 px-3 py-2 text-xs text-white">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Camera / microphone problem</p>
              <p className="text-white/90">{joinError}</p>
              <p className="mt-0.5 text-white/70">
                Check the camera icon in your browser&apos;s address bar and allow access, then
                toggle Cam/Mic again.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setErrorDismissed(true)}
              className="shrink-0 rounded p-0.5 text-white/80 hover:bg-white/20 hover:text-white"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {floating && frame && (
          <>
            <div
              className="absolute left-0 right-0 top-0 z-30 h-10 cursor-move touch-none"
              onPointerDown={e => {
                if (!frame) return
                dragRef.current = {
                  pointerId: e.pointerId,
                  startX: e.clientX,
                  startY: e.clientY,
                  originX: frame.x,
                  originY: frame.y,
                }
                ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
              }}
            />
            <div
              className="absolute bottom-2 right-2 z-30 h-4 w-4 cursor-se-resize touch-none rounded bg-white/20"
              onPointerDown={e => {
                if (!frame) return
                resizeRef.current = {
                  pointerId: e.pointerId,
                  startX: e.clientX,
                  startY: e.clientY,
                  originW: frame.w,
                  originH: frame.h,
                }
                ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
              }}
            />
          </>
        )}

        <div className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-xs text-white backdrop-blur">
          <Wifi className="h-4 w-4" />
          <span>Live</span>
          <span className="mx-1 h-1 w-1 rounded-full bg-white/60" />
          <Users className="h-4 w-4" />
          <span>{Math.max(1, dailyParticipants.length)}</span>
        </div>

        {/* MAIN CONTENT — full-bleed. Student: video of the broadcaster fills the
            area, everything else overlays. Tutor: a grid of STUDENT AVATARS
            (students don't broadcast video), unless the tutor is screen-sharing. */}
        <div className="absolute inset-0 bg-slate-950">
          {isTutor && !twoWay ? (
            screenShareParticipant ? (
              <ParticipantMediaTile
                participant={screenShareParticipant}
                mode="screen"
                isActiveSpeaker={false}
              />
            ) : remoteParticipants.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-white/60">
                Waiting for students to join…
              </div>
            ) : (
              <div className="grid h-full auto-rows-fr grid-cols-2 gap-3 overflow-auto p-3 pb-20 pt-12 sm:grid-cols-3 md:grid-cols-4">
                {remoteParticipants.map((p: any) => (
                  <StudentAvatarTile
                    key={p.session_id}
                    participant={p}
                    isActiveSpeaker={activeSpeakerId === p?.session_id}
                  />
                ))}
              </div>
            )
          ) : mainTile ? (
            // Student view, and both sides of a two-way 1-on-1: full-bleed video
            // of the OTHER participant; your own camera is the self-view PiP.
            <ParticipantMediaTile
              participant={mainTile}
              mode={screenShareParticipant ? 'screen' : 'camera'}
              isActiveSpeaker={activeSpeakerId === (mainTile as any)?.session_id}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-white/70">
              {twoWay
                ? isTutor
                  ? 'Waiting for the student…'
                  : 'Waiting for the tutor…'
                : 'Waiting for the tutor…'}
            </div>
          )}
        </div>

        {/* Self-view PiP — your own camera, a small floating corner tile. */}
        {selfHasVideo && localParticipant && (
          <div className="absolute right-3 top-14 z-20 h-24 w-32 overflow-hidden rounded-xl border border-white/25 bg-slate-900 shadow-lg">
            <ParticipantMediaTile
              participant={localParticipant}
              mode="camera"
              isActiveSpeaker={false}
            />
            <div className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
              You
            </div>
          </div>
        )}

        {/* Remote audio — always mounted regardless of layout. */}
        {remoteParticipants.map((p: any) => (
          <ParticipantAudio key={`${p.session_id}-audio`} participant={p} />
        ))}

        {/* OVERLAY: floating controls pill, centered at the bottom. */}
        <div className="absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-full bg-black/70 px-3 py-2 shadow-lg backdrop-blur">
            <ControlButton
              onClick={toggleAudio}
              active={isAudioEnabled}
              activeIcon={<Mic className="h-4 w-4" />}
              inactiveIcon={<MicOff className="h-4 w-4" />}
              activeLabel="Mic"
              inactiveLabel="Mic"
            />
            <ControlButton
              onClick={toggleVideo}
              active={isVideoEnabled}
              activeIcon={<Video className="h-4 w-4" />}
              inactiveIcon={<VideoOff className="h-4 w-4" />}
              activeLabel="Cam"
              inactiveLabel="Cam"
              // Two-way (1-on-1): the student's token grants video, so always
              // allow the camera toggle.
              disabled={!canSendVideo && !twoWay}
            />
            <ControlButton
              onClick={() => (isScreenSharing ? stopScreenShare() : startScreenShare())}
              active={isScreenSharing}
              activeIcon={<MonitorUp className="h-4 w-4" />}
              inactiveIcon={<MonitorUp className="h-4 w-4" />}
              activeLabel="Sharing"
              inactiveLabel="Share"
            />

            {/* Virtual background — a dedicated, discoverable button (tutor only,
                since students don't broadcast). */}
            {isTutor && (
              <Popover open={backgroundOpen} onOpenChange={setBackgroundOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-sm transition-colors ${
                      background !== 'none'
                        ? 'bg-white text-slate-900 hover:bg-white/90'
                        : 'bg-white/10 text-white hover:bg-white/15'
                    }`}
                  >
                    {applyingBackground ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImageIcon className="h-4 w-4" />
                    )}
                    Background
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="center"
                  // The floating video overlay is z-[9999]; the picker portals to
                  // body with the lower z-popover, so it rendered behind the
                  // video. Lift it above the overlay.
                  className="z-[10000] max-h-[70vh] w-[340px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="mb-2 text-sm font-semibold text-slate-900">
                    Virtual background
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <BackgroundSwatch
                      label="None"
                      active={background === 'none'}
                      onClick={() => applyBackground('none', 'none')}
                    >
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-slate-500">
                        None
                      </div>
                    </BackgroundSwatch>
                    <BackgroundSwatch
                      label="Blur"
                      active={background === 'blur'}
                      onClick={() => applyBackground('blur', 'blur')}
                    >
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-400 text-[10px] font-medium text-slate-700 blur-[1px]">
                        Blur
                      </div>
                    </BackgroundSwatch>
                  </div>

                  <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Colors
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {VIDEO_BACKGROUNDS.filter(bg => bg.kind === 'color').map(bg => (
                      <BackgroundSwatch
                        key={bg.id}
                        label={bg.label}
                        active={background === bg.url}
                        onClick={() => applyBackground({ url: bg.url }, bg.url)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={bg.url} alt={bg.label} className="h-full w-full object-cover" />
                      </BackgroundSwatch>
                    ))}
                  </div>

                  <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Photos
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {VIDEO_BACKGROUNDS.filter(bg => bg.kind === 'photo').map(bg => (
                      <BackgroundSwatch
                        key={bg.id}
                        label={bg.label}
                        active={background === bg.url}
                        onClick={() => applyBackground({ url: bg.url }, bg.url)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={bg.url} alt={bg.label} className="h-full w-full object-cover" />
                      </BackgroundSwatch>
                    ))}
                  </div>

                  <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Your own
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {customBg && (
                      <BackgroundSwatch
                        label="Your image"
                        active={background === 'custom'}
                        onClick={async () => {
                          const buf = await (await fetch(customBg)).arrayBuffer()
                          await applyBackground({ source: buf }, 'custom', customBg)
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={customBg} alt="Custom" className="h-full w-full object-cover" />
                      </BackgroundSwatch>
                    )}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex aspect-video flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed border-slate-300 text-[10px] font-medium text-slate-500 transition-colors hover:border-indigo-400 hover:text-indigo-600"
                    >
                      <Upload className="h-4 w-4" />
                      Upload
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) void handleUploadBackground(file)
                    }}
                  />

                  <p className="mt-3 text-[10px] text-slate-400">
                    {isMobileDevice
                      ? 'Virtual backgrounds are available on desktop only.'
                      : 'Turn your camera on to preview. Desktop only — not available on some low-power devices.'}
                  </p>
                </PopoverContent>
              </Popover>
            )}

            <button
              type="button"
              onClick={handleLeave}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-500"
            >
              <PhoneOff className="h-4 w-4" />
              Leave
            </button>

            <Popover open={devicesOpen} onOpenChange={setDevicesOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-white/15"
                >
                  <Settings2 className="h-4 w-4" />
                  Devices
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[360px] rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Device settings</div>
                  <button
                    type="button"
                    onClick={() => void refreshDevices()}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                    disabled={isRefreshingDevices}
                  >
                    {isRefreshingDevices ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>

                <div className="mt-3 grid gap-3">
                  <div className="grid gap-1">
                    <div className="text-xs font-semibold text-slate-600">Microphone</div>
                    <Select value={audioInputId} onValueChange={setAudioInputId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select microphone" />
                      </SelectTrigger>
                      <SelectContent>
                        {audioInputs.map(d => (
                          <SelectItem key={d.deviceId} value={d.deviceId}>
                            {d.label || 'Microphone'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-1">
                    <div className="text-xs font-semibold text-slate-600">Camera</div>
                    <Select value={videoInputId} onValueChange={setVideoInputId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select camera" />
                      </SelectTrigger>
                      <SelectContent>
                        {videoInputs.map(d => (
                          <SelectItem key={d.deviceId} value={d.deviceId}>
                            {d.label || 'Camera'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-1">
                    <div className="text-xs font-semibold text-slate-600">Speaker</div>
                    <Select value={audioOutputId} onValueChange={setAudioOutputId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select speaker" />
                      </SelectTrigger>
                      <SelectContent>
                        {audioOutputs.length > 0 ? (
                          audioOutputs.map(d => (
                            <SelectItem key={d.deviceId} value={d.deviceId}>
                              {d.label || 'Speaker'}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__na__" disabled>
                            Not supported in this browser
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </div>
  )
}

function BackgroundSwatch({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`aspect-video overflow-hidden rounded-md border-2 transition-colors ${
        active ? 'border-indigo-500' : 'border-transparent hover:border-slate-300'
      }`}
    >
      {children}
    </button>
  )
}

function ControlButton({
  onClick,
  active,
  activeIcon,
  inactiveIcon,
  activeLabel,
  inactiveLabel,
  disabled,
}: {
  onClick: () => void
  active: boolean
  activeIcon: ReactNode
  inactiveIcon: ReactNode
  activeLabel: string
  inactiveLabel: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={disabled ? () => {} : onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-sm transition-colors ${
        disabled
          ? 'cursor-not-allowed bg-white/5 text-white/40'
          : active
            ? 'bg-white text-slate-900 hover:bg-white/90'
            : 'bg-white/10 text-white hover:bg-white/15'
      }`}
    >
      {active ? activeIcon : inactiveIcon}
      {active ? activeLabel : inactiveLabel}
    </button>
  )
}

function getTrack(participant: any, mode: 'camera' | 'screen') {
  const tracks = participant?.tracks
  if (!tracks) return null
  const key = mode === 'screen' ? 'screenVideo' : 'video'
  const t = tracks[key]
  if (!t) return null
  return t.persistentTrack || t.track || null
}

function ParticipantMediaTile({
  participant,
  mode,
  isActiveSpeaker,
}: {
  participant: any
  mode: 'camera' | 'screen'
  isActiveSpeaker: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const track = getTrack(participant, mode)
  const hasVideo = !!track

  useEffect(() => {
    if (!videoRef.current) return
    if (!track) {
      videoRef.current.srcObject = null
      return
    }
    const stream = new MediaStream([track])
    videoRef.current.srcObject = stream
    videoRef.current.play().catch(() => {})
  }, [track])

  const name = participant?.user_name || participant?.user_id || 'Participant'
  const initials = String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((x: string) => x[0]?.toUpperCase())
    .join('')

  return (
    <div className="relative h-full w-full">
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={!!participant?.local}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 text-2xl font-semibold text-white">
            {initials || '?'}
          </div>
        </div>
      )}

      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
        <div className="truncate rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
          {participant?.local ? 'You' : name}
        </div>
        {isActiveSpeaker && (
          <div className="rounded-full bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-white">
            Speaking
          </div>
        )}
      </div>
    </div>
  )
}

/** Avatar card for a student on the tutor's side (students don't broadcast
 *  video, so we show initials + name + mic/hand status rather than a video). */
function StudentAvatarTile({
  participant,
  isActiveSpeaker,
}: {
  participant: any
  isActiveSpeaker: boolean
}) {
  const name = participant?.user_name || participant?.user_id || 'Student'
  const isMuted = !participant?.audio
  const initials = String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((x: string) => x[0]?.toUpperCase())
    .join('')

  return (
    <div
      className={`relative flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border bg-slate-900 p-3 transition-colors ${
        isActiveSpeaker ? 'border-emerald-400 ring-1 ring-emerald-400/60' : 'border-white/10'
      }`}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xl font-semibold text-white">
        {initials || '?'}
      </div>
      <div className="max-w-full truncate text-center text-xs font-medium text-white/90">
        {name}
      </div>
      <div className="absolute right-2 top-2 text-white/70">
        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-emerald-400" />}
      </div>
    </div>
  )
}

function ParticipantAudio({ participant }: { participant: any }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const track =
    participant?.tracks?.audio?.persistentTrack || participant?.tracks?.audio?.track || null

  useEffect(() => {
    if (!audioRef.current) return
    if (!track) {
      audioRef.current.srcObject = null
      return
    }
    const stream = new MediaStream([track])
    audioRef.current.srcObject = stream
    audioRef.current.play().catch(() => {})
  }, [track])

  return <audio ref={audioRef} autoPlay playsInline />
}
