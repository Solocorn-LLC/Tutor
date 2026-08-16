'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Plus, ChevronLeft, ChevronRight, X, Grid3X3 } from 'lucide-react'

export interface SlidePageMenuPage {
  id: string
  name: string
}

interface SlidePageMenuProps {
  pages: SlidePageMenuPage[]
  currentPageIndex: number
  onPageChange: (index: number) => void
  onAddPage: () => void
  onDeletePage: (index: number) => void
  readOnly?: boolean
  className?: string
}

/**
 * Bottom pagination menu for slide-based builders (task/assessment pages).
 * Based on the whiteboard page menu. Shows up to 5 page pills at once; the pill
 * container scrolls horizontally when more pages exist.
 */
export function SlidePageMenu({
  pages,
  currentPageIndex,
  onPageChange,
  onAddPage,
  onDeletePage,
  readOnly,
  className,
}: SlidePageMenuProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const canGoBack = currentPageIndex > 0
  const canGoForward = currentPageIndex < pages.length - 1

  const scrollToPage = (index: number) => {
    const container = scrollRef.current
    if (!container) return
    const buttons = container.querySelectorAll('[data-page-index]')
    const target = buttons[index] as HTMLElement | undefined
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }

  // Auto-scroll the pagination strip so the active page (including a newly added page)
  // is always visible without manual arrow clicks.
  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    scrollToPage(currentPageIndex)
  }, [currentPageIndex, pages.length])

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-2xl border border-white/40 bg-white/70 p-1.5 shadow-2xl ring-1 ring-black/[0.05] backdrop-blur-xl',
        className
      )}
    >
      {!readOnly && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onAddPage}
            className="h-8 gap-1 rounded-xl text-slate-700 hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" /> New Page
          </Button>
          <div className="mx-1 h-6 w-px bg-slate-200" />
        </>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          const next = Math.max(0, currentPageIndex - 1)
          onPageChange(next)
          scrollToPage(next)
        }}
        disabled={!canGoBack}
        className="h-8 w-8 shrink-0 rounded-xl p-0 text-slate-700 hover:bg-slate-100 disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div
        ref={scrollRef}
        className="scrollbar-hide flex max-w-[520px] items-center gap-1 overflow-x-auto"
      >
        {pages.map((page, index) => (
          <button
            key={page.id}
            data-page-index={index}
            onClick={() => onPageChange(index)}
            className={cn(
              'flex items-center gap-1 whitespace-nowrap rounded-xl px-3 py-1.5 text-sm transition-all',
              index === currentPageIndex
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <Grid3X3 className="h-3 w-3" />
            <span className="max-w-[80px] truncate">{page.name}</span>
            {pages.length > 1 && index === currentPageIndex && !readOnly && (
              <X
                className="ml-1 h-3 w-3 rounded-full opacity-70 transition-colors hover:bg-white/20 hover:opacity-100"
                onClick={e => {
                  e.stopPropagation()
                  onDeletePage(index)
                }}
              />
            )}
          </button>
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          const next = Math.min(pages.length - 1, currentPageIndex + 1)
          onPageChange(next)
          scrollToPage(next)
        }}
        disabled={!canGoForward}
        className="h-8 w-8 shrink-0 rounded-xl p-0 text-slate-700 hover:bg-slate-100 disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
