'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DemoVideoUploader } from './DemoVideoUploader'
import { DemoVideoRecorder } from './DemoVideoRecorder'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Film, Trash2, Upload, Video, X, Play, Clock } from 'lucide-react'

interface DemoVideo {
  contentId: string
  title: string | null
  url: string | undefined
  duration: number | null
  uploadStatus: string | null
  createdAt: string | null
}

interface DemoVideoManagerProps {
  sessionId: string
  defaultTab?: 'upload' | 'record'
}

export function DemoVideoManager({ sessionId, defaultTab = 'upload' }: DemoVideoManagerProps) {
  const [video, setVideo] = useState<DemoVideo | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [showPreview, setShowPreview] = useState(false)

  const handleTabChange = useCallback((value: string) => {
    if (value === 'upload' || value === 'record') {
      setActiveTab(value)
    }
  }, [])

  const fetchVideo = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tutor/classes/${sessionId}/demo-video`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to load demo video')
      }
      const data = await res.json()
      setVideo(data.video)
    } catch (err: any) {
      console.error('Failed to load demo video:', err)
      toast.error(err.message || 'Failed to load demo video')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    fetchVideo()
  }, [fetchVideo])

  const handleDelete = useCallback(async () => {
    if (!video) return
    if (
      !confirm(
        'Remove this demo video from the class? The uploaded file will remain in your assets.'
      )
    ) {
      return
    }
    try {
      const res = await fetch(`/api/tutor/classes/${sessionId}/demo-video`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to remove demo video')
      }
      toast.success('Demo video removed')
      setVideo(null)
      setActiveTab('upload')
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove demo video')
    }
  }, [video, sessionId])

  const formatDuration = (seconds: number | null) => {
    if (!seconds || seconds <= 0) return null
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <Card className="flex h-full flex-col border-slate-200 shadow-sm">
      <CardContent className="flex flex-1 flex-col p-4">
        {loading ? (
          <div className="py-6 text-center text-sm text-slate-500">Loading…</div>
        ) : video ? (
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex items-start gap-3 rounded-xl bg-blue-50 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white">
                <Film className="h-5 w-5 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {video.title || 'Demo video'}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge variant="secondary" className="text-xs font-normal">
                    {video.uploadStatus || 'ready'}
                  </Badge>
                  {video.duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(video.duration)}
                    </span>
                  )}
                  {video.createdAt && <span>{new Date(video.createdAt).toLocaleDateString()}</span>}
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1"
                  onClick={() => setShowPreview(true)}
                >
                  <Play className="h-3.5 w-3.5" />
                  Preview
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {showPreview && video.url && (
              <div className="relative overflow-hidden rounded-xl bg-black">
                <video
                  src={video.url}
                  controls
                  className="max-h-[300px] w-full"
                  onError={() => toast.error('Failed to load video preview')}
                />
                <button
                  onClick={() => setShowPreview(false)}
                  className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <Tabs
              value={activeTab}
              onValueChange={handleTabChange}
              className="flex flex-1 flex-col overflow-hidden"
            >
              <TabsList className="relative grid w-full grid-cols-2 gap-1 rounded-xl bg-slate-700 p-1">
                <div
                  className={cn(
                    'absolute bottom-1 top-1 rounded-lg bg-white shadow-sm transition-all duration-300 ease-out',
                    activeTab === 'upload'
                      ? 'left-1 w-[calc(50%-6px)]'
                      : 'left-[calc(50%+2px)] w-[calc(50%-6px)]'
                  )}
                />
                <TabsTrigger
                  value="upload"
                  className="relative z-10 gap-1 rounded-lg bg-transparent text-xs font-medium text-white/90 transition-colors hover:bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-slate-700 data-[state=inactive]:hover:bg-transparent"
                >
                  <Upload className="h-3.5 w-3.5" /> Replace
                </TabsTrigger>
                <TabsTrigger
                  value="record"
                  className="relative z-10 gap-1 rounded-lg bg-transparent text-xs font-medium text-white/90 transition-colors hover:bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-slate-700 data-[state=inactive]:hover:bg-transparent"
                >
                  <Video className="h-3.5 w-3.5" /> Record
                </TabsTrigger>
              </TabsList>
              <TabsContent value="upload" className="min-h-0 flex-1 overflow-y-auto pt-2">
                <DemoVideoUploader sessionId={sessionId} onUploaded={fetchVideo} />
              </TabsContent>
              <TabsContent value="record" className="min-h-0 flex-1 overflow-y-auto pt-2">
                <DemoVideoRecorder sessionId={sessionId} onUploaded={fetchVideo} />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <TabsList className="relative grid w-full grid-cols-2 gap-1 rounded-xl bg-slate-700 p-1">
              <div
                className={cn(
                  'absolute bottom-1 top-1 rounded-lg bg-white shadow-sm transition-all duration-300 ease-out',
                  activeTab === 'upload'
                    ? 'left-1 w-[calc(50%-6px)]'
                    : 'left-[calc(50%+2px)] w-[calc(50%-6px)]'
                )}
              />
              <TabsTrigger
                value="upload"
                className="relative z-10 gap-1 rounded-lg bg-transparent text-xs font-medium text-white/90 transition-colors hover:bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-slate-700 data-[state=inactive]:hover:bg-transparent"
              >
                <Upload className="h-3.5 w-3.5" /> Upload
              </TabsTrigger>
              <TabsTrigger
                value="record"
                className="relative z-10 gap-1 rounded-lg bg-transparent text-xs font-medium text-white/90 transition-colors hover:bg-transparent data-[state=active]:bg-transparent data-[state=active]:text-slate-700 data-[state=inactive]:hover:bg-transparent"
              >
                <Video className="h-3.5 w-3.5" /> Record
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="min-h-0 flex-1 overflow-y-auto pt-2">
              <DemoVideoUploader sessionId={sessionId} onUploaded={fetchVideo} />
            </TabsContent>
            <TabsContent value="record" className="min-h-0 flex-1 overflow-y-auto pt-2">
              <DemoVideoRecorder sessionId={sessionId} onUploaded={fetchVideo} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}
