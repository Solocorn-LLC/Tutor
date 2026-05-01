import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Sigma, Loader2, AlertCircle } from 'lucide-react'

interface LatexFormulaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPlace: (options: {
    latex: string
    scale: number
    color: string
  }) => void
}

const PRESETS = [
  { label: 'Quadratic', latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
  { label: 'Integral', latex: '\\int_{a}^{b} f(x) \\, dx' },
  { label: 'Derivative', latex: '\\frac{d}{dx} e^x = e^x' },
  { label: 'Sum', latex: '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}' },
  { label: 'Limit', latex: '\\lim_{x \\to \\infty} \\frac{1}{x} = 0' },
  { label: 'Pythagorean', latex: 'a^2 + b^2 = c^2' },
]

export function LatexFormulaDialog({ open, onOpenChange, onPlace }: LatexFormulaDialogProps) {
  const [latex, setLatex] = useState('\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}')
  const [scale, setScale] = useState([1.5])
  const [color, setColor] = useState('#000000')
  const [previewSvg, setPreviewSvg] = useState('')
  const [previewWidth, setPreviewWidth] = useState(0)
  const [previewHeight, setPreviewHeight] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const renderPreview = useCallback(async (expr: string) => {
    if (!expr.trim()) {
      setPreviewSvg('')
      return
    }

    if (abortRef.current) abortRef.current.abort()
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
        setError(data.error || 'Failed to render')
        setPreviewSvg('')
        return
      }

      const data = await res.json()
      setPreviewSvg(data.svg)
      setPreviewWidth(data.width)
      setPreviewHeight(data.height)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('Network error')
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Debounced preview
  useEffect(() => {
    const timer = setTimeout(() => renderPreview(latex), 400)
    return () => clearTimeout(timer)
  }, [latex, renderPreview])

  const applyPreset = (presetLatex: string) => {
    setLatex(presetLatex)
    setError('')
  }

  const handlePlace = () => {
    if (!latex.trim()) {
      setError('Please enter a formula')
      return
    }
    if (!previewSvg) {
      setError('Please wait for preview to render')
      return
    }
    onPlace({ latex: latex.trim(), scale: scale[0], color })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sigma className="h-5 w-5 text-blue-500" />
            LaTeX Formula
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* LaTeX input */}
          <div className="space-y-1.5">
            <Label htmlFor="latex">LaTeX Expression</Label>
            <Input
              id="latex"
              value={latex}
              onChange={e => { setLatex(e.target.value); setError('') }}
              placeholder="\\frac{a}{b}"
              className="font-mono text-sm"
            />
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p.latex}
                onClick={() => applyPreset(p.latex)}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-blue-100 hover:text-blue-700"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Scale */}
          <div className="space-y-1.5">
            <Label>Scale: {scale[0].toFixed(1)}x</Label>
            <Slider value={scale} onValueChange={setScale} min={0.5} max={3} step={0.1} />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              {['#000000', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#f59e0b'].map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? '#1f2937' : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg border bg-white p-4">
            <Label className="mb-2 block text-xs text-slate-500">Preview</Label>
            <div
              className="flex min-h-[80px] items-center justify-center"
              style={{ minHeight: Math.max(80, previewHeight * scale[0]) }}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              ) : previewSvg ? (
                <div
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                  style={{
                    transform: `scale(${scale[0]})`,
                    transformOrigin: 'center center',
                  }}
                />
              ) : (
                <span className="text-sm text-slate-400">Type a formula to preview</span>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handlePlace} disabled={isLoading || !previewSvg}>
              <Sigma className="mr-1.5 h-4 w-4" />
              Place on Board
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
