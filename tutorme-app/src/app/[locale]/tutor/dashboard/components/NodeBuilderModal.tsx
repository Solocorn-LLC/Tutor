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
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { Switch } from '@/components/ui/switch'
import { Layers } from 'lucide-react'

interface NodeBuilderModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: any) => void
  initialData?: any
}

export function NodeBuilderModal({ isOpen, onClose, onSave, initialData }: NodeBuilderModalProps) {
  const [data, setData] = useState(
    initialData || { title: '', description: '', isPublished: false }
  )

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-500" />
            Module Builder
          </DialogTitle>
        </DialogHeader>
        <div className="pt-4">
          <div className="space-y-4 rounded-[14px] border border-[rgba(226,232,240,0.9)] bg-white p-6 text-[#1F2933] shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
            <div className="space-y-2">
              <Label>Lesson Title *</Label>
              <Input
                value={data.title}
                onChange={(e: any) => setData({ ...data, title: e.target.value })}
                placeholder="Enter node title"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <AutoTextarea
                value={data.description}
                onChange={(e: any) => setData({ ...data, description: e.target.value })}
                placeholder="What will students learn in this node?"
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={data.isPublished}
                onCheckedChange={checked => setData({ ...data, isPublished: checked })}
              />
              <Label>Publish (visible to students)</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(data)}>Save Lesson</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
