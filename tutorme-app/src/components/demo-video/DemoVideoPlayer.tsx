'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn, resolvePublicUrl } from '@/lib/utils'
import { Play, SkipForward, Film } from 'lucide-react'

interface DemoVideo {
  contentId: string
  title: string | null
  url: string | undefined
  duration: number | null
}

interface DemoVideoPromptProps {
  video: DemoVideo
  onPlay: () => void
  onSkip: () => void
}

export function DemoVideoPrompt({ video, onPlay, onSkip }: DemoVideoPromptProps) {
  const title = video.title || 'Class video'

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-md" showCloseButton={false} theme="default">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <Film className="h-6 w-6 text-blue-600" />
          </div>
          <DialogTitle>Play class video?</DialogTitle>
          <DialogDescription>
            This demo class includes a video:{' '}
            <span className="font-medium text-slate-900">{title}</span>
            {video.duration && video.duration > 0 && (
              <span> ({Math.ceil(video.duration / 60)} min)</span>
            )}
            .
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button
            onClick={onPlay}
            className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-700"
          >
            <Play className="h-4 w-4" />
            Play class video
          </Button>
          <Button onClick={onSkip} variant="outline" className="w-full gap-2">
            <SkipForward className="h-4 w-4" />
            Skip and enter class
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface DemoVideoPlayerProps {
  video: DemoVideo
  onComplete: () => void
  onSkip: () => void
}

export function DemoVideoPlayer({ video, onComplete, onSkip }: DemoVideoPlayerProps) {
  const [playing, setPlaying] = useState(false)
  const url = resolvePublicUrl(video.url)

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
      <div className="w-full max-w-4xl">
        <div className="mb-3 flex items-center justify-between text-white">
          <h2 className="text-sm font-medium">{video.title || 'Demo class video'}</h2>
          <button onClick={onSkip} className="rounded px-3 py-1 text-xs hover:bg-white/10">
            Skip and enter class
          </button>
        </div>
        <div className="overflow-hidden rounded-xl bg-black shadow-2xl">
          {url ? (
            <video
              src={url}
              controls
              autoPlay
              className="max-h-[70vh] w-full"
              onPlay={() => setPlaying(true)}
              onEnded={onComplete}
              onError={() => onComplete()}
            />
          ) : (
            <div className="flex h-64 items-center justify-center text-white/70">
              Video URL not available.
            </div>
          )}
        </div>
        {!playing && url && (
          <div className="mt-4 text-center">
            <Button
              onClick={() => {
                const videoEl = document.querySelector('video')
                videoEl?.play()
              }}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
            >
              <Play className="h-4 w-4" />
              Play
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
