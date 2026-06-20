import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Sigma, X, Loader2, AlertCircle, CornerDownLeft, Eraser } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FloatingMathToolProps {
  /** Places the rendered formula on the board. Reuses the whiteboard's formula handler. */
  onPlace: (options: { latex: string; scale: number; color: string }) => void | Promise<void>
  /** Current pen color, used as the default formula color. */
  defaultColor?: string
}

/**
 * A self-contained, draggable floating tool dedicated to math (and science
 * notation) entry. Unlike the old modal Formula dialog, this stays open so a
 * tutor/student can drop several expressions in a row, and offers a symbol +
 * template palette so users don't have to know LaTeX to write math fast.
 */

// Templates insert a LaTeX skeleton and drop the caret inside the first slot.
// `caretBack` = how many characters from the end of the snippet the caret sits.
interface Template {
  label: string
  latex: string
  caretBack: number
}

const TEMPLATES: Template[] = [
  { label: 'a/b', latex: '\\frac{}{}', caretBack: 3 },
  { label: 'xⁿ', latex: '^{}', caretBack: 1 },
  { label: 'xₙ', latex: '_{}', caretBack: 1 },
  { label: '√', latex: '\\sqrt{}', caretBack: 1 },
  { label: 'ⁿ√', latex: '\\sqrt[]{}', caretBack: 3 },
  { label: '∫', latex: '\\int_{}^{}', caretBack: 4 },
  { label: '∑', latex: '\\sum_{}^{}', caretBack: 4 },
  { label: 'lim', latex: '\\lim_{}', caretBack: 1 },
  { label: '( )', latex: '\\left(\\right)', caretBack: 7 },
  { label: 'vec', latex: '\\vec{}', caretBack: 1 },
]

// Symbols insert as-is (caret lands right after them).
interface SymbolGroup {
  name: string
  symbols: { display: string; latex: string }[]
}

const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    name: 'Basic',
    symbols: [
      { display: '×', latex: '\\times ' },
      { display: '÷', latex: '\\div ' },
      { display: '±', latex: '\\pm ' },
      { display: '∓', latex: '\\mp ' },
      { display: '·', latex: '\\cdot ' },
      { display: '∞', latex: '\\infty ' },
      { display: '°', latex: '^{\\circ}' },
      { display: '%', latex: '\\% ' },
      { display: '∝', latex: '\\propto ' },
      { display: '∴', latex: '\\therefore ' },
    ],
  },
  {
    name: 'Relations',
    symbols: [
      { display: '=', latex: '= ' },
      { display: '≠', latex: '\\neq ' },
      { display: '≤', latex: '\\leq ' },
      { display: '≥', latex: '\\geq ' },
      { display: '≈', latex: '\\approx ' },
      { display: '≡', latex: '\\equiv ' },
      { display: '→', latex: '\\to ' },
      { display: '⇌', latex: '\\rightleftharpoons ' },
      { display: '∈', latex: '\\in ' },
      { display: '⊂', latex: '\\subset ' },
      { display: '∪', latex: '\\cup ' },
      { display: '∩', latex: '\\cap ' },
    ],
  },
  {
    name: 'Greek',
    symbols: [
      { display: 'α', latex: '\\alpha ' },
      { display: 'β', latex: '\\beta ' },
      { display: 'γ', latex: '\\gamma ' },
      { display: 'δ', latex: '\\delta ' },
      { display: 'θ', latex: '\\theta ' },
      { display: 'λ', latex: '\\lambda ' },
      { display: 'μ', latex: '\\mu ' },
      { display: 'π', latex: '\\pi ' },
      { display: 'ρ', latex: '\\rho ' },
      { display: 'σ', latex: '\\sigma ' },
      { display: 'φ', latex: '\\phi ' },
      { display: 'ω', latex: '\\omega ' },
      { display: 'Δ', latex: '\\Delta ' },
      { display: 'Σ', latex: '\\Sigma ' },
      { display: 'Ω', latex: '\\Omega ' },
    ],
  },
  {
    name: 'Calculus',
    symbols: [
      { display: '∫', latex: '\\int ' },
      { display: '∮', latex: '\\oint ' },
      { display: '∑', latex: '\\sum ' },
      { display: '∏', latex: '\\prod ' },
      { display: '∂', latex: '\\partial ' },
      { display: '∇', latex: '\\nabla ' },
      { display: 'd/dx', latex: '\\frac{d}{dx} ' },
      { display: '∂/∂x', latex: '\\frac{\\partial}{\\partial x} ' },
      { display: 'lim', latex: '\\lim_{x \\to } ' },
    ],
  },
  {
    name: 'Science',
    symbols: [
      { display: '×10ⁿ', latex: '\\times 10^{}' },
      { display: 'Δ', latex: '\\Delta ' },
      { display: 'λ', latex: '\\lambda ' },
      { display: 'ℏ', latex: '\\hbar ' },
      { display: '(aq)', latex: '_{(aq)} ' },
      { display: '(g)', latex: '_{(g)} ' },
      { display: '(s)', latex: '_{(s)} ' },
      { display: '(l)', latex: '_{(l)} ' },
      { display: '→', latex: '\\rightarrow ' },
      { display: '⇌', latex: '\\rightleftharpoons ' },
      { display: '°C', latex: '^{\\circ}\\text{C}' },
      { display: 'x̂', latex: '\\hat{}' },
    ],
  },
]

const COLORS = ['#000000', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#f59e0b']
const SCALES = [1, 1.5, 2, 2.5]

export function FloatingMathTool({ onPlace, defaultColor }: FloatingMathToolProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ x: 20, y: 90 })
  const [latex, setLatex] = useState('')
  const [scale, setScale] = useState(1.5)
  const [color, setColor] = useState(defaultColor || '#000000')
  const [activeGroup, setActiveGroup] = useState(SYMBOL_GROUPS[0].name)
  const [previewSvg, setPreviewSvg] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const caretRef = useRef<number | null>(null)

  // Keep the formula color in sync with the pen color until the user overrides it.
  useEffect(() => {
    if (defaultColor) setColor(defaultColor)
  }, [defaultColor])

  // Restore the caret after a palette insertion re-renders the input.
  useEffect(() => {
    if (caretRef.current !== null && inputRef.current) {
      const pos = caretRef.current
      inputRef.current.focus()
      inputRef.current.setSelectionRange(pos, pos)
      caretRef.current = null
    }
  }, [latex])

  const insert = useCallback(
    (snippet: string, caretBack = 0) => {
      const el = inputRef.current
      const start = el?.selectionStart ?? latex.length
      const end = el?.selectionEnd ?? start
      const next = latex.slice(0, start) + snippet + latex.slice(end)
      caretRef.current = start + snippet.length - caretBack
      setLatex(next)
      setError('')
    },
    [latex]
  )

  const renderPreview = useCallback(async (expr: string) => {
    if (!expr.trim()) {
      setPreviewSvg('')
      setError('')
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setIsLoading(true)
    setError('')
    try {
      const res = await fetch('/api/whiteboard/render-formula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latex: expr, display: true }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Could not render')
        setPreviewSvg('')
        return
      }
      const data = await res.json()
      setPreviewSvg(data.svg)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError('Network error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Debounced live preview.
  useEffect(() => {
    const timer = setTimeout(() => renderPreview(latex), 350)
    return () => clearTimeout(timer)
  }, [latex, renderPreview])

  const handlePlace = useCallback(() => {
    if (!latex.trim()) {
      setError('Type a math expression first')
      return
    }
    if (!previewSvg) {
      setError('Wait for the preview to render')
      return
    }
    onPlace({ latex: latex.trim(), scale, color })
    // Keep the panel open but clear the input so the next formula is fast.
    setLatex('')
    setPreviewSvg('')
  }, [latex, previewSvg, scale, color, onPlace])

  return (
    <motion.div
      className="pointer-events-auto absolute z-50"
      animate={{ x: position.x, y: position.y }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
      drag
      dragMomentum={false}
      onDragEnd={(_e, info) =>
        setPosition({ x: position.x + info.offset.x, y: position.y + info.offset.y })
      }
      style={{ touchAction: 'none' }}
    >
      {isOpen ? (
        <div className="w-[300px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Header (drag handle) */}
          <div className="flex cursor-grab items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2 active:cursor-grabbing">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Sigma className="h-4 w-4 text-blue-500" /> Math
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2.5 p-3" onPointerDownCapture={e => e.stopPropagation()}>
            {/* Input */}
            <div className="relative">
              <input
                ref={inputRef}
                value={latex}
                onChange={e => {
                  setLatex(e.target.value)
                  setError('')
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handlePlace()
                  }
                }}
                placeholder="Type or tap symbols below…"
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-lg border border-slate-200 py-2 pl-2.5 pr-8 font-mono text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
              />
              {latex && (
                <button
                  onClick={() => {
                    setLatex('')
                    setPreviewSvg('')
                    setError('')
                    inputRef.current?.focus()
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                  title="Clear"
                >
                  <Eraser className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Templates */}
            <div className="flex flex-wrap gap-1">
              {TEMPLATES.map(t => (
                <button
                  key={t.label}
                  onClick={() => insert(t.latex, t.caretBack)}
                  className="min-w-[34px] rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                  title={t.latex}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Symbol category tabs */}
            <div className="flex gap-1 overflow-x-auto">
              {SYMBOL_GROUPS.map(g => (
                <button
                  key={g.name}
                  onClick={() => setActiveGroup(g.name)}
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                    activeGroup === g.name
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  )}
                >
                  {g.name}
                </button>
              ))}
            </div>

            {/* Symbol palette */}
            <div className="grid grid-cols-6 gap-1">
              {SYMBOL_GROUPS.find(g => g.name === activeGroup)?.symbols.map(s => (
                <button
                  key={s.latex}
                  onClick={() => insert(s.latex)}
                  className="flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white text-sm text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                  title={s.latex.trim()}
                >
                  {s.display}
                </button>
              ))}
            </div>

            {/* Preview */}
            <div className="flex min-h-[56px] items-center justify-center rounded-lg border border-slate-100 bg-slate-50 p-2">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : error ? (
                <span className="flex items-center gap-1.5 text-xs text-red-500">
                  <AlertCircle className="h-3.5 w-3.5" /> {error}
                </span>
              ) : previewSvg ? (
                <div
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                  style={{ color }}
                  className="max-h-[80px] max-w-full overflow-auto [&_svg]:max-w-full"
                />
              ) : (
                <span className="text-xs text-slate-400">Preview</span>
              )}
            </div>

            {/* Color + scale + place */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderColor: color === c ? '#1f2937' : 'transparent',
                    }}
                    title={c}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1">
                {SCALES.map(s => (
                  <button
                    key={s}
                    onClick={() => setScale(s)}
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                      scale === s
                        ? 'bg-slate-800 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    )}
                    title={`Scale ${s}x`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handlePlace}
              disabled={isLoading || !previewSvg}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CornerDownLeft className="h-4 w-4" /> Place on Board
            </button>
          </div>
        </div>
      ) : (
        <motion.button
          onClick={() => setIsOpen(true)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex h-14 w-14 cursor-grab items-center justify-center rounded-full bg-white text-slate-800 shadow-[0_0_15px_rgba(0,0,0,0.15)] transition-colors hover:bg-slate-50 active:cursor-grabbing"
          title="Math tool"
        >
          <Sigma className="h-6 w-6" />
        </motion.button>
      )}
    </motion.div>
  )
}
