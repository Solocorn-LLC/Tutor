'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const MIN_SIZE = 10
const CENTER_SIZE = 18
const MAX_SIZE = 32

const DEFAULT_COLORS = ['#000000', '#EF4444', '#3B82F6', '#22C55E', '#F97316']

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean, 16)
  if (isNaN(bigint)) return { r: 0, g: 0, b: 0 }
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  }
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function sizeToPercent(size: number) {
  const logMin = Math.log(MIN_SIZE)
  const logCenter = Math.log(CENTER_SIZE)
  const logMax = Math.log(MAX_SIZE)
  const logSize = Math.log(size)
  if (logSize <= logCenter) {
    return ((logSize - logMin) / (logCenter - logMin)) * 50
  }
  return 50 + ((logSize - logCenter) / (logMax - logCenter)) * 50
}

function percentToSize(percent: number) {
  const logMin = Math.log(MIN_SIZE)
  const logCenter = Math.log(CENTER_SIZE)
  const logMax = Math.log(MAX_SIZE)
  if (percent <= 50) {
    return Math.exp(logMin + (percent / 50) * (logCenter - logMin))
  }
  return Math.exp(logCenter + ((percent - 50) / 50) * (logMax - logCenter))
}

interface TaskSlideFontEditorProps {
  fontSize: number
  onFontSizeChange: (fontSize: number) => void
  color: string
  onColorChange: (color: string) => void
  className?: string
}

export function TaskSlideFontEditor({
  fontSize,
  onFontSizeChange,
  color,
  onColorChange,
  className,
}: TaskSlideFontEditorProps) {
  const [customColors, setCustomColors] = useState(DEFAULT_COLORS)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerColor, setPickerColor] = useState(color)

  const rgb = useMemo(() => hexToRgb(pickerColor), [pickerColor])
  const sliderPercent = sizeToPercent(fontSize)

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const percent = parseFloat(e.target.value)
    const nextSize = Math.round(percentToSize(percent))
    onFontSizeChange(nextSize)
  }

  const handleReset = () => {
    onFontSizeChange(CENTER_SIZE)
    onColorChange('#000000')
  }

  const handleRgbChange = (key: 'r' | 'g' | 'b', value: string) => {
    const num = parseInt(value, 10) || 0
    const next = { ...rgb, [key]: num }
    setPickerColor(rgbToHex(next.r, next.g, next.b))
  }

  const addColor = () => {
    const normalized = pickerColor.toUpperCase()
    setCustomColors(prev => (prev.includes(normalized) ? prev : [...prev, normalized]))
    onColorChange(normalized)
    setPickerOpen(false)
  }

  const selectSwatch = (swatch: string) => {
    onColorChange(swatch)
    setPickerColor(swatch)
    setPickerOpen(false)
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border border-slate-200/60 bg-white/90 p-1.5 shadow-lg backdrop-blur-md',
        className
      )}
    >
      {/* Color swatch */}
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-7 w-7 rounded-full border border-slate-300 shadow-sm"
            style={{ backgroundColor: color }}
            title="Text color"
            aria-label="Open text color picker"
          />
        </PopoverTrigger>
        <PopoverContent variant="panel" align="end" className="w-64 p-4">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-lg border border-slate-200 shadow-sm"
                style={{ backgroundColor: pickerColor }}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">Color</p>
                <p className="text-xs text-slate-500">{pickerColor.toUpperCase()}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-600">RGB</Label>
              <div className="flex gap-2">
                {(['r', 'g', 'b'] as const).map(key => (
                  <div key={key} className="flex-1">
                    <Input
                      type="number"
                      min={0}
                      max={255}
                      value={rgb[key]}
                      onChange={e => handleRgbChange(key, e.target.value)}
                      className="h-8 px-2 text-center text-xs"
                    />
                    <span className="block text-center text-[10px] uppercase text-slate-400">
                      {key}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <Button size="sm" variant="outline" className="w-full text-xs" onClick={addColor}>
              Add color
            </Button>

            <div>
              <Label className="text-xs text-slate-600">Swatches</Label>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {customColors.map((swatch, i) => (
                  <button
                    key={`${swatch}-${i}`}
                    type="button"
                    onClick={() => selectSwatch(swatch)}
                    className={cn(
                      'h-7 w-7 rounded-full border shadow-sm transition-transform hover:scale-110',
                      swatch.toUpperCase() === color.toUpperCase()
                        ? 'border-slate-900 ring-2 ring-slate-400'
                        : 'border-slate-200'
                    )}
                    style={{ backgroundColor: swatch }}
                    aria-label={`Select color ${swatch}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Font-size slider */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] font-medium text-slate-700">{fontSize}px</span>
        <div className="relative h-24 w-3.5">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={sliderPercent}
            onChange={handleSliderChange}
            className="absolute inset-0 h-24 w-3.5 cursor-pointer appearance-none rounded-full bg-slate-300/70 outline-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.3)]"
            style={{
              writingMode: 'vertical-lr',
              direction: 'rtl',
            }}
            aria-label="Font size"
          />
        </div>
      </div>

      {/* Reset button */}
      <button
        type="button"
        onClick={handleReset}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700"
        title="Reset font size and color"
        aria-label="Reset font size and color"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </button>
    </div>
  )
}
