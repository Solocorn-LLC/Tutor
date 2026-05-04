import { NextRequest, NextResponse } from 'next/server'

// Lazy-load mathjax to avoid init cost on unrelated requests
let mathJaxInstance: any = null
let mathJaxReady: Promise<any> | null = null
let mathJaxFailed = false

async function getMathJax() {
  if (mathJaxInstance) return mathJaxInstance
  if (mathJaxReady && !mathJaxFailed) return mathJaxReady

  mathJaxFailed = false
  mathJaxReady = (async () => {
    const mj = require('mathjax')
    await mj.init({
      loader: { load: ['input/tex', 'output/svg'] },
      tex: { packages: { '[+]': ['ams'] } },
    })
    mathJaxInstance = mj
    return mj
  })().catch(err => {
    mathJaxFailed = true
    mathJaxReady = null
    throw err
  })

  return mathJaxReady
}

/**
 * Generate a simple fallback SVG that renders the raw LaTeX as text.
 * Used when MathJax is unavailable so the whiteboard still shows something.
 */
function fallbackSvg(latex: string): { svg: string; width: number; height: number } {
  const chars = latex.length
  const width = Math.max(40, chars * 10)
  const height = 30
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#f8fafc" rx="4"/>
    <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="14" fill="#334155">${escapeXml(latex)}</text>
  </svg>`
  return { svg, width, height }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function POST(req: NextRequest) {
  try {
    const { latex, display = true } = await req.json()

    if (!latex || typeof latex !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid latex field' }, { status: 400 })
    }

    const trimmed = latex.trim()
    if (!trimmed) {
      return NextResponse.json({ error: 'Empty latex field' }, { status: 400 })
    }

    let MathJax: any
    try {
      MathJax = await getMathJax()
    } catch (initErr) {
      console.warn('[render-formula] MathJax init failed, using fallback:', (initErr as Error).message)
      return NextResponse.json(fallbackSvg(trimmed))
    }

    let svgNode: any
    try {
      svgNode = MathJax.tex2svg(trimmed, { display })
    } catch (texErr) {
      console.warn('[render-formula] tex2svg failed, using fallback:', (texErr as Error).message)
      return NextResponse.json(fallbackSvg(trimmed))
    }

    const svgHtml = MathJax.startup.adaptor.outerHTML(svgNode)

    // Extract width/height from SVG attributes for client sizing
    const widthMatch = svgHtml.match(/width="([\d.]+)ex"/)
    const heightMatch = svgHtml.match(/height="([\d.]+)ex"/)
    const widthEx = widthMatch ? parseFloat(widthMatch[1]) : 10
    const heightEx = heightMatch ? parseFloat(heightMatch[1]) : 5

    // Approximate px size (1ex ≈ 8px for typical fonts)
    const pxPerEx = 10

    return NextResponse.json({
      svg: svgHtml,
      width: Math.round(widthEx * pxPerEx),
      height: Math.round(heightEx * pxPerEx),
    })
  } catch (err) {
    console.error('[render-formula] Unexpected error:', err)
    // Return a safe fallback instead of 500 so the whiteboard doesn't break
    try {
      const body = await req.json().catch(() => ({}))
      if (body.latex && typeof body.latex === 'string') {
        return NextResponse.json(fallbackSvg(body.latex.trim()))
      }
    } catch {
      // ignore
    }
    return NextResponse.json(
      { error: 'Failed to render formula', detail: (err as Error).message },
      { status: 500 }
    )
  }
}
