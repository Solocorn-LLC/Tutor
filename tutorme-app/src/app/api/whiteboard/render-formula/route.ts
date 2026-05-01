import { NextRequest, NextResponse } from 'next/server'

// Lazy-load mathjax to avoid init cost on unrelated requests
let mathJaxInstance: any = null
let mathJaxReady: Promise<any> | null = null

async function getMathJax() {
  if (mathJaxInstance) return mathJaxInstance
  if (mathJaxReady) return mathJaxReady

  mathJaxReady = (async () => {
    const mj = require('mathjax')
    await mj.init({
      loader: { load: ['input/tex', 'output/svg'] },
      tex: { packages: { '[+]': ['ams'] } },
    })
    mathJaxInstance = mj
    return mj
  })()

  return mathJaxReady
}

export async function POST(req: NextRequest) {
  try {
    const { latex, display = true } = await req.json()

    if (!latex || typeof latex !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid latex field' }, { status: 400 })
    }

    const MathJax = await getMathJax()
    const svgNode = MathJax.tex2svg(latex.trim(), { display })
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
    console.error('[render-formula] Error:', err)
    return NextResponse.json(
      { error: 'Failed to render formula', detail: (err as Error).message },
      { status: 500 }
    )
  }
}
