import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PenTool,
  Pencil,
  Eraser,
  Palette,
  Circle,
  Type,
  MousePointer2,
  Trash2,
  X,
  Square,
  Triangle,
  Minus,
  ArrowUpRight,
  ChevronLeft,
  Sigma,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface FloatingToolMenuProps {
  currentTool: string
  currentColor: string
  currentLineWidth: number
  onToolChange: (tool: any) => void
  onColorChange: (color: string) => void
  onLineWidthChange: (width: number) => void
  onClear: () => void
  isDrawing: boolean
  currentPointerPos: { x: number; y: number } | null
}

const COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Pink', value: '#ec4899' },
]

type MenuLevel = 'main' | 'erase' | 'shapes' | 'lines' | 'color' | 'pen'

export function FloatingToolMenu({
  currentTool,
  currentColor,
  currentLineWidth,
  onToolChange,
  onColorChange,
  onLineWidthChange,
  onClear,
  isDrawing,
  currentPointerPos,
}: FloatingToolMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeMenu, setActiveMenu] = useState<MenuLevel>('main')
  const [position, setPosition] = useState({ x: 20, y: 20 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-evasion logic
  useEffect(() => {
    if (isDrawing && currentPointerPos && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const widgetCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }

      const dx = currentPointerPos.x - widgetCenter.x
      const dy = currentPointerPos.y - widgetCenter.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      const evasionRadius = 150

      if (distance < evasionRadius) {
        const parent = containerRef.current.parentElement
        if (parent) {
          const parentRect = parent.getBoundingClientRect()
          const relX = currentPointerPos.x - parentRect.left
          const relY = currentPointerPos.y - parentRect.top

          const newX = relX > parentRect.width / 2 ? 20 : parentRect.width - 100
          const newY = relY > parentRect.height / 2 ? 20 : parentRect.height - 100

          setPosition({ x: newX, y: newY })
        } else {
          const newX = currentPointerPos.x > window.innerWidth / 2 ? 20 : window.innerWidth - 200
          const newY = currentPointerPos.y > window.innerHeight / 2 ? 20 : window.innerHeight - 200
          setPosition({ x: newX, y: newY })
        }

        if (isOpen) setIsOpen(false)
        setActiveMenu('main')
      }
    }
  }, [isDrawing, currentPointerPos, position, isOpen])

  // Boundary constraint when opened to prevent clipping
  useEffect(() => {
    if (isOpen && containerRef.current && containerRef.current.parentElement) {
      const parentRect = containerRef.current.parentElement.getBoundingClientRect()
      const safeMargin = 120

      let newX = position.x
      let newY = position.y

      // Add safe margins so the radial items (radius ~95) don't clip
      if (newX < safeMargin) newX = safeMargin
      if (newX > parentRect.width - safeMargin - 64) newX = parentRect.width - safeMargin - 64

      if (newY < safeMargin) newY = safeMargin
      if (newY > parentRect.height - safeMargin - 64) newY = parentRect.height - safeMargin - 64

      if (newX !== position.x || newY !== position.y) {
        setPosition({ x: newX, y: newY })
      }
    }
  }, [isOpen, position.x, position.y])

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setTimeout(() => setActiveMenu('main'), 200)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const getIcon = () => {
    switch (currentTool) {
      case 'pen':
        return <PenTool className="h-6 w-6" />
      case 'line':
        return <Minus className="h-6 w-6" />
      case 'arrow':
        return <ArrowUpRight className="h-6 w-6" />
      case 'rectangle':
        return <Square className="h-6 w-6" />
      case 'circle':
        return <Circle className="h-6 w-6" />
      case 'triangle':
        return <Triangle className="h-6 w-6" />
      case 'eraser':
        return <Eraser className="h-6 w-6" />
      case 'text':
        return <Type className="h-6 w-6" />
      case 'select':
        return <MousePointer2 className="h-6 w-6" />
      case 'formula':
        return <Sigma className="h-6 w-6" />
      case 'graph':
        return <TrendingUp className="h-6 w-6" />
      default:
        return <Pencil className="h-6 w-6" />
    }
  }

  const getMenuItems = () => {
    switch (activeMenu) {
      case 'erase':
        return [
          {
            icon: <div className="h-2 w-2 rounded-full bg-current" />,
            label: 'Small',
            action: () => {
              onToolChange('eraser')
              onLineWidthChange(10)
            },
            active: currentTool === 'eraser' && currentLineWidth === 10,
          },
          {
            icon: <div className="h-4 w-4 rounded-full bg-current" />,
            label: 'Medium',
            action: () => {
              onToolChange('eraser')
              onLineWidthChange(20)
            },
            active: currentTool === 'eraser' && currentLineWidth === 20,
          },
          {
            icon: <div className="h-6 w-6 rounded-full bg-current" />,
            label: 'Large',
            action: () => {
              onToolChange('eraser')
              onLineWidthChange(40)
            },
            active: currentTool === 'eraser' && currentLineWidth === 40,
          },
        ]
      case 'shapes':
        return [
          {
            icon: <Square className="h-5 w-5" />,
            label: 'Rectangle',
            action: () => onToolChange('rectangle'),
            active: currentTool === 'rectangle',
          },
          {
            icon: <Circle className="h-5 w-5" />,
            label: 'Circle',
            action: () => onToolChange('circle'),
            active: currentTool === 'circle',
          },
          {
            icon: <Triangle className="h-5 w-5" />,
            label: 'Triangle',
            action: () => onToolChange('triangle'),
            active: currentTool === 'triangle',
          },
        ]
      case 'lines':
        return [
          {
            icon: <Minus className="h-5 w-5" />,
            label: 'Line',
            action: () => onToolChange('line'),
            active: currentTool === 'line',
          },
          {
            icon: <ArrowUpRight className="h-5 w-5" />,
            label: 'Arrow',
            action: () => onToolChange('arrow'),
            active: currentTool === 'arrow',
          },
        ]
      case 'pen':
        return [
          {
            icon: <div className="h-1 w-1 rounded-full bg-current" />,
            label: 'Fine',
            action: () => {
              onToolChange('pen')
              onLineWidthChange(2)
            },
            active: currentTool === 'pen' && currentLineWidth === 2,
          },
          {
            icon: <div className="h-2 w-2 rounded-full bg-current" />,
            label: 'Normal',
            action: () => {
              onToolChange('pen')
              onLineWidthChange(4)
            },
            active: currentTool === 'pen' && currentLineWidth === 4,
          },
          {
            icon: <div className="h-4 w-4 rounded-full bg-current" />,
            label: 'Thick',
            action: () => {
              onToolChange('pen')
              onLineWidthChange(8)
            },
            active: currentTool === 'pen' && currentLineWidth === 8,
          },
        ]
      case 'color':
        return COLORS.map(c => ({
          icon: <div className="h-6 w-6 rounded-full" style={{ backgroundColor: c.value }} />,
          label: c.name,
          action: () => onColorChange(c.value),
          active: currentColor === c.value,
        }))
      case 'main':
      default:
        return [
          {
            icon: <Eraser className="h-5 w-5" />,
            label: 'Erase',
            action: () => setActiveMenu('erase'),
            active: currentTool === 'eraser',
          },
          {
            icon: <Trash2 className="h-5 w-5" />,
            label: 'Clear Board',
            action: () => {
              onClear()
              setIsOpen(false)
            },
            active: false,
            isDestructive: true,
          },
          {
            icon: <Square className="h-5 w-5" />,
            label: 'Shapes',
            action: () => setActiveMenu('shapes'),
            active: ['rectangle', 'circle', 'triangle'].includes(currentTool),
          },
          {
            icon: <Minus className="h-5 w-5" />,
            label: 'Lines',
            action: () => setActiveMenu('lines'),
            active: ['line', 'arrow'].includes(currentTool),
          },
          {
            icon: <Palette className="h-5 w-5" />,
            label: 'Colors',
            action: () => setActiveMenu('color'),
            active: false,
          },
          {
            icon: <Pencil className="h-5 w-5" />,
            label: 'Pen',
            action: () => setActiveMenu('pen'),
            active: currentTool === 'pen',
          },
          {
            icon: <Type className="h-5 w-5" />,
            label: 'Text',
            action: () => onToolChange('text'),
            active: currentTool === 'text',
          },
          {
            icon: <MousePointer2 className="h-5 w-5" />,
            label: 'Select',
            action: () => onToolChange('select'),
            active: currentTool === 'select',
          },
          {
            icon: <Sigma className="h-5 w-5" />,
            label: 'Formula',
            action: () => onToolChange('formula'),
            active: currentTool === 'formula',
          },
          {
            icon: <TrendingUp className="h-5 w-5" />,
            label: 'Graph',
            action: () => onToolChange('graph'),
            active: currentTool === 'graph',
          },
        ]
    }
  }

  const menuItems = getMenuItems()
  const radius = 95

  return (
    <motion.div
      ref={containerRef}
      className="pointer-events-auto absolute z-50"
      animate={{ x: position.x, y: position.y }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      drag
      dragMomentum={false}
      onDragEnd={(e, info) => {
        setPosition({
          x: position.x + info.offset.x,
          y: position.y + info.offset.y,
        })
      }}
      style={{ touchAction: 'none' }}
    >
      <div className="relative flex items-center justify-center">
        {/* Radial Menu */}
        <AnimatePresence>
          {isOpen && (
            <>
              {menuItems.map((item, index) => {
                const angle = (index * (Math.PI * 2)) / menuItems.length - Math.PI / 2
                const x = Math.cos(angle) * radius
                const y = Math.sin(angle) * radius

                return (
                  <motion.button
                    key={item.label}
                    initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                    animate={{ opacity: 1, x, y, scale: 1 }}
                    exit={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      damping: 20,
                      delay: index * 0.03,
                    }}
                    onClick={e => {
                      e.stopPropagation()
                      item.action()
                    }}
                    className={cn(
                      'absolute flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-colors',
                      item.active
                        ? 'border-2 border-blue-400 bg-blue-100 text-blue-600'
                        : item.isDestructive
                          ? 'bg-white text-rose-500 hover:bg-rose-50'
                          : 'bg-white text-slate-700 hover:bg-slate-50'
                    )}
                    title={item.label}
                  >
                    {item.icon}
                  </motion.button>
                )
              })}
            </>
          )}
        </AnimatePresence>

        {/* Main Center Button */}
        <motion.button
          onClick={() => {
            if (isOpen && activeMenu !== 'main') {
              setActiveMenu('main')
            } else {
              if (isOpen) {
                setTimeout(() => setActiveMenu('main'), 200)
              }
              setIsOpen(!isOpen)
            }
          }}
          className={cn(
            'relative z-10 flex h-16 w-16 items-center justify-center rounded-full shadow-[0_0_15px_rgba(0,0,0,0.15)] transition-colors',
            isOpen
              ? 'bg-slate-800 text-white hover:bg-[#1F2933] hover:outline hover:outline-1 hover:outline-white'
              : 'bg-white text-slate-800 hover:bg-slate-50',
            !isOpen &&
              currentColor !== '#000000' &&
              currentTool === 'pen' &&
              'border-4 border-solid'
          )}
          style={{
            borderColor:
              !isOpen && currentColor !== '#000000' && currentTool === 'pen'
                ? currentColor
                : undefined,
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {isOpen ? (
            activeMenu === 'main' ? (
              <X className="h-6 w-6" />
            ) : (
              <ChevronLeft className="h-6 w-6" />
            )
          ) : (
            getIcon()
          )}
        </motion.button>
      </div>
    </motion.div>
  )
}
