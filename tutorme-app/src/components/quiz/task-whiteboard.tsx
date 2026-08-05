'use client'

import { forwardRef, useImperativeHandle, useRef, useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Eraser, Pen, Trash2, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Imperative handle: parent calls these on submit. */
export interface TaskWhiteboardHandle {
  /** PNG data URL of the drawing, or null when nothing has been drawn. */
  exportPng: () => string | null
  isEmpty: () => boolean
}

const COLORS = ['#1f2937', '#dc2626', '#2563eb', '#059669', '#d97706']
const PEN_WIDTH = 3
const ERASER_WIDTH = 24

/**
 * A self-contained drawing canvas a student can attach to a task answer. Not the
 * collaborative live-classroom whiteboard — just a local pad whose PNG is submitted
 * with the task. Strokes are kept so undo/clear/redraw work across resizes.
 */
type Stroke = { points: { x: number; y: number }[]; color: string; width: number; erase: boolean }

export const TaskWhiteboard = forwardRef<TaskWhiteboardHandle, { className?: string }>(
  function TaskWhiteboard({ className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const strokesRef = useRef<Stroke[]>([])
    const drawingRef = useRef<Stroke | null>(null)
    const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
    const [color, setColor] = useState(COLORS[0])
    const [hasDrawn, setHasDrawn] = useState(false)

    const redraw = useCallback(() => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const s of strokesRef.current) {
        if (s.points.length === 0) continue
        ctx.strokeStyle = s.erase ? '#ffffff' : s.color
        ctx.lineWidth = s.width
        ctx.beginPath()
        ctx.moveTo(s.points[0].x, s.points[0].y)
        for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y)
        ctx.stroke()
      }
    }, [])

    // Size the canvas to its container (accounting for DPR) and repaint.
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const resize = () => {
        const rect = canvas.getBoundingClientRect()
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.max(1, Math.floor(rect.width * dpr))
        canvas.height = Math.max(1, Math.floor(rect.height * dpr))
        // Points are stored in CSS pixels; scale the context so 1 unit = 1 CSS px.
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        redraw()
      }
      resize()
      window.addEventListener('resize', resize)
      return () => window.removeEventListener('resize', resize)
    }, [redraw])

    const pos = (e: React.PointerEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const onDown = (e: React.PointerEvent) => {
      e.preventDefault()
      canvasRef.current?.setPointerCapture(e.pointerId)
      drawingRef.current = {
        points: [pos(e)],
        color,
        width: tool === 'eraser' ? ERASER_WIDTH : PEN_WIDTH,
        erase: tool === 'eraser',
      }
    }
    const onMove = (e: React.PointerEvent) => {
      if (!drawingRef.current) return
      drawingRef.current.points.push(pos(e))
      redrawStrokeLive()
    }
    const onUp = () => {
      if (!drawingRef.current) return
      strokesRef.current.push(drawingRef.current)
      drawingRef.current = null
      setHasDrawn(true)
    }

    // Draw only the in-progress stroke incrementally (avoids full redraw per move).
    const redrawStrokeLive = () => {
      const ctx = canvasRef.current?.getContext('2d')
      const s = drawingRef.current
      if (!ctx || !s || s.points.length < 2) return
      ctx.strokeStyle = s.erase ? '#ffffff' : s.color
      ctx.lineWidth = s.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const a = s.points[s.points.length - 2]
      const b = s.points[s.points.length - 1]
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }

    const undo = () => {
      strokesRef.current.pop()
      setHasDrawn(strokesRef.current.length > 0)
      redraw()
    }
    const clear = () => {
      strokesRef.current = []
      setHasDrawn(false)
      redraw()
    }

    useImperativeHandle(ref, () => ({
      isEmpty: () => strokesRef.current.length === 0,
      exportPng: () => {
        if (strokesRef.current.length === 0) return null
        return canvasRef.current?.toDataURL('image/png') ?? null
      },
    }))

    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-slate-200 p-1">
            <button
              type="button"
              onClick={() => setTool('pen')}
              className={cn(
                'rounded p-1.5',
                tool === 'pen' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500'
              )}
              title="Pen"
            >
              <Pen className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setTool('eraser')}
              className={cn(
                'rounded p-1.5',
                tool === 'eraser' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500'
              )}
              title="Eraser"
            >
              <Eraser className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            {COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(c)
                  setTool('pen')
                }}
                className={cn(
                  'h-5 w-5 rounded-full border-2',
                  color === c && tool === 'pen' ? 'border-slate-800' : 'border-transparent'
                )}
                style={{ backgroundColor: c }}
                title="Color"
              />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button type="button" variant="outline" size="sm" onClick={undo} className="gap-1">
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={clear} className="gap-1">
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          className="h-64 w-full touch-none rounded-md border border-slate-300 bg-white"
        />
        {!hasDrawn && <p className="text-xs text-slate-400">Draw your working here (optional).</p>}
      </div>
    )
  }
)
