'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { DailyVideoFrame } from '@/components/class/daily-video-frame'
import { useVideoOverlayStore } from '@/stores/video-overlay-store'

export function FloatingVideoOverlay() {
  const { open, roomUrl, token, autoRecord, isTutor, closeOverlay } = useVideoOverlayStore()
  const [frame, setFrame] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
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
    if (!open && frame) {
      setFrame(null)
      return
    }
    if (!open) return
    if (frame) return
    if (typeof window === 'undefined') return
    if (isTutor) {
      const minW = 360
      const minH = 240
      setFrame({ x: 0, y: Math.max(0, window.innerHeight - minH), w: minW, h: minH })
      return
    }
    const w = Math.min(560, Math.max(360, Math.floor(window.innerWidth * 0.4)))
    const h = Math.min(420, Math.max(240, Math.floor(window.innerHeight * 0.35)))
    setFrame({ x: 24, y: 24, w, h })
  }, [open, frame, isTutor])

  useEffect(() => {
    if (!open || !frame) return
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      const resize = resizeRef.current

      if (drag && e.pointerId === drag.pointerId) {
        const dx = e.clientX - drag.startX
        const dy = e.clientY - drag.startY
        setFrame(prev => {
          if (!prev) return prev
          const maxX = Math.max(0, window.innerWidth - prev.w)
          const maxY = Math.max(0, window.innerHeight - prev.h)
          return {
            ...prev,
            x: Math.max(0, Math.min(maxX, drag.originX + dx)),
            y: Math.max(0, Math.min(maxY, drag.originY + dy)),
          }
        })
      }

      if (resize && e.pointerId === resize.pointerId) {
        const dx = e.clientX - resize.startX
        const dy = e.clientY - resize.startY
        setFrame(prev => {
          if (!prev) return prev
          const minW = 360
          const minH = 240
          const maxW = Math.max(minW, window.innerWidth - prev.x)
          const maxH = Math.max(minH, window.innerHeight - prev.y)
          return {
            ...prev,
            w: Math.max(minW, Math.min(maxW, resize.originW + dx)),
            h: Math.max(minH, Math.min(maxH, resize.originH + dy)),
          }
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
  }, [open, frame])

  const canRender = useMemo(() => open && !!roomUrl, [open, roomUrl])
  if (!canRender || !frame || !roomUrl) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999]">
      <div
        className="pointer-events-auto absolute overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-2xl"
        style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
      >
        <div
          className="absolute left-0 right-0 top-0 z-30 flex h-10 cursor-move touch-none items-center justify-between gap-2 bg-black/70 px-2 text-xs font-semibold text-white backdrop-blur"
          onPointerDown={e => {
            dragRef.current = {
              pointerId: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              originX: frame.x,
              originY: frame.y,
            }
            ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
          }}
        >
          <div className="truncate pl-2">Video</div>
          <button
            type="button"
            // Stop the drag handle's pointer capture from stealing the pointerup
            // (which would suppress this button's click and prevent closing).
            onPointerDown={e => e.stopPropagation()}
            onClick={() => {
              window.dispatchEvent(new Event('tutorme:daily-video-leave'))
              closeOverlay()
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/15"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="h-full w-full pt-10">
          <DailyVideoFrame
            roomUrl={roomUrl}
            token={token}
            autoRecord={autoRecord}
            floating={false}
            className="h-full w-full rounded-none border-0"
          />
        </div>

        <div
          className="absolute bottom-2 right-2 z-30 h-4 w-4 cursor-se-resize touch-none rounded bg-white/20"
          onPointerDown={e => {
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
      </div>
    </div>
  )
}
