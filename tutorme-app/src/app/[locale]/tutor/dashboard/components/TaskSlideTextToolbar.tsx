'use client'

import { useState, useMemo, type RefObject } from 'react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TaskSlideTextEditorRef } from './TaskSlideTextEditor'

const MIN_SIZE = 10
const DEFAULT_SIZE = 18
const MAX_SIZE = 32

const FONT_FAMILIES = [
  {
    value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
    label: 'Sans',
  },
  {
    value: 'Georgia, "Times New Roman", Times, serif',
    label: 'Serif',
  },
  {
    value: '"Fira Code", "Courier New", Courier, monospace',
    label: 'Mono',
  },
  {
    value: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "SimHei", sans-serif',
    label: 'Chinese',
  },
  {
    value: '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
    label: 'Korean',
  },
  {
    value: '"Noto Sans JP", "Hiragino Kaku Gothic Pro", "Meiryo", sans-serif',
    label: 'Japanese',
  },
  {
    value: '"Noto Sans Arabic", "Scheherazade New", "Arial", sans-serif',
    label: 'Arabic',
  },
  {
    value: '"Noto Sans Devanagari", "Mangal", "Kokila", "Arial", sans-serif',
    label: 'Hindi',
  },
  {
    value: '"Noto Sans Tamil", "Latha", "Vijaya", "Arial", sans-serif',
    label: 'Tamil',
  },
  {
    value: '"Noto Sans Thai", "Tahoma", "Leelawadee", "Arial", sans-serif',
    label: 'Thai',
  },
  {
    value: '"Noto Sans Hebrew", "Arial Hebrew", "Tahoma", sans-serif',
    label: 'Hebrew',
  },
  {
    value: '"Noto Sans Greek", "Arial", "Helvetica", sans-serif',
    label: 'Greek',
  },
]

const DEFAULT_COLORS = [
  '#000000',
  '#EF4444',
  '#3B82F6',
  '#22C55E',
  '#F97316',
  '#A855F7',
  '#EAB308',
  '#06B6D4',
]

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

interface TaskSlideTextToolbarProps {
  editorRef: RefObject<TaskSlideTextEditorRef | null>
  fontFamily: string
  fontSize: number
  color: string
  onFontFamilyChange: (fontFamily: string) => void
  onFontSizeChange: (fontSize: number) => void
  onColorChange: (color: string) => void
  className?: string
}

export function TaskSlideTextToolbar({
  editorRef,
  fontFamily,
  fontSize,
  color,
  onFontFamilyChange,
  onFontSizeChange,
  onColorChange,
  className,
}: TaskSlideTextToolbarProps) {
  const [customColors, setCustomColors] = useState(DEFAULT_COLORS)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerColor, setPickerColor] = useState(color)

  const rgb = useMemo(() => hexToRgb(pickerColor), [pickerColor])
  const currentFamilyLabel = FONT_FAMILIES.find(f => f.value === fontFamily)?.label ?? 'Sans'

  const handleFontFamilyChange = (value: string) => {
    onFontFamilyChange(value)
    // Defer so the toolbar state update has happened before the editor reads it.
    setTimeout(() => editorRef.current?.applyFormat({ fontFamily: value, fontSize, color }), 0)
  }

  const handleFontSizeChange = (value: number) => {
    const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, value))
    onFontSizeChange(clamped)
    setTimeout(() => editorRef.current?.applyFormat({ fontFamily, fontSize: clamped, color }), 0)
  }

  const handleColorChange = (value: string) => {
    onColorChange(value)
    setPickerColor(value)
    setTimeout(() => editorRef.current?.applyFormat({ fontFamily, fontSize, color: value }), 0)
  }

  const handleRgbChange = (key: 'r' | 'g' | 'b', value: string) => {
    const num = parseInt(value, 10) || 0
    const next = { ...rgb, [key]: num }
    setPickerColor(rgbToHex(next.r, next.g, next.b))
  }

  const addColor = () => {
    const normalized = pickerColor.toUpperCase()
    setCustomColors(prev => (prev.includes(normalized) ? prev : [...prev, normalized]))
    handleColorChange(normalized)
    setPickerOpen(false)
  }

  const selectSwatch = (swatch: string) => {
    handleColorChange(swatch)
    setPickerOpen(false)
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border border-slate-200/60 bg-white/90 p-1.5 shadow-lg backdrop-blur-md',
        className
      )}
    >
      {/* Font family */}
      <Select value={fontFamily} onValueChange={handleFontFamilyChange}>
        <SelectTrigger
          className="h-8 w-[140px] border-slate-200 bg-white text-xs font-medium text-slate-700"
          aria-label="Font family"
        >
          <SelectValue placeholder={currentFamilyLabel} />
        </SelectTrigger>
        <SelectContent>
          {FONT_FAMILIES.map(f => (
            <SelectItem key={f.label} value={f.value} className="text-xs">
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Font size */}
      <div className="flex h-8 items-center overflow-hidden rounded-md border border-slate-200 bg-white">
        <input
          type="number"
          min={MIN_SIZE}
          max={MAX_SIZE}
          value={fontSize}
          onChange={e => handleFontSizeChange(parseInt(e.target.value, 10) || DEFAULT_SIZE)}
          className="h-full w-12 border-0 bg-transparent px-1.5 text-center text-xs font-medium text-slate-700 focus:outline-none focus-visible:ring-0"
          aria-label="Font size"
        />
        <div className="flex h-full flex-col border-l border-slate-200">
          <button
            type="button"
            onClick={() => handleFontSizeChange(fontSize + 1)}
            disabled={fontSize >= MAX_SIZE}
            className="flex h-4 w-5 items-center justify-center text-[9px] text-slate-600 hover:bg-slate-50 disabled:opacity-30"
            aria-label="Increase font size"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => handleFontSizeChange(fontSize - 1)}
            disabled={fontSize <= MIN_SIZE}
            className="flex h-4 w-5 items-center justify-center text-[9px] text-slate-600 hover:bg-slate-50 disabled:opacity-30"
            aria-label="Decrease font size"
          >
            ▼
          </button>
        </div>
      </div>

      {/* Color picker */}
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            aria-label="Open text color picker"
          >
            <span
              className="h-4 w-4 rounded border border-slate-200"
              style={{ backgroundColor: color }}
            />
            Color
          </button>
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
    </div>
  )
}
