'use client'

/**
 * AudioPlayer — render an audio track with native playback controls.
 *
 * Used by task slides, extensions, and anywhere else a stored audio track
 * should be playable.
 */

import { Headphones } from 'lucide-react'
import { resolveDocDisplayUrl, type DocSource } from '@/lib/storage/doc-url'

export interface AudioPlayerTrack {
  fileName?: string | null
  fileUrl?: string | null
  fileKey?: string | null
  mimeType?: string | null
}

interface AudioPlayerProps {
  track: AudioPlayerTrack | null | undefined
  className?: string
}

export function AudioPlayer({ track, className }: AudioPlayerProps) {
  if (!track) return null

  const url = resolveDocDisplayUrl(track as DocSource)
  if (!url) return null

  const name = track.fileName || 'Audio track'

  return (
    <div
      className={
        className ??
        'flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm'
      }
    >
      <Headphones className="h-5 w-5 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-700">{name}</p>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          controls
          preload="metadata"
          src={url}
          className="mt-1 h-8 w-full [&::-webkit-media-controls-panel]:bg-slate-50"
        />
      </div>
    </div>
  )
}
