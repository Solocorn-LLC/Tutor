import { compileExpression } from '@/lib/math/expression'

export interface GraphSample {
  x: number
  y: number | null
}

export interface GraphRenderOptions {
  expression: string
  xMin: number
  xMax: number
  yMin?: number
  yMax?: number
  samples?: number
}

/**
 * Sample a mathematical expression over a domain for canvas plotting.
 * Returns points with null y for discontinuities/asymptotes.
 */
export function sampleGraph(options: GraphRenderOptions): GraphSample[] {
  const { expression, xMin, xMax, yMin, yMax, samples = 500 } = options
  const fn = compileExpression(expression)
  const points: GraphSample[] = []
  const step = (xMax - xMin) / samples

  for (let i = 0; i <= samples; i++) {
    const x = xMin + i * step
    const y = fn(x)

    if (y === null || !Number.isFinite(y)) {
      points.push({ x, y: null })
      continue
    }

    // Clamp to visible range if specified
    if (yMin !== undefined && yMax !== undefined) {
      if (y < yMin || y > yMax) {
        points.push({ x, y: null })
        continue
      }
    }

    points.push({ x, y })
  }

  return points
}

/**
 * Draw a sampled graph onto a canvas context in world coordinates.
 * Breaks the path at discontinuities (null y values).
 */
export function drawGraphOnCanvas(
  ctx: CanvasRenderingContext2D,
  points: GraphSample[],
  color: string,
  lineWidth: number
) {
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  let isDrawingSegment = false

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]

    if (pt.y === null) {
      if (isDrawingSegment) {
        ctx.stroke()
        isDrawingSegment = false
      }
      continue
    }

    if (!isDrawingSegment) {
      ctx.beginPath()
      ctx.moveTo(pt.x, pt.y)
      isDrawingSegment = true
    } else {
      ctx.lineTo(pt.x, pt.y)
    }
  }

  if (isDrawingSegment) {
    ctx.stroke()
  }
}

/**
 * Convert an SVG HTML string to a data URL for canvas drawImage.
 */
export function svgToDataUrl(svgHtml: string): string {
  // Strip the wrapper <mjx-container> if present, keep only the inner <svg>
  const svgMatch = svgHtml.match(/<svg[\s\S]*?<\/svg>/)
  const svg = svgMatch ? svgMatch[0] : svgHtml

  // Ensure xmlns is present
  const svgWithNs = svg.includes('xmlns=')
    ? svg
    : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')

  const encoded = encodeURIComponent(svgWithNs)
  return `data:image/svg+xml;charset=utf-8,${encoded}`
}
