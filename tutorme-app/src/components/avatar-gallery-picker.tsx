'use client'

import { useCallback, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Image as ImageIcon, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'

interface AvatarGalleryPickerProps {
  /** Currently selected avatar URL (controlled). */
  value: string | null
  /** Called with the chosen URL, or null when cleared. */
  onChange: (url: string | null) => void
  /** GET endpoint returning `{ avatars: {name,url}[] }` (default public list). */
  listUrl?: string
  /** Preview circle size in px. */
  size?: number
  /** Fallback initial/char when no avatar is selected. */
  fallbackText?: string
}

/**
 * Lightweight, purely client-side avatar gallery picker for flows without a
 * session yet (e.g. registration). It does not persist — the chosen URL is held
 * in the parent's state and submitted with the form. For logged-in editing use
 * AvatarUploader (which persists via an endpoint).
 */
export function AvatarGalleryPicker({
  value,
  onChange,
  listUrl = '/api/public/avatars',
  size = 72,
  fallbackText = '?',
}: AvatarGalleryPickerProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [avatars, setAvatars] = useState<{ name: string; url: string }[]>([])

  const openGallery = useCallback(async () => {
    setOpen(true)
    setLoading(true)
    try {
      const res = await fetch(listUrl, { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      setAvatars(Array.isArray(data?.avatars) ? data.avatars : [])
    } catch {
      setAvatars([])
      toast.error('Could not load avatars')
    } finally {
      setLoading(false)
    }
  }, [listUrl])

  return (
    <div className="flex items-center gap-4">
      <div
        className="flex items-center justify-center overflow-hidden rounded-full border-2 border-white bg-slate-100 shadow-sm"
        style={{ width: size, height: size }}
      >
        {value ? (
          <img src={value} alt="Selected avatar" className="h-full w-full object-cover" />
        ) : (
          <span className="text-lg font-semibold text-slate-400">{fallbackText}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => void openGallery()}>
          <ImageIcon className="mr-2 h-4 w-4" />
          Choose from gallery
        </Button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-gray-500 underline hover:text-gray-700"
          >
            Remove
          </button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Choose an avatar</DialogTitle>
          </DialogHeader>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            </div>
          ) : avatars.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/70">No avatars available yet.</p>
          ) : (
            <div className="grid max-h-[60vh] grid-cols-4 gap-3 overflow-y-auto p-1 sm:grid-cols-5">
              {avatars.map(a => {
                const selected = value === a.url
                return (
                  <button
                    key={a.url}
                    type="button"
                    onClick={() => {
                      onChange(a.url)
                      setOpen(false)
                    }}
                    className={`group relative aspect-square overflow-hidden rounded-full border-2 bg-white/5 transition-all hover:border-[#F97316] focus:border-[#F97316] focus:outline-none ${
                      selected ? 'border-[#F97316]' : 'border-white/15'
                    }`}
                    aria-label={`Select ${a.name}`}
                  >
                    <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                    {selected && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Check className="h-5 w-5 text-white" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
