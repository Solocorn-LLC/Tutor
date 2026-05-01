import React, { useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { compileExpression } from '@/lib/math/expression'
import { TrendingUp, AlertCircle } from 'lucide-react'

interface GraphDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPlot: (options: {
    expression: string
    color: string
    lineWidth: number
    xMin: number
    xMax: number
    yMin?: number
    yMax?: number
  }) => void
  defaultColor?: string
}

const PRESETS = [
  { label: 'Sine wave', expr: 'sin(x)' },
  { label: 'Parabola', expr: 'x^2' },
  { label: 'Exponential', expr: 'exp(x)' },
  { label: 'Square root', expr: 'sqrt(abs(x))' },
  { label: 'Logarithm', expr: 'log(abs(x))' },
]

export function GraphDialog({ open, onOpenChange, onPlot, defaultColor = '#3b82f6' }: GraphDialogProps) {
  const [expression, setExpression] = useState('sin(x)')
  const [color, setColor] = useState(defaultColor)
  const [lineWidth, setLineWidth] = useState([2])
  const [xMin, setXMin] = useState('-10')
  const [xMax, setXMax] = useState('10')
  const [yMin, setYMin] = useState('')
  const [yMax, setYMax] = useState('')
  const [error, setError] = useState('')

  const validate = useCallback(() => {
    const trimmed = expression.trim()
    if (!trimmed) {
      setError('Please enter an expression')
      return false
    }
    const fn = compileExpression(trimmed)
    const testVal = fn(1)
    if (testVal === null) {
      setError('Invalid expression. Use x as variable. Allowed: sin, cos, tan, sqrt, log, exp, abs, etc.')
      return false
    }
    const min = parseFloat(xMin)
    const max = parseFloat(xMax)
    if (Number.isNaN(min) || Number.isNaN(max) || min >= max) {
      setError('Invalid domain: xMin must be less than xMax')
      return false
    }
    setError('')
    return true
  }, [expression, xMin, xMax])

  const handlePlot = () => {
    if (!validate()) return
    onPlot({
      expression: expression.trim(),
      color,
      lineWidth: lineWidth[0],
      xMin: parseFloat(xMin),
      xMax: parseFloat(xMax),
      yMin: yMin ? parseFloat(yMin) : undefined,
      yMax: yMax ? parseFloat(yMax) : undefined,
    })
    onOpenChange(false)
  }

  const applyPreset = (expr: string) => {
    setExpression(expr)
    setError('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            Function Graph
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Expression */}
          <div className="space-y-1.5">
            <Label htmlFor="expr">Expression (use x)</Label>
            <Input
              id="expr"
              value={expression}
              onChange={e => { setExpression(e.target.value); setError('') }}
              placeholder="sin(x) + 0.5"
              className="font-mono"
            />
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p.expr}
                onClick={() => applyPreset(p.expr)}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-blue-100 hover:text-blue-700"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Domain */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="xmin">x Min</Label>
              <Input id="xmin" value={xMin} onChange={e => setXMin(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="xmax">x Max</Label>
              <Input id="xmax" value={xMax} onChange={e => setXMax(e.target.value)} />
            </div>
          </div>

          {/* Range (optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ymin">y Min (optional)</Label>
              <Input id="ymin" value={yMin} onChange={e => setYMin(e.target.value)} placeholder="auto" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ymax">y Max (optional)</Label>
              <Input id="ymax" value={yMax} onChange={e => setYMax(e.target.value)} placeholder="auto" />
            </div>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              {['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f59e0b', '#000000'].map(c => (
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

          {/* Line width */}
          <div className="space-y-1.5">
            <Label>Line Width: {lineWidth[0]}px</Label>
            <Slider value={lineWidth} onValueChange={setLineWidth} min={1} max={6} step={1} />
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
            <Button onClick={handlePlot}>
              <TrendingUp className="mr-1.5 h-4 w-4" />
              Plot
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
