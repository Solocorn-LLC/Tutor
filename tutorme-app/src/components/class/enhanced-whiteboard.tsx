/**
 * Enhanced Whiteboard Component
 * Features:
 * - Changeable background colors and styles
 * - Multiple pages with navigation
 * - Scrollable, pannable, zoomable canvas (zoom affects viewport, not content size)
 * - Video overlay support (draggable, fullscreen 70%)
 * - Text typing on whiteboard with formatting and TTS
 * - Selectable and movable objects
 * - Straight line drawing
 * - Basic shapes (rectangle, circle, triangle)
 * - Multiple draggable and resizable text overlays
 * - Asset sidebar for documents and images
 * - Teaching Assistant panel with AI-powered features
 */

import { motion } from 'framer-motion'
import { useRef, useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { TeachingAssistant } from './teaching-assistant'
import { FloatingToolMenu } from './floating-tool-menu'
import { FloatingMathTool } from './floating-math-tool'
import { GraphDialog } from './graph-dialog'
import { sampleGraph, drawGraphOnCanvas, svgToDataUrl } from '@/lib/whiteboard/math-render'
import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  Type,
  Palette,
  Grid3X3,
  X,
  Hand,
  MousePointer2,
  Square,
  Circle,
  Triangle,
  Minus,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Edit3,
  GripVertical,
  Volume2,
  Upload,
  Image as ImageIcon,
  FileText,
  FolderOpen,
  Bot,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Magnet,
  Frame,
} from 'lucide-react'

interface Point {
  x: number
  y: number
}

interface Student {
  id: string
  name: string
  status: 'active' | 'struggling' | 'idle' | 'needs_help'
  engagement: number
  understanding: number
  frustration: number
  lastActive: Date
  raisedHand?: boolean
  currentActivity?: string
}

interface TextFormat {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: 'left' | 'center' | 'right'
  color?: string
}

interface TextElement {
  id: string
  text: string
  x: number
  y: number
  color: string
  fontSize: number
  format: TextFormat
  width: number
  height: number
}

interface ShapeElement {
  id: string
  type: 'rectangle' | 'circle' | 'line' | 'triangle' | 'arrow'
  x: number
  y: number
  width: number
  height: number
  color: string
  lineWidth: number
}

interface Stroke {
  id: string
  points: Point[]
  color: string
  width: number
  type: 'pen' | 'eraser'
}

interface FormulaElement {
  id: string
  latex: string
  x: number
  y: number
  width: number
  height: number
  color: string
  scale: number
  svgDataUrl: string
}

interface GraphElement {
  id: string
  expression: string
  color: string
  lineWidth: number
  xMin: number
  xMax: number
  yMin?: number
  yMax?: number
  samples?: number
}

interface Page {
  id: string
  name: string
  strokes: Stroke[]
  texts: TextElement[]
  shapes: ShapeElement[]
  formulas: FormulaElement[]
  graphs: GraphElement[]
  backgroundColor: string
  backgroundStyle: 'solid' | 'grid' | 'dots' | 'lines' | 'coordinate-plane'
  backgroundImage?: string
}

interface Asset {
  id: string
  type: 'image' | 'document'
  name: string
  url: string
  thumbnail?: string
}

interface SelectedObject {
  type: 'text' | 'shape' | 'stroke' | 'formula' | 'graph'
  id: string
  x: number
  y: number
  width: number
  height: number
}

interface TextOverlay {
  id: string
  x: number
  y: number
  text: string
  fontSize: number
  format: TextFormat
  width: number
  height: number
}

interface CursorDelta {
  userId: string
  name: string
  color: string
  x: number
  y: number
  pageIndex: number
  timestamp?: number
}

interface EnhancedWhiteboardProps {
  onUpdate?: (pages: Page[]) => void
  readOnly?: boolean
  videoOverlay?: boolean
  onToggleVideoFullscreen?: () => void
  isVideoFullscreen?: boolean
  videoComponent?: React.ReactNode
  // External page control
  pages?: Page[]
  currentPageIndex?: number
  onPagesChange?: (pages: Page[]) => void
  onPageIndexChange?: (index: number) => void
  students?: Student[]
  onPushHint?: (studentId: string, hint: string) => void
  initialLessonContent?: { title?: string; objectives?: string[]; diagrams?: any[] }
  // Real-time sync
  socket?: any
  roomId?: string
  userId?: string
  userName?: string
  userColor?: string
  onRemoteStroke?: (stroke: Stroke) => void
  filterByUserId?: string
}

const BACKGROUND_COLORS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Black', value: '#1f2937' },
  { name: 'Blue', value: '#1e3a5f' },
  { name: 'Green', value: '#1a3d2e' },
  { name: 'Dark Gray', value: '#374151' },
  { name: 'Cream', value: '#fef3c7' },
]

const COLORS = ['#000000', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ffffff']

export function EnhancedWhiteboard({
  onUpdate,
  readOnly = false,
  videoOverlay = true,
  onToggleVideoFullscreen,
  isVideoFullscreen = false,
  videoComponent,
  pages: externalPages,
  currentPageIndex: externalPageIndex,
  onPagesChange,
  onPageIndexChange,
  students: externalStudents,
  onPushHint,
  initialLessonContent,
  socket,
  roomId,
  userId,
  userName,
  userColor,
  onRemoteStroke,
  filterByUserId,
}: EnhancedWhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayTextareaRefs = useRef<Record<string, HTMLTextAreaElement>>({})

  // Internal page state (used if external not provided)
  const [internalPages, setInternalPages] = useState<Page[]>([
    {
      id: 'page-1',
      name: 'Page 1',
      strokes: [],
      texts: [],
      shapes: [],
      formulas: [],
      graphs: [],
      backgroundColor: '#ffffff',
      backgroundStyle: 'solid',
    },
  ])
  const [internalPageIndex, setInternalPageIndex] = useState(0)

  // Use external or internal state
  const pages = externalPages ?? internalPages
  const currentPageIndex = externalPageIndex ?? internalPageIndex
  const setPages = onPagesChange ?? setInternalPages
  const setCurrentPageIndex = onPageIndexChange ?? setInternalPageIndex

  // Refs to avoid stale closures in socket handlers
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  const currentPageIndexRef = useRef(currentPageIndex)
  currentPageIndexRef.current = currentPageIndex

  // Pre-populate page 1 with lesson content when initializing
  const initialLessonAppliedRef = useRef(false)
  useEffect(() => {
    if (initialLessonAppliedRef.current) return
    if (!initialLessonContent?.title && !initialLessonContent?.objectives?.length) return
    initialLessonAppliedRef.current = true

    const titleText: TextElement = {
      id: `lesson-title-${Date.now()}`,
      text: initialLessonContent.title || '',
      x: 40,
      y: 40,
      color: '#1f2937',
      fontSize: 28,
      format: { bold: true, align: 'left' },
      width: 600,
      height: 50,
    }

    const objectiveTexts: TextElement[] = (initialLessonContent.objectives || []).map(
      (obj, idx) => ({
        id: `lesson-obj-${Date.now()}-${idx}`,
        text: `${idx + 1}. ${obj}`,
        x: 40,
        y: 110 + idx * 36,
        color: '#374151',
        fontSize: 18,
        format: { align: 'left' },
        width: 700,
        height: 36,
      })
    )

    setInternalPages(prev => {
      if (prev.length === 0) return prev
      const next = [...prev]
      next[0] = {
        ...next[0],
        texts: [...next[0].texts, titleText, ...objectiveTexts],
      }
      onPagesChange?.(next)
      return next
    })
  }, [initialLessonContent, onPagesChange])

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentStroke, setCurrentStroke] = useState<Point[]>([])
  const [color, setColor] = useState('#000000')
  const [lineWidth, setLineWidth] = useState(3)
  const [tool, setTool] = useState<
    | 'pen'
    | 'eraser'
    | 'text'
    | 'hand'
    | 'line'
    | 'arrow'
    | 'rectangle'
    | 'circle'
    | 'triangle'
    | 'select'
    | 'marquee-zoom'
    | 'formula'
    | 'graph'
  >('pen')

  // Line drawing state
  const [lineStart, setLineStart] = useState<Point | null>(null)
  const [tempLineEnd, setTempLineEnd] = useState<Point | null>(null)
  const [marqueeStart, setMarqueeStart] = useState<Point | null>(null)
  const [tempMarqueeEnd, setTempMarqueeEnd] = useState<Point | null>(null)
  const [activeLocalZoom, setActiveLocalZoom] = useState<{
    x: number
    y: number
    width: number
    height: number
    dataUrl: string
  } | null>(null)

  // Shape preview state
  const [shapeStart, setShapeStart] = useState<Point | null>(null)
  const [tempShape, setTempShape] = useState<ShapeElement | null>(null)

  // View state - scale affects the view transform, canvas stays full size
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  // Text overlays
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([])
  const [draggingOverlay, setDraggingOverlay] = useState<string | null>(null)
  const [overlayDragOffset, setOverlayDragOffset] = useState({ x: 0, y: 0 })
  const [resizingOverlay, setResizingOverlay] = useState<string | null>(null)
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })

  // Direct inline text input (for "type anywhere" feature)
  const [inlineTextInput, setInlineTextInput] = useState<{
    id: string
    x: number
    y: number
    text: string
    fontSize: number
    format: TextFormat
    color: string
  } | null>(null)

  // Selection state
  const [selectedObject, setSelectedObject] = useState<SelectedObject | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  // UI state
  const [showBackgroundPanel, setShowBackgroundPanel] = useState(false)
  const [showVideo, setShowVideo] = useState(true)
  const [videoPosition, setVideoPosition] = useState({ x: 0, y: 0 })
  // The floating video's size — draggable via the grip handle and resizable via
  // the bottom-left handle (16:9 locked). Both use self-contained window pointer
  // listeners so they work regardless of the canvas hit-testing pipeline.
  const [videoSize, setVideoSize] = useState({ width: 320, height: 180 })
  const [isDraggingVideo, setIsDraggingVideo] = useState(false)
  const [videoDragOffset, setVideoDragOffset] = useState({ x: 0, y: 0 })
  const [showTeachingAssistant, setShowTeachingAssistant] = useState(false)

  // Math tools state
  const [showGraphDialog, setShowGraphDialog] = useState(false)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const gridStep = 20

  // Formula image cache (SVG data URL -> Image)
  const formulaImageCache = useRef<Map<string, HTMLImageElement>>(new Map())

  // Real-time collaboration state
  const [remoteCursors, setRemoteCursors] = useState<Map<string, CursorDelta>>(new Map())
  const cursorThrottleRef = useRef<number | null>(null)
  const cursorFlushTimerRef = useRef<number | null>(null)
  const remoteCursorsRef = useRef<Map<string, CursorDelta>>(new Map())

  // Use external students if provided; otherwise empty (no mock data in production)
  const students = externalStudents ?? []

  // Asset sidebar state
  const [showAssetSidebar, setShowAssetSidebar] = useState(false)
  const [assets, setAssets] = useState<Asset[]>([])
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null)
  const [draggingAsset, setDraggingAsset] = useState<Asset | null>(null)

  const currentPage = pages[currentPageIndex]

  // Canvas will be sized to fit container
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

  // Initialize canvas and handle resize
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const updateCanvasSize = () => {
      const nextWidth = Math.max(1, container.clientWidth)
      const nextHeight = Math.max(1, container.clientHeight)
      setCanvasSize({ width: nextWidth, height: nextHeight })
      canvas.width = nextWidth
      canvas.height = nextHeight

      redrawCanvas()
    }

    updateCanvasSize()

    const resizeObserver = new ResizeObserver(updateCanvasSize)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [])

  // Redraw canvas when state changes
  useEffect(() => {
    redrawCanvas()
  }, [
    pages,
    currentPageIndex,
    scale,
    pan,
    currentStroke,
    tempLineEnd,
    tempShape,
    selectedObject,
    canvasSize,
    remoteCursors,
  ])

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    // Clear with background color
    ctx.fillStyle = currentPage.backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw background image if set
    if (currentPage.backgroundImage) {
      // In a real implementation, you'd draw the image here
      // For now, we'll just draw a placeholder
      ctx.fillStyle = 'rgba(0,0,0,0.1)'
      ctx.fillRect(0, 0, canvasSize.width, canvasSize.height)
    }

    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(scale, scale)

    const worldViewport = {
      left: -pan.x / scale,
      top: -pan.y / scale,
      right: (canvas.width - pan.x) / scale,
      bottom: (canvas.height - pan.y) / scale,
    }
    drawBackgroundPattern(
      ctx,
      currentPage.backgroundStyle,
      currentPage.backgroundColor,
      worldViewport
    )

    currentPage.strokes.forEach(stroke => {
      if (stroke.type === 'eraser') drawEraserStroke(ctx, stroke.points, stroke.width || 20)
      else drawStroke(ctx, stroke.points, stroke.color, stroke.width)
    })

    currentPage.shapes.forEach(shape => drawShape(ctx, shape))
    currentPage.texts.forEach(text => drawTextElement(ctx, text))
    currentPage.formulas.forEach(formula => drawFormulaElement(ctx, formula))
    currentPage.graphs.forEach(graph => drawGraphElement(ctx, graph))

    if (currentStroke.length > 0) {
      if (tool === 'eraser') drawEraserStroke(ctx, currentStroke, lineWidth)
      else drawStroke(ctx, currentStroke, color, lineWidth)
    }

    if (lineStart && tempLineEnd && (tool === 'line' || tool === 'arrow')) {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(lineStart.x, lineStart.y)
      ctx.lineTo(tempLineEnd.x, tempLineEnd.y)
      ctx.stroke()
      if (tool === 'arrow') {
        const headlen = 15
        const angle = Math.atan2(tempLineEnd.y - lineStart.y, tempLineEnd.x - lineStart.x)
        ctx.beginPath()
        ctx.moveTo(tempLineEnd.x, tempLineEnd.y)
        ctx.lineTo(
          tempLineEnd.x - headlen * Math.cos(angle - Math.PI / 6),
          tempLineEnd.y - headlen * Math.sin(angle - Math.PI / 6)
        )
        ctx.moveTo(tempLineEnd.x, tempLineEnd.y)
        ctx.lineTo(
          tempLineEnd.x - headlen * Math.cos(angle + Math.PI / 6),
          tempLineEnd.y - headlen * Math.sin(angle + Math.PI / 6)
        )
        ctx.stroke()
      }
      ctx.restore()
    }

    if (marqueeStart && tempMarqueeEnd && tool === 'marquee-zoom') {
      ctx.save()
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2 / scale
      ctx.setLineDash([5 / scale, 5 / scale])
      ctx.strokeRect(
        marqueeStart.x,
        marqueeStart.y,
        tempMarqueeEnd.x - marqueeStart.x,
        tempMarqueeEnd.y - marqueeStart.y
      )
      ctx.restore()
    }

    // Remote cursors
    remoteCursors.forEach(cursor => {
      if (cursor.pageIndex !== currentPageIndex) return
      ctx.save()
      ctx.translate(cursor.x, cursor.y)
      ctx.scale(1 / scale, 1 / scale)
      ctx.fillStyle = cursor.color || '#3b82f6'
      ctx.beginPath()
      ctx.arc(0, 0, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#1f2937'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(cursor.name || 'User', 10, -10)
      ctx.restore()
    })
  }, [
    pages,
    currentPageIndex,
    currentStroke,
    lineStart,
    tempLineEnd,
    tempShape,
    color,
    lineWidth,
    tool,
    scale,
    pan,
    selectedObject,
    currentPage,
    canvasSize,
    remoteCursors,
  ])

  const drawBackgroundPattern = (
    ctx: CanvasRenderingContext2D,
    style: string,
    bgColor: string,
    viewport: { left: number; top: number; right: number; bottom: number }
  ) => {
    const patternColor = bgColor === '#ffffff' ? '#e5e7eb' : '#4b5563'
    ctx.strokeStyle = patternColor
    ctx.lineWidth = 1
    const step = 40
    const startX = Math.floor(viewport.left / step) * step
    const endX = Math.ceil(viewport.right / step) * step
    const startY = Math.floor(viewport.top / step) * step
    const endY = Math.ceil(viewport.bottom / step) * step

    switch (style) {
      case 'grid':
        for (let x = startX; x <= endX; x += step) {
          ctx.beginPath()
          ctx.moveTo(x, startY)
          ctx.lineTo(x, endY)
          ctx.stroke()
        }
        for (let y = startY; y <= endY; y += step) {
          ctx.beginPath()
          ctx.moveTo(startX, y)
          ctx.lineTo(endX, y)
          ctx.stroke()
        }
        break
      case 'dots':
        ctx.fillStyle = patternColor
        for (let x = startX + step / 2; x <= endX; x += step) {
          for (let y = startY + step / 2; y <= endY; y += step) {
            ctx.beginPath()
            ctx.arc(x, y, 2, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        break
      case 'lines':
        for (let y = startY; y <= endY; y += step) {
          ctx.beginPath()
          ctx.moveTo(startX, y)
          ctx.lineTo(endX, y)
          ctx.stroke()
        }
        break
      case 'coordinate-plane': {
        const isDark = bgColor !== '#ffffff' && bgColor !== '#fef3c7'
        const axisColor = isDark ? '#ffffff' : '#1f2937'
        const minorColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'
        const labelColor = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)'
        const gridStep = 50

        // Minor grid lines
        ctx.strokeStyle = minorColor
        ctx.lineWidth = 1
        const gsX = Math.floor(viewport.left / gridStep) * gridStep
        const geX = Math.ceil(viewport.right / gridStep) * gridStep
        const gsY = Math.floor(viewport.top / gridStep) * gridStep
        const geY = Math.ceil(viewport.bottom / gridStep) * gridStep

        for (let x = gsX; x <= geX; x += gridStep) {
          if (x === 0) continue
          ctx.beginPath()
          ctx.moveTo(x, gsY)
          ctx.lineTo(x, geY)
          ctx.stroke()
        }
        for (let y = gsY; y <= geY; y += gridStep) {
          if (y === 0) continue
          ctx.beginPath()
          ctx.moveTo(gsX, y)
          ctx.lineTo(geX, y)
          ctx.stroke()
        }

        // Axes
        ctx.strokeStyle = axisColor
        ctx.lineWidth = 2
        // X-axis
        if (viewport.top <= 0 && viewport.bottom >= 0) {
          ctx.beginPath()
          ctx.moveTo(viewport.left, 0)
          ctx.lineTo(viewport.right, 0)
          ctx.stroke()
        }
        // Y-axis
        if (viewport.left <= 0 && viewport.right >= 0) {
          ctx.beginPath()
          ctx.moveTo(0, viewport.top)
          ctx.lineTo(0, viewport.bottom)
          ctx.stroke()
        }

        // Tick labels
        ctx.fillStyle = labelColor
        ctx.font = `${12 / scale}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'

        for (let x = gsX; x <= geX; x += gridStep) {
          if (x === 0) continue
          if (x < viewport.left || x > viewport.right) continue
          // X-axis tick label (place near x-axis or bottom of viewport)
          const labelY =
            viewport.top <= 0 && viewport.bottom >= 0 ? 4 / scale : viewport.bottom - 16 / scale
          ctx.fillText(String(Math.round(x)), x, labelY)
        }

        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        for (let y = gsY; y <= geY; y += gridStep) {
          if (y === 0) continue
          if (y < viewport.top || y > viewport.bottom) continue
          // Y-axis tick label
          const labelX =
            viewport.left <= 0 && viewport.right >= 0 ? -4 / scale : viewport.left + 4 / scale
          ctx.fillText(String(Math.round(-y)), labelX, y)
        }
        break
      }
    }
  }

  const drawStroke = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    strokeColor: string,
    width: number
  ) => {
    if (points.length < 2) return
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
    ctx.stroke()
  }

  const drawEraserStroke = (ctx: CanvasRenderingContext2D, points: Point[], width: number) => {
    if (points.length < 2) return
    ctx.globalCompositeOperation = 'destination-out'
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }

  const drawShape = (ctx: CanvasRenderingContext2D, shape: ShapeElement, isTemp = false) => {
    ctx.strokeStyle = shape.color
    ctx.lineWidth = shape.lineWidth
    ctx.lineCap = 'round'

    if (shape.type === 'line' || shape.type === 'arrow') {
      ctx.beginPath()
      ctx.moveTo(shape.x, shape.y)
      ctx.lineTo(shape.width, shape.height)
      ctx.stroke()
      if (shape.type === 'arrow') {
        const headlen = 15
        const angle = Math.atan2(shape.height - shape.y, shape.width - shape.x)
        ctx.beginPath()
        ctx.moveTo(shape.width, shape.height)
        ctx.lineTo(
          shape.width - headlen * Math.cos(angle - Math.PI / 6),
          shape.height - headlen * Math.sin(angle - Math.PI / 6)
        )
        ctx.moveTo(shape.width, shape.height)
        ctx.lineTo(
          shape.width - headlen * Math.cos(angle + Math.PI / 6),
          shape.height - headlen * Math.sin(angle + Math.PI / 6)
        )
        ctx.stroke()
      }
    } else if (shape.type === 'rectangle') {
      ctx.strokeRect(shape.x, shape.y, shape.width, shape.height)
    } else if (shape.type === 'circle') {
      ctx.beginPath()
      ctx.ellipse(
        shape.x + shape.width / 2,
        shape.y + shape.height / 2,
        Math.abs(shape.width) / 2,
        Math.abs(shape.height) / 2,
        0,
        0,
        Math.PI * 2
      )
      ctx.stroke()
    } else if (shape.type === 'triangle') {
      ctx.beginPath()
      ctx.moveTo(shape.x + shape.width / 2, shape.y)
      ctx.lineTo(shape.x + shape.width, shape.y + shape.height)
      ctx.lineTo(shape.x, shape.y + shape.height)
      ctx.closePath()
      ctx.stroke()
    }
  }

  const drawTextElement = (ctx: CanvasRenderingContext2D, text: TextElement) => {
    ctx.fillStyle = text.color
    const fontWeight = text.format.bold ? 'bold' : 'normal'
    const fontStyle = text.format.italic ? 'italic' : 'normal'
    ctx.font = `${fontStyle} ${fontWeight} ${text.fontSize}px sans-serif`

    const lines = text.text.split('\n')
    const lineHeight = text.fontSize * 1.2

    lines.forEach((line, i) => {
      let x = text.x
      if (text.format.align === 'center') {
        const metrics = ctx.measureText(line)
        x = text.x + (text.width - metrics.width) / 2
      } else if (text.format.align === 'right') {
        const metrics = ctx.measureText(line)
        x = text.x + text.width - metrics.width
      }
      ctx.fillText(line, x, text.y + (i + 1) * lineHeight)
    })

    if (text.format.underline) {
      ctx.strokeStyle = text.color
      ctx.lineWidth = 1
      lines.forEach((line, i) => {
        const y = text.y + (i + 1) * lineHeight
        const metrics = ctx.measureText(line)
        let x = text.x
        if (text.format.align === 'center') x = text.x + (text.width - metrics.width) / 2
        if (text.format.align === 'right') x = text.x + text.width - metrics.width
        ctx.beginPath()
        ctx.moveTo(x, y + 2)
        ctx.lineTo(x + metrics.width, y + 2)
        ctx.stroke()
      })
    }
  }

  const drawFormulaElement = (ctx: CanvasRenderingContext2D, formula: FormulaElement) => {
    const cached = formulaImageCache.current.get(formula.svgDataUrl)
    if (cached && cached.complete) {
      ctx.drawImage(
        cached,
        formula.x,
        formula.y,
        formula.width * formula.scale,
        formula.height * formula.scale
      )
      return
    }
    // Load and cache
    const img = new Image()
    img.onload = () => {
      formulaImageCache.current.set(formula.svgDataUrl, img)
      redrawCanvas()
    }
    img.src = formula.svgDataUrl
    // Fallback: draw placeholder rectangle
    ctx.strokeStyle = formula.color
    ctx.lineWidth = 1
    ctx.strokeRect(
      formula.x,
      formula.y,
      formula.width * formula.scale,
      formula.height * formula.scale
    )
  }

  const drawGraphElement = (ctx: CanvasRenderingContext2D, graph: GraphElement) => {
    const points = sampleGraph({
      expression: graph.expression,
      xMin: graph.xMin,
      xMax: graph.xMax,
      yMin: graph.yMin,
      yMax: graph.yMax,
      samples: graph.samples ?? 500,
    })
    drawGraphOnCanvas(ctx, points, graph.color, graph.lineWidth)
  }

  const drawSelectionHighlight = (ctx: CanvasRenderingContext2D, selected: SelectedObject) => {
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2 / scale
    ctx.setLineDash([5 / scale, 5 / scale])
    ctx.strokeRect(selected.x - 5, selected.y - 5, selected.width + 10, selected.height + 10)
    ctx.setLineDash([])

    ctx.fillStyle = '#3b82f6'
    const handles = [
      { x: selected.x - 5, y: selected.y - 5 },
      { x: selected.x + selected.width / 2, y: selected.y - 5 },
      { x: selected.x + selected.width, y: selected.y - 5 },
      { x: selected.x - 5, y: selected.y + selected.height / 2 },
      { x: selected.x + selected.width, y: selected.y + selected.height / 2 },
      { x: selected.x - 5, y: selected.y + selected.height },
      { x: selected.x + selected.width / 2, y: selected.y + selected.height },
      { x: selected.x + selected.width, y: selected.y + selected.height },
    ]
    handles.forEach(h => ctx.fillRect(h.x - 3 / scale, h.y - 3 / scale, 6 / scale, 6 / scale))
  }

  const compressPoints = (pts: Point[]): number[] =>
    pts.flatMap(p => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100])

  const decompressPoints = (flat: number[]): Point[] => {
    const pts: Point[] = []
    for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i], y: flat[i + 1] })
    return pts
  }

  const drawStrokeDirectly = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(scale, scale)
    if (stroke.type === 'eraser') drawEraserStroke(ctx, stroke.points, stroke.width || 20)
    else drawStroke(ctx, stroke.points, stroke.color, stroke.width)
    ctx.restore()
  }

  const snap = (v: number): number => Math.round(v / gridStep) * gridStep

  const screenToCanvas = (screenX: number, screenY: number, shouldSnap = snapToGrid): Point => {
    const container = containerRef.current
    if (!container) return { x: 0, y: 0 }
    const rect = container.getBoundingClientRect()
    const x = (screenX - rect.left - pan.x) / scale
    const y = (screenY - rect.top - pan.y) / scale
    if (!shouldSnap) return { x, y }
    return { x: snap(x), y: snap(y) }
  }

  const hitTest = (point: Point): SelectedObject | null => {
    for (let i = currentPage.texts.length - 1; i >= 0; i--) {
      const text = currentPage.texts[i]
      if (
        point.x >= text.x &&
        point.x <= text.x + text.width &&
        point.y >= text.y &&
        point.y <= text.y + text.height
      ) {
        return {
          type: 'text',
          id: text.id,
          x: text.x,
          y: text.y,
          width: text.width,
          height: text.height,
        }
      }
    }

    for (let i = currentPage.shapes.length - 1; i >= 0; i--) {
      const shape = currentPage.shapes[i]
      if (shape.type === 'line' || shape.type === 'arrow') {
        const minX = Math.min(shape.x, shape.width) - 10
        const maxX = Math.max(shape.x, shape.width) + 10
        const minY = Math.min(shape.y, shape.height) - 10
        const maxY = Math.max(shape.y, shape.height) + 10
        if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
          return {
            type: 'shape',
            id: shape.id,
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          }
        }
      } else {
        const tolerance = 10
        if (
          point.x >= shape.x - tolerance &&
          point.x <= shape.x + shape.width + tolerance &&
          point.y >= shape.y - tolerance &&
          point.y <= shape.y + shape.height + tolerance
        ) {
          return {
            type: 'shape',
            id: shape.id,
            x: shape.x,
            y: shape.y,
            width: shape.width,
            height: shape.height,
          }
        }
      }
    }

    for (let i = currentPage.formulas.length - 1; i >= 0; i--) {
      const formula = currentPage.formulas[i]
      const w = formula.width * formula.scale
      const h = formula.height * formula.scale
      if (
        point.x >= formula.x &&
        point.x <= formula.x + w &&
        point.y >= formula.y &&
        point.y <= formula.y + h
      ) {
        return {
          type: 'formula',
          id: formula.id,
          x: formula.x,
          y: formula.y,
          width: w,
          height: h,
        }
      }
    }

    for (let i = currentPage.graphs.length - 1; i >= 0; i--) {
      const graph = currentPage.graphs[i]
      // Graph hit test: check if point is within the graph's domain and near any sample
      if (point.x >= graph.xMin && point.x <= graph.xMax) {
        const samples = sampleGraph({
          expression: graph.expression,
          xMin: graph.xMin,
          xMax: graph.xMax,
          yMin: graph.yMin,
          yMax: graph.yMax,
          samples: 100,
        })
        for (const s of samples) {
          if (s.y !== null && Math.abs(s.y - point.y) < 15) {
            return {
              type: 'graph',
              id: graph.id,
              x: graph.xMin,
              y: graph.yMin ?? -10,
              width: graph.xMax - graph.xMin,
              height: (graph.yMax ?? 10) - (graph.yMin ?? -10),
            }
          }
        }
      }
    }

    for (let i = currentPage.strokes.length - 1; i >= 0; i--) {
      const stroke = currentPage.strokes[i]
      for (const p of stroke.points) {
        if (Math.abs(p.x - point.x) < 10 && Math.abs(p.y - point.y) < 10) {
          const minX = Math.min(...stroke.points.map(p => p.x))
          const maxX = Math.max(...stroke.points.map(p => p.x))
          const minY = Math.min(...stroke.points.map(p => p.y))
          const maxY = Math.max(...stroke.points.map(p => p.y))
          return {
            type: 'stroke',
            id: stroke.id,
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          }
        }
      }
    }

    return null
  }

  // Text to Speech function
  const speakText = (text: string) => {
    if (!window.speechSynthesis) {
      alert('Text-to-speech is not supported in your browser')
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN' // Default to Chinese since this is for Chinese market
    utterance.rate = 0.9
    window.speechSynthesis.speak(utterance)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    // In read-only mode we still want to allow panning (when Pan mode is active),
    // but we should never allow drawing/selection edits.
    if (readOnly) {
      if (tool === 'hand') {
        setIsPanning(true)
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
      } else if (tool === 'marquee-zoom') {
        // Zoom-to-area is a view operation, so allow it even in read-only mode.
        const p = screenToCanvas(e.clientX, e.clientY)
        setMarqueeStart(p)
        setTempMarqueeEnd(p)
      }
      return
    }

    const point = screenToCanvas(e.clientX, e.clientY)

    if (tool === 'marquee-zoom') {
      setMarqueeStart(point)
      setTempMarqueeEnd(point)
      return
    }

    // Check if clicking on video
    if (showVideo && !isVideoFullscreen && videoComponent) {
      const container = containerRef.current
      if (container) {
        const rect = container.getBoundingClientRect()
        const videoX = rect.width - videoSize.width - videoPosition.x
        const videoY = 16 + videoPosition.y
        if (
          e.clientX - rect.left >= videoX &&
          e.clientX - rect.left <= videoX + videoSize.width &&
          e.clientY - rect.top >= videoY &&
          e.clientY - rect.top <= videoY + videoSize.height
        ) {
          setIsDraggingVideo(true)
          setVideoDragOffset({ x: e.clientX - videoX, y: e.clientY - videoY })
          return
        }
      }
    }

    if (tool === 'hand') {
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
      return
    }

    // Check for overlay drag/resize
    const overlayHit = textOverlays.find(ov => {
      const screenX = ov.x * scale + pan.x
      const screenY = ov.y * scale + pan.y
      const screenW = ov.width * scale
      const screenH = ov.height * scale

      // Check resize handle (bottom-right corner)
      if (
        e.clientX >= screenX + screenW - 16 &&
        e.clientX <= screenX + screenW &&
        e.clientY >= screenY + screenH - 16 &&
        e.clientY <= screenY + screenH
      ) {
        return 'resize'
      }

      // Check entire overlay
      if (
        e.clientX >= screenX &&
        e.clientX <= screenX + screenW &&
        e.clientY >= screenY &&
        e.clientY <= screenY + screenH
      ) {
        return 'drag'
      }
      return false
    })

    if (overlayHit) {
      // Check if clicking resize handle
      const screenX = overlayHit.x * scale + pan.x
      const screenY = overlayHit.y * scale + pan.y
      const screenW = overlayHit.width * scale
      const screenH = overlayHit.height * scale

      if (
        e.clientX >= screenX + screenW - 16 &&
        e.clientX <= screenX + screenW &&
        e.clientY >= screenY + screenH - 16 &&
        e.clientY <= screenY + screenH
      ) {
        setResizingOverlay(overlayHit.id)
        setResizeStart({
          x: e.clientX,
          y: e.clientY,
          width: overlayHit.width,
          height: overlayHit.height,
        })
        return
      }

      setDraggingOverlay(overlayHit.id)
      setOverlayDragOffset({
        x: (e.clientX - pan.x) / scale - overlayHit.x,
        y: (e.clientY - pan.y) / scale - overlayHit.y,
      })
      return
    }

    if (tool === 'pen' || tool === 'eraser') {
      setIsDrawing(true)
      setCurrentStroke([point])
      setSelectedObject(null)
      return
    }

    if (tool === 'line' || tool === 'arrow') {
      if (!lineStart) {
        setLineStart(point)
      } else {
        const newShape: ShapeElement = {
          id: Date.now().toString(),
          type: 'line',
          x: lineStart.x,
          y: lineStart.y,
          width: point.x,
          height: point.y,
          color,
          lineWidth,
        }
        updateCurrentPage({ ...currentPage, shapes: [...currentPage.shapes, newShape] })
        if (socket && roomId) {
          socket.emit('whiteboard:shape:add', {
            roomId,
            shape: newShape,
            pageIndex: currentPageIndexRef.current,
          })
        }
        setLineStart(null)
        setTempLineEnd(null)
      }
      return
    }

    if (tool === 'rectangle' || tool === 'circle' || tool === 'triangle') {
      setShapeStart(point)
      return
    }

    if (tool === 'text') {
      // Use inline direct text input instead of overlay
      setInlineTextInput({
        id: Date.now().toString(),
        x: point.x,
        y: point.y,
        text: '',
        fontSize: 20,
        format: { align: 'left', color: color },
        color: color,
      })
      // Also clear any existing overlays
      setTextOverlays(prev => prev.filter(o => o.text.trim()))
      return
    }

    const hit = hitTest(point)
    if (hit) {
      setSelectedObject(hit)
      setIsDragging(true)
      setDragOffset({ x: point.x - hit.x, y: point.y - hit.y })
    } else {
      setSelectedObject(null)
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    setPointerPos({ x: e.clientX, y: e.clientY })
    const point = screenToCanvas(e.clientX, e.clientY)

    // Emit cursor position for real-time collaboration
    if (socket && roomId && userId) {
      // Cursor is high-frequency; keep network throttled and UI updates batched separately.
      const cursorIntervalMs = 80
      if (!cursorThrottleRef.current) {
        cursorThrottleRef.current = window.setTimeout(() => {
          cursorThrottleRef.current = null
        }, cursorIntervalMs)
        socket.emit('whiteboard:cursor:move', {
          roomId,
          cursor: {
            userId,
            name: userName || 'User',
            color: userColor || '#3b82f6',
            x: point.x,
            y: point.y,
            pageIndex: currentPageIndex,
          },
        })
      }
    }

    if (isDraggingVideo) {
      const container = containerRef.current
      if (container) {
        const rect = container.getBoundingClientRect()
        const newVideoX = e.clientX - rect.left - videoDragOffset.x
        const newVideoY = e.clientY - rect.top - videoDragOffset.y
        setVideoPosition({ x: rect.width - videoSize.width - newVideoX, y: newVideoY - 16 })
      }
      return
    }

    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y })
      return
    }

    if (resizingOverlay) {
      const dx = (e.clientX - resizeStart.x) / scale
      const dy = (e.clientY - resizeStart.y) / scale
      setTextOverlays(overlays =>
        overlays.map(ov =>
          ov.id === resizingOverlay
            ? {
                ...ov,
                width: Math.max(200, resizeStart.width + dx),
                height: Math.max(150, resizeStart.height + dy),
              }
            : ov
        )
      )
      return
    }

    if (draggingOverlay) {
      setTextOverlays(overlays =>
        overlays.map(ov =>
          ov.id === draggingOverlay
            ? { ...ov, x: point.x - overlayDragOffset.x, y: point.y - overlayDragOffset.y }
            : ov
        )
      )
      return
    }

    if (marqueeStart && tool === 'marquee-zoom') {
      setTempMarqueeEnd(point)
      return
    }

    if (lineStart && (tool === 'line' || tool === 'arrow')) {
      setTempLineEnd(point)
      return
    }

    if (shapeStart && (tool === 'rectangle' || tool === 'circle' || tool === 'triangle')) {
      setTempShape({
        id: 'temp',
        type: tool,
        x: shapeStart.x,
        y: shapeStart.y,
        width: point.x - shapeStart.x,
        height: point.y - shapeStart.y,
        color,
        lineWidth,
      })
      return
    }

    if (!isDrawing && !isDragging) return

    if (isDragging && selectedObject) {
      const newX = point.x - dragOffset.x
      const newY = point.y - dragOffset.y

      if (selectedObject.type === 'text') {
        updateCurrentPage({
          ...currentPage,
          texts: currentPage.texts.map(t =>
            t.id === selectedObject.id ? { ...t, x: newX, y: newY } : t
          ),
        })
        setSelectedObject({ ...selectedObject, x: newX, y: newY })
      } else if (selectedObject.type === 'shape') {
        const shape = currentPage.shapes.find(s => s.id === selectedObject.id)
        if (shape) {
          if (shape.type === 'line') {
            const dx = newX - shape.x
            const dy = newY - shape.y
            updateCurrentPage({
              ...currentPage,
              shapes: currentPage.shapes.map(s =>
                s.id === selectedObject.id
                  ? { ...s, x: newX, y: newY, width: s.width + dx, height: s.height + dy }
                  : s
              ),
            })
          } else {
            updateCurrentPage({
              ...currentPage,
              shapes: currentPage.shapes.map(s =>
                s.id === selectedObject.id ? { ...s, x: newX, y: newY } : s
              ),
            })
          }
          setSelectedObject({ ...selectedObject, x: newX, y: newY })
        }
      }
      return
    }

    if (isDrawing) setCurrentStroke(prev => [...prev, point])
  }

  const handleMouseUp = () => {
    // Commit a zoom-to-area marquee: fit the viewport to the dragged rectangle.
    if (tool === 'marquee-zoom' && marqueeStart && tempMarqueeEnd) {
      const minX = Math.min(marqueeStart.x, tempMarqueeEnd.x)
      const maxX = Math.max(marqueeStart.x, tempMarqueeEnd.x)
      const minY = Math.min(marqueeStart.y, tempMarqueeEnd.y)
      const maxY = Math.max(marqueeStart.y, tempMarqueeEnd.y)
      setMarqueeStart(null)
      setTempMarqueeEnd(null)
      // Ignore tiny/accidental drags (treat as a click).
      if (maxX - minX > 8 && maxY - minY > 8) {
        fitToBounds(minX, minY, maxX, maxY, 0.03)
        setTool('select')
      }
      return
    }
    if (isDraggingVideo) {
      setIsDraggingVideo(false)
      return
    }
    if (isPanning) {
      setIsPanning(false)
      return
    }
    if (resizingOverlay) {
      setResizingOverlay(null)
      return
    }
    if (draggingOverlay) {
      setDraggingOverlay(null)
      return
    }
    if (isDragging) {
      setIsDragging(false)
      return
    }

    if (shapeStart && tempShape) {
      const newShape: ShapeElement = {
        id: Date.now().toString(),
        type: tempShape.type,
        x: tempShape.x,
        y: tempShape.y,
        width: tempShape.width,
        height: tempShape.height,
        color,
        lineWidth,
      }
      updateCurrentPage({ ...currentPage, shapes: [...currentPage.shapes, newShape] })
      if (socket && roomId) {
        socket.emit('whiteboard:shape:add', {
          roomId,
          shape: newShape,
          pageIndex: currentPageIndexRef.current,
        })
      }
      setShapeStart(null)
      setTempShape(null)
      return
    }

    if (!isDrawing) return
    setIsDrawing(false)

    if (currentStroke.length > 0) {
      const newStroke: Stroke = {
        id: Date.now().toString(),
        points: currentStroke,
        color: tool === 'eraser' ? '' : color,
        width: lineWidth,
        type: tool === 'eraser' ? 'eraser' : 'pen',
      }
      updateCurrentPage({ ...currentPage, strokes: [...currentPage.strokes, newStroke] })
      if (socket && roomId) {
        socket.emit('whiteboard:stroke:add', {
          roomId,
          stroke: { ...newStroke, points: compressPoints(newStroke.points) },
          pageIndex: currentPageIndexRef.current,
        })
      }
      setCurrentStroke([])
    }
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    // Ctrl/Cmd + wheel = zoom, otherwise pan
    if (e.ctrlKey || e.metaKey) {
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setScale(prev => Math.max(0.1, Math.min(5, prev * delta)))
    } else {
      // Pan instead of zoom - scroll moves the canvas
      const sensitivity = 0.5
      setPan(prev => ({
        x: prev.x - e.deltaX * sensitivity,
        y: prev.y - e.deltaY * sensitivity,
      }))
    }
  }

  // Text overlay functions
  const confirmTextOverlay = (overlayId: string) => {
    const overlay = textOverlays.find(o => o.id === overlayId)
    if (!overlay || !overlay.text.trim()) {
      setTextOverlays(overlays => overlays.filter(o => o.id !== overlayId))
      return
    }

    const newText: TextElement = {
      id: overlayId,
      text: overlay.text,
      x: overlay.x,
      y: overlay.y,
      color: overlay.format.color || color,
      fontSize: overlay.fontSize,
      format: overlay.format,
      width: overlay.width,
      height: overlay.height,
    }

    updateCurrentPage({ ...currentPage, texts: [...currentPage.texts, newText] })
    if (socket && roomId) {
      socket.emit('whiteboard:text:add', {
        roomId,
        text: newText,
        pageIndex: currentPageIndexRef.current,
      })
    }
    setTextOverlays(overlays => overlays.filter(o => o.id !== overlayId))
  }

  const cancelTextOverlay = (overlayId: string) => {
    setTextOverlays(overlays => overlays.filter(o => o.id !== overlayId))
  }

  const editTextElement = (textId: string) => {
    const text = currentPage.texts.find(t => t.id === textId)
    if (!text) return

    updateCurrentPage({
      ...currentPage,
      texts: currentPage.texts.filter(t => t.id !== textId),
    })

    // Use inline text input for editing
    setInlineTextInput({
      id: textId,
      x: text.x,
      y: text.y,
      text: text.text,
      fontSize: text.fontSize,
      format: text.format,
      color: text.color,
    })
  }

  const updateOverlayText = (id: string, newText: string) => {
    setTextOverlays(overlays => overlays.map(o => (o.id === id ? { ...o, text: newText } : o)))
  }

  const updateOverlayFormat = (id: string, formatUpdate: Partial<TextFormat>) => {
    setTextOverlays(overlays =>
      overlays.map(o => (o.id === id ? { ...o, format: { ...o.format, ...formatUpdate } } : o))
    )
  }

  // Asset handling
  const handleAssetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      const url = URL.createObjectURL(file)
      const newAsset: Asset = {
        id: Date.now().toString() + Math.random(),
        type: file.type.startsWith('image/') ? 'image' : 'document',
        name: file.name,
        url: url,
        thumbnail: file.type.startsWith('image/') ? url : undefined,
      }
      setAssets(prev => [...prev, newAsset])
    })
  }

  const setAssetAsBackground = (asset: Asset) => {
    if (asset.type === 'image') {
      updateCurrentPage({
        ...currentPage,
        backgroundImage: asset.url,
        backgroundStyle: 'solid',
      })
    }
  }

  // Page management
  const addPage = () => {
    const newPage: Page = {
      id: `page-${pages.length + 1}`,
      name: `Page ${pages.length + 1}`,
      strokes: [],
      texts: [],
      shapes: [],
      formulas: [],
      graphs: [],
      backgroundColor: '#ffffff',
      backgroundStyle: 'solid',
    }
    setPages([...pages, newPage])
    setCurrentPageIndex(pages.length)
  }

  const deletePage = (index: number) => {
    if (pages.length <= 1) return
    const newPages = pages.filter((_, i) => i !== index)
    setPages(newPages)
    setCurrentPageIndex(Math.min(currentPageIndex, newPages.length - 1))
  }

  const updateCurrentPage = (updatedPage: Page) => {
    const newPages = [...pages]
    newPages[currentPageIndex] = updatedPage
    setPages(newPages)
    onUpdate?.(newPages)
  }

  const deleteSelected = () => {
    if (!selectedObject) return
    if (selectedObject.type === 'text') {
      updateCurrentPage({
        ...currentPage,
        texts: currentPage.texts.filter(t => t.id !== selectedObject.id),
      })
    } else if (selectedObject.type === 'shape') {
      updateCurrentPage({
        ...currentPage,
        shapes: currentPage.shapes.filter(s => s.id !== selectedObject.id),
      })
    } else if (selectedObject.type === 'stroke') {
      updateCurrentPage({
        ...currentPage,
        strokes: currentPage.strokes.filter(s => s.id !== selectedObject.id),
      })
    } else if (selectedObject.type === 'formula') {
      updateCurrentPage({
        ...currentPage,
        formulas: currentPage.formulas.filter(f => f.id !== selectedObject.id),
      })
    } else if (selectedObject.type === 'graph') {
      updateCurrentPage({
        ...currentPage,
        graphs: currentPage.graphs.filter(g => g.id !== selectedObject.id),
      })
    }
    setSelectedObject(null)
  }

  const undoLast = () => {
    if (currentPage.graphs.length > 0) {
      updateCurrentPage({ ...currentPage, graphs: currentPage.graphs.slice(0, -1) })
    } else if (currentPage.formulas.length > 0) {
      updateCurrentPage({ ...currentPage, formulas: currentPage.formulas.slice(0, -1) })
    } else if (currentPage.shapes.length > 0) {
      updateCurrentPage({ ...currentPage, shapes: currentPage.shapes.slice(0, -1) })
    } else if (currentPage.strokes.length > 0) {
      updateCurrentPage({ ...currentPage, strokes: currentPage.strokes.slice(0, -1) })
    }
  }

  const clearPage = () => {
    updateCurrentPage({
      ...currentPage,
      strokes: [],
      texts: [],
      shapes: [],
      formulas: [],
      graphs: [],
    })
    if (socket && roomId) {
      socket.emit('whiteboard:page:clear', { roomId, pageIndex: currentPageIndex })
    }
    setSelectedObject(null)
    setTextOverlays([])
  }

  const zoomIn = () => setScale(prev => Math.min(5, prev * 1.2))
  const zoomOut = () => setScale(prev => Math.max(0.1, prev / 1.2))

  // Set scale+pan so the given canvas-coordinate box fits the visible canvas,
  // centered, with a little padding. Shared by "zoom to fit" and "zoom to area".
  const fitToBounds = (minX: number, minY: number, maxX: number, maxY: number, padding = 0.1) => {
    const W = canvasSize.width
    const H = canvasSize.height
    if (!W || !H) return
    const bw = maxX - minX
    const bh = maxY - minY
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    if (bw <= 0 && bh <= 0) {
      setScale(1)
      setPan({ x: W / 2 - cx, y: H / 2 - cy })
      return
    }
    const sx = bw > 0 ? (W * (1 - 2 * padding)) / bw : Infinity
    const sy = bh > 0 ? (H * (1 - 2 * padding)) / bh : Infinity
    let s = Math.min(sx, sy)
    if (!Number.isFinite(s) || s <= 0) s = 1
    s = Math.max(0.1, Math.min(5, s))
    setScale(s)
    setPan({ x: W / 2 - cx * s, y: H / 2 - cy * s })
  }

  // Bounding box (in canvas coords) of all drawable content on the current page.
  // Graphs span the coordinate plane and have no fixed box, so they're excluded.
  const getContentBounds = (): {
    minX: number
    minY: number
    maxX: number
    maxY: number
  } | null => {
    if (!currentPage) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const add = (x0: number, y0: number, x1: number, y1: number) => {
      minX = Math.min(minX, x0, x1)
      minY = Math.min(minY, y0, y1)
      maxX = Math.max(maxX, x0, x1)
      maxY = Math.max(maxY, y0, y1)
    }
    for (const stroke of currentPage.strokes) {
      for (const p of stroke.points) add(p.x, p.y, p.x, p.y)
    }
    for (const t of currentPage.texts) {
      add(t.x, t.y, t.x + (t.width || 0), t.y + (t.height || 0))
    }
    for (const sh of currentPage.shapes) {
      // For line/arrow, width/height hold the END point's absolute coords.
      if (sh.type === 'line' || sh.type === 'arrow') add(sh.x, sh.y, sh.width, sh.height)
      else add(sh.x, sh.y, sh.x + sh.width, sh.y + sh.height)
    }
    for (const f of currentPage.formulas) {
      const fs = f.scale || 1
      add(f.x, f.y, f.x + f.width * fs, f.y + f.height * fs)
    }
    // Include not-yet-confirmed text (HTML overlays + the inline "type anywhere"
    // box). Without these, fitting a page whose only content is still being typed
    // would find nothing and reset the view, moving the text out of frame.
    for (const ov of textOverlays) {
      add(ov.x, ov.y, ov.x + (ov.width || 0), ov.y + (ov.height || 0))
    }
    if (inlineTextInput) {
      const approxW = Math.max(
        40,
        (inlineTextInput.text.length || 1) * inlineTextInput.fontSize * 0.6
      )
      add(
        inlineTextInput.x,
        inlineTextInput.y,
        inlineTextInput.x + approxW,
        inlineTextInput.y + inlineTextInput.fontSize * 1.4
      )
    }
    if (minX === Infinity) return null
    return { minX, minY, maxX, maxY }
  }

  // Zoom/pan so everything on the page is in view (no-op-safe when empty).
  const zoomToFit = () => {
    const b = getContentBounds()
    if (!b) {
      setScale(1)
      setPan({ x: 0, y: 0 })
      return
    }
    fitToBounds(b.minX, b.minY, b.maxX, b.maxY, 0.1)
  }
  const resetView = () => {
    setTool('select')
    setActiveLocalZoom(null)
    setScale(1)
    setPan({ x: 0, y: 0 })
    setIsPanning(false)
    setIsDrawing(false)
    setCurrentStroke([])
    setLineStart(null)
    setTempLineEnd(null)
    setShapeStart(null)
    setTempShape(null)
    setSelectedObject(null)
    setTextOverlays([])
    setDraggingOverlay(null)
    setResizingOverlay(null)
  }

  const goToPage = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(nextIndex, pages.length - 1))
    setTool('select')
    setIsPanning(false)
    setIsDrawing(false)
    setSelectedObject(null)
    setTextOverlays([])
    setInlineTextInput(null)
    setCurrentStroke([])
    setLineStart(null)
    setTempLineEnd(null)
    setShapeStart(null)
    setTempShape(null)
    setCurrentPageIndex(clamped)
  }

  const updateBackground = (bgColor: string, style: Page['backgroundStyle']) => {
    updateCurrentPage({ ...currentPage, backgroundColor: bgColor, backgroundStyle: style })
    setShowBackgroundPanel(false)
  }

  const handlePlaceFormula = async (options: { latex: string; scale: number; color: string }) => {
    try {
      const res = await fetch('/api/whiteboard/render-formula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latex: options.latex, display: true }),
      })
      if (!res.ok) throw new Error('Render failed')
      const data = await res.json()
      const svgDataUrl = svgToDataUrl(data.svg)

      // Place at viewport center
      const container = containerRef.current
      const cx = container ? (container.clientWidth / 2 - pan.x) / scale : 200
      const cy = container ? (container.clientHeight / 2 - pan.y) / scale : 200

      const formula: FormulaElement = {
        id: `formula-${Date.now()}`,
        latex: options.latex,
        x: cx - (data.width * options.scale) / 2,
        y: cy - (data.height * options.scale) / 2,
        width: data.width,
        height: data.height,
        color: options.color,
        scale: options.scale,
        svgDataUrl,
      }

      updateCurrentPage({ ...currentPage, formulas: [...currentPage.formulas, formula] })
      if (socket && roomId) {
        socket.emit('whiteboard:formula:add', {
          roomId,
          formula,
          pageIndex: currentPageIndexRef.current,
        })
      }
    } catch (err) {
      console.error('Failed to place formula:', err)
    }
  }

  const handlePlotGraph = (options: {
    expression: string
    color: string
    lineWidth: number
    xMin: number
    xMax: number
    yMin?: number
    yMax?: number
  }) => {
    const graph: GraphElement = {
      id: `graph-${Date.now()}`,
      expression: options.expression,
      color: options.color,
      lineWidth: options.lineWidth,
      xMin: options.xMin,
      xMax: options.xMax,
      yMin: options.yMin,
      yMax: options.yMax,
      samples: 500,
    }
    updateCurrentPage({ ...currentPage, graphs: [...currentPage.graphs, graph] })
    if (socket && roomId) {
      socket.emit('whiteboard:graph:add', { roomId, graph, pageIndex: currentPageIndexRef.current })
    }
  }

  // Handle inline text input key presses
  const handleInlineTextKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!inlineTextInput) return

      if (e.key === 'Enter') {
        // Confirm text
        if (inlineTextInput.text.trim()) {
          const newText: TextElement = {
            id: inlineTextInput.id,
            text: inlineTextInput.text,
            x: inlineTextInput.x,
            y: inlineTextInput.y,
            color: inlineTextInput.color,
            fontSize: inlineTextInput.fontSize,
            format: inlineTextInput.format,
            width: Math.max(100, inlineTextInput.text.length * inlineTextInput.fontSize * 0.6),
            height: inlineTextInput.fontSize * 1.5,
          }
          updateCurrentPage({ ...currentPage, texts: [...currentPage.texts, newText] })
          if (socket && roomId) {
            socket.emit('whiteboard:text:add', {
              roomId,
              text: newText,
              pageIndex: currentPageIndexRef.current,
            })
          }
        }
        setInlineTextInput(null)
      } else if (e.key === 'Escape') {
        // Cancel
        setInlineTextInput(null)
      }
    },
    [inlineTextInput, currentPage, color]
  )

  // Open math dialogs immediately when tool is selected
  useEffect(() => {
    if (tool === 'graph') {
      setShowGraphDialog(true)
      setTool('select')
    }
  }, [tool])

  // Keyboard shortcuts
  useEffect(() => {
    if (readOnly) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        undoLast()
      }
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedObject &&
        !(
          ['INPUT', 'TEXTAREA'].includes(
            (document.activeElement as HTMLElement | null)?.tagName || ''
          ) || (document.activeElement as HTMLElement | null)?.isContentEditable
        )
      ) {
        deleteSelected()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [readOnly, selectedObject, textOverlays, currentPage, inlineTextInput])

  // Socket.io real-time sync
  useEffect(() => {
    if (!socket || !roomId) return

    type PendingOp =
      | { type: 'stroke'; pageIndex: number; stroke: Stroke }
      | { type: 'shape'; pageIndex: number; shape: ShapeElement }
      | { type: 'text'; pageIndex: number; text: TextElement }
      | { type: 'formula'; pageIndex: number; formula: FormulaElement }
      | { type: 'graph'; pageIndex: number; graph: GraphElement }
      | { type: 'page:clear'; pageIndex: number }

    const pendingOpsRef = { current: [] as PendingOp[] }
    let flushRaf: number | null = null

    const safePageIndex = (idx: unknown, fallback: number) => {
      if (typeof idx === 'number' && Number.isFinite(idx) && idx >= 0) return Math.floor(idx)
      return fallback
    }

    const enqueue = (op: PendingOp) => {
      pendingOpsRef.current.push(op)
      if (flushRaf) return
      flushRaf = window.requestAnimationFrame(() => {
        flushRaf = null
        const ops = pendingOpsRef.current
        pendingOpsRef.current = []
        if (ops.length === 0) return

        const currentPages = pagesRef.current
        if (!Array.isArray(currentPages) || currentPages.length === 0) return

        const nextPages = [...currentPages]
        const touched = new Set<number>()

        const ensurePage = (idx: number) => {
          if (idx < 0) return null
          if (idx >= nextPages.length) return null
          if (!touched.has(idx)) {
            nextPages[idx] = { ...nextPages[idx] }
            touched.add(idx)
          }
          return nextPages[idx]
        }

        for (const op of ops) {
          const page = ensurePage(op.pageIndex)
          if (!page) continue
          if (op.type === 'stroke') {
            page.strokes = [...page.strokes, op.stroke]
          } else if (op.type === 'shape') {
            page.shapes = [...page.shapes, op.shape]
          } else if (op.type === 'text') {
            page.texts = [...page.texts, op.text]
          } else if (op.type === 'formula') {
            page.formulas = [...page.formulas, op.formula]
          } else if (op.type === 'graph') {
            page.graphs = [...page.graphs, op.graph]
          } else if (op.type === 'page:clear') {
            page.strokes = []
            page.texts = []
            page.shapes = []
            page.formulas = []
            page.graphs = []
          }
        }

        setPages(nextPages)
        onUpdate?.(nextPages)
      })
    }

    const handleStrokeAdded = (data: {
      userId?: string
      stroke: Stroke & { points?: number[] | Point[] }
      pageIndex?: number
      replay?: boolean
    }) => {
      if (!data.replay && data.userId && userId && data.userId === userId) return // own echo: already applied locally (but replayed hydration must apply)
      if (filterByUserId && data.userId !== filterByUserId) return
      const stroke: Stroke = {
        ...data.stroke,
        points: Array.isArray(data.stroke.points?.[0])
          ? (data.stroke.points as Point[])
          : decompressPoints((data.stroke.points as number[]) || []),
      }
      const idx = safePageIndex(data.pageIndex, currentPageIndexRef.current)
      enqueue({ type: 'stroke', pageIndex: idx, stroke })
      onRemoteStroke?.(stroke)
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) drawStrokeDirectly(ctx, stroke)
    }

    const handleShapeAdded = (data: {
      userId?: string
      shape: ShapeElement
      pageIndex?: number
      replay?: boolean
    }) => {
      if (!data.replay && data.userId && userId && data.userId === userId) return // own echo: already applied locally (but replayed hydration must apply)
      if (filterByUserId && data.userId !== filterByUserId) return
      const idx = safePageIndex(data.pageIndex, currentPageIndexRef.current)
      enqueue({ type: 'shape', pageIndex: idx, shape: data.shape })
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        ctx.save()
        ctx.translate(pan.x, pan.y)
        ctx.scale(scale, scale)
        drawShape(ctx, data.shape)
        ctx.restore()
      }
    }

    const handleTextAdded = (data: {
      userId?: string
      text: TextElement
      pageIndex?: number
      replay?: boolean
    }) => {
      if (!data.replay && data.userId && userId && data.userId === userId) return // own echo: already applied locally (but replayed hydration must apply)
      if (filterByUserId && data.userId !== filterByUserId) return
      const idx = safePageIndex(data.pageIndex, currentPageIndexRef.current)
      enqueue({ type: 'text', pageIndex: idx, text: data.text })
    }

    const handleCursorMoved = (data: { cursor?: CursorDelta }) => {
      const cursor = data?.cursor
      if (!cursor?.userId) return
      remoteCursorsRef.current.set(cursor.userId, { ...cursor, timestamp: Date.now() })
      if (cursorFlushTimerRef.current) return
      cursorFlushTimerRef.current = window.setTimeout(() => {
        cursorFlushTimerRef.current = null
        setRemoteCursors(new Map(remoteCursorsRef.current))
      }, 120)
    }

    const handleFormulaAdded = (data: {
      userId?: string
      formula: FormulaElement
      pageIndex?: number
      replay?: boolean
    }) => {
      if (!data.replay && data.userId && userId && data.userId === userId) return // own echo: already applied locally (but replayed hydration must apply)
      if (filterByUserId && data.userId !== filterByUserId) return
      const idx = safePageIndex(data.pageIndex, currentPageIndexRef.current)
      enqueue({ type: 'formula', pageIndex: idx, formula: data.formula })
    }

    const handleGraphAdded = (data: {
      userId?: string
      graph: GraphElement
      pageIndex?: number
      replay?: boolean
    }) => {
      if (!data.replay && data.userId && userId && data.userId === userId) return // own echo: already applied locally (but replayed hydration must apply)
      if (filterByUserId && data.userId !== filterByUserId) return
      const idx = safePageIndex(data.pageIndex, currentPageIndexRef.current)
      enqueue({ type: 'graph', pageIndex: idx, graph: data.graph })
    }

    const handlePageCleared = (data: { pageIndex?: number }) => {
      const idx = safePageIndex(data.pageIndex, currentPageIndexRef.current)
      enqueue({ type: 'page:clear', pageIndex: idx })
      setSelectedObject(null)
      setTextOverlays([])
    }

    socket.on('whiteboard:stroke:added', handleStrokeAdded)
    socket.on('whiteboard:shape:added', handleShapeAdded)
    socket.on('whiteboard:text:added', handleTextAdded)
    socket.on('whiteboard:formula:added', handleFormulaAdded)
    socket.on('whiteboard:graph:added', handleGraphAdded)
    socket.on('whiteboard:cursor:moved', handleCursorMoved)
    socket.on('whiteboard:page:cleared', handlePageCleared)

    return () => {
      if (flushRaf) {
        window.cancelAnimationFrame(flushRaf)
        flushRaf = null
      }
      socket.off('whiteboard:stroke:added', handleStrokeAdded)
      socket.off('whiteboard:shape:added', handleShapeAdded)
      socket.off('whiteboard:text:added', handleTextAdded)
      socket.off('whiteboard:formula:added', handleFormulaAdded)
      socket.off('whiteboard:graph:added', handleGraphAdded)
      socket.off('whiteboard:cursor:moved', handleCursorMoved)
      socket.off('whiteboard:page:cleared', handlePageCleared)
    }
  }, [socket, roomId, scale, pan, onPagesChange, onRemoteStroke, filterByUserId, userId])

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-lg bg-slate-900">
      {/* Main Content Area */}
      <div className="relative flex flex-1 overflow-hidden">
        {!readOnly && (
          <FloatingToolMenu
            currentTool={tool}
            currentColor={color}
            currentLineWidth={lineWidth}
            onToolChange={setTool}
            onColorChange={setColor}
            onLineWidthChange={setLineWidth}
            onClear={clearPage}
            isDrawing={isDrawing}
            currentPointerPos={pointerPos}
          />
        )}

        {/* Dedicated, draggable math tool (separate from the radial menu) */}
        {!readOnly && <FloatingMathTool onPlace={handlePlaceFormula} defaultColor={color} />}

        {/* Floating Background Color Toggle */}
        {!readOnly && (
          <div className="absolute bottom-6 left-6 z-20">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full border border-white/40 shadow-2xl ring-1 ring-black/[0.05] backdrop-blur-xl transition-all hover:scale-105"
              style={{
                backgroundColor:
                  currentPage.backgroundColor === '#ffffff'
                    ? '#ffffff'
                    : currentPage.backgroundColor === '#1f2937'
                      ? '#1f2937'
                      : currentPage.backgroundColor === '#1a3d2e'
                        ? '#1a3d2e'
                        : currentPage.backgroundColor,
                color: currentPage.backgroundColor === '#ffffff' ? '#1f2937' : '#ffffff',
              }}
              onClick={() => {
                let nextColor = '#ffffff'
                if (currentPage.backgroundColor === '#ffffff') nextColor = '#1f2937'
                else if (currentPage.backgroundColor === '#1f2937') nextColor = '#1a3d2e'
                else nextColor = '#ffffff' // catch-all to reset
                updateBackground(nextColor, currentPage.backgroundStyle)
              }}
              title="Toggle Background Color"
            >
              <Palette className="h-5 w-5" />
            </Button>
          </div>
        )}

        {/* (Deduped) Zoom widget and local zoom overlay are rendered once above */}

        {/* Floating View Controls (zoom/pan/page navigation) */}
        <div
          className="absolute bottom-6 right-6 z-20 flex flex-col items-end gap-1 rounded-2xl border border-white/40 bg-white/70 px-2 py-1 shadow-2xl ring-1 ring-black/[0.05] backdrop-blur-xl"
          onMouseDown={e => e.stopPropagation()}
        >
          {/* Row 1: Zoom */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setScale(s => Math.max(0.1, s - 0.1))}
              className="h-8 w-8 rounded-xl p-0 text-slate-700 hover:bg-slate-100"
              title="Zoom out"
              onMouseDown={e => e.stopPropagation()}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span
              className="w-12 text-center text-xs font-medium text-slate-700"
              title="Current zoom level"
            >
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setScale(s => Math.min(5, s + 0.1))}
              className="h-8 w-8 rounded-xl p-0 text-slate-700 hover:bg-slate-100"
              title="Zoom in"
              onMouseDown={e => e.stopPropagation()}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <div className="mx-1 h-6 w-px bg-slate-300" />
            <Button
              variant="ghost"
              size="sm"
              onClick={zoomToFit}
              className="h-8 w-8 rounded-xl p-0 text-slate-700 hover:bg-slate-100"
              title="Zoom to fit (show everything)"
              onMouseDown={e => e.stopPropagation()}
            >
              <Frame className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTool('marquee-zoom')
                setActiveLocalZoom(null)
              }}
              className={cn(
                'h-8 w-8 rounded-xl p-0 text-slate-700 hover:bg-slate-100',
                tool === 'marquee-zoom' && 'bg-blue-100 text-blue-600'
              )}
              title="Zoom to area (drag a box over the region)"
              onMouseDown={e => e.stopPropagation()}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          {/* Row 2: Normal view / Pan / Page navigation */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetView}
              className={cn(
                'h-8 w-8 rounded-xl p-0 text-slate-700 hover:bg-slate-100',
                Math.abs(scale - 1) < 0.001 && 'bg-blue-100 text-blue-600'
              )}
              title="Normal view (reset zoom + pan)"
              onMouseDown={e => e.stopPropagation()}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTool('hand')
                setActiveLocalZoom(null)
              }}
              className={cn(
                'h-8 w-8 rounded-xl p-0 text-slate-700 hover:bg-slate-100',
                tool === 'hand' && 'bg-blue-100 text-blue-600'
              )}
              title="Pan (drag to move)"
              onMouseDown={e => e.stopPropagation()}
            >
              <Hand className="h-4 w-4" />
            </Button>
            <div className="mx-1 h-6 w-px bg-slate-300" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToPage(currentPageIndex - 1)}
              className="h-8 w-8 rounded-xl p-0 text-slate-700 hover:bg-slate-100"
              disabled={currentPageIndex <= 0}
              aria-label="Previous page"
              title="Previous page"
              onMouseDown={e => e.stopPropagation()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span
              className="w-12 text-center text-[10px] font-medium text-slate-700"
              title="Current page / total pages"
            >
              {currentPageIndex + 1}/{Math.max(1, pages.length)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToPage(currentPageIndex + 1)}
              className="h-8 w-8 rounded-xl p-0 text-slate-700 hover:bg-slate-100"
              disabled={currentPageIndex >= pages.length - 1}
              aria-label="Next page"
              title="Next page"
              onMouseDown={e => e.stopPropagation()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Active Local Zoom Overlay */}
        {activeLocalZoom && (
          <motion.div
            drag
            dragMomentum={false}
            className="absolute z-40 overflow-hidden rounded-xl border-4 border-blue-500 bg-white shadow-2xl"
            style={{
              left: activeLocalZoom.x,
              top: activeLocalZoom.y,
              width: activeLocalZoom.width,
              height: activeLocalZoom.height,
              touchAction: 'none',
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <img
              src={activeLocalZoom.dataUrl}
              alt="Zoomed area"
              className="h-full w-full object-contain"
              draggable={false}
            />
            <Button
              variant="destructive"
              size="sm"
              className="absolute right-2 top-2 h-8 w-8 rounded-full p-0 opacity-80 shadow-md hover:opacity-100"
              onClick={() => setActiveLocalZoom(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </motion.div>
        )}

        {/* Asset Sidebar */}
        {showAssetSidebar && (
          <div className="w-80 overflow-hidden border-l border-gray-100 bg-white/50 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
              <h3 className="text-sm font-bold text-gray-900">Resource Library</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-gray-100"
                onClick={() => setShowAssetSidebar(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="border-b border-gray-100 bg-gray-50/50 p-3">
              <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 hover:shadow-xl active:scale-95">
                <Upload className="h-4 w-4" />
                Upload Assets
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx"
                  className="hidden"
                  onChange={handleAssetUpload}
                />
              </label>
            </div>
            <ScrollArea className="flex-1 p-3">
              <div className="grid grid-cols-1 gap-2.5">
                {assets.length === 0 && (
                  <div className="py-12 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50 text-gray-300">
                      <FolderOpen className="h-6 w-6" />
                    </div>
                    <p className="px-4 text-xs font-medium text-gray-400">
                      Drop images or PDF documents here to use as whiteboard backgrounds.
                    </p>
                  </div>
                )}
                {assets.map(asset => (
                  <div
                    key={asset.id}
                    className="group relative cursor-pointer overflow-hidden rounded-xl border border-gray-100 bg-white p-2 shadow-sm transition-all hover:border-blue-400 hover:shadow-md"
                    onClick={() => setAssetAsBackground(asset)}
                  >
                    {asset.thumbnail ? (
                      <img
                        src={asset.thumbnail}
                        alt={asset.name}
                        className="mb-2 h-32 w-full rounded-lg object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="mb-2 flex h-32 w-full items-center justify-center rounded-lg bg-gray-50">
                        <FileText className="h-10 w-10 text-gray-300" />
                      </div>
                    )}
                    <div className="px-1">
                      <p className="truncate text-xs font-bold text-gray-700">{asset.name}</p>
                      <p className="mt-0.5 text-[10px] font-medium text-blue-500 opacity-0 transition-opacity group-hover:opacity-100">
                        Apply to background
                      </p>
                    </div>
                    <button
                      className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow-lg transition-all hover:bg-red-600 group-hover:opacity-100"
                      onClick={e => {
                        e.stopPropagation()
                        setAssets(prev => prev.filter(a => a.id !== asset.id))
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Canvas Container */}
        <div
          ref={containerRef}
          className="relative z-10 flex-1 overflow-hidden bg-gray-50/50"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{
            cursor:
              tool === 'hand'
                ? isPanning
                  ? 'grabbing'
                  : 'grab'
                : tool === 'text'
                  ? 'text'
                  : tool === 'pen' || tool === 'eraser'
                    ? 'crosshair'
                    : selectedObject && !isDrawing
                      ? 'move'
                      : lineStart
                        ? 'crosshair'
                        : resizingOverlay
                          ? 'nw-resize'
                          : 'default',
          }}
        >
          {/* Canvas - Viewport sized, transforms handled in render */}
          <canvas
            ref={canvasRef}
            className="absolute left-0 top-0"
            style={{
              width: canvasSize.width,
              height: canvasSize.height,
            }}
          />

          {/* Confirmed Text Elements - with edit buttons */}
          {currentPage.texts.map(text => (
            <div
              key={text.id}
              className="absolute"
              style={{
                left: text.x * scale + pan.x,
                top: text.y * scale + pan.y,
                width: text.width * scale,
                height: text.height * scale,
                pointerEvents: 'none',
              }}
            >
              {selectedObject?.id === text.id && (
                <div className="pointer-events-auto absolute inset-0 border-2 border-dashed border-blue-500">
                  <button
                    type="button"
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation()
                      editTextElement(text.id)
                    }}
                    className="absolute -right-6 -top-6 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 shadow-lg hover:bg-blue-600"
                    title="Edit text"
                  >
                    <Edit3 className="h-3 w-3 text-white" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Inline Direct Text Input - type directly on canvas */}
          {inlineTextInput && (
            <div
              className="absolute z-30"
              style={{
                left: inlineTextInput.x * scale + pan.x,
                top: inlineTextInput.y * scale + pan.y,
              }}
              onMouseDown={e => e.stopPropagation()}
            >
              <textarea
                autoFocus
                value={inlineTextInput.text}
                onChange={e =>
                  setInlineTextInput(prev => (prev ? { ...prev, text: e.target.value } : null))
                }
                onKeyDown={handleInlineTextKeyDown}
                placeholder="Type here..."
                className="min-w-[150px] resize-none border-b-2 border-blue-500 bg-transparent px-1 py-0 text-black outline-none"
                style={{
                  fontSize: `${inlineTextInput.fontSize * scale}px`,
                  fontWeight: inlineTextInput.format.bold ? 'bold' : 'normal',
                  fontStyle: inlineTextInput.format.italic ? 'italic' : 'normal',
                  textDecoration: inlineTextInput.format.underline ? 'underline' : 'none',
                  textAlign: inlineTextInput.format.align || 'left',
                  color: inlineTextInput.format.color || '#000000',
                }}
              />
              <span className="ml-2 text-xs text-slate-400">Enter to confirm, Esc to cancel</span>
            </div>
          )}

          {/* Draggable and Resizable Text Input Overlays */}
          {textOverlays.map(overlay => (
            <div
              key={overlay.id}
              role="presentation"
              onMouseDown={e => e.stopPropagation()}
              className="absolute z-20"
              style={{
                left: overlay.x * scale + pan.x,
                top: overlay.y * scale + pan.y,
                width: overlay.width * scale,
                height: overlay.height * scale,
              }}
            >
              <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-gray-300 bg-white shadow-2xl">
                {/* Drag handle and header */}
                <div className="flex shrink-0 cursor-move items-center justify-between border-b border-gray-200 bg-gray-100 px-2 py-1">
                  <div className="flex items-center gap-1">
                    <GripVertical className="h-4 w-4 text-slate-400" />
                    <span className="text-xs text-slate-500">Drag to move</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* TTS Button */}
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        speakText(overlay.text)
                      }}
                      className="rounded p-1 text-slate-500 hover:bg-blue-100 hover:text-blue-600"
                      title="Text to Speech"
                    >
                      <Volume2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        cancelTextOverlay(overlay.id)
                      }}
                      className="p-1 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Formatting toolbar */}
                <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-gray-200 px-2 py-1">
                  <Button
                    variant={overlay.format.bold ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => updateOverlayFormat(overlay.id, { bold: !overlay.format.bold })}
                  >
                    <Bold className="h-3 w-3" />
                  </Button>
                  <Button
                    variant={overlay.format.italic ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() =>
                      updateOverlayFormat(overlay.id, { italic: !overlay.format.italic })
                    }
                  >
                    <Italic className="h-3 w-3" />
                  </Button>
                  <Button
                    variant={overlay.format.underline ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() =>
                      updateOverlayFormat(overlay.id, { underline: !overlay.format.underline })
                    }
                  >
                    <Underline className="h-3 w-3" />
                  </Button>
                  <div className="mx-1 h-4 w-px bg-gray-300" />
                  <Button
                    variant={overlay.format.align === 'left' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => updateOverlayFormat(overlay.id, { align: 'left' })}
                  >
                    <AlignLeft className="h-3 w-3" />
                  </Button>
                  <Button
                    variant={overlay.format.align === 'center' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => updateOverlayFormat(overlay.id, { align: 'center' })}
                  >
                    <AlignCenter className="h-3 w-3" />
                  </Button>
                  <Button
                    variant={overlay.format.align === 'right' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => updateOverlayFormat(overlay.id, { align: 'right' })}
                  >
                    <AlignRight className="h-3 w-3" />
                  </Button>
                  <div className="mx-1 h-4 w-px bg-gray-300" />
                  {COLORS.slice(0, 5).map(c => (
                    <button
                      key={c}
                      onClick={() => updateOverlayFormat(overlay.id, { color: c })}
                      className={`h-5 w-5 rounded-full border ${overlay.format.color === c ? 'ring-1 ring-gray-400 ring-offset-1' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                {/* Text area - flexible */}
                <textarea
                  ref={el => {
                    if (el) overlayTextareaRefs.current[overlay.id] = el
                  }}
                  autoFocus
                  value={overlay.text}
                  onChange={e => updateOverlayText(overlay.id, e.target.value)}
                  placeholder="Type your text here..."
                  className="min-h-0 w-full flex-1 resize-none p-3 text-gray-800 outline-none"
                  style={{
                    fontSize: `${overlay.fontSize}px`,
                    fontWeight: overlay.format.bold ? 'bold' : 'normal',
                    fontStyle: overlay.format.italic ? 'italic' : 'normal',
                    textDecoration: overlay.format.underline ? 'underline' : 'none',
                    textAlign: overlay.format.align || 'left',
                    color: overlay.format.color || '#000000',
                  }}
                  onClick={e => e.stopPropagation()}
                />

                {/* Size and actions */}
                <div className="flex shrink-0 items-center gap-2 border-t border-gray-200 bg-gray-50 px-3 py-2">
                  <span className="text-xs text-slate-500">Size:</span>
                  <input
                    type="range"
                    min="12"
                    max="72"
                    value={overlay.fontSize}
                    onChange={e =>
                      setTextOverlays(overlays =>
                        overlays.map(o =>
                          o.id === overlay.id ? { ...o, fontSize: Number(e.target.value) } : o
                        )
                      )
                    }
                    className="flex-1"
                  />
                  <span className="w-10 text-right text-xs text-slate-500">
                    {overlay.fontSize}px
                  </span>
                </div>

                <div className="flex shrink-0 gap-2 border-t border-gray-200 bg-gray-50 p-2">
                  <Button
                    size="sm"
                    onClick={e => {
                      e.stopPropagation()
                      confirmTextOverlay(overlay.id)
                    }}
                    className="flex-1"
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={e => {
                      e.stopPropagation()
                      cancelTextOverlay(overlay.id)
                    }}
                  >
                    Cancel
                  </Button>
                </div>

                {/* Resize handle */}
                <div
                  className="absolute bottom-0 right-0 flex h-4 w-4 cursor-nw-resize items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, transparent 50%, #3b82f6 50%)' }}
                  title="Drag to resize"
                />
              </div>
            </div>
          ))}

          {/* Video Overlay - Draggable */}
          {videoOverlay && videoComponent && showVideo && !isVideoFullscreen && (
            <div
              role="presentation"
              // Stop BOTH pointer and mouse events from reaching the canvas
              // container — otherwise the canvas's own onMouseDown re-runs the
              // legacy video hit-test and a second, competing drag fires alongside
              // the handle drag (they fight and the frame jumps).
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              className="absolute z-10 overflow-hidden rounded-lg border border-slate-600 bg-black shadow-lg"
              style={{
                width: `${videoSize.width}px`,
                height: `${videoSize.height}px`,
                right: `${16 + videoPosition.x}px`,
                top: `${16 + videoPosition.y}px`,
              }}
            >
              {/* Move handle — a labelled top bar. Uses pointer capture so the
                  drag keeps tracking over the video tiles, and clamps the frame
                  inside the board so it can't be dragged off-screen. */}
              <div
                className="absolute inset-x-0 top-0 z-30 flex h-6 cursor-move touch-none select-none items-center gap-1 bg-slate-900/70 pl-2 pr-16 text-[10px] font-medium text-white/80 hover:bg-slate-900/85"
                title="Drag to move the video"
                onPointerDown={e => {
                  e.stopPropagation()
                  e.preventDefault()
                  const el = e.currentTarget
                  el.setPointerCapture(e.pointerId)
                  const startX = e.clientX
                  const startY = e.clientY
                  const start = { ...videoPosition }
                  const onMove = (ev: PointerEvent) => {
                    let nx = start.x - (ev.clientX - startX)
                    let ny = start.y + (ev.clientY - startY)
                    // Keep the whole frame on-screen (offset = 16 + n): so
                    // n ∈ [-16, containerSize - frameSize - 16].
                    const rect = containerRef.current?.getBoundingClientRect()
                    if (rect) {
                      nx = Math.min(Math.max(nx, -16), rect.width - videoSize.width - 16)
                      ny = Math.min(Math.max(ny, -16), rect.height - videoSize.height - 16)
                    }
                    setVideoPosition({ x: nx, y: ny })
                  }
                  const onUp = () => {
                    el.releasePointerCapture(e.pointerId)
                    el.removeEventListener('pointermove', onMove)
                    el.removeEventListener('pointerup', onUp)
                    el.removeEventListener('pointercancel', onUp)
                  }
                  el.addEventListener('pointermove', onMove)
                  el.addEventListener('pointerup', onUp)
                  el.addEventListener('pointercancel', onUp)
                }}
              >
                <GripVertical className="h-3.5 w-3.5" />
                Move
              </div>
              {/* Resize handle — bottom-left corner (box is anchored top-right),
                  16:9 locked. Pointer capture for the same iframe reason. */}
              <div
                role="presentation"
                title="Drag to resize"
                className="absolute bottom-0 left-0 z-30 flex h-5 w-5 cursor-nesw-resize touch-none items-end justify-start p-1"
                onPointerDown={e => {
                  e.stopPropagation()
                  e.preventDefault()
                  const el = e.currentTarget
                  el.setPointerCapture(e.pointerId)
                  const startX = e.clientX
                  const startW = videoSize.width
                  const onMove = (ev: PointerEvent) => {
                    const w = Math.max(220, Math.min(560, startW - (ev.clientX - startX)))
                    setVideoSize({ width: w, height: Math.round((w * 9) / 16) })
                  }
                  const onUp = () => {
                    el.releasePointerCapture(e.pointerId)
                    el.removeEventListener('pointermove', onMove)
                    el.removeEventListener('pointerup', onUp)
                    el.removeEventListener('pointercancel', onUp)
                  }
                  el.addEventListener('pointermove', onMove)
                  el.addEventListener('pointerup', onUp)
                  el.addEventListener('pointercancel', onUp)
                }}
              >
                <span className="h-2.5 w-2.5 border-b-2 border-l-2 border-white/70" />
              </div>
              <div className="absolute right-2 top-1 z-40 flex gap-1">
                {onToggleVideoFullscreen ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 bg-slate-800/50 p-0 hover:bg-[#1F2933] hover:text-white hover:outline hover:outline-1 hover:outline-white"
                    onClick={onToggleVideoFullscreen}
                  >
                    <Maximize className="h-3 w-3 text-white" />
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 bg-slate-800/50 p-0 hover:bg-[#1F2933] hover:text-white hover:outline hover:outline-1 hover:outline-white"
                  onClick={() => setShowVideo(false)}
                >
                  <X className="h-3 w-3 text-white" />
                </Button>
              </div>
              {videoComponent}
            </div>
          )}

          {/* Show Video Button */}
          {!showVideo && (
            <div className="absolute right-4 top-4 z-10" onMouseDown={e => e.stopPropagation()}>
              <Button variant="outline" size="sm" onClick={() => setShowVideo(true)}>
                Show Video
              </Button>
            </div>
          )}
        </div>

        {/* Video Fullscreen Overlay - 70% centered */}
        {isVideoFullscreen && videoComponent && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
            <div
              className="relative overflow-hidden rounded-lg border border-slate-600 bg-black shadow-2xl"
              style={{ width: '70%', height: '70%' }}
            >
              <div className="absolute right-4 top-4 z-10">
                <Button variant="outline" size="sm" onClick={onToggleVideoFullscreen}>
                  <Minimize className="mr-2 h-4 w-4" /> Minimize
                </Button>
              </div>
              <div className="h-full w-full">{videoComponent}</div>
            </div>
          </div>
        )}

        {/* Background Panel - Color & Style Selection */}
        {showBackgroundPanel && (
          <div className="absolute right-4 top-16 z-50 w-80 rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-white">Background</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setShowBackgroundPanel(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              {/* Background Colors */}
              <div>
                <label className="mb-2 block text-sm text-slate-400">Color</label>
                <div className="grid grid-cols-3 gap-2">
                  {BACKGROUND_COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => updateBackground(c.value, currentPage.backgroundStyle)}
                      className={`flex h-12 flex-col items-center justify-center rounded border-2 transition-all ${
                        currentPage.backgroundColor === c.value
                          ? 'border-blue-500 ring-2 ring-blue-500/50'
                          : 'border-slate-600 hover:border-gray-400'
                      }`}
                      style={{ backgroundColor: c.value }}
                    >
                      <span
                        className={`text-xs font-medium ${
                          c.value === '#ffffff' || c.value === '#fef3c7'
                            ? 'text-gray-800'
                            : 'text-white'
                        }`}
                      >
                        {c.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Background Styles */}
              <div>
                <label className="mb-2 block text-sm text-slate-400">Style</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['solid', 'grid', 'dots', 'lines', 'coordinate-plane'] as const).map(style => (
                    <button
                      key={style}
                      onClick={() => updateBackground(currentPage.backgroundColor, style)}
                      className={`rounded border px-2 py-2 text-xs capitalize ${
                        currentPage.backgroundStyle === style
                          ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                          : 'border-slate-600 text-slate-300 hover:border-gray-400'
                      }`}
                    >
                      {style === 'coordinate-plane' ? 'Coords' : style}
                    </button>
                  ))}
                </div>
              </div>

              {/* Snap to Grid */}
              <div>
                <label className="mb-2 block text-sm text-slate-400">Grid Snap</label>
                <button
                  onClick={() => setSnapToGrid(v => !v)}
                  className={`flex w-full items-center gap-2 rounded border px-3 py-2 text-sm ${
                    snapToGrid
                      ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                      : 'border-slate-600 text-slate-300 hover:border-gray-400'
                  }`}
                >
                  <Magnet className="h-4 w-4" />
                  {snapToGrid ? 'Snap On' : 'Snap Off'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Teaching Assistant Panel */}
        {showTeachingAssistant && (
          <TeachingAssistant
            students={students}
            roomId="class-room"
            onPushHint={(studentId, hint, type: 'socratic' | 'direct' | 'encouragement') =>
              onPushHint?.(studentId, hint)
            }
          />
        )}
      </div>

      {/* Math Dialogs */}
      <GraphDialog
        open={showGraphDialog}
        onOpenChange={setShowGraphDialog}
        onPlot={handlePlotGraph}
        defaultColor={color}
      />

      {/* Bottom Page Navigation - only show when using internal state */}
      {true && (
        <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/40 bg-white/70 px-4 py-2 shadow-2xl ring-1 ring-black/[0.05] backdrop-blur-xl">
          {!readOnly && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={addPage}
                className="h-8 gap-1 rounded-xl text-slate-700 hover:bg-slate-100"
              >
                <Plus className="h-4 w-4" /> New Page
              </Button>
              <div className="mx-1 h-6 w-px bg-slate-200" />
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPageIndex(Math.max(0, currentPageIndex - 1))}
            disabled={currentPageIndex === 0}
            className="h-8 w-8 rounded-xl p-0 text-slate-700 hover:bg-slate-100 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex max-w-md items-center gap-1 overflow-x-auto">
            {pages.map((page, index) => (
              <button
                key={page.id}
                onClick={() => setCurrentPageIndex(index)}
                className={cn(
                  'flex items-center gap-1 whitespace-nowrap rounded-xl px-3 py-1.5 text-sm transition-all',
                  index === currentPageIndex
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                <Grid3X3 className="h-3 w-3" />
                <span className="max-w-[80px] truncate">{page.name}</span>
                {pages.length > 1 && index === currentPageIndex && !readOnly && (
                  <X
                    className="ml-1 h-3 w-3 rounded-full opacity-70 transition-colors hover:bg-white/20 hover:opacity-100"
                    onClick={e => {
                      e.stopPropagation()
                      deletePage(index)
                    }}
                  />
                )}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPageIndex(Math.min(pages.length - 1, currentPageIndex + 1))}
            disabled={currentPageIndex === pages.length - 1}
            className="h-8 w-8 rounded-xl p-0 text-slate-700 hover:bg-slate-100 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
