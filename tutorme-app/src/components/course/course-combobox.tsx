'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Search, X, BookOpen } from 'lucide-react'

export interface CourseOption {
  id: string
  name: string
  /** Whether the course is published. When `undefined`, no badge is shown
   *  (e.g. student-facing lists where every option is already published). */
  isPublished?: boolean
}

/**
 * A compact, searchable single-select for courses that stays out of the way — a
 * trigger button that opens a small popover with a search box and a scrollable
 * list, instead of a wall of course cards. When `isPublished` is provided each
 * option shows an unambiguous Published/Draft badge. Reusable across the group-
 * session setup and the 1-on-1 signup flows.
 */
export function CourseCombobox({
  options,
  value,
  onChange,
  placeholder = 'Select a course…',
  loading = false,
  allowClear = true,
  disabled = false,
}: {
  options: CourseOption[]
  value: string | null
  onChange: (id: string | null) => void
  placeholder?: string
  loading?: boolean
  allowClear?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(() => options.find(o => o.id === value) ?? null, [options, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter(o => o.name.toLowerCase().includes(q)) : options
  }, [options, query])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const badge = (isPublished?: boolean) =>
    isPublished === undefined ? null : (
      <span
        className={
          'ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ' +
          (isPublished ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')
        }
      >
        {isPublished ? 'Published' : 'Draft'}
      </span>
    )

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-900 hover:border-gray-300 focus:border-[#F17623] focus:outline-none disabled:opacity-60"
      >
        <BookOpen className="h-4 w-4 shrink-0 text-gray-400" />
        {selected ? (
          <>
            <span className="min-w-0 flex-1 truncate">{selected.name}</span>
            {badge(selected.isPublished)}
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-gray-400">{placeholder}</span>
        )}
        {allowClear && selected ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear course"
            onClick={e => {
              e.stopPropagation()
              onChange(null)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                onChange(null)
              }
            }}
            className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        )}
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
          <div className="relative border-b p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search courses…"
              className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-[#F17623] focus:outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto p-1">
            {loading ? (
              <li className="px-3 py-6 text-center text-xs text-gray-400">Loading courses…</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-gray-400">
                {options.length === 0 ? 'No courses yet.' : `No courses match “${query}”.`}
              </li>
            ) : (
              filtered.map(o => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.id)
                      setOpen(false)
                      setQuery('')
                    }}
                    className={
                      'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-gray-50 ' +
                      (o.id === value ? 'bg-gray-50 font-medium text-gray-900' : 'text-gray-700')
                    }
                  >
                    {o.id === value ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-[#F17623]" />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                    {badge(o.isPublished)}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
