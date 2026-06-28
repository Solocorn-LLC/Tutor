'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface DrawingPadProps {
  /** Existing PNG data URL to restore (when the student already drew something). */
  value?: string
  /** Called with the PNG data URL after each stroke (empty string when cleared). */
  onChange: (dataUrl: string) => void
  onInteract?: () => void
  className?: string
}

const MIN_HEIGHT = 120
const MAX_HEIGHT = 640

/**
 * A pen/mouse/touch drawing surface for written answers (e.g. maths working).
 * The height is ADJUSTABLE via the drag bar at the bottom; existing strokes are
 * preserved (more space is added, content isn't scaled). Supports a Pen and an
 * Eraser. Emits a PNG data URL so the answer can be submitted/graded like any
 * value.
 */
export function DrawingPad({ value, onChange, onInteract, className = '' }: DrawingPadProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const dataRef = useRef<string>(value && value.startsWith('data:image') ? value : '')
  const toolRef = useRef<'pen' | 'eraser'>('pen')
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [height, setHeight] = useState(176)
  const resizeStart = useRef<{ y: number; h: number } | null>(null)

  // Size the canvas backing store to the wrapper and redraw the saved drawing at
  // its natural size (top-left) so expanding adds blank space without distorting.
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const rect = wrap.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    if (canvas.width === w && canvas.height === h) return
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    if (dataRef.current.startsWith('data:image')) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0)
      img.src = dataRef.current
    }
  }, [])

  useEffect(() => {
    initCanvas()
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => initCanvas())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [initCanvas])

  const applyTool = (ctx: CanvasRenderingContext2D) => {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (toolRef.current === 'eraser') {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 18
    } else {
      ctx.strokeStyle = '#1F2933'
      ctx.lineWidth = 2.4
    }
  }

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pointFromEvent(e)
    onInteract?.()
  }

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !last.current) return
    applyTool(ctx)
    const p = pointFromEvent(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }

  const handleUp = () => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    const url = canvasRef.current?.toDataURL('image/png')
    if (url) {
      dataRef.current = url
      onChange(url)
    }
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    dataRef.current = ''
    onChange('')
  }

  // Drag the bottom bar to resize the pad (separate from the drawing surface).
  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    resizeStart.current = { y: e.clientY, h: height }
  }
  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return
    const next = resizeStart.current.h + (e.clientY - resizeStart.current.y)
    setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, next)))
  }
  const onResizeUp = () => {
    resizeStart.current = null
  }

  const toolBtn = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
      active ? 'bg-[#F17623] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`

  return (
    <div className={className}>
      <div className="mb-1 flex items-center gap-1">
        <button
          type="button"
          className={toolBtn(tool === 'pen')}
          onClick={() => {
            toolRef.current = 'pen'
            setTool('pen')
          }}
        >
          Pen
        </button>
        <button
          type="button"
          className={toolBtn(tool === 'eraser')}
          onClick={() => {
            toolRef.current = 'eraser'
            setTool('eraser')
          }}
        >
          Eraser
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="ml-auto rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          Clear
        </button>
      </div>
      <div
        ref={wrapRef}
        style={{ height }}
        className="relative w-full overflow-hidden rounded-md border border-gray-300 bg-white"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
        />
        {/* Faint horizontal ruled lines to guide handwriting. Purely a visual
            overlay (pointer-events-none, drawn over the canvas) so it never
            ends up in the exported PNG sent to OCR or shown to the tutor. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent 0, transparent 27px, rgba(15,23,42,0.08) 27px, rgba(15,23,42,0.08) 28px)',
          }}
        />
      </div>
      {/* Drag bar to make the pad taller/shorter. */}
      <div
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        className="mt-0.5 flex h-4 w-full cursor-ns-resize touch-none items-center justify-center rounded-md hover:bg-gray-100"
        title="Drag to resize the drawing area"
      >
        <div className="h-0.5 w-10 rounded-full bg-gray-300" />
      </div>
      <p className="text-[10px] text-gray-400">
        Pen, mouse, or finger. Drag the bar above to resize.
      </p>
    </div>
  )
}
