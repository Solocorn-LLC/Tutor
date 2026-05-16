'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import type {
  CourseBuilderNode,
  Lesson,
  Task,
  Assessment,
  Content,
  CourseBuilderNodeQuiz,
} from '../builder-types'
import {
  DEFAULT_NODE,
  DEFAULT_LESSON,
  DEFAULT_TASK,
  DEFAULT_HOMEWORK,
  DEFAULT_CONTENT,
  DEFAULT_NODE_QUIZ,
  generateId as utilsGenerateId,
  normalizeCourseBuilderNodesForAssessments,
} from '../builder-utils'

const generateId = utilsGenerateId

function sanitizeBlobUrls(obj: unknown, path = ''): { sanitized: unknown; removedPaths: string[] } {
  const removedPaths: string[] = []
  if (typeof obj === 'string') {
    if (obj.startsWith('blob:')) {
      removedPaths.push(path || '<root>')
      return { sanitized: '', removedPaths }
    }
    return { sanitized: obj, removedPaths }
  }
  if (Array.isArray(obj)) {
    const sanitized: unknown[] = []
    obj.forEach((item, idx) => {
      const result = sanitizeBlobUrls(item, `${path}[${idx}]`)
      sanitized.push(result.sanitized)
      removedPaths.push(...result.removedPaths)
    })
    return { sanitized, removedPaths }
  }
  if (obj !== null && typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      const newPath = path ? `${path}.${key}` : key
      if (
        key === 'sourceDocument' &&
        value !== null &&
        typeof value === 'object' &&
        (value as Record<string, unknown>).fileUrl &&
        String((value as Record<string, unknown>).fileUrl).startsWith('blob:')
      ) {
        removedPaths.push(newPath)
        continue
      }
      const result = sanitizeBlobUrls(value, newPath)
      sanitized[key] = result.sanitized
      removedPaths.push(...result.removedPaths)
    }
    return { sanitized, removedPaths }
  }
  return { sanitized: obj, removedPaths }
}

export interface UseCourseBuilderStateOptions {
  initialLessons?: Lesson[]
  mainTab: 'live' | 'builder' | 'test-pci'
  isStudentView: boolean
  saveMode?: 'live' | 'draft'
  onSave?: (
    lessons: Lesson[],
    options?: {
      developmentMode: 'single' | 'multi'
      previewDifficulty: 'all' | 'beginner' | 'intermediate' | 'advanced'
      courseName?: string
      courseDescription?: string
      isAutoSave?: boolean
      isLive?: boolean
    }
  ) => void
  courseName?: string
  coursePropsModalName: string
  coursePropsModalDescription: string
  coursePropsModalIsLive: boolean
  devMode: 'single' | 'multi'
  previewDifficulty: 'all' | 'beginner' | 'intermediate' | 'advanced'
  moveToHomework?: (
    nodeId: string,
    lessonId: string,
    type: 'task' | 'assessment',
    item: Task | Assessment
  ) => void
  loadTaskIntoBuilder?: (task: Task, extId?: string | null) => void
  loadAssessmentIntoBuilder?: (assessment: Assessment) => void
  loadedAssessmentId: string | null
  setLoadedAssessmentId: (id: string | null) => void
  setMainBuilderTab: (tab: 'task' | 'assessment') => void
}

export function useCourseBuilderState(options: UseCourseBuilderStateOptions) {
  const {
    initialLessons,
    mainTab,
    isStudentView,
    saveMode,
    onSave,
    courseName,
    coursePropsModalName,
    coursePropsModalDescription,
    coursePropsModalIsLive,
    devMode,
    previewDifficulty,
    moveToHomework,
    loadTaskIntoBuilder,
    loadAssessmentIntoBuilder,
    loadedAssessmentId,
    setLoadedAssessmentId,
    setMainBuilderTab,
  } = options

  // ============================================
  // STATE
  // ============================================

  const resolvedInitialCourseBuilderNodes = useMemo(() => {
    const lessons = initialLessons || []
    const { sanitized: sanitizedLessons, removedPaths } = sanitizeBlobUrls(lessons, 'lessons')
    if (removedPaths.length > 0) {
      console.warn('[CourseBuilder] Removed blob URLs from loaded lessons:', removedPaths)
      toast.error(
        `Some attached documents were not properly saved (blob URLs detected in ${removedPaths.length} location${removedPaths.length === 1 ? '' : 's'}). Please re-upload them.`
      )
    }
    const safeLessons = Array.isArray(sanitizedLessons) ? sanitizedLessons : lessons
    return safeLessons.map((lesson: any, idx: number) => ({
      id: `node-${lesson.id || idx}`,
      title: lesson.title || `Lesson ${idx + 1}`,
      description: lesson.description || '',
      order: lesson.order || idx,
      isPublished: lesson.isPublished || false,
      difficultyMode: lesson.difficultyMode || 'all',
      variants: lesson.variants || {},
      lessons: [lesson],
      quizzes: [],
    }))
  }, [initialLessons])

  const initialCourseBuilderNodesKey = useMemo(() => {
    try {
      return JSON.stringify(resolvedInitialCourseBuilderNodes)
    } catch {
      return String(resolvedInitialCourseBuilderNodes?.length ?? 0)
    }
  }, [resolvedInitialCourseBuilderNodes])

  const lastInitialCourseBuilderNodesKeyRef = useRef<string | null>(null)

  const [builderNodes, setBuilderNodes] = useState<CourseBuilderNode[]>([])
  const [liveNodes, setLiveNodes] = useState<CourseBuilderNode[]>([])

  // Auto-initialization from props
  useMemo(() => {
    if (lastInitialCourseBuilderNodesKeyRef.current === initialCourseBuilderNodesKey) return
    lastInitialCourseBuilderNodesKeyRef.current = initialCourseBuilderNodesKey
    const normalized = normalizeCourseBuilderNodesForAssessments(resolvedInitialCourseBuilderNodes)
    setBuilderNodes(normalized)
    setLiveNodes(
      isStudentView || saveMode !== 'draft'
        ? (() => {
            if (typeof structuredClone === 'function') {
              return structuredClone(normalized)
            }
            return JSON.parse(JSON.stringify(normalized)) as CourseBuilderNode[]
          })()
        : []
    )
  }, [initialCourseBuilderNodesKey, resolvedInitialCourseBuilderNodes, isStudentView, saveMode])

  const cloneNodes = useCallback((value: CourseBuilderNode[]) => {
    if (typeof structuredClone === 'function') {
      return structuredClone(value)
    }
    return JSON.parse(JSON.stringify(value)) as CourseBuilderNode[]
  }, [])

  const nodes = useMemo(
    () => (mainTab === 'live' ? liveNodes : builderNodes),
    [mainTab, liveNodes, builderNodes]
  )

  const setCourseBuilderNodes = useCallback(
    (updater: React.SetStateAction<CourseBuilderNode[]>) => {
      if (mainTab === 'live') {
        setLiveNodes(updater)
      } else {
        setBuilderNodes(updater)
      }
    },
    [mainTab]
  )

  const [expandedCourseBuilderNodes, setExpandedCourseBuilderNodes] = useState<Set<string>>(
    new Set()
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<{ type: string; id: string } | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [collapsedTaskExtensions, setCollapsedTaskExtensions] = useState<Set<string>>(new Set())
  const [renamingItemId, setRenamingItemId] = useState<string | null>(null)

  const [activeModal, setActiveModal] = useState<{
    type: 'node' | 'lesson' | 'task' | 'homework' | 'nodeQuiz' | 'content'
    isOpen: boolean
    nodeId?: string
    lessonId?: string
    itemId?: string
  }>({ type: 'node', isOpen: false })

  const [editingData, setEditingData] = useState<any>(null)

  // Dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // ============================================
  // HELPERS
  // ============================================

  const toggleCourseBuilderNode = useCallback((nodeId: string) => {
    setExpandedCourseBuilderNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  const toggleSection = useCallback(
    (nodeId: string, section: 'task' | 'assessment' | 'homework') => {
      setCollapsedSections(prev => {
        const key = `${nodeId}:${section}`
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
    },
    []
  )

  const isSectionCollapsed = useCallback(
    (nodeId: string, section: 'task' | 'assessment' | 'homework') =>
      collapsedSections.has(`${nodeId}:${section}`),
    [collapsedSections]
  )

  const ensureSectionExpanded = useCallback(
    (nodeId: string, section: 'task' | 'assessment' | 'homework') => {
      setExpandedCourseBuilderNodes(prev => {
        const next = new Set(prev)
        next.add(nodeId)
        return next
      })
      setCollapsedSections(prev => {
        const next = new Set(prev)
        next.delete(`${nodeId}:${section}`)
        return next
      })
    },
    []
  )

  const toggleExtensions = useCallback((taskId: string) => {
    setCollapsedTaskExtensions(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }, [])

  const isExtensionsCollapsed = useCallback(
    (taskId: string) => collapsedTaskExtensions.has(taskId),
    [collapsedTaskExtensions]
  )

  const renumberCourseBuilderNodes = useCallback(
    (mods: CourseBuilderNode[]): CourseBuilderNode[] => {
      return mods.map((mod, idx) => ({
        ...mod,
        order: idx,
        title: mod.title.replace(/^Lesson \d+/, `Lesson ${idx + 1}`),
      }))
    },
    []
  )

  const getAllLessons = useCallback(() => {
    return nodes.flatMap(m => m.lessons)
  }, [nodes])

  const saveNodesIfPossible = useCallback(
    async (nextNodes: CourseBuilderNode[]) => {
      if (isStudentView) return
      if (!onSave) return
      if (!courseName && !coursePropsModalName) return

      await onSave(
        nextNodes.map(n => n.lessons[0] || ({} as any)),
        {
          developmentMode: devMode,
          previewDifficulty,
          courseName: coursePropsModalName || courseName,
          courseDescription: coursePropsModalDescription,
          isLive: coursePropsModalIsLive,
        }
      )
    },
    [
      isStudentView,
      onSave,
      courseName,
      coursePropsModalName,
      coursePropsModalDescription,
      coursePropsModalIsLive,
      devMode,
      previewDifficulty,
    ]
  )

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  const addCourseBuilderNode = useCallback(() => {
    const newOrder = nodes.length
    const newCourseBuilderNode = DEFAULT_NODE(newOrder)
    newCourseBuilderNode.title = `Lesson ${newOrder + 1}`
    newCourseBuilderNode.lessons[0].title = `Lesson ${newOrder + 1}`

    setCourseBuilderNodes(prev => [...prev, newCourseBuilderNode])
    setExpandedCourseBuilderNodes(prev => new Set(Array.from(prev).concat(newCourseBuilderNode.id)))
  }, [nodes.length, setCourseBuilderNodes])

  const addTask = useCallback(
    (nodeId: string, lessonId: string) => {
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      if (nodeIndex === -1) return
      let lessonIndex = nodes[nodeIndex].lessons.findIndex(l => l.id === lessonId)
      if (lessonIndex === -1) {
        const fallbackLesson = DEFAULT_LESSON(nodes[nodeIndex].lessons.length)
        const newCourseBuilderNodes = [...nodes]
        newCourseBuilderNodes[nodeIndex].lessons.push(fallbackLesson)
        setCourseBuilderNodes(newCourseBuilderNodes)
        lessonIndex = newCourseBuilderNodes[nodeIndex].lessons.length - 1
      }

      const isFirstTask = nodes[nodeIndex].lessons[lessonIndex].tasks.length === 0
      const newTask = DEFAULT_TASK(nodes[nodeIndex].lessons[lessonIndex].tasks.length)
      const newCourseBuilderNodes = [...nodes]
      newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks.push(newTask)
      setCourseBuilderNodes(newCourseBuilderNodes)
      if (isFirstTask) ensureSectionExpanded(nodeId, 'task')
      setEditingData(newTask)
      setActiveModal({ type: 'task', isOpen: true, nodeId, lessonId })
    },
    [nodes, setCourseBuilderNodes, ensureSectionExpanded]
  )

  const addContent = useCallback(
    (nodeId: string, lessonId: string) => {
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      if (nodeIndex === -1) return
      const lessonIndex = nodes[nodeIndex].lessons.findIndex(l => l.id === lessonId)
      if (lessonIndex === -1) return

      const newContent = DEFAULT_CONTENT(nodes[nodeIndex].lessons[lessonIndex].content?.length || 0)
      const newCourseBuilderNodes = [...nodes]
      if (!newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].content) {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].content = []
      }
      newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].content.push(newContent)
      setCourseBuilderNodes(newCourseBuilderNodes)
      setEditingData(newContent)
      setActiveModal({ type: 'content', isOpen: true, nodeId, lessonId })
    },
    [nodes, setCourseBuilderNodes]
  )

  const addAssessment = useCallback(
    (nodeId: string, lessonId: string) => {
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      if (nodeIndex === -1) return
      let lessonIndex = nodes[nodeIndex].lessons.findIndex(l => l.id === lessonId)
      if (lessonIndex === -1) {
        const fallbackLesson = DEFAULT_LESSON(nodes[nodeIndex].lessons.length)
        const newCourseBuilderNodes = [...nodes]
        newCourseBuilderNodes[nodeIndex].lessons.push(fallbackLesson)
        setCourseBuilderNodes(newCourseBuilderNodes)
        lessonIndex = newCourseBuilderNodes[nodeIndex].lessons.length - 1
      }

      const isFirstAssessment = nodes[nodeIndex].lessons[lessonIndex].homework.length === 0
      const newAssessment = DEFAULT_HOMEWORK(
        nodes[nodeIndex].lessons[lessonIndex].homework.length,
        'assessment'
      )
      const newCourseBuilderNodes = [...nodes]
      newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework.push(newAssessment)
      setCourseBuilderNodes(newCourseBuilderNodes)
      if (isFirstAssessment) ensureSectionExpanded(nodeId, 'assessment')
    },
    [nodes, setCourseBuilderNodes, ensureSectionExpanded]
  )

  const addCourseExam = useCallback(() => {
    const workingCourseBuilderNodes = nodes.length > 0 ? [...nodes] : [DEFAULT_NODE(0)]
    const lastCourseBuilderNodeIndex = workingCourseBuilderNodes.length - 1
    const lastCourseBuilderNode = workingCourseBuilderNodes[lastCourseBuilderNodeIndex]
    const newExam = {
      ...DEFAULT_NODE_QUIZ(lastCourseBuilderNode.quizzes.length),
      title: 'Final Exam',
      description: 'Comprehensive course-end assessment.',
    }
    workingCourseBuilderNodes[lastCourseBuilderNodeIndex] = {
      ...lastCourseBuilderNode,
      quizzes: [...(lastCourseBuilderNode.quizzes || []), newExam],
    }
    setCourseBuilderNodes(workingCourseBuilderNodes)
    setExpandedCourseBuilderNodes(
      prev =>
        new Set(Array.from(prev).concat(workingCourseBuilderNodes[lastCourseBuilderNodeIndex].id))
    )
    setEditingData(newExam)
    setActiveModal({
      type: 'nodeQuiz',
      isOpen: true,
      nodeId: workingCourseBuilderNodes[lastCourseBuilderNodeIndex].id,
    })
  }, [nodes, setCourseBuilderNodes])

  const ensureFirstLessonContext = useCallback(() => {
    let nextCourseBuilderNodes = [...nodes]
    if (nextCourseBuilderNodes.length === 0) {
      nextCourseBuilderNodes = [DEFAULT_NODE(0)]
    }
    if (nextCourseBuilderNodes[0].lessons.length === 0) {
      nextCourseBuilderNodes[0] = {
        ...nextCourseBuilderNodes[0],
        lessons: [DEFAULT_LESSON(0)],
      }
    }
    setCourseBuilderNodes(nextCourseBuilderNodes)
    setExpandedCourseBuilderNodes(
      prev => new Set(Array.from(prev).concat(nextCourseBuilderNodes[0].id))
    )
    return {
      nodeId: nextCourseBuilderNodes[0].id,
      lessonId: nextCourseBuilderNodes[0].lessons[0].id,
    }
  }, [nodes, setCourseBuilderNodes])

  const applyTemplate = useCallback(
    (template: { category: string; name: string }) => {
      if (template.category === 'lesson') {
        addCourseBuilderNode()
        return
      }
      const { nodeId, lessonId } = ensureFirstLessonContext()
      if (template.category === 'quiz') {
        addAssessment(nodeId, lessonId)
        return
      }
      if (template.category === 'assessment' || template.category === 'activity') {
        addTask(nodeId, lessonId)
        return
      }
    },
    [addCourseBuilderNode, ensureFirstLessonContext, addAssessment, addTask]
  )

  // Delete operations
  const deleteCourseBuilderNode = useCallback(
    async (nodeId: string) => {
      const nextNodes = nodes.filter(m => m.id !== nodeId)
      setCourseBuilderNodes(nextNodes)
      if (mainTab !== 'live') await saveNodesIfPossible(nextNodes)
    },
    [nodes, setCourseBuilderNodes, mainTab, saveNodesIfPossible]
  )

  const deleteLesson = useCallback(
    async (nodeId: string, lessonId: string) => {
      const nextNodes = nodes.map(m =>
        m.id === nodeId ? { ...m, lessons: m.lessons.filter(l => l.id !== lessonId) } : m
      )
      setCourseBuilderNodes(nextNodes)
      if (mainTab !== 'live') await saveNodesIfPossible(nextNodes)
    },
    [nodes, setCourseBuilderNodes, mainTab, saveNodesIfPossible]
  )

  const deleteTask = useCallback(
    async (nodeId: string, lessonId: string, taskId: string) => {
      const nextNodes = nodes.map(m =>
        m.id === nodeId
          ? {
              ...m,
              lessons: m.lessons.map(l =>
                l.id === lessonId
                  ? { ...l, tasks: (l.tasks || []).filter(t => t.id !== taskId) }
                  : l
              ),
            }
          : m
      )
      setCourseBuilderNodes(nextNodes)
      if (mainTab !== 'live') await saveNodesIfPossible(nextNodes)
      setSelectedItem(null)
    },
    [nodes, setCourseBuilderNodes, mainTab, saveNodesIfPossible]
  )

  const deleteAssessment = useCallback(
    async (nodeId: string, lessonId: string, hwId: string) => {
      const nextNodes = nodes.map(m =>
        m.id === nodeId
          ? {
              ...m,
              lessons: m.lessons.map(l =>
                l.id === lessonId
                  ? { ...l, homework: (l.homework || []).filter(h => h.id !== hwId) }
                  : l
              ),
            }
          : m
      )
      setCourseBuilderNodes(nextNodes)
      if (mainTab !== 'live') await saveNodesIfPossible(nextNodes)
      setSelectedItem(null)
    },
    [nodes, setCourseBuilderNodes, mainTab, saveNodesIfPossible]
  )

  const deleteCourseBuilderNodeQuiz = useCallback(
    async (nodeId: string, quizId: string) => {
      const nextNodes = nodes.map(m =>
        m.id === nodeId ? { ...m, quizzes: (m.quizzes || []).filter(q => q.id !== quizId) } : m
      )
      setCourseBuilderNodes(nextNodes)
      if (mainTab !== 'live') await saveNodesIfPossible(nextNodes)
      setSelectedItem(null)
    },
    [nodes, setCourseBuilderNodes, mainTab, saveNodesIfPossible]
  )

  // Duplicate operations
  const cloneTask = useCallback(
    (task: Task): Task => ({
      ...task,
      id: `task-${generateId()}`,
      extensions: (task.extensions || []).map(ext => ({
        ...ext,
        id: `ext-${generateId()}`,
      })),
    }),
    []
  )

  const cloneAssessment = useCallback(
    (assessment: Assessment): Assessment => ({
      ...assessment,
      id: `homework-${generateId()}`,
    }),
    []
  )

  const cloneLesson = useCallback(
    (lesson: Lesson, order: number): Lesson => ({
      ...lesson,
      id: `lesson-${generateId()}`,
      order,
      tasks: (lesson.tasks || []).map(cloneTask),
      homework: (lesson.homework || []).map(cloneAssessment),
    }),
    [cloneTask, cloneAssessment]
  )

  const duplicateTask = useCallback(
    (nodeId: string, lessonId: string, task: Task) => {
      const copy: Task = {
        ...task,
        id: `task-${generateId()}`,
        title: `${task.title} (copy)`,
        questions: task.questions?.map(q => ({ ...q, id: `q-${generateId()}` })),
      }
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      if (nodeIndex === -1) return
      const lessonIndex = nodes[nodeIndex].lessons.findIndex(l => l.id === lessonId)
      if (lessonIndex === -1) return
      const newCourseBuilderNodes = [...nodes]
      newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks = [
        ...(newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks || []),
        copy,
      ]
      setCourseBuilderNodes(newCourseBuilderNodes)
      setSelectedItem({ type: 'task', id: copy.id })
    },
    [nodes, setCourseBuilderNodes]
  )

  const duplicateAssessment = useCallback(
    (nodeId: string, lessonId: string, hw: Assessment) => {
      const copy: Assessment = {
        ...hw,
        id: `homework-${generateId()}`,
        title: `${hw.title} (copy)`,
        questions: hw.questions?.map(q => ({ ...q, id: `q-${generateId()}` })),
      }
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      if (nodeIndex === -1) return
      const lessonIndex = nodes[nodeIndex].lessons.findIndex(l => l.id === lessonId)
      if (lessonIndex === -1) return
      const newCourseBuilderNodes = [...nodes]
      newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework = [
        ...(newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework || []),
        copy,
      ]
      setCourseBuilderNodes(newCourseBuilderNodes)
      setSelectedItem({ type: 'homework', id: copy.id })
    },
    [nodes, setCourseBuilderNodes]
  )

  const duplicateCourseBuilderNodeQuiz = useCallback(
    (nodeId: string, quiz: CourseBuilderNodeQuiz) => {
      const copy: CourseBuilderNodeQuiz = {
        ...quiz,
        id: `quiz-${generateId()}`,
        title: `${quiz.title} (copy)`,
        questions: quiz.questions?.map(q => ({ ...q, id: `q-${generateId()}` })),
      }
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      if (nodeIndex === -1) return
      const newCourseBuilderNodes = [...nodes]
      newCourseBuilderNodes[nodeIndex].quizzes = [
        ...(newCourseBuilderNodes[nodeIndex].quizzes || []),
        copy,
      ]
      setCourseBuilderNodes(newCourseBuilderNodes)
      setSelectedItem({ type: 'nodeQuiz', id: copy.id })
    },
    [nodes, setCourseBuilderNodes]
  )

  const duplicateLesson = useCallback(
    (nodeId: string, lesson: Lesson) => {
      const copy: Lesson = {
        ...lesson,
        id: `lesson-${generateId()}`,
        title: `${lesson.title} (copy)`,
        tasks: lesson.tasks?.map(t => ({
          ...t,
          id: `task-${generateId()}`,
          questions: t.questions?.map(q => ({ ...q, id: `q-${generateId()}` })),
        })),
        homework: lesson.homework?.map(h => ({
          ...h,
          id: `homework-${generateId()}`,
          questions: h.questions?.map(q => ({ ...q, id: `q-${generateId()}` })),
        })),
      }
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      if (nodeIndex === -1) return
      const newCourseBuilderNodes = [...nodes]
      newCourseBuilderNodes[nodeIndex].lessons = [
        ...(newCourseBuilderNodes[nodeIndex].lessons || []),
        copy,
      ]
      setCourseBuilderNodes(newCourseBuilderNodes)
      setSelectedItem({ type: 'lesson', id: copy.id })
    },
    [nodes, setCourseBuilderNodes]
  )

  const duplicateCourseBuilderNode = useCallback(
    (node: CourseBuilderNode) => {
      const copy: CourseBuilderNode = {
        ...node,
        id: `node-${generateId()}`,
        title: `${node.title} (copy)`,
        lessons: node.lessons?.map(l => ({
          ...l,
          id: `lesson-${generateId()}`,
          tasks: l.tasks?.map(t => ({
            ...t,
            id: `task-${generateId()}`,
            questions: t.questions?.map(q => ({ ...q, id: `q-${generateId()}` })),
          })),
          homework: l.homework?.map(h => ({
            ...h,
            id: `homework-${generateId()}`,
            questions: h.questions?.map(q => ({ ...q, id: `q-${generateId()}` })),
          })),
        })),
        quizzes: node.quizzes?.map(q => ({
          ...q,
          id: `quiz-${generateId()}`,
          questions: q.questions?.map(qu => ({ ...qu, id: `q-${generateId()}` })),
        })),
      }
      setCourseBuilderNodes(prev => [...prev, copy])
      setSelectedItem({ type: 'node', id: copy.id })
    },
    [setCourseBuilderNodes]
  )

  // Save handlers
  const handleSaveCourseBuilderNode = useCallback(
    (data: any) => {
      if (activeModal.itemId) {
        setCourseBuilderNodes(prev =>
          prev.map(m => (m.id === activeModal.itemId ? { ...m, ...data } : m))
        )
      } else {
        setCourseBuilderNodes(prev =>
          prev.map(m => (m.id === editingData.id ? { ...m, ...data } : m))
        )
      }
      setActiveModal({ type: 'node', isOpen: false })
    },
    [activeModal, editingData, setCourseBuilderNodes]
  )

  const handleSaveLesson = useCallback(
    (data: any) => {
      const nodeIndex = nodes.findIndex(m => m.id === activeModal.nodeId)
      if (nodeIndex === -1) return

      const newCourseBuilderNodes = [...nodes]
      const lessonIndex = newCourseBuilderNodes[nodeIndex].lessons.findIndex(
        l => l.id === editingData.id
      )
      if (lessonIndex !== -1) {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex] = {
          ...newCourseBuilderNodes[nodeIndex].lessons[lessonIndex],
          ...data,
        }
      }
      setCourseBuilderNodes(newCourseBuilderNodes)
      setActiveModal({ type: 'lesson', isOpen: false })
    },
    [nodes, activeModal, editingData, setCourseBuilderNodes]
  )

  const handleSaveTask = useCallback(
    (data: any, targetCourseBuilderNodeId?: string, targetLessonId?: string) => {
      const nodeId = targetCourseBuilderNodeId || activeModal.nodeId
      const lessonId = targetLessonId || activeModal.lessonId
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      const lessonIndex = nodes[nodeIndex]?.lessons.findIndex(l => l.id === lessonId)
      if (nodeIndex === -1 || lessonIndex === -1) return

      const newCourseBuilderNodes = [...nodes]
      const taskIndex = newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks.findIndex(
        t => t.id === editingData?.id
      )
      if (taskIndex !== -1) {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks[taskIndex] = data
      } else {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].tasks.push(data)
      }
      setCourseBuilderNodes(newCourseBuilderNodes)
      setActiveModal({ type: 'task', isOpen: false })
    },
    [nodes, activeModal, editingData, setCourseBuilderNodes]
  )

  const handleSaveContent = useCallback(
    (data: Content) => {
      const nodeIndex = nodes.findIndex(m => m.id === activeModal.nodeId)
      const lessonIndex = nodes[nodeIndex]?.lessons.findIndex(l => l.id === activeModal.lessonId)
      if (nodeIndex === -1 || lessonIndex === -1) return

      const newCourseBuilderNodes = [...nodes]
      const contentIndex = newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].content?.findIndex(
        c => c.id === editingData?.id
      )
      if (contentIndex !== undefined && contentIndex !== -1) {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].content[contentIndex] = data
      } else {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].content.push(data)
      }
      setCourseBuilderNodes(newCourseBuilderNodes)
      setActiveModal({ type: 'content', isOpen: false })
    },
    [nodes, activeModal, editingData, setCourseBuilderNodes]
  )

  const handleSaveAssessment = useCallback(
    (data: any, targetCourseBuilderNodeId?: string, targetLessonId?: string) => {
      const nodeId = targetCourseBuilderNodeId || activeModal.nodeId
      const lessonId = targetLessonId || activeModal.lessonId
      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      const lessonIndex = nodes[nodeIndex]?.lessons.findIndex(l => l.id === lessonId)
      if (nodeIndex === -1 || lessonIndex === -1) return

      const newCourseBuilderNodes = [...nodes]
      const hwIndex = newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework.findIndex(
        h => h.id === editingData?.id
      )
      if (hwIndex !== -1) {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework[hwIndex] = data
      } else {
        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].homework.push(data)
      }
      setCourseBuilderNodes(newCourseBuilderNodes)
      setActiveModal({ type: 'homework', isOpen: false })
    },
    [nodes, activeModal, editingData, setCourseBuilderNodes]
  )

  const handleSaveCourseBuilderNodeQuiz = useCallback(
    (data: any) => {
      const nodeIndex = nodes.findIndex(m => m.id === activeModal.nodeId)
      if (nodeIndex === -1) return

      const newCourseBuilderNodes = [...nodes]
      const quizIndex = newCourseBuilderNodes[nodeIndex].quizzes.findIndex(
        q => q.id === editingData.id
      )
      if (quizIndex !== -1) {
        newCourseBuilderNodes[nodeIndex].quizzes[quizIndex] = data
      }
      setCourseBuilderNodes(newCourseBuilderNodes)
      setActiveModal({ type: 'nodeQuiz', isOpen: false })
    },
    [nodes, activeModal, editingData, setCourseBuilderNodes]
  )

  const updateSelectedItem = useCallback(
    (updates: Partial<Task> | Partial<Assessment>) => {
      if (!selectedItem) return

      setCourseBuilderNodes(prev =>
        prev.map(mod => {
          if (selectedItem.type === 'task') {
            return {
              ...mod,
              lessons: mod.lessons.map(lesson => ({
                ...lesson,
                tasks: lesson.tasks.map(task =>
                  task.id === selectedItem.id ? ({ ...task, ...updates } as Task) : task
                ),
              })),
            }
          }
          if (selectedItem.type === 'homework') {
            return {
              ...mod,
              lessons: mod.lessons.map(lesson => ({
                ...lesson,
                homework: lesson.homework.map(hw =>
                  hw.id === selectedItem.id ? ({ ...hw, ...updates } as Assessment) : hw
                ),
              })),
            }
          }
          return mod
        })
      )
    },
    [selectedItem, setCourseBuilderNodes]
  )

  // Media / Doc handlers
  const trackObjectUrl = useCallback((url: string) => {
    return url
  }, [])

  const handleMediaUpload = useCallback(
    (nodeId: string, lessonId: string, files: FileList | null, type: 'video' | 'image') => {
      if (!files || files.length === 0) return

      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      const lessonIndex = nodes[nodeIndex]?.lessons.findIndex(l => l.id === lessonId)
      if (nodeIndex === -1 || lessonIndex === -1) return

      const newCourseBuilderNodes = [...nodes]

      Array.from(files).forEach(file => {
        if (type === 'video') {
          newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].media.videos.push({
            id: `video-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            title: file.name,
            url: trackObjectUrl(URL.createObjectURL(file)),
            duration: 0,
          })
        } else {
          newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].media.images.push({
            id: `image-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            title: file.name,
            url: trackObjectUrl(URL.createObjectURL(file)),
          })
        }
      })

      setCourseBuilderNodes(newCourseBuilderNodes)
    },
    [nodes, setCourseBuilderNodes, trackObjectUrl]
  )

  const handleDocUpload = useCallback(
    (nodeId: string, lessonId: string, files: FileList | null) => {
      if (!files || files.length === 0) return

      const nodeIndex = nodes.findIndex(m => m.id === nodeId)
      const lessonIndex = nodes[nodeIndex]?.lessons.findIndex(l => l.id === lessonId)
      if (nodeIndex === -1 || lessonIndex === -1) return

      const newCourseBuilderNodes = [...nodes]

      Array.from(files).forEach(file => {
        const ext = file.name.split('.').pop()?.toLowerCase()
        const docType =
          ext === 'pdf'
            ? 'pdf'
            : ext === 'doc' || ext === 'docx'
              ? 'doc'
              : ext === 'ppt' || ext === 'pptx'
                ? 'ppt'
                : 'other'

        newCourseBuilderNodes[nodeIndex].lessons[lessonIndex].docs.push({
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          title: file.name,
          url: trackObjectUrl(URL.createObjectURL(file)),
          type: docType,
        })
      })

      setCourseBuilderNodes(newCourseBuilderNodes)
    },
    [nodes, setCourseBuilderNodes, trackObjectUrl]
  )

  const handleAssetsMediaUpload = useCallback(
    (
      files: FileList | null,
      type: 'video' | 'image',
      getFirstLessonContext: () => { nodeId: string; lessonId: string }
    ) => {
      const { nodeId, lessonId } = getFirstLessonContext()
      handleMediaUpload(nodeId, lessonId, files, type)
    },
    [handleMediaUpload]
  )

  const handleAssetsDocUpload = useCallback(
    (files: FileList | null, getFirstLessonContext: () => { nodeId: string; lessonId: string }) => {
      const { nodeId, lessonId } = getFirstLessonContext()
      handleDocUpload(nodeId, lessonId, files)
    },
    [handleDocUpload]
  )

  const handleDeleteAssetMedia = useCallback(
    (
      mediaType: 'video' | 'image',
      mediaId: string,
      getFirstLessonContext: () => { nodeId: string; lessonId: string }
    ) => {
      const { nodeId, lessonId } = getFirstLessonContext()
      setCourseBuilderNodes(prev =>
        prev.map(node => {
          if (node.id !== nodeId) return node
          return {
            ...node,
            lessons: node.lessons.map(lesson => {
              if (lesson.id !== lessonId) return lesson
              return {
                ...lesson,
                media: {
                  ...lesson.media,
                  videos:
                    mediaType === 'video'
                      ? (lesson.media?.videos || []).filter(v => v.id !== mediaId)
                      : lesson.media?.videos || [],
                  images:
                    mediaType === 'image'
                      ? (lesson.media?.images || []).filter(i => i.id !== mediaId)
                      : lesson.media?.images || [],
                },
              }
            }),
          }
        })
      )
    },
    [setCourseBuilderNodes]
  )

  const handleDeleteAssetDoc = useCallback(
    (docId: string, getFirstLessonContext: () => { nodeId: string; lessonId: string }) => {
      const { nodeId, lessonId } = getFirstLessonContext()
      setCourseBuilderNodes(prev =>
        prev.map(node => {
          if (node.id !== nodeId) return node
          return {
            ...node,
            lessons: node.lessons.map(lesson => {
              if (lesson.id !== lessonId) return lesson
              return {
                ...lesson,
                docs: (lesson.docs || []).filter(doc => doc.id !== docId),
              }
            }),
          }
        })
      )
    },
    [setCourseBuilderNodes]
  )

  // ============================================
  // DnD HANDLERS
  // ============================================

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveDragId(null)

      if (!over || active.id === over.id) return

      const activeId = active.id as string
      const overId = over.id as string

      const findTaskLocation = (id: string) => {
        for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
          for (let lIdx = 0; lIdx < nodes[nIdx].lessons.length; lIdx++) {
            const taskIndex = nodes[nIdx].lessons[lIdx].tasks.findIndex(t => t.id === id)
            if (taskIndex !== -1) return { nIdx, lIdx, taskIndex }
          }
        }
        return null
      }

      const findHomeworkLocation = (id: string) => {
        for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
          for (let lIdx = 0; lIdx < nodes[nIdx].lessons.length; lIdx++) {
            const hwIndex = nodes[nIdx].lessons[lIdx].homework.findIndex(h => h.id === id)
            if (hwIndex !== -1) return { nIdx, lIdx, hwIndex }
          }
        }
        return null
      }

      const findLessonByCourseBuilderNodeId = (id: string) => {
        const nodeIndex = nodes.findIndex(m => m.id === id)
        if (nodeIndex === -1) return null
        return { nIdx: nodeIndex, lIdx: 0 }
      }

      // Drop onto Homework folder
      if (typeof overId === 'string' && overId.startsWith('drop-hw-')) {
        const rest = overId.slice('drop-hw-'.length)
        const sep = rest.indexOf('::')
        const targetCourseBuilderNodeId = sep >= 0 ? rest.slice(0, sep) : rest
        const targetLessonId = sep >= 0 ? rest.slice(sep + 2) : ''
        if (targetCourseBuilderNodeId && targetLessonId) {
          const taskLoc = findTaskLocation(activeId)
          const hwLoc = findHomeworkLocation(activeId)
          if (taskLoc) {
            const task = nodes[taskLoc.nIdx].lessons[taskLoc.lIdx].tasks[taskLoc.taskIndex]
            moveToHomework?.(targetCourseBuilderNodeId, targetLessonId, 'task', task)
            setCourseBuilderNodes(prev =>
              prev.map((mod, nIdx) => {
                if (nIdx !== taskLoc.nIdx) return mod
                return {
                  ...mod,
                  lessons: mod.lessons.map((les, lIdx) => {
                    if (lIdx !== taskLoc.lIdx) return les
                    return { ...les, tasks: les.tasks.filter(t => t.id !== activeId) }
                  }),
                }
              })
            )
            return
          }
          if (hwLoc) {
            const hw = nodes[hwLoc.nIdx].lessons[hwLoc.lIdx].homework[hwLoc.hwIndex]
            moveToHomework?.(targetCourseBuilderNodeId, targetLessonId, 'assessment', hw)
            setCourseBuilderNodes(prev =>
              prev.map((mod, nIdx) => {
                if (nIdx !== hwLoc.nIdx) return mod
                return {
                  ...mod,
                  lessons: mod.lessons.map((les, lIdx) => {
                    if (lIdx !== hwLoc.lIdx) return les
                    return { ...les, homework: les.homework.filter(h => h.id !== activeId) }
                  }),
                }
              })
            )
            return
          }
        }
      }

      // Drag from Homework to Tasks
      if (typeof overId === 'string' && overId.startsWith('drop-task-')) {
        const rest = overId.slice('drop-task-'.length)
        const sep = rest.indexOf('::')
        const targetCourseBuilderNodeId = sep >= 0 ? rest.slice(0, sep) : rest
        const targetLessonId = sep >= 0 ? rest.slice(sep + 2) : ''
        const hwLoc = findHomeworkLocation(activeId)
        if (hwLoc && targetCourseBuilderNodeId && targetLessonId) {
          const hw = nodes[hwLoc.nIdx].lessons[hwLoc.lIdx].homework[hwLoc.hwIndex]
          const newTask: Task = {
            id: `task-${generateId()}`,
            title: hw.title || 'Task',
            description: hw.description || '',
            instructions: hw.instructions || '',
            dmiItems: hw.dmiItems || [],
            estimatedMinutes: hw.estimatedMinutes ?? 15,
            points: hw.points ?? 10,
            submissionType: 'text',
            isAiGraded: false,
            difficultyMode: 'all',
          }
          const srcModId = nodes[hwLoc.nIdx].id
          const srcLesId = nodes[hwLoc.nIdx].lessons[hwLoc.lIdx].id
          setCourseBuilderNodes(prev =>
            prev.map(mod => {
              if (mod.id !== targetCourseBuilderNodeId) {
                if (mod.id !== srcModId) return mod
                return {
                  ...mod,
                  lessons: mod.lessons.map(les =>
                    les.id === srcLesId
                      ? { ...les, homework: les.homework.filter(h => h.id !== activeId) }
                      : les
                  ),
                }
              }
              return {
                ...mod,
                lessons: mod.lessons.map(les => {
                  let next = les
                  if (les.id === srcLesId)
                    next = { ...next, homework: next.homework.filter(h => h.id !== activeId) }
                  if (les.id === targetLessonId)
                    next = { ...next, tasks: [...(next.tasks || []), newTask] }
                  return next
                }),
              }
            })
          )
          if (loadedAssessmentId === activeId) {
            setLoadedAssessmentId(null)
            setSelectedItem({ type: 'task', id: newTask.id })
            loadTaskIntoBuilder?.(newTask, null)
            setMainBuilderTab('task')
          }
          return
        }
      }

      // Drag from Homework to Assessments
      if (typeof overId === 'string' && overId.startsWith('drop-assessment-')) {
        const rest = overId.slice('drop-assessment-'.length)
        const sep = rest.indexOf('::')
        const targetCourseBuilderNodeId = sep >= 0 ? rest.slice(0, sep) : rest
        const targetLessonId = sep >= 0 ? rest.slice(sep + 2) : ''
        const hwLoc = findHomeworkLocation(activeId)
        if (hwLoc && targetCourseBuilderNodeId && targetLessonId) {
          const hw = nodes[hwLoc.nIdx].lessons[hwLoc.lIdx].homework[hwLoc.hwIndex]
          const asAssessment = {
            ...cloneAssessment(hw),
            category: 'assessment' as const,
            id: `a-${generateId()}`,
          }
          setCourseBuilderNodes(prev =>
            prev.map(mod => {
              if (mod.id === nodes[hwLoc.nIdx].id) {
                return {
                  ...mod,
                  lessons: mod.lessons.map((les, lIdx) =>
                    lIdx === hwLoc.lIdx
                      ? { ...les, homework: les.homework.filter(h => h.id !== activeId) }
                      : les
                  ),
                }
              }
              if (mod.id !== targetCourseBuilderNodeId) return mod
              return {
                ...mod,
                lessons: mod.lessons.map(les =>
                  les.id !== targetLessonId
                    ? les
                    : { ...les, homework: [...(les.homework || []), asAssessment] }
                ),
              }
            })
          )
          if (loadedAssessmentId === activeId) {
            setSelectedItem({ type: 'homework', id: asAssessment.id })
            loadAssessmentIntoBuilder?.(asAssessment)
          }
          return
        }
      }

      // Check if dragging a lesson
      const activeCourseBuilderNodeIndex = nodes.findIndex(m => m.id === activeId)
      const overCourseBuilderNodeIndex = nodes.findIndex(m => m.id === overId)

      if (activeCourseBuilderNodeIndex !== -1 && overCourseBuilderNodeIndex !== -1) {
        const movedCourseBuilderNodes = arrayMove(
          nodes,
          activeCourseBuilderNodeIndex,
          overCourseBuilderNodeIndex
        )
        setCourseBuilderNodes(renumberCourseBuilderNodes(movedCourseBuilderNodes))
        return
      }

      // Check if dragging a lesson within a node
      for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
        const activeLessonIndex = nodes[nIdx].lessons.findIndex(l => l.id === activeId)
        const overLessonIndex = nodes[nIdx].lessons.findIndex(l => l.id === overId)

        if (activeLessonIndex !== -1 && overLessonIndex !== -1) {
          const newCourseBuilderNodes = [...nodes]
          const movedLessons = arrayMove(
            newCourseBuilderNodes[nIdx].lessons,
            activeLessonIndex,
            overLessonIndex
          )
          newCourseBuilderNodes[nIdx].lessons = movedLessons.map((lesson, idx) => ({
            ...lesson,
            order: idx,
            title: lesson.title.replace(/^Lesson \d+/, `Lesson ${idx + 1}`),
          }))
          setCourseBuilderNodes(newCourseBuilderNodes)
          return
        }
      }

      // Check if dragging content within a lesson
      for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
        for (let lIdx = 0; lIdx < nodes[nIdx].lessons.length; lIdx++) {
          const lesson = nodes[nIdx].lessons[lIdx]
          const activeContentIndex = lesson.content?.findIndex(c => c.id === activeId) ?? -1
          const overContentIndex = lesson.content?.findIndex(c => c.id === overId) ?? -1

          if (activeContentIndex !== -1 && overContentIndex !== -1) {
            const newCourseBuilderNodes = [...nodes]
            newCourseBuilderNodes[nIdx].lessons[lIdx].content = arrayMove(
              newCourseBuilderNodes[nIdx].lessons[lIdx].content,
              activeContentIndex,
              overContentIndex
            ).map((content, idx) => ({ ...content, order: idx }))
            setCourseBuilderNodes(newCourseBuilderNodes)
            return
          }
        }
      }

      // Check if dragging a task within a lesson
      for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
        for (let lIdx = 0; lIdx < nodes[nIdx].lessons.length; lIdx++) {
          const lesson = nodes[nIdx].lessons[lIdx]
          const activeTaskIndex = lesson.tasks?.findIndex(t => t.id === activeId) ?? -1
          const overTaskIndex = lesson.tasks?.findIndex(t => t.id === overId) ?? -1

          if (activeTaskIndex !== -1 && overTaskIndex !== -1) {
            const newCourseBuilderNodes = [...nodes]
            newCourseBuilderNodes[nIdx].lessons[lIdx].tasks = arrayMove(
              newCourseBuilderNodes[nIdx].lessons[lIdx].tasks,
              activeTaskIndex,
              overTaskIndex
            )
            setCourseBuilderNodes(newCourseBuilderNodes)
            return
          }
        }
      }

      // Move task across lessons
      const taskSource = findTaskLocation(activeId)
      if (taskSource) {
        const targetTaskLocation = findTaskLocation(overId)
        const targetLesson = targetTaskLocation
          ? { nIdx: targetTaskLocation.nIdx, lIdx: targetTaskLocation.lIdx }
          : findLessonByCourseBuilderNodeId(overId)
        if (
          targetLesson &&
          (taskSource.nIdx !== targetLesson.nIdx || taskSource.lIdx !== targetLesson.lIdx)
        ) {
          const newCourseBuilderNodes = [...nodes]
          const sourceTasks = newCourseBuilderNodes[taskSource.nIdx].lessons[taskSource.lIdx].tasks
          const [movedTask] = sourceTasks.splice(taskSource.taskIndex, 1)
          const targetTasks =
            newCourseBuilderNodes[targetLesson.nIdx].lessons[targetLesson.lIdx].tasks
          const insertIndex = targetTaskLocation
            ? targetTasks.findIndex(t => t.id === overId)
            : targetTasks.length
          targetTasks.splice(insertIndex === -1 ? targetTasks.length : insertIndex, 0, movedTask)
          setCourseBuilderNodes(newCourseBuilderNodes)
          return
        }
      }

      // Check if dragging homework within a lesson
      for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
        for (let lIdx = 0; lIdx < nodes[nIdx].lessons.length; lIdx++) {
          const lesson = nodes[nIdx].lessons[lIdx]
          const activeHwIndex = lesson.homework?.findIndex(h => h.id === activeId) ?? -1
          const overHwIndex = lesson.homework?.findIndex(h => h.id === overId) ?? -1

          if (activeHwIndex !== -1 && overHwIndex !== -1) {
            const newCourseBuilderNodes = [...nodes]
            newCourseBuilderNodes[nIdx].lessons[lIdx].homework = arrayMove(
              newCourseBuilderNodes[nIdx].lessons[lIdx].homework,
              activeHwIndex,
              overHwIndex
            )
            setCourseBuilderNodes(newCourseBuilderNodes)
            return
          }
        }
      }

      // Move homework/assessment across lessons
      const hwSource = findHomeworkLocation(activeId)
      if (hwSource) {
        const targetHwLocation = findHomeworkLocation(overId)
        const targetLesson = targetHwLocation
          ? { nIdx: targetHwLocation.nIdx, lIdx: targetHwLocation.lIdx }
          : findLessonByCourseBuilderNodeId(overId)
        if (
          targetLesson &&
          (hwSource.nIdx !== targetLesson.nIdx || hwSource.lIdx !== targetLesson.lIdx)
        ) {
          const newCourseBuilderNodes = [...nodes]
          const sourceHomework =
            newCourseBuilderNodes[hwSource.nIdx].lessons[hwSource.lIdx].homework
          const [movedHw] = sourceHomework.splice(hwSource.hwIndex, 1)
          const targetHomework =
            newCourseBuilderNodes[targetLesson.nIdx].lessons[targetLesson.lIdx].homework
          const insertIndex = targetHwLocation
            ? targetHomework.findIndex(h => h.id === overId)
            : targetHomework.length
          targetHomework.splice(
            insertIndex === -1 ? targetHomework.length : insertIndex,
            0,
            movedHw
          )
          setCourseBuilderNodes(newCourseBuilderNodes)
          return
        }
      }
    },
    [
      nodes,
      setCourseBuilderNodes,
      moveToHomework,
      cloneAssessment,
      loadedAssessmentId,
      setLoadedAssessmentId,
      setSelectedItem,
      loadTaskIntoBuilder,
      setMainBuilderTab,
      loadAssessmentIntoBuilder,
      renumberCourseBuilderNodes,
    ]
  )

  // ============================================
  // DERIVED
  // ============================================

  const filteredCourseBuilderNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodes
    const lowerQuery = searchQuery.toLowerCase()

    return nodes
      .map(node => {
        const nodeMatch = node.title.toLowerCase().includes(lowerQuery)

        const filteredLessons = node.lessons
          .map(lesson => {
            const lessonMatch = lesson.title.toLowerCase().includes(lowerQuery)

            const filteredTasks = (lesson.tasks || []).filter(
              task =>
                task.title?.toLowerCase().includes(lowerQuery) ||
                task.description?.toLowerCase().includes(lowerQuery) ||
                task.extensions?.some(
                  ext =>
                    ext.name?.toLowerCase().includes(lowerQuery) ||
                    ext.content?.toLowerCase().includes(lowerQuery)
                )
            )

            const filteredHomework = (lesson.homework || []).filter(
              hw =>
                hw.title?.toLowerCase().includes(lowerQuery) ||
                hw.description?.toLowerCase().includes(lowerQuery)
            )

            const hasMatchingContent = filteredTasks.length > 0 || filteredHomework.length > 0

            if (lessonMatch || nodeMatch || hasMatchingContent) {
              return {
                ...lesson,
                tasks: lessonMatch || nodeMatch ? lesson.tasks : filteredTasks,
                homework: lessonMatch || nodeMatch ? lesson.homework : filteredHomework,
              }
            }
            return null
          })
          .filter(Boolean) as typeof node.lessons

        if (nodeMatch || filteredLessons.length > 0) {
          return {
            ...node,
            lessons: filteredLessons,
          }
        }
        return null
      })
      .filter(Boolean) as typeof nodes
  }, [nodes, searchQuery])

  return {
    // State
    builderNodes,
    setBuilderNodes,
    liveNodes,
    setLiveNodes,
    nodes,
    setCourseBuilderNodes,
    expandedCourseBuilderNodes,
    setExpandedCourseBuilderNodes,
    selectedItem,
    setSelectedItem,
    searchQuery,
    setSearchQuery,
    activeDragId,
    setActiveDragId,
    collapsedSections,
    setCollapsedSections,
    collapsedTaskExtensions,
    setCollapsedTaskExtensions,
    renamingItemId,
    setRenamingItemId,
    activeModal,
    setActiveModal,
    editingData,
    setEditingData,
    sensors,

    // Handlers
    toggleCourseBuilderNode,
    toggleSection,
    isSectionCollapsed,
    ensureSectionExpanded,
    toggleExtensions,
    isExtensionsCollapsed,
    addCourseBuilderNode,
    addTask,
    addContent,
    addAssessment,
    addCourseExam,
    ensureFirstLessonContext,
    deleteCourseBuilderNode,
    deleteLesson,
    deleteTask,
    deleteAssessment,
    deleteCourseBuilderNodeQuiz,
    duplicateTask,
    duplicateAssessment,
    duplicateCourseBuilderNodeQuiz,
    duplicateLesson,
    duplicateCourseBuilderNode,
    handleSaveCourseBuilderNode,
    handleSaveLesson,
    handleSaveTask,
    handleSaveContent,
    handleSaveAssessment,
    handleSaveCourseBuilderNodeQuiz,
    updateSelectedItem,
    handleMediaUpload,
    handleDocUpload,
    handleAssetsMediaUpload,
    handleAssetsDocUpload,
    handleDeleteAssetMedia,
    handleDeleteAssetDoc,
    handleDragStart,
    handleDragEnd,
    saveNodesIfPossible,
    applyTemplate,
    getAllLessons,
    cloneNodes,
    cloneTask,
    cloneAssessment,
    cloneLesson,

    // Derived
    filteredCourseBuilderNodes,
    resolvedInitialCourseBuilderNodes,
    initialCourseBuilderNodesKey,
    lastInitialCourseBuilderNodesKeyRef,
  }
}
