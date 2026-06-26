'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RotateCcw, Pencil, Trash2, Image as ImageIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface AvatarUploaderProps {
  /** Current avatar URL (for display) */
  avatarUrl: string | null
  /** Called when upload succeeds with the new URL */
  onUploadSuccess: (url: string) => void
  /** Called when avatar is deleted */
  onDeleteSuccess?: () => void
  /** API endpoint to POST the cropped image to */
  uploadUrl: string
  /** API endpoint to DELETE the avatar */
  deleteUrl: string
  /** GET endpoint returning preset avatars `{ avatars: {name,url}[] }`. When set
   *  with `presetSelectUrl`, a "Choose from gallery" option is shown. */
  presetListUrl?: string
  /** POST endpoint that sets the avatar to a chosen preset (body `{ url }`). */
  presetSelectUrl?: string
  /** Size of the avatar preview circle */
  size?: number
  /** Whether to show the delete button */
  allowDelete?: boolean
  /** Text to show when no avatar is set (default: '?') */
  fallbackText?: string
}

const MAX_AVATAR_SIZE_BYTES = 10 * 1024 * 1024
const ACCEPTED_AVATAR_MIME = ['image/jpeg', 'image/png', 'image/webp']
const CROP_OUTPUT_SIZE = 512

function isAcceptedAvatarFile(file: File) {
  if (ACCEPTED_AVATAR_MIME.includes(file.type)) return true
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.webp')
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function AvatarUploader({
  avatarUrl,
  onUploadSuccess,
  onDeleteSuccess,
  uploadUrl,
  deleteUrl,
  presetListUrl,
  presetSelectUrl,
  size = 80,
  allowDelete = true,
  fallbackText = '?',
}: AvatarUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // Preset gallery state
  const presetsEnabled = !!presetListUrl && !!presetSelectUrl
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryLoading, setGalleryLoading] = useState(false)
  const [galleryAvatars, setGalleryAvatars] = useState<{ name: string; url: string }[]>([])
  const [selectingUrl, setSelectingUrl] = useState<string | null>(null)

  const openGallery = useCallback(async () => {
    if (!presetListUrl) return
    setGalleryOpen(true)
    setGalleryLoading(true)
    try {
      const res = await fetch(presetListUrl, { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      setGalleryAvatars(Array.isArray(data?.avatars) ? data.avatars : [])
    } catch {
      setGalleryAvatars([])
      toast.error('Could not load avatars')
    } finally {
      setGalleryLoading(false)
    }
  }, [presetListUrl])

  const selectPreset = useCallback(
    async (url: string) => {
      if (!presetSelectUrl) return
      setSelectingUrl(url)
      try {
        const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
        const csrfData = await csrfRes.json().catch(() => ({}))
        const csrfToken = csrfData?.token ?? null
        const res = await fetch(presetSelectUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({ url }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(data?.error || 'Failed to set avatar')
          return
        }
        const newUrl: string = data?.avatarUrl ?? url
        const fullUrl =
          newUrl.startsWith('/') && typeof window !== 'undefined'
            ? `${window.location.origin}${newUrl}`
            : newUrl
        onUploadSuccess(fullUrl)
        toast.success('Avatar updated')
        setGalleryOpen(false)
      } catch {
        toast.error('Failed to set avatar')
      } finally {
        setSelectingUrl(null)
      }
    },
    [presetSelectUrl, onUploadSuccess]
  )

  // Crop dialog state
  const [cropDialogOpen, setCropDialogOpen] = useState(false)
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null)
  const [cropSourceFile, setCropSourceFile] = useState<File | null>(null)
  const cropViewportRef = useRef<HTMLDivElement | null>(null)
  const cropImageRef = useRef<HTMLImageElement | null>(null)
  const cropDragRef = useRef<{
    active: boolean
    startX: number
    startY: number
    startOffsetX: number
    startOffsetY: number
  } | null>(null)
  const [cropImageSize, setCropImageSize] = useState<{ width: number; height: number } | null>(null)
  const [cropViewportSize, setCropViewportSize] = useState(0)
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 })
  const [cropZoom, setCropZoom] = useState(1)
  const [cropError, setCropError] = useState<string | null>(null)
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string | null>(null)
  const [cropping, setCropping] = useState(false)

  // Reset crop state when dialog closes
  const closeCropDialog = useCallback(() => {
    setCropDialogOpen(false)
    setCropping(false)
    setCropError(null)
    setCropZoom(1)
    setCropOffset({ x: 0, y: 0 })
    setCropViewportSize(0)
    cropImageRef.current = null
    setCropImageSize(null)
    setCropSourceUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setCropSourceFile(null)
    setCroppedPreviewUrl(null)
  }, [])

  // Load image into crop dialog
  useEffect(() => {
    if (!cropSourceUrl) {
      cropImageRef.current = null
      setCropImageSize(null)
      setCroppedPreviewUrl(null)
      return
    }

    let active = true
    const img = new Image()
    img.src = cropSourceUrl
    img.onload = () => {
      if (!active) return
      cropImageRef.current = img
      setCropImageSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      if (!active) return
      cropImageRef.current = null
      setCropImageSize(null)
      setCroppedPreviewUrl(null)
      setCropError('Invalid image file')
    }

    return () => {
      active = false
    }
  }, [cropSourceUrl])

  // Measure viewport size when dialog opens
  useEffect(() => {
    if (!cropDialogOpen) return
    const el = cropViewportRef.current
    if (!el) return

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width)
        if (w > 0) setCropViewportSize(w)
      }
    })
    ro.observe(el)

    // Initial measure
    const rect = el.getBoundingClientRect()
    if (rect.width > 0) setCropViewportSize(Math.round(rect.width))

    return () => ro.disconnect()
  }, [cropDialogOpen])

  // Compute max zoom so the crop area is never smaller than 256px
  const maxCropZoom = useMemo(() => {
    if (!cropImageSize || !cropViewportSize) return 1
    const baseScale = Math.max(
      cropViewportSize / cropImageSize.width,
      cropViewportSize / cropImageSize.height
    )
    const maxByMinCrop = cropViewportSize / (baseScale * 256)
    return Math.max(1, Number.isFinite(maxByMinCrop) ? maxByMinCrop : 1)
  }, [cropImageSize, cropViewportSize])

  // Clamp zoom when max changes
  useEffect(() => {
    setCropZoom(prev => clamp(prev, 1, maxCropZoom))
  }, [maxCropZoom])

  // Compute crop data from current zoom/offset
  const getCropData = useCallback(() => {
    if (!cropImageSize) return null

    // Measure on demand if ResizeObserver hasn't fired yet
    let viewportSize = cropViewportSize
    if (!viewportSize && cropViewportRef.current) {
      const rect = cropViewportRef.current.getBoundingClientRect()
      viewportSize = Math.round(rect.width)
      if (viewportSize > 0) setCropViewportSize(viewportSize)
    }
    if (!viewportSize) return null

    const baseScale = Math.max(
      viewportSize / cropImageSize.width,
      viewportSize / cropImageSize.height
    )
    const scale = baseScale * cropZoom
    const displayW = cropImageSize.width * scale
    const displayH = cropImageSize.height * scale

    const maxOffsetX = Math.max(0, (displayW - viewportSize) / 2)
    const maxOffsetY = Math.max(0, (displayH - viewportSize) / 2)
    const offsetX = clamp(cropOffset.x, -maxOffsetX, maxOffsetX)
    const offsetY = clamp(cropOffset.y, -maxOffsetY, maxOffsetY)

    const imgLeft = (viewportSize - displayW) / 2 + offsetX
    const imgTop = (viewportSize - displayH) / 2 + offsetY

    const side = viewportSize / scale
    const sx = Math.round(clamp(-imgLeft / scale, 0, cropImageSize.width - 1))
    const sy = Math.round(clamp(-imgTop / scale, 0, cropImageSize.height - 1))
    const maxSide = Math.min(cropImageSize.width - sx, cropImageSize.height - sy)

    return {
      x: sx,
      y: sy,
      width: Math.min(side, maxSide),
      height: Math.min(side, maxSide),
      originalWidth: cropImageSize.width,
      originalHeight: cropImageSize.height,
    }
  }, [cropImageSize, cropViewportSize, cropOffset, cropZoom])

  // Generate preview when crop params change
  useEffect(() => {
    if (!cropSourceUrl || !cropDialogOpen) return
    if (!cropImageSize || !cropViewportSize) return

    const canvas = document.createElement('canvas')
    canvas.width = CROP_OUTPUT_SIZE
    canvas.height = CROP_OUTPUT_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = cropImageRef.current
    if (!img) return

    const cropData = getCropData()
    if (!cropData) return

    ctx.drawImage(
      img,
      cropData.x,
      cropData.y,
      cropData.width,
      cropData.height,
      0,
      0,
      CROP_OUTPUT_SIZE,
      CROP_OUTPUT_SIZE
    )

    // Use PNG for broad compatibility; server will accept it
    const dataUrl = canvas.toDataURL('image/png')
    setCroppedPreviewUrl(dataUrl)
  }, [
    cropSourceUrl,
    cropDialogOpen,
    cropImageSize,
    cropViewportSize,
    cropOffset,
    cropZoom,
    getCropData,
  ])

  // Pointer drag handlers
  const handleCropPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (cropping || uploading) return
      const el = cropViewportRef.current
      if (!el) return
      el.setPointerCapture(e.pointerId)
      cropDragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        startOffsetX: cropOffset.x,
        startOffsetY: cropOffset.y,
      }
    },
    [cropping, uploading, cropOffset.x, cropOffset.y]
  )

  const handleCropPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = cropDragRef.current
    if (!drag?.active) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    setCropOffset({ x: drag.startOffsetX + dx, y: drag.startOffsetY + dy })
  }, [])

  const handleCropPointerUp = useCallback(() => {
    const drag = cropDragRef.current
    if (!drag?.active) return
    cropDragRef.current = null
  }, [])

  // File selection handler
  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!isAcceptedAvatarFile(file)) {
        toast.error('Accepted formats: JPG, PNG, WEBP only')
        return
      }
      if (file.size > MAX_AVATAR_SIZE_BYTES) {
        toast.error('Maximum size is 10 MB')
        return
      }

      if (cropSourceUrl) URL.revokeObjectURL(cropSourceUrl)
      setCroppedPreviewUrl(null)
      setCropDialogOpen(false)
      setCropError(null)
      setCropOffset({ x: 0, y: 0 })
      setCropZoom(1)
      const objectUrl = URL.createObjectURL(file)

      try {
        const img = new Image()
        img.src = objectUrl
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('Failed to load image'))
        })

        if (img.naturalWidth < 256 || img.naturalHeight < 256) {
          toast.error('Minimum dimensions: 256 × 256 px')
          URL.revokeObjectURL(objectUrl)
          return
        }

        cropImageRef.current = img
        setCropImageSize({ width: img.naturalWidth, height: img.naturalHeight })
        setCropSourceUrl(objectUrl)
        setCropSourceFile(file)
        setCropDialogOpen(true)
      } catch {
        toast.error('Invalid image file')
        URL.revokeObjectURL(objectUrl)
      }
    },
    [cropSourceUrl]
  )

  // Upload the cropped canvas
  const confirmCropAndUpload = useCallback(async () => {
    if (!cropSourceUrl || !cropSourceFile) return
    const cropData = getCropData()
    if (!cropData) {
      toast.error('Failed to calculate crop')
      return
    }
    if (cropData.width < 256 || cropData.height < 256) {
      toast.error('Crop is too small (min 256×256)')
      return
    }

    setCropping(true)
    try {
      // Generate cropped blob from canvas
      const canvas = document.createElement('canvas')
      canvas.width = CROP_OUTPUT_SIZE
      canvas.height = CROP_OUTPUT_SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx || !cropImageRef.current) {
        toast.error('Failed to process image')
        return
      }

      ctx.drawImage(
        cropImageRef.current,
        cropData.x,
        cropData.y,
        cropData.width,
        cropData.height,
        0,
        0,
        CROP_OUTPUT_SIZE,
        CROP_OUTPUT_SIZE
      )

      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/png', 0.95)
      })
      if (!blob) {
        toast.error('Failed to process image')
        return
      }

      const croppedFile = new File([blob], 'avatar.png', { type: 'image/png' })

      // Upload
      setUploading(true)
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const formData = new FormData()
      formData.set('avatar', croppedFile)

      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
        body: formData,
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Failed to upload photo')
        return
      }

      const newUrl = data?.avatarUrl ?? data?.url ?? null
      if (!newUrl || typeof newUrl !== 'string') {
        toast.error('Upload succeeded but no photo URL was returned. Please try again.')
        return
      }

      const fullUrl =
        newUrl.startsWith('/') && typeof window !== 'undefined'
          ? `${window.location.origin}${newUrl}`
          : newUrl

      onUploadSuccess(fullUrl)
      toast.success('Profile photo updated')
    } catch (err) {
      console.error('Upload error:', err)
      toast.error('Failed to upload photo')
    } finally {
      setCropping(false)
      setUploading(false)
      closeCropDialog()
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [cropSourceUrl, cropSourceFile, getCropData, uploadUrl, onUploadSuccess, closeCropDialog])

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!confirm('Are you sure you want to delete your profile photo?')) return
    setUploading(true)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      const res = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Failed to delete photo')
        return
      }
      onDeleteSuccess?.()
      toast.success('Profile photo deleted')
    } catch {
      toast.error('Failed to delete photo')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [deleteUrl, onDeleteSuccess])

  return (
    <>
      <div className="relative inline-block">
        <div
          className="flex items-center justify-center overflow-hidden rounded-xl border-2 border-white bg-slate-100 shadow-sm"
          style={{ width: size, height: size }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Avatar"
              className="h-full w-full object-cover"
              onError={e => {
                console.error('Avatar failed to load:', avatarUrl)
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="text-lg font-semibold text-slate-400">{fallbackText}</div>
          )}
        </div>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={uploading}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-700 shadow hover:bg-slate-50 disabled:opacity-50"
              aria-label="Edit profile photo"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-44 border-white/10 bg-[#1F2933] p-1.5 text-white shadow-lg"
          >
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                fileInputRef.current?.click()
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-white/10"
            >
              <Pencil className="h-4 w-4" />
              Change photo
            </button>
            {presetsEnabled && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  void openGallery()
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-white/10"
              >
                <ImageIcon className="h-4 w-4" />
                Choose from gallery
              </button>
            )}
            {allowDelete && avatarUrl && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  void handleDelete()
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-red-400 transition-colors hover:bg-white/10"
              >
                <Trash2 className="h-4 w-4" />
                Delete photo
              </button>
            )}
          </PopoverContent>
        </Popover>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) void handleFileSelect(file)
          }}
          className="hidden"
        />
      </div>

      {/* Preset gallery dialog */}
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Choose an avatar</DialogTitle>
          </DialogHeader>
          {galleryLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            </div>
          ) : galleryAvatars.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/70">No avatars available yet.</p>
          ) : (
            <div className="grid max-h-[60vh] grid-cols-4 gap-3 overflow-y-auto p-1 sm:grid-cols-5">
              {galleryAvatars.map(a => {
                const isSelecting = selectingUrl === a.url
                return (
                  <button
                    key={a.url}
                    type="button"
                    disabled={selectingUrl !== null}
                    onClick={() => void selectPreset(a.url)}
                    className="group relative aspect-square overflow-hidden rounded-full border-2 border-white/15 bg-white/5 transition-all hover:border-[#1D4ED8] focus:border-[#1D4ED8] focus:outline-none disabled:opacity-60"
                    aria-label={`Select ${a.name}`}
                  >
                    <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                    {isSelecting && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Crop Dialog */}
      <Dialog
        open={cropDialogOpen}
        onOpenChange={open => {
          if (!open) closeCropDialog()
          setCropDialogOpen(open)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Crop Profile Photo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {cropError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {cropError}
              </div>
            ) : null}

            {cropSourceUrl ? (
              <div
                ref={cropViewportRef}
                className="relative mx-auto w-full max-w-[360px] touch-none select-none overflow-hidden rounded-xl border border-[#E2E8F0] bg-white"
                style={{ aspectRatio: '1 / 1' }}
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
                onPointerCancel={handleCropPointerUp}
              >
                <img
                  src={cropSourceUrl}
                  alt="Avatar crop"
                  className="absolute left-1/2 top-1/2 max-w-none select-none"
                  draggable={false}
                  style={{
                    transform: `translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${
                      cropImageSize && cropViewportSize
                        ? cropZoom *
                          Math.max(
                            cropViewportSize / cropImageSize.width,
                            cropViewportSize / cropImageSize.height
                          )
                        : 1
                    })`,
                  }}
                />
                <div className="pointer-events-none absolute inset-0 ring-2 ring-[#1D4ED8]/70" />
              </div>
            ) : null}

            {cropSourceUrl ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">Zoom</div>
                  <Button
                    type="button"
                    variant="modal-secondary-dark"
                    size="sm"
                    className="h-8 gap-2"
                    onClick={() => {
                      setCropError(null)
                      setCropZoom(1)
                      setCropOffset({ x: 0, y: 0 })
                    }}
                    disabled={cropping || uploading}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </Button>
                </div>
                <Slider
                  min={1}
                  max={maxCropZoom}
                  step={0.01}
                  value={[cropZoom]}
                  onValueChange={v => setCropZoom(v[0] ?? 1)}
                  disabled={cropping || uploading}
                />
              </div>
            ) : null}

            {croppedPreviewUrl ? (
              <div className="flex items-center gap-4">
                <div className="text-sm font-medium text-white">Preview (256×256)</div>
                <img
                  src={croppedPreviewUrl}
                  alt="Cropped avatar preview"
                  className="h-20 w-20 rounded-lg border border-white/20 object-cover"
                />
              </div>
            ) : null}
            <p className="text-xs text-white/80">
              Drag to position. Crop is locked to 1:1 and will upload exactly as previewed.
            </p>
          </div>
          <DialogFooter className="gap-3">
            <Button
              type="button"
              variant="modal-secondary-dark"
              onClick={closeCropDialog}
              disabled={cropping || uploading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="modal-primary-dark"
              onClick={() => void confirmCropAndUpload()}
              disabled={
                cropping || uploading || !cropSourceUrl || !cropSourceFile || !cropImageSize
              }
            >
              {cropping ? 'Processing…' : 'Crop & Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
