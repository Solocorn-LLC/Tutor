'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { CountryFlag } from '@/components/country-flag'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'

type CourseState = 'published' | 'unpublished' | 'creating'

interface CourseItem {
  id: string
  name: string
  nationality?: string
  variantCategory?: string
  isPublished?: boolean
  isVariant?: boolean
  categories?: string[]
  folder?: string | null
}

interface FolderItem {
  id: string
  name: string
}

interface CourseSelectorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  courses: CourseItem[]
  draftCourses: CourseItem[]
  currentCourseId?: string | null
  onSelectCourse: (courseId: string) => void
}

export function CourseSelectorDialog({
  open,
  onOpenChange,
  courses,
  draftCourses,
  currentCourseId,
  onSelectCourse,
}: CourseSelectorDialogProps) {
  const [tab, setTab] = useState<CourseState>('unpublished')
  const [selectedFolder, setSelectedFolder] = useState<string>('All')
  const [customFolders, setCustomFolders] = useState<FolderItem[]>([])
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [editingFolder, setEditingFolder] = useState<string | null>(null)
  const [editFolderName, setEditFolderName] = useState('')

  const courseCategories = useMemo(() => {
    const set = new Set<string>()
    for (const c of courses) {
      const cat = c.categories?.[0]
      if (cat) set.add(cat)
    }
    for (const c of draftCourses) {
      const cat = c.categories?.[0]
      if (cat) set.add(cat)
    }
    return Array.from(set).sort()
  }, [courses, draftCourses])

  const folders = useMemo(() => {
    const custom = customFolders.map(f => f.name)
    const all = new Set(['All', ...custom, ...courseCategories])
    return Array.from(all).sort((a, b) => {
      if (a === 'All') return -1
      if (b === 'All') return 1
      return a.localeCompare(b)
    })
  }, [customFolders, courseCategories])

  const coursesInTab = useMemo(() => {
    if (tab === 'creating') return draftCourses
    return courses.filter(c => (tab === 'published' ? c.isPublished : !c.isPublished))
  }, [tab, courses, draftCourses])

  const filteredCourses = useMemo(() => {
    if (selectedFolder === 'All') return coursesInTab
    return coursesInTab.filter(c => {
      if (c.folder === selectedFolder) return true
      const category = c.categories?.[0]
      return category === selectedFolder
    })
  }, [coursesInTab, selectedFolder])

  const loadFolders = async () => {
    if (!open) return
    setLoadingFolders(true)
    try {
      const res = await fetch('/api/tutor/course-folders', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load folders')
      const data = await res.json()
      setCustomFolders(data.folders || [])
    } catch (err) {
      console.error('Failed to load course folders:', err)
      toast.error('Failed to load folders')
    } finally {
      setLoadingFolders(false)
    }
  }

  useEffect(() => {
    loadFolders()
  }, [open])

  useEffect(() => {
    if (!folders.includes(selectedFolder)) {
      setSelectedFolder('All')
    }
  }, [folders, selectedFolder])

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim()
    if (!trimmed) return
    try {
      const res = await fetchWithCsrf('/api/tutor/course-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create folder')
      }
      const data = await res.json()
      setCustomFolders(prev => [...prev, data.folder])
      setNewFolderName('')
      setIsCreatingFolder(false)
      toast.success(`Folder "${trimmed}" created`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create folder')
    }
  }

  const handleRenameFolder = async (oldName: string) => {
    const trimmed = editFolderName.trim()
    if (!trimmed || trimmed === oldName) {
      setEditingFolder(null)
      return
    }
    const folder = customFolders.find(f => f.name === oldName)
    if (!folder) return
    try {
      const res = await fetchWithCsrf(`/api/tutor/course-folders/${folder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to rename folder')
      }
      setCustomFolders(prev => prev.map(f => (f.name === oldName ? { ...f, name: trimmed } : f)))
      if (selectedFolder === oldName) setSelectedFolder(trimmed)
      setEditingFolder(null)
      toast.success(`Folder renamed to "${trimmed}"`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to rename folder')
    }
  }

  const handleDeleteFolder = async (name: string) => {
    const folder = customFolders.find(f => f.name === name)
    if (!folder) return
    const inFolder = courses.filter(c => c.folder === name).length
    const msg =
      inFolder > 0
        ? `Are you sure? ${inFolder} course${inFolder > 1 ? 's' : ''} in this folder will become Uncategorized.`
        : 'Are you sure you want to delete this folder?'
    if (!confirm(msg)) return
    try {
      const res = await fetchWithCsrf(`/api/tutor/course-folders/${folder.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete folder')
      }
      setCustomFolders(prev => prev.filter(f => f.name !== name))
      if (selectedFolder === name) setSelectedFolder('All')
      toast.success(`Folder "${name}" deleted`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete folder')
    }
  }

  const handleAssignFolder = async (courseId: string, folderName: string | null) => {
    try {
      const res = await fetchWithCsrf(`/api/tutor/courses/${courseId}/folder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: folderName }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update folder')
      }
      toast.success('Folder updated')
    } catch (err: any) {
      toast.error(err.message || 'Failed to update folder')
    }
  }

  const handleSelect = (courseId: string) => {
    onSelectCourse(courseId)
    onOpenChange(false)
  }

  const folderCount = (folder: string) => {
    if (folder === 'All') return coursesInTab.length
    return coursesInTab.filter(c => {
      if (c.folder === folder) return true
      const category = c.categories?.[0]
      return category === folder
    }).length
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl rounded-2xl border-0 bg-gray-200/90 p-5 shadow-2xl backdrop-blur-sm">
        <div className="flex h-[520px] flex-col gap-4">
          {/* Header */}
          <div className="text-center">
            <h3 className="text-lg font-bold text-gray-900">Courses</h3>
            <p className="text-xs text-gray-500">Select a course to edit</p>
          </div>

          {/* Toolbar */}
          <div className="flex gap-4">
            <div className="w-64 shrink-0">
              {isCreatingFolder ? (
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    placeholder="Folder name..."
                    className="h-9 flex-1 rounded-full border-gray-300 bg-white text-sm shadow-sm"
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreateFolder()
                      if (e.key === 'Escape') {
                        setNewFolderName('')
                        setIsCreatingFolder(false)
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-9 rounded-full bg-emerald-500 px-3 text-white hover:bg-emerald-600"
                    onClick={handleCreateFolder}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 rounded-full p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    onClick={() => {
                      setNewFolderName('')
                      setIsCreatingFolder(false)
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1 rounded-full border-0 bg-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-white hover:text-emerald-600"
                  onClick={() => setIsCreatingFolder(true)}
                >
                  <Plus className="h-4 w-4" /> Folder
                </Button>
              )}
            </div>
            <div className="flex flex-1 justify-end">
              <Tabs value={tab} onValueChange={v => setTab(v as CourseState)}>
                <TabsList className="grid h-9 grid-cols-3 gap-1 rounded-full bg-white p-1 shadow-sm">
                  <TabsTrigger
                    value="published"
                    className="rounded-full text-xs font-medium data-[state=active]:bg-emerald-500 data-[state=active]:text-white"
                  >
                    Published
                  </TabsTrigger>
                  <TabsTrigger
                    value="unpublished"
                    className="rounded-full text-xs font-medium data-[state=active]:bg-emerald-500 data-[state=active]:text-white"
                  >
                    Unpublished
                  </TabsTrigger>
                  <TabsTrigger
                    value="creating"
                    className="rounded-full text-xs font-medium data-[state=active]:bg-emerald-500 data-[state=active]:text-white"
                  >
                    Creating
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-1 gap-4 overflow-hidden">
            {/* Folder list */}
            <div className="flex w-64 shrink-0 flex-col rounded-xl bg-white p-3 shadow-sm">
              <ScrollArea className="flex-1">
                <div className="space-y-1">
                  {loadingFolders ? (
                    <div className="py-4 text-center text-xs text-gray-500">Loading folders...</div>
                  ) : (
                    folders.map(folder => (
                      <div key={folder}>
                        {editingFolder === folder ? (
                          <div className="flex items-center gap-1 px-2 py-1.5">
                            <Input
                              autoFocus
                              className="h-7 flex-1 rounded-md border-gray-300 bg-white text-sm"
                              value={editFolderName}
                              onChange={e => setEditFolderName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleRenameFolder(folder)
                                if (e.key === 'Escape') {
                                  setEditingFolder(null)
                                  setEditFolderName('')
                                }
                              }}
                            />
                            <Button
                              size="icon"
                              className="h-7 w-7 rounded-md bg-emerald-500 text-white hover:bg-emerald-600"
                              onClick={() => handleRenameFolder(folder)}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              onClick={() => {
                                setEditingFolder(null)
                                setEditFolderName('')
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            className={cn(
                              'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                              selectedFolder === folder
                                ? 'bg-blue-50 font-medium text-blue-600'
                                : 'text-gray-600 hover:bg-gray-50'
                            )}
                            onClick={() => setSelectedFolder(folder)}
                          >
                            <span className="flex items-center gap-2">
                              {selectedFolder === folder ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                              <span
                                className={
                                  selectedFolder === folder ? 'text-blue-600' : 'text-gray-700'
                                }
                              >
                                {folder}
                              </span>
                            </span>
                            <span className="flex items-center gap-1">
                              {customFolders.some(f => f.name === folder) && (
                                <>
                                  <button
                                    className="rounded p-0.5 text-gray-600 hover:bg-gray-100 hover:text-gray-600"
                                    onClick={e => {
                                      e.stopPropagation()
                                      setEditingFolder(folder)
                                      setEditFolderName(folder)
                                    }}
                                    title="Rename folder"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    className="rounded p-0.5 text-gray-600 hover:bg-red-50 hover:text-red-500"
                                    onClick={e => {
                                      e.stopPropagation()
                                      handleDeleteFolder(folder)
                                    }}
                                    title="Delete folder"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </>
                              )}
                              <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                                {folderCount(folder)}
                              </span>
                            </span>
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Course list */}
            <div className="flex flex-1 flex-col rounded-xl bg-white p-4 shadow-sm">
              <ScrollArea className="flex-1">
                <div className="space-y-2">
                  {filteredCourses.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-600">
                      No courses in this folder.
                    </p>
                  ) : (
                    filteredCourses.map(course => {
                      const category = course.categories?.[0]
                      const isActive = course.id === currentCourseId
                      return (
                        <div
                          key={course.id}
                          className={cn(
                            'flex items-center justify-between rounded-xl px-4 py-3 transition-colors',
                            isActive
                              ? 'bg-emerald-500/70 ring-2 ring-emerald-500'
                              : 'bg-emerald-500/50 hover:bg-emerald-500/60'
                          )}
                        >
                          <div className="mr-3 flex flex-1 items-center gap-3 overflow-hidden">
                            <FolderOpen className="h-5 w-5 shrink-0 text-white" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">
                                {course.name}
                              </p>
                              <p className="text-[11px] text-white/80">
                                {category || 'Uncategorized'}
                                {course.nationality && course.nationality !== 'Global' && (
                                  <span className="ml-2 inline-flex items-center gap-1">
                                    <CountryFlag
                                      countryName={course.nationality}
                                      size="xs"
                                      showLabel
                                    />
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div
                            className="flex shrink-0 items-center gap-2"
                            onClick={e => e.stopPropagation()}
                          >
                            <select
                              className="h-7 rounded-md border border-gray-200 bg-white px-2 text-[11px] text-gray-600 outline-none focus-visible:border-blue-400"
                              value={course.folder || category || ''}
                              onChange={e => {
                                const value = e.target.value || null
                                handleAssignFolder(course.id, value)
                              }}
                            >
                              <option value="">Uncategorized</option>
                              {courseCategories.map(cat => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                              {customFolders.map(f => (
                                <option key={f.id} value={f.name}>
                                  {f.name}
                                </option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              className="h-7 gap-1 rounded-md bg-white px-3 text-xs font-semibold text-emerald-600 hover:bg-white/90"
                              onClick={() => handleSelect(course.id)}
                            >
                              <Edit3 className="h-3 w-3" />
                              Edit
                            </Button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
