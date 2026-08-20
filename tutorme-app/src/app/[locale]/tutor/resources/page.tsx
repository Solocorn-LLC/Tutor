'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  FolderOpen,
  Plus,
  Search,
  FileText,
  Image,
  FileSpreadsheet,
  MoreVertical,
  Download,
  Trash2,
  Loader2,
  X,
  Video,
  File,
  Tag,
  Share2,
  Users,
  Lock,
  Globe,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

interface Resource {
  id: string
  name: string
  description: string | null
  type: 'document' | 'image' | 'spreadsheet' | 'video' | 'other'
  size: number
  mimeType: string | null
  url: string
  tags: string[]
  downloadCount: number
  createdAt: string
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function getResourceIcon(type: string) {
  switch (type) {
    case 'document':
      return <FileText className="h-8 w-8 text-blue-500" />
    case 'image':
      return <Image className="h-8 w-8 text-green-500" />
    case 'spreadsheet':
      return <FileSpreadsheet className="h-8 w-8 text-orange-500" />
    case 'video':
      return <Video className="h-8 w-8 text-red-500" />
    default:
      return <File className="h-8 w-8 text-gray-500" />
  }
}

export default function TutorResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadForm, setUploadForm] = useState({
    name: '',
    description: '',
    tags: '',
    isPublic: false,
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [sharingResource, setSharingResource] = useState<Resource | null>(null)
  const [shareMode, setShareMode] = useState<'all' | 'specific'>('all')
  const [shareMessage, setShareMessage] = useState('')
  const [sharing, setSharing] = useState(false)

  // Fetch resources on mount
  useEffect(() => {
    fetchResources()
  }, [])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchResources()
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchResources = async () => {
    try {
      const queryParams = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ''
      const res = await fetch(`/api/tutor/resources${queryParams}`, {
        credentials: 'include',
      })

      if (res.ok) {
        const data = await res.json()
        setResources(data.resources || [])
      } else {
        toast.error('Failed to load resources')
      }
    } catch {
      toast.error('Failed to load resources')
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setUploadForm(prev => ({
        ...prev,
        name: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
      }))
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file')
      return
    }

    setUploading(true)
    try {
      // Step 1: Get presigned upload URL (or proxy URL)
      const urlRes = await fetch(
        `/api/tutor/resources/upload-url?filename=${encodeURIComponent(selectedFile.name)}&mimeType=${encodeURIComponent(selectedFile.type)}&size=${selectedFile.size}&isPublic=${uploadForm.isPublic}`,
        { credentials: 'include' }
      )

      if (!urlRes.ok) throw new Error('Failed to get upload URL')

      const { uploadUrl, key, type, publicUrl, uploadHeaders, usePresigned } = await urlRes.json()

      let finalUrl: string

      if (usePresigned) {
        // Step 2a: PUT directly to GCS presigned URL
        const gcsRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: selectedFile,
          headers: {
            'Content-Type': selectedFile.type,
            ...(uploadHeaders || {}),
          },
        })
        if (!gcsRes.ok) throw new Error('GCS upload failed')
        finalUrl = publicUrl || uploadUrl.split('?')[0] // strip signing params
      } else {
        // Step 2b: Proxy upload through Next.js API
        const formData = new FormData()
        formData.append('file', selectedFile)
        const proxyRes = await fetch('/api/tutor/resources/upload-proxy', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        })
        if (!proxyRes.ok) throw new Error('Proxy upload failed')
        const proxyData = await proxyRes.json()
        finalUrl = proxyData.url
      }

      // Step 3: Create resource record
      const createRes = await fetch('/api/tutor/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: uploadForm.name || selectedFile.name,
          description: uploadForm.description,
          type,
          size: selectedFile.size,
          mimeType: selectedFile.type,
          url: finalUrl,
          key,
          tags: uploadForm.tags
            .split(',')
            .map(t => t.trim())
            .filter(Boolean),
          isPublic: uploadForm.isPublic,
        }),
      })

      if (createRes.ok) {
        const { resource } = await createRes.json()
        setResources(prev => [resource, ...prev])
        toast.success('Resource uploaded successfully')
        setUploadDialogOpen(false)
        setSelectedFile(null)
        setUploadForm({ name: '', description: '', tags: '', isPublic: false })
      } else {
        throw new Error('Failed to create resource')
      }
    } catch (error) {
      console.error('[upload]', error)
      toast.error('Failed to upload resource')
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (resource: Resource) => {
    try {
      const res = await fetch(`/api/tutor/resources/${resource.id}/download`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error()
      const { downloadUrl } = await res.json()
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = resource.name
      link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('Download started')
    } catch {
      toast.error('Failed to download resource')
    }
  }

  const handleDelete = async (resourceId: string) => {
    if (!confirm('Are you sure you want to delete this resource?')) return

    try {
      const res = await fetch(`/api/tutor/resources/${resourceId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (res.ok) {
        setResources(prev => prev.filter(r => r.id !== resourceId))
        toast.success('Resource deleted')
      } else {
        throw new Error('Failed to delete')
      }
    } catch {
      toast.error('Failed to delete resource')
    }
  }

  const handleShare = async (resource: Resource) => {
    setSharingResource(resource)
    setShareMode('all')
    setShareMessage('')
    setShareDialogOpen(true)
  }

  const submitShare = async () => {
    if (!sharingResource) return
    setSharing(true)
    try {
      const res = await fetch(`/api/tutor/resources/${sharingResource.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sharedWithAll: shareMode === 'all',
          message: shareMessage || null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Resource shared successfully')
      setShareDialogOpen(false)
    } catch {
      toast.error('Failed to share resource')
    } finally {
      setSharing(false)
    }
  }

  const filteredResources = resources

  return (
    <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <FolderOpen className="h-6 w-6" />
            Resources
          </h1>
          <p className="mt-1 text-gray-600">Manage your teaching materials and documents</p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Upload Resource
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search resources..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="mb-3 h-8 w-8 rounded bg-gray-200" />
                <div className="mb-2 h-4 w-3/4 rounded bg-gray-200" />
                <div className="h-3 w-1/2 rounded bg-gray-200" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredResources.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <h3 className="mb-2 text-lg font-medium text-gray-700">
              {searchQuery ? 'No resources found' : 'No resources yet'}
            </h3>
            <p className="mb-4 text-gray-500">
              {searchQuery
                ? 'Try adjusting your search'
                : 'Upload your first teaching resource to get started'}
            </p>
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Upload Resource
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredResources.map(resource => (
            <Card key={resource.id} className="transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  {getResourceIcon(resource.type)}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleDownload(resource)}>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleShare(resource)}>
                        <Share2 className="mr-2 h-4 w-4" />
                        Share with Students
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => handleDelete(resource.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <h3 className="mt-3 truncate font-medium" title={resource.name}>
                  {resource.name}
                </h3>
                {resource.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-gray-500">{resource.description}</p>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm text-gray-500">{formatFileSize(resource.size)}</p>
                  {resource.tags.length > 0 && (
                    <div className="flex gap-1">
                      {resource.tags.slice(0, 2).map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {resource.tags.length > 2 && (
                        <Badge variant="secondary" className="text-xs">
                          +{resource.tags.length - 2}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          <Card
            className="cursor-pointer border-dashed transition-shadow hover:shadow-md"
            onClick={() => setUploadDialogOpen(true)}
          >
            <CardContent className="flex h-full min-h-[160px] flex-col items-center justify-center p-4">
              <Plus className="mb-2 h-10 w-10 text-gray-400" />
              <p className="font-medium text-gray-500">Upload New</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              Share Resource
            </DialogTitle>
            <DialogDescription>
              Share &ldquo;{sharingResource?.name}&rdquo; with your students.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Share mode */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShareMode('all')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                  shareMode === 'all'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Users className="h-6 w-6 text-blue-500" />
                <span className="text-sm font-medium">All My Students</span>
                <span className="text-xs text-gray-500">All enrolled students</span>
              </button>
              <button
                onClick={() => setShareMode('specific')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                  shareMode === 'specific'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Lock className="h-6 w-6 text-purple-600" />
                <span className="text-sm font-medium">Specific Students</span>
                <span className="text-xs text-gray-500">Coming soon</span>
              </button>
            </div>

            {/* Optional message */}
            <div className="space-y-1">
              <Label htmlFor="shareMsg">Message (optional)</Label>
              <Textarea
                id="shareMsg"
                value={shareMessage}
                onChange={e => setShareMessage(e.target.value)}
                placeholder="Add a note for students..."
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitShare} disabled={sharing} className="gap-2">
              {sharing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Globe className="h-4 w-4" />
              )}
              {sharing ? 'Sharing...' : 'Share'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Resource</DialogTitle>
            <DialogDescription>
              Upload teaching materials, documents, or media files.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* File Selection */}
            <div className="space-y-2">
              <Label>File</Label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:bg-gray-50"
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-blue-500" />
                    <span className="font-medium">{selectedFile.name}</span>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        setSelectedFile(null)
                      }}
                      className="ml-2 text-red-500 hover:text-red-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Plus className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                    <p className="text-sm text-gray-500">Click to select a file</p>
                    <p className="mt-1 text-xs text-gray-400">Max size: 100MB</p>
                  </>
                )}
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={uploadForm.name}
                onChange={e => setUploadForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Resource name"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={uploadForm.description}
                onChange={e => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the resource"
                rows={2}
              />
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="tags">
                <Tag className="mr-1 inline h-4 w-4" />
                Tags (comma separated)
              </Label>
              <Input
                id="tags"
                value={uploadForm.tags}
                onChange={e => setUploadForm(prev => ({ ...prev, tags: e.target.value }))}
                placeholder="math, worksheet, grade-5"
              />
            </div>

            {/* Public Toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPublic"
                checked={uploadForm.isPublic}
                onChange={e => setUploadForm(prev => ({ ...prev, isPublic: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <Label htmlFor="isPublic" className="cursor-pointer text-sm">
                Make this resource public to students
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
