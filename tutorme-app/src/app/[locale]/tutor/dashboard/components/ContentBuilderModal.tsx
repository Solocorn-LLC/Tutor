'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BookOpen } from 'lucide-react'
import type { Content, BuilderModalProps } from './builder-types'
import { ResourceImportPanel } from './builder-components'
import { DEFAULT_CONTENT } from './builder-utils'

export function ContentBuilderModal({ isOpen, onClose, onSave, initialData }: BuilderModalProps) {
  const [data, setData] = useState<Content>(initialData || DEFAULT_CONTENT(0))

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-500" />
            Content Builder
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Content Title *</Label>
            <Input
              value={data.title}
              onChange={(e: any) => setData({ ...data, title: e.target.value })}
              placeholder="e.g., Lesson 1"
            />
          </div>
          <div className="space-y-2">
            <Label>Content Type</Label>
            <Select
              value={data.type}
              onValueChange={(value: Content['type']) => setData({ ...data, type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text / Article</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="audio">Audio</SelectItem>
                <SelectItem value="interactive">Interactive</SelectItem>
                <SelectItem value="embed">Embed (iframe)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {data.type === 'text' && (
            <>
              <ResourceImportPanel data={data} setData={setData} targetField="body" />
              <div className="space-y-2">
                <Label>Content Body</Label>
                <Textarea
                  value={data.body || ''}
                  onChange={(e: any) => setData({ ...data, body: e.target.value })}
                  placeholder="Enter your lesson content here..."
                  rows={10}
                />
              </div>
            </>
          )}
          {data.type !== 'text' && (
            <div className="space-y-2">
              <Label>URL / Embed Code</Label>
              <Input
                value={data.url || ''}
                onChange={(e: any) => setData({ ...data, url: e.target.value })}
                placeholder={data.type === 'embed' ? 'Paste iframe or embed code' : 'https://...'}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Duration (minutes, optional)</Label>
            <Input
              type="number"
              value={data.duration || ''}
              onChange={(e: any) =>
                setData({ ...data, duration: parseInt(e.target.value) || undefined })
              }
              placeholder="e.g., 15"
            />
          </div>
          <div className="space-y-2">
            <Label>Order</Label>
            <Input
              type="number"
              value={data.order}
              onChange={(e: any) => setData({ ...data, order: parseInt(e.target.value) || 0 })}
              min={0}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(data)} disabled={!data.title.trim()}>
            Save Content
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
