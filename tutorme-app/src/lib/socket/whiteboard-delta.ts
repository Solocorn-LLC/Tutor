/**
 * Whiteboard Delta Sync Protocol
 *
 * Replaces full-state snapshot sync with incremental stroke/shape/text
 * deltas. Reduces per-draw payload from O(all strokes) to O(1).
 */

export interface PointDelta {
  x: number
  y: number
}

/** Flat number array compression: [x1, y1, x2, y2, ...] */
export type CompressedPoints = number[]

export interface StrokeDelta {
  id: string
  points: CompressedPoints
  color: string
  width: number
  type: 'pen' | 'eraser'
  userId: string
  pageIndex: number
}

export interface ShapeDelta {
  id: string
  type: 'rectangle' | 'circle' | 'line' | 'triangle' | 'arrow'
  x: number
  y: number
  width: number
  height: number
  color: string
  lineWidth: number
  userId: string
  pageIndex: number
}

export interface TextDelta {
  id: string
  text: string
  x: number
  y: number
  color: string
  fontSize: number
  pageIndex: number
}

export interface CursorDelta {
  userId: string
  name: string
  color: string
  x: number
  y: number
  pageIndex: number
}

export interface FormulaDelta {
  id: string
  latex: string
  x: number
  y: number
  width: number
  height: number
  color: string
  scale: number
  svgDataUrl?: string
  userId: string
  pageIndex: number
}

export interface GraphDelta {
  id: string
  expression: string
  color: string
  lineWidth: number
  xMin: number
  xMax: number
  yMin?: number
  yMax?: number
  samples?: number
  userId: string
  pageIndex: number
}

export interface WhiteboardBatchDelta {
  roomId: string
  strokes?: StrokeDelta[]
  shapes?: ShapeDelta[]
  texts?: TextDelta[]
  clearPageIndex?: number
}

// ============================================
// Point compression utilities
// ============================================

export function compressPoints(points: PointDelta[]): CompressedPoints {
  const flat: number[] = new Array(points.length * 2)
  for (let i = 0; i < points.length; i++) {
    flat[i * 2] = Math.round(points[i].x * 100) / 100
    flat[i * 2 + 1] = Math.round(points[i].y * 100) / 100
  }
  return flat
}

export function decompressPoints(flat: CompressedPoints): PointDelta[] {
  const points: PointDelta[] = new Array(flat.length / 2)
  for (let i = 0; i < points.length; i++) {
    points[i] = {
      x: flat[i * 2],
      y: flat[i * 2 + 1],
    }
  }
  return points
}

// Batch compression: group consecutive strokes by page
export function batchDeltasByPage<T extends { pageIndex: number }>(deltas: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>()
  for (const d of deltas) {
    const arr = map.get(d.pageIndex) || []
    arr.push(d)
    map.set(d.pageIndex, arr)
  }
  return map
}
