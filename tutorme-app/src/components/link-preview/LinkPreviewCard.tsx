'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ExternalLink, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LinkPreviewItem } from '@/lib/link-preview/types'

const MIN_WIDTH = 180
const MIN_HEIGHT = 100

export type LinkPreviewCardProps = {
  item: LinkPreviewItem
  containerWidth: number
  containerHeight: number
  onChange: (updates: Partial<LinkPreviewItem>) => void
  onRemove: () => void
  /** When true, the card is displayed for viewing only: drag, resize and remove are disabled. */
  readOnly?: boolean
}

type DragState =
  | { type: null }
  | { type: 'drag'; startX: number; startY: number; initialX: number; initialY: number }
  | { type: 'resize'; startX: number; startY: number; initialW: number; initialH: number }

export function LinkPreviewCard({
  item,
  containerWidth,
  containerHeight,
  onChange,
  onRemove,
  readOnly = false,
}: LinkPreviewCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [dragState, setDragState] = useState<DragState>({ type: null })

  const clampX = (x: number, w: number) => Math.max(0, Math.min(x, containerWidth - w))
  const clampY = (y: number, h: number) => Math.max(0, Math.min(y, containerHeight - h))
  const clampW = (w: number, x: number) => Math.max(MIN_WIDTH, Math.min(w, containerWidth - x))
  const clampH = (h: number, y: number) => Math.max(MIN_HEIGHT, Math.min(h, containerHeight - y))

  useEffect(() => {
    if (dragState.type === null) return

    const handleMove = (e: MouseEvent) => {
      if (dragState.type === 'drag') {
        const dx = e.clientX - dragState.startX
        const dy = e.clientY - dragState.startY
        onChange({
          x: clampX(dragState.initialX + dx, item.width),
          y: clampY(dragState.initialY + dy, item.height),
        })
      } else if (dragState.type === 'resize') {
        const dw = e.clientX - dragState.startX
        const dh = e.clientY - dragState.startY
        onChange({
          width: clampW(dragState.initialW + dw, item.x),
          height: clampH(dragState.initialH + dh, item.y),
        })
      }
    }

    const handleUp = () => {
      setDragState({ type: null })
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [
    dragState,
    item.width,
    item.height,
    item.x,
    item.y,
    onChange,
    containerWidth,
    containerHeight,
  ])

  const handleMouseDownDrag = (e: React.MouseEvent) => {
    if (readOnly || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    setDragState({
      type: 'drag',
      startX: e.clientX,
      startY: e.clientY,
      initialX: item.x,
      initialY: item.y,
    })
  }

  const handleMouseDownResize = (e: React.MouseEvent) => {
    if (readOnly || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    setDragState({
      type: 'resize',
      startX: e.clientX,
      startY: e.clientY,
      initialW: item.width,
      initialH: item.height,
    })
  }

  const title = item.title || item.siteName || item.url
  const hasImage = Boolean(item.imageUrl) && !item.isFile
  const imageAspectRatio =
    hasImage &&
    typeof item.imageWidth === 'number' &&
    typeof item.imageHeight === 'number' &&
    item.imageWidth > 0 &&
    item.imageHeight > 0
      ? item.imageWidth / item.imageHeight
      : 16 / 9
  const imageHeight = hasImage ? item.width / imageAspectRatio : 0

  return (
    <div
      ref={cardRef}
      className={cn(
        'shadow-elevation-2 absolute flex flex-col overflow-hidden rounded-xl border border-[rgba(15,23,42,0.08)] bg-white',
        dragState.type !== null && 'select-none'
      )}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: hasImage && imageHeight > 0 ? 'auto' : item.height,
        minHeight: item.height,
      }}
    >
      {/* Header / drag handle */}
      <div
        className={cn(
          'flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2',
          !readOnly && 'cursor-grab active:cursor-grabbing'
        )}
        onMouseDown={handleMouseDownDrag}
      >
        {item.faviconUrl ? (
          <img
            src={item.faviconUrl}
            alt=""
            className="h-4 w-4 flex-shrink-0 rounded-sm object-contain"
            onError={e => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-600" title={title}>
          {item.siteName || item.url}
        </span>
        <div className="flex items-center gap-1">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            title="Open link"
            onMouseDown={e => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
          {!readOnly && (
            <button
              type="button"
              onClick={onRemove}
              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-red-100 hover:text-red-600"
              title="Remove preview"
              onMouseDown={e => e.stopPropagation()}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex min-h-0 flex-1 flex-col"
        onMouseDown={e => {
          // Allow the header to drag; clicking body opens link.
          if (
            e.target === e.currentTarget ||
            (e.currentTarget as HTMLElement).contains(e.target as Node)
          ) {
            // no-op
          }
        }}
      >
        {hasImage && imageHeight > 40 && (
          <div
            className="relative w-full flex-shrink-0 overflow-hidden bg-slate-100"
            style={{ height: imageHeight }}
          >
            <img
              src={item.imageUrl}
              alt={title}
              className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
              onError={e => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <h4 className="line-clamp-2 text-sm font-semibold text-slate-800" title={title}>
            {title}
          </h4>
          {item.description ? (
            <p className="mt-1 line-clamp-3 text-xs text-slate-500">{item.description}</p>
          ) : null}
          {item.isFile && item.fileType ? (
            <span className="mt-auto inline-flex w-fit items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
              {item.fileType}
            </span>
          ) : null}
        </div>
      </a>

      {/* Resize handle */}
      {!readOnly && (
        <div
          className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize"
          onMouseDown={handleMouseDownResize}
          title="Resize"
        >
          <svg viewBox="0 0 10 10" className="h-full w-full text-slate-300">
            <path d="M2 8 L8 2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 8 L8 5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      )}
    </div>
  )
}
