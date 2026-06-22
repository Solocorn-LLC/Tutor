'use client'

import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import type {
  DMIQuestion,
  DMIVersion,
  Task,
  Assessment,
  ImportedLearningResource,
} from '../builder-types'

function parsePciTranscript(pciText: string): { role: 'user' | 'assistant'; content: string }[] {
  if (!pciText.trim()) return []
  const lines = pciText.split('\n')
  const messages: { role: 'user' | 'assistant'; content: string }[] = []
  let currentRole: 'user' | 'assistant' | null = null
  let currentContent = ''

  for (const line of lines) {
    const userMatch = line.match(/^User:\s*(.*)/)
    const assistantMatch = line.match(/^Assistant:\s*(.*)/)

    if (userMatch) {
      if (currentRole) {
        messages.push({ role: currentRole, content: currentContent.trim() })
      }
      currentRole = 'user'
      currentContent = userMatch[1]
    } else if (assistantMatch) {
      if (currentRole) {
        messages.push({ role: currentRole, content: currentContent.trim() })
      }
      currentRole = 'assistant'
      currentContent = assistantMatch[1]
    } else if (currentRole) {
      currentContent += '\n' + line
    }
  }

  if (currentRole) {
    messages.push({ role: currentRole, content: currentContent.trim() })
  }

  return messages
}

function formatPciTranscript(messages: { role: 'user' | 'assistant'; content: string }[]): string {
  return messages
    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n')
}

async function renderPdfToImages(fileUrl: string, maxPages: number): Promise<string[]> {
  try {
    const { PDFDocument } = await import('pdf-lib')
    const res = await fetch(fileUrl)
    const arrayBuffer = await res.arrayBuffer()
    const pdf = await PDFDocument.load(arrayBuffer)
    const pages = pdf.getPages()
    const images: string[] = []
    for (let i = 0; i < Math.min(pages.length, maxPages); i++) {
      const page = pages[i]
      const { width, height } = page.getSize()
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(width)
      canvas.height = Math.floor(height)
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      // Simplified - just return placeholder for now
      images.push(canvas.toDataURL('image/png'))
    }
    return images
  } catch {
    return []
  }
}

export interface UseBuilderEditorsReturn {
  // Task builder
  taskBuilder: {
    title: string
    taskContent: string
    taskPci: string
    details: string
    sourceDocument?: {
      fileName: string
      fileUrl: string
      mimeType: string
      uploadedAt: string
      extractedText?: string
    }
    extensions: {
      id: string
      name: string
      description?: string
      content: string
      pci: string
      sourceDocument?: any
    }[]
    activeExtensionId: string | null
  }
  setTaskBuilder: React.Dispatch<
    React.SetStateAction<{
      title: string
      taskContent: string
      taskPci: string
      details: string
      sourceDocument?: any
      extensions: any[]
      activeExtensionId: string | null
    }>
  >
  taskBuilderActiveTab: 'content' | 'pci'
  setTaskBuilderActiveTab: (tab: 'content' | 'pci') => void

  // Assessment builder
  assessmentBuilder: {
    title: string
    taskContent: string
    taskPci: string
    details: string
    extensions: any[]
    activeExtensionId: string | null
  }
  setAssessmentBuilder: React.Dispatch<
    React.SetStateAction<{
      title: string
      taskContent: string
      taskPci: string
      details: string
      extensions: any[]
      activeExtensionId: string | null
    }>
  >
  assessmentBuilderActiveTab: 'content' | 'pci'
  setAssessmentBuilderActiveTab: (tab: 'content' | 'pci') => void

  // Main builder tab
  mainBuilderTab: 'task' | 'assessment'
  setMainBuilderTab: (tab: 'task' | 'assessment') => void

  // Loaded IDs
  loadedTaskId: string | null
  setLoadedTaskId: (id: string | null) => void
  loadedAssessmentId: string | null
  setLoadedAssessmentId: (id: string | null) => void

  // PCI messages
  taskPciMessages: { role: 'user' | 'assistant'; content: string }[]
  setTaskPciMessages: React.Dispatch<
    React.SetStateAction<{ role: 'user' | 'assistant'; content: string }[]>
  >
  taskExtensionPciMessages: Record<string, { role: 'user' | 'assistant'; content: string }[]>
  setTaskExtensionPciMessages: React.Dispatch<
    React.SetStateAction<Record<string, { role: 'user' | 'assistant'; content: string }[]>>
  >
  taskExtensionPciInputs: Record<string, string>
  setTaskExtensionPciInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>
  assessmentPciMessagesMap: Record<string, { role: 'user' | 'assistant'; content: string }[]>
  setAssessmentPciMessagesMap: React.Dispatch<
    React.SetStateAction<Record<string, { role: 'user' | 'assistant'; content: string }[]>>
  >
  taskPciInputMap: Record<string, string>
  setTaskPciInputMap: React.Dispatch<React.SetStateAction<Record<string, string>>>
  assessmentPciInputMap: Record<string, string>
  setAssessmentPciInputMap: React.Dispatch<React.SetStateAction<Record<string, string>>>
  taskPciLoading: boolean
  setTaskPciLoading: React.Dispatch<React.SetStateAction<boolean>>
  assessmentPciLoadingMap: Record<string, boolean>
  setAssessmentPciLoadingMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  taskPciErrorHint: string
  setTaskPciErrorHint: React.Dispatch<React.SetStateAction<string>>
  assessmentPciErrorHintMap: Record<string, string>
  setAssessmentPciErrorHintMap: React.Dispatch<React.SetStateAction<Record<string, string>>>

  // AI Assist
  aiAssistOpen: boolean
  setAiAssistOpen: React.Dispatch<React.SetStateAction<boolean>>
  aiAssistContext: 'task' | 'assessment'
  setAiAssistContext: React.Dispatch<React.SetStateAction<'task' | 'assessment'>>
  taskAiMessages: { role: 'user' | 'assistant'; content: string }[]
  setTaskAiMessages: React.Dispatch<
    React.SetStateAction<{ role: 'user' | 'assistant'; content: string }[]>
  >
  assessmentAiMessages: { role: 'user' | 'assistant'; content: string }[]
  setAssessmentAiMessages: React.Dispatch<
    React.SetStateAction<{ role: 'user' | 'assistant'; content: string }[]>
  >

  // Uploaded files
  taskUploadedFiles: { id: string; name: string }[]
  setTaskUploadedFiles: React.Dispatch<React.SetStateAction<{ id: string; name: string }[]>>
  assessmentUploadedFiles: { id: string; name: string }[]
  setAssessmentUploadedFiles: React.Dispatch<React.SetStateAction<{ id: string; name: string }[]>>
  taskSourceDocument: ImportedLearningResource | undefined
  setTaskSourceDocument: React.Dispatch<React.SetStateAction<ImportedLearningResource | undefined>>
  assessmentSourceDocument: ImportedLearningResource | undefined
  setAssessmentSourceDocument: React.Dispatch<
    React.SetStateAction<ImportedLearningResource | undefined>
  >

  // Test PCI
  testPciInputs: Record<string, string>
  setTestPciInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>
  testPciViewMode: string
  setTestPciViewMode: React.Dispatch<React.SetStateAction<string>>
  testPciContent: Record<string, string>
  setTestPciContent: React.Dispatch<React.SetStateAction<Record<string, string>>>
  testPciScores: Record<string, { score: number; feedback: string }[]>
  setTestPciScores: React.Dispatch<
    React.SetStateAction<Record<string, { score: number; feedback: string }[]>>
  >
  testPciLoading: boolean
  setTestPciLoading: React.Dispatch<React.SetStateAction<boolean>>
  testPciActiveTab: string
  setTestPciActiveTab: React.Dispatch<React.SetStateAction<string>>
  testPciSource: 'task' | 'assessment'
  setTestPciSource: React.Dispatch<React.SetStateAction<'task' | 'assessment'>>

  // DMI
  taskDmiItems: DMIQuestion[]
  setTaskDmiItems: React.Dispatch<React.SetStateAction<DMIQuestion[]>>
  assessmentDmiItems: DMIQuestion[]
  setAssessmentDmiItems: React.Dispatch<React.SetStateAction<DMIQuestion[]>>
  taskDmiVersions: DMIVersion[]
  setTaskDmiVersions: React.Dispatch<React.SetStateAction<DMIVersion[]>>
  assessmentDmiVersions: DMIVersion[]
  setAssessmentDmiVersions: React.Dispatch<React.SetStateAction<DMIVersion[]>>
  showDmiVersionList: boolean
  setShowDmiVersionList: React.Dispatch<React.SetStateAction<boolean>>
  previewDmiVersion: DMIVersion | null
  setPreviewDmiVersion: React.Dispatch<React.SetStateAction<DMIVersion | null>>
  dmiGenerating: boolean
  setDmiGenerating: React.Dispatch<React.SetStateAction<boolean>>

  // Handlers
  loadTaskIntoBuilder: (task: Task, activeExtensionId?: string | null) => void
  loadAssessmentIntoBuilder: (assessment: Assessment) => void
  handlePciSend: (type: 'task' | 'assessment', overrideMessage?: string) => Promise<void>
  handleTestPciSubmit: () => Promise<void>
  handleGenerateDMI: (type: 'task' | 'assessment') => Promise<void>
  handleLoadDmiVersion: (version: DMIVersion, type: 'task' | 'assessment') => void
  handleDeleteDmiVersion: (versionId: string, type: 'task' | 'assessment') => void
  formatPciTranscript: (messages: { role: 'user' | 'assistant'; content: string }[]) => string
}

export function useBuilderEditors(): UseBuilderEditorsReturn {
  // Task builder state
  const [taskBuilder, setTaskBuilder] = useState({
    title: '',
    taskContent: '',
    taskPci: '',
    details: '',
    extensions: [] as {
      id: string
      name: string
      description?: string
      content: string
      pci: string
      sourceDocument?: any
    }[],
    activeExtensionId: null as string | null,
  })

  // Assessment builder state
  const [assessmentBuilder, setAssessmentBuilder] = useState({
    title: '',
    taskContent: '',
    taskPci: '',
    details: '',
    extensions: [] as {
      id: string
      name: string
      description?: string
      content: string
      pci: string
      sourceDocument?: any
    }[],
    activeExtensionId: null as string | null,
  })

  const [taskBuilderActiveTab, setTaskBuilderActiveTab] = useState<'content' | 'pci'>('content')
  const [assessmentBuilderActiveTab, setAssessmentBuilderActiveTab] = useState<'content' | 'pci'>(
    'content'
  )
  const [mainBuilderTab, setMainBuilderTab] = useState<'task' | 'assessment'>('task')

  const [loadedTaskId, setLoadedTaskId] = useState<string | null>(null)
  const [loadedAssessmentId, setLoadedAssessmentId] = useState<string | null>(null)

  // PCI messages
  const [taskPciMessages, setTaskPciMessages] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([])
  const [taskExtensionPciMessages, setTaskExtensionPciMessages] = useState<
    Record<string, { role: 'user' | 'assistant'; content: string }[]>
  >({})
  const [taskExtensionPciInputs, setTaskExtensionPciInputs] = useState<Record<string, string>>({})
  const [assessmentPciMessagesMap, setAssessmentPciMessagesMap] = useState<
    Record<string, { role: 'user' | 'assistant'; content: string }[]>
  >({})
  const [taskPciInputMap, setTaskPciInputMap] = useState<Record<string, string>>({})
  const [assessmentPciInputMap, setAssessmentPciInputMap] = useState<Record<string, string>>({})
  const [taskPciLoading, setTaskPciLoading] = useState(false)
  const [assessmentPciLoadingMap, setAssessmentPciLoadingMap] = useState<Record<string, boolean>>(
    {}
  )
  const [taskPciErrorHint, setTaskPciErrorHint] = useState('')
  const [assessmentPciErrorHintMap, setAssessmentPciErrorHintMap] = useState<
    Record<string, string>
  >({})

  // AI Assist
  const [aiAssistOpen, setAiAssistOpen] = useState(false)
  const [aiAssistContext, setAiAssistContext] = useState<'task' | 'assessment'>('task')
  const [taskAiMessages, setTaskAiMessages] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([])
  const [assessmentAiMessages, setAssessmentAiMessages] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([])

  // Uploaded files
  const [taskUploadedFiles, setTaskUploadedFiles] = useState<{ id: string; name: string }[]>([])
  const [assessmentUploadedFiles, setAssessmentUploadedFiles] = useState<
    { id: string; name: string }[]
  >([])
  const [taskSourceDocument, setTaskSourceDocument] = useState<
    ImportedLearningResource | undefined
  >(undefined)
  const [assessmentSourceDocument, setAssessmentSourceDocument] = useState<
    ImportedLearningResource | undefined
  >(undefined)

  // Test PCI
  const [testPciInputs, setTestPciInputs] = useState<Record<string, string>>({
    classroom: '',
    student1: '',
    student2: '',
  })
  const [testPciViewMode, setTestPciViewMode] = useState<string>('pdf')
  const [testPciContent, setTestPciContent] = useState<Record<string, string>>({
    classroom: '',
    student1: '',
    student2: '',
  })
  const [testPciScores, setTestPciScores] = useState<
    Record<string, { score: number; feedback: string }[]>
  >({
    classroom: [],
    student1: [],
    student2: [],
  })
  const [testPciLoading, setTestPciLoading] = useState(false)
  const [testPciActiveTab, setTestPciActiveTab] = useState('classroom')
  const [testPciSource, setTestPciSource] = useState<'task' | 'assessment'>('task')

  // DMI
  const [taskDmiItems, setTaskDmiItems] = useState<DMIQuestion[]>([])
  const [assessmentDmiItems, setAssessmentDmiItems] = useState<DMIQuestion[]>([])
  const [taskDmiVersions, setTaskDmiVersions] = useState<DMIVersion[]>([])
  const [assessmentDmiVersions, setAssessmentDmiVersions] = useState<DMIVersion[]>([])
  const [showDmiVersionList, setShowDmiVersionList] = useState(false)
  const [previewDmiVersion, setPreviewDmiVersion] = useState<DMIVersion | null>(null)
  const [dmiGenerating, setDmiGenerating] = useState(false)

  // Refs for latest state in async handlers
  const taskBuilderRef = useRef(taskBuilder)
  const assessmentBuilderRef = useRef(assessmentBuilder)
  const loadedTaskIdRef = useRef(loadedTaskId)
  const loadedAssessmentIdRef = useRef(loadedAssessmentId)
  const taskDmiItemsRef = useRef(taskDmiItems)
  const assessmentDmiItemsRef = useRef(assessmentDmiItems)
  const taskDmiVersionsRef = useRef(taskDmiVersions)
  const assessmentDmiVersionsRef = useRef(assessmentDmiVersions)

  taskBuilderRef.current = taskBuilder
  assessmentBuilderRef.current = assessmentBuilder
  loadedTaskIdRef.current = loadedTaskId
  loadedAssessmentIdRef.current = loadedAssessmentId
  taskDmiItemsRef.current = taskDmiItems
  assessmentDmiItemsRef.current = assessmentDmiItems
  taskDmiVersionsRef.current = taskDmiVersions
  assessmentDmiVersionsRef.current = assessmentDmiVersions

  const loadTaskIntoBuilder = useCallback((task: Task, activeExtensionId: string | null = null) => {
    const content = task.description || task.sourceDocument?.extractedText || ''
    setTaskBuilder({
      title: task.title || '',
      taskContent: content,
      taskPci: task.instructions || '',
      details: task.shortDescription || '',
      extensions: (task.extensions || []).map(ext => ({
        ...ext,
        description: ext.description || '',
      })),
      activeExtensionId,
    })
    setTaskDmiItems(task.dmiItems || [])
    setTaskDmiVersions(task.dmiVersions || [])
    setTestPciSource('task')
    if (task.activeDmiVersionId) {
      setTestPciViewMode(`dmi_${task.activeDmiVersionId}`)
    } else {
      setTestPciViewMode('pdf')
    }
    setTaskPciMessages(parsePciTranscript(task.instructions || ''))
    setTaskExtensionPciMessages(
      (task.extensions || []).reduce<
        Record<string, { role: 'user' | 'assistant'; content: string }[]>
      >((acc, ext) => {
        acc[ext.id] = parsePciTranscript(ext.pci || '')
        return acc
      }, {})
    )
    setTaskExtensionPciInputs(prev => {
      const next = { ...prev }
      for (const ext of task.extensions || []) {
        if (next[ext.id] === undefined) next[ext.id] = ''
      }
      return next
    })
    setLoadedTaskId(task.id)
    setTaskUploadedFiles(
      task.sourceDocument ? [{ id: 'source', name: task.sourceDocument.fileName }] : []
    )
    setTaskSourceDocument(task.sourceDocument)
    setTaskBuilderActiveTab('content')
  }, [])

  const loadAssessmentIntoBuilder = useCallback((assessment: Assessment) => {
    const content = assessment.description || assessment.sourceDocument?.extractedText || ''
    setAssessmentBuilder({
      title: assessment.title || '',
      taskContent: content,
      taskPci: assessment.instructions || '',
      details: '',
      extensions: [],
      activeExtensionId: null,
    })
    setAssessmentDmiItems(assessment.dmiItems || [])
    setAssessmentDmiVersions(assessment.dmiVersions || [])
    setTestPciSource('assessment')
    if (assessment.activeDmiVersionId) {
      setTestPciViewMode(`dmi_${assessment.activeDmiVersionId}`)
    } else {
      setTestPciViewMode('pdf')
    }
    setLoadedAssessmentId(assessment.id)
    setAssessmentUploadedFiles(
      assessment.sourceDocument ? [{ id: 'source', name: assessment.sourceDocument.fileName }] : []
    )
    setAssessmentSourceDocument(assessment.sourceDocument)
    setAssessmentBuilderActiveTab('content')
  }, [])

  const handlePciSend = useCallback(
    async (type: 'task' | 'assessment', overrideMessage?: string) => {
      const isTask = type === 'task'
      const currentTaskBuilder = taskBuilderRef.current
      const currentAssessmentBuilder = assessmentBuilderRef.current
      const currentTaskId = loadedTaskIdRef.current
      const currentAssessmentId = loadedAssessmentIdRef.current

      const activeTaskInput = currentTaskBuilder.activeExtensionId
        ? taskExtensionPciInputs[currentTaskBuilder.activeExtensionId] || ''
        : taskPciInputMap[currentTaskId || ''] || ''
      const assessmentInput = assessmentPciInputMap[currentAssessmentId || ''] || ''
      const input = overrideMessage || (isTask ? activeTaskInput : assessmentInput)
      const assessmentLoading = assessmentPciLoadingMap[currentAssessmentId || ''] || false
      const loading = isTask ? taskPciLoading : assessmentLoading
      if (!input.trim() || loading) return

      const userMessage = input.trim()

      if (!overrideMessage) {
        if (isTask) {
          if (currentTaskBuilder.activeExtensionId) {
            setTaskExtensionPciInputs(prev => ({
              ...prev,
              [currentTaskBuilder.activeExtensionId as string]: '',
            }))
          } else {
            setTaskPciInputMap(prev => ({ ...prev, [currentTaskId || '']: '' }))
          }
        } else {
          setAssessmentPciInputMap(prev => ({ ...prev, [currentAssessmentId || '']: '' }))
        }
      }

      const currentTaskMessages = currentTaskBuilder.activeExtensionId
        ? taskExtensionPciMessages[currentTaskBuilder.activeExtensionId] || []
        : taskPciMessages
      const currentAssessmentMessages = assessmentPciMessagesMap[currentAssessmentId || ''] || []
      const nextMessages = (isTask ? currentTaskMessages : currentAssessmentMessages).concat({
        role: 'user',
        content: userMessage,
      })

      // Write a finalized, clean PCI string straight to the field (used when the
      // PCI assistant returns a finalized rubric — keeps the conversation out of
      // the saved PCI).
      const setTaskPciValue = (value: string) => {
        setTaskBuilder(prev => {
          if (prev.activeExtensionId) {
            return {
              ...prev,
              extensions: prev.extensions.map(ext =>
                ext.id === prev.activeExtensionId ? { ...ext, pci: value } : ext
              ),
            }
          }
          return { ...prev, taskPci: value }
        })
      }

      if (isTask) {
        if (currentTaskBuilder.activeExtensionId) {
          setTaskExtensionPciMessages(prev => ({
            ...prev,
            [currentTaskBuilder.activeExtensionId as string]: nextMessages,
          }))
        } else {
          setTaskPciMessages(nextMessages)
        }
        // PCI field is written only from a finalized rubric (see pciDraft below),
        // not from the running conversation transcript.
        setTaskPciLoading(true)
      } else {
        setAssessmentPciMessagesMap(prev => ({
          ...prev,
          [currentAssessmentId || '']: nextMessages,
        }))
        setAssessmentPciLoadingMap(prev => ({ ...prev, [currentAssessmentId || '']: true }))
      }

      try {
        const slideContent = isTask
          ? currentTaskBuilder.taskContent
          : currentAssessmentBuilder.taskContent
        const pci = isTask
          ? currentTaskBuilder.activeExtensionId
            ? currentTaskBuilder.extensions.find(e => e.id === currentTaskBuilder.activeExtensionId)
                ?.pci || currentTaskBuilder.taskPci
            : currentTaskBuilder.taskPci
          : currentAssessmentBuilder.taskPci
        const sessionId = isTask
          ? currentTaskId
            ? `pci-task:${currentTaskId}`
            : undefined
          : currentAssessmentId
            ? `pci-assessment:${currentAssessmentId}`
            : undefined
        const activeExt =
          isTask && currentTaskBuilder.activeExtensionId
            ? currentTaskBuilder.extensions.find(e => e.id === currentTaskBuilder.activeExtensionId)
            : null
        const extensionName = activeExt ? activeExt.name : undefined

        const sourceDocData = isTask
          ? activeExt?.sourceDocument || taskSourceDocument
          : assessmentSourceDocument
        const sourceDocument = sourceDocData
          ? {
              fileName: sourceDocData.fileName,
              fileUrl: sourceDocData.fileUrl,
              mimeType: sourceDocData.mimeType,
            }
          : undefined

        const response = await fetch('/api/ai/pci-master', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMessage,
            sessionId,
            context: {
              type,
              title: isTask ? currentTaskBuilder.title : currentAssessmentBuilder.title,
              content: slideContent,
              pci,
              extensionName,
              sourceDocument,
            },
          }),
        })
        if (!response.ok) {
          let errorMessage = `Failed to get AI response (${response.status})`
          try {
            const errorBody = await response.json()
            if (errorBody?.error) {
              errorMessage = errorBody.errorId
                ? `${errorBody.error} (Error ID: ${errorBody.errorId})`
                : errorBody.error
            }
          } catch {
            // ignore
          }
          throw new Error(errorMessage)
        }
        const data = await response.json()
        // The PCI assistant returns a finalized, clean rubric in `pciDraft` ONLY
        // after the tutor approves finalizing; until then it's empty and the PCI
        // field is left untouched (the chat stays conversational).
        const pciDraft = typeof data.pciDraft === 'string' ? data.pciDraft.trim() : ''
        const assistantMessage = {
          role: 'assistant' as const,
          content: data.response || 'Unable to respond.',
        }
        if (isTask) {
          const updated = nextMessages.concat(assistantMessage)
          if (currentTaskBuilder.activeExtensionId) {
            setTaskExtensionPciMessages(prev => ({
              ...prev,
              [currentTaskBuilder.activeExtensionId as string]: updated,
            }))
          } else {
            setTaskPciMessages(updated)
          }
          if (pciDraft) setTaskPciValue(pciDraft)
          setTaskPciErrorHint('')
        } else {
          const updated = nextMessages.concat(assistantMessage)
          setAssessmentPciMessagesMap(prev => ({ ...prev, [currentAssessmentId || '']: updated }))
          if (pciDraft) {
            setAssessmentBuilder(prev => ({ ...prev, taskPci: pciDraft }))
          }
          setAssessmentPciErrorHintMap(prev => ({ ...prev, [currentAssessmentId || '']: '' }))
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? `PCI Assistant error: ${error.message}`
            : 'PCI Assistant error. Please try again.'
        toast.error(message)
        const hint =
          error instanceof Error && error.message
            ? error.message
            : 'Unable to reach the PCI assistant. Please try again.'
        if (isTask) setTaskPciErrorHint(hint)
        else setAssessmentPciErrorHintMap(prev => ({ ...prev, [currentAssessmentId || '']: hint }))
        const errorMessage = {
          role: 'assistant' as const,
          content: 'Sorry, there was an error processing your request. Please try again.',
        }
        if (isTask) {
          const updated = nextMessages.concat(errorMessage)
          if (currentTaskBuilder.activeExtensionId) {
            setTaskExtensionPciMessages(prev => ({
              ...prev,
              [currentTaskBuilder.activeExtensionId as string]: updated,
            }))
          } else {
            setTaskPciMessages(updated)
          }
        } else {
          const updated = nextMessages.concat(errorMessage)
          setAssessmentPciMessagesMap(prev => ({ ...prev, [currentAssessmentId || '']: updated }))
        }
      } finally {
        if (isTask) setTaskPciLoading(false)
        else setAssessmentPciLoadingMap(prev => ({ ...prev, [currentAssessmentId || '']: false }))
      }
    },
    [
      taskPciLoading,
      assessmentPciLoadingMap,
      taskPciInputMap,
      assessmentPciInputMap,
      taskPciMessages,
      taskExtensionPciMessages,
      assessmentPciMessagesMap,
      taskSourceDocument,
      assessmentSourceDocument,
    ]
  )

  const handleTestPciSubmit = useCallback(async () => {
    const currentInput = testPciInputs[testPciActiveTab] || ''
    if (!currentInput.trim() || testPciLoading) return

    const answer = currentInput.trim()
    setTestPciInputs(prev => ({ ...prev, [testPciActiveTab]: '' }))
    setTestPciLoading(true)

    const currentTaskBuilder = taskBuilderRef.current
    const currentAssessmentBuilder = assessmentBuilderRef.current

    const pciContent =
      testPciSource === 'task'
        ? currentTaskBuilder.activeExtensionId
          ? currentTaskBuilder.extensions.find(e => e.id === currentTaskBuilder.activeExtensionId)
              ?.pci || currentTaskBuilder.taskPci
          : currentTaskBuilder.taskPci
        : currentAssessmentBuilder.taskPci

    const tabsToUpdate: string[] = []
    if (testPciActiveTab === 'classroom') {
      tabsToUpdate.push('classroom', 'student1', 'student2')
    } else {
      tabsToUpdate.push(testPciActiveTab)
    }

    setTestPciContent(prev => {
      const newContent = { ...prev }
      tabsToUpdate.forEach(tab => {
        newContent[tab] = (newContent[tab] ? newContent[tab] + '\n' : '') + `Tutor: ${answer}`
      })
      return newContent
    })

    try {
      const gradingContent =
        testPciActiveTab === 'classroom'
          ? testPciContent.classroom
          : testPciContent[testPciActiveTab] || ''
      const safeGradingContent = gradingContent.slice(0, 500)

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content:
                "You are an AI tutor assistant. Score the student's answer on a scale of 0-100 and provide brief feedback.",
            },
            {
              role: 'user',
              content: `Question/Context: ${pciContent?.slice(0, 1000) || 'N/A'}\n\nStudent Answer: ${answer}\n\nPrevious conversation: ${safeGradingContent}`,
            },
          ],
          temperature: 0.3,
        }),
      })

      if (!response.ok) throw new Error(`Grading failed: ${response.status}`)

      const data = await response.json()
      const aiResponse = data.response || data.choices?.[0]?.message?.content || ''

      const scoreMatch = aiResponse.match(/(\d{1,3})/)
      const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10))) : 75
      const feedback = aiResponse.replace(/\d{1,3}\/100/, '').trim() || 'Good effort!'

      setTestPciScores(prev => {
        const next = { ...prev }
        tabsToUpdate.forEach(tab => {
          next[tab] = [...(next[tab] || []), { score, feedback }]
        })
        return next
      })

      setTestPciContent(prev => {
        const next = { ...prev }
        tabsToUpdate.forEach(tab => {
          next[tab] = (next[tab] ? next[tab] + '\n' : '') + `AI: ${aiResponse}`
        })
        return next
      })
    } catch {
      toast.error('Failed to score answer. Please try again.')
    } finally {
      setTestPciLoading(false)
    }
  }, [testPciInputs, testPciActiveTab, testPciLoading, testPciContent, testPciSource])

  const handleGenerateDMI = useCallback(
    async (type: 'task' | 'assessment') => {
      const isTask = type === 'task'
      const currentTaskBuilder = taskBuilderRef.current
      const currentAssessmentBuilder = assessmentBuilderRef.current
      const builder = isTask ? currentTaskBuilder : currentAssessmentBuilder
      const activeExt =
        isTask && currentTaskBuilder.activeExtensionId
          ? currentTaskBuilder.extensions.find(e => e.id === currentTaskBuilder.activeExtensionId)
          : null
      const content = activeExt ? activeExt.content : builder.taskContent
      const sourceDoc = isTask
        ? activeExt?.sourceDocument || taskSourceDocument
        : assessmentSourceDocument

      const hasContent = content.trim().length > 0
      const hasPdf = sourceDoc?.mimeType === 'application/pdf' && sourceDoc.fileUrl

      if (!hasContent && !hasPdf) {
        toast.error('Please add Assessment content or load a PDF first')
        return
      }

      setDmiGenerating(true)
      try {
        let pdfPages: string[] | undefined
        if (hasPdf) {
          toast.info('Analyzing PDF with AI...')
          // Analyze up to 5 pages (the generate-dmi API cap) instead of silently 3.
          pdfPages = await renderPdfToImages(sourceDoc.fileUrl, 5)
        }

        const response = await fetch('/api/ai/generate-dmi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            title: builder.title,
            content: !hasPdf && hasContent ? content : undefined,
            pdfPages,
          }),
        })

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(errorBody.error || `Failed to generate DMI (${response.status})`)
        }

        const data = await response.json()
        const questions = data.questions || []

        if (questions.length === 0) {
          toast.warning('No questions could be generated. Try adding more content.')
          return
        }

        const items: DMIQuestion[] = questions.map((q: any) => ({
          id: `dmi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          questionNumber: q.questionNumber || 1,
          questionText: q.questionText || 'Question',
          answer: q.answer || '',
        }))

        const existingVersions = isTask
          ? taskDmiVersionsRef.current
          : assessmentDmiVersionsRef.current
        const nextVersionNumber = existingVersions.length + 1

        const newVersion: DMIVersion = {
          id: `dmi-version-${Date.now()}`,
          versionNumber: nextVersionNumber,
          items: items,
          createdAt: Date.now(),
          taskId: isTask ? loadedTaskIdRef.current || undefined : undefined,
          assessmentId: !isTask ? loadedAssessmentIdRef.current || undefined : undefined,
        }

        if (isTask) {
          setTaskDmiItems(items)
          setTaskDmiVersions(prev => [...prev, newVersion])
          setTestPciSource('task')
          setTestPciViewMode(`dmi_${newVersion.id}`)
        } else {
          setAssessmentDmiItems(items)
          setAssessmentDmiVersions(prev => [...prev, newVersion])
          setTestPciSource('assessment')
          setTestPciViewMode(`dmi_${newVersion.id}`)
        }

        toast.success(`DMI form v${nextVersionNumber} created with ${items.length} questions`)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate DMI'
        toast.error(message)
      } finally {
        setDmiGenerating(false)
      }
    },
    [taskSourceDocument, assessmentSourceDocument]
  )

  const handleLoadDmiVersion = useCallback((version: DMIVersion, type: 'task' | 'assessment') => {
    const currentTaskBuilder = taskBuilderRef.current
    const currentAssessmentBuilder = assessmentBuilderRef.current
    if (type === 'task') {
      setTaskDmiItems(version.items)
    } else {
      setAssessmentDmiItems(version.items)
    }
    setShowDmiVersionList(false)

    const content =
      type === 'task' ? currentTaskBuilder.taskContent : currentAssessmentBuilder.taskContent
    setTestPciScores({})
    setTestPciInputs({ classroom: '', student1: '', student2: '' })
    setTestPciContent({
      classroom: content,
      student1: content,
      student2: content,
    })
    setTestPciSource(type)
    setTestPciViewMode(`dmi_${version.id}`)
    setTestPciActiveTab('classroom')

    toast.success(`Loaded DMI version ${version.versionNumber}`)
  }, [])

  const handleDeleteDmiVersion = useCallback((versionId: string, type: 'task' | 'assessment') => {
    if (type === 'task') {
      setTaskDmiVersions(prev => prev.filter(v => v.id !== versionId))
    } else {
      setAssessmentDmiVersions(prev => prev.filter(v => v.id !== versionId))
    }
  }, [])

  return {
    taskBuilder,
    setTaskBuilder,
    taskBuilderActiveTab,
    setTaskBuilderActiveTab,
    assessmentBuilder,
    setAssessmentBuilder,
    assessmentBuilderActiveTab,
    setAssessmentBuilderActiveTab,
    mainBuilderTab,
    setMainBuilderTab,
    loadedTaskId,
    setLoadedTaskId,
    loadedAssessmentId,
    setLoadedAssessmentId,
    taskPciMessages,
    setTaskPciMessages,
    taskExtensionPciMessages,
    setTaskExtensionPciMessages,
    taskExtensionPciInputs,
    setTaskExtensionPciInputs,
    assessmentPciMessagesMap,
    setAssessmentPciMessagesMap,
    taskPciInputMap,
    setTaskPciInputMap,
    assessmentPciInputMap,
    setAssessmentPciInputMap,
    taskPciLoading,
    setTaskPciLoading,
    assessmentPciLoadingMap,
    setAssessmentPciLoadingMap,
    taskPciErrorHint,
    setTaskPciErrorHint,
    assessmentPciErrorHintMap,
    setAssessmentPciErrorHintMap,
    aiAssistOpen,
    setAiAssistOpen,
    aiAssistContext,
    setAiAssistContext,
    taskAiMessages,
    setTaskAiMessages,
    assessmentAiMessages,
    setAssessmentAiMessages,
    taskUploadedFiles,
    setTaskUploadedFiles,
    assessmentUploadedFiles,
    setAssessmentUploadedFiles,
    taskSourceDocument,
    setTaskSourceDocument,
    assessmentSourceDocument,
    setAssessmentSourceDocument,
    testPciInputs,
    setTestPciInputs,
    testPciViewMode,
    setTestPciViewMode,
    testPciContent,
    setTestPciContent,
    testPciScores,
    setTestPciScores,
    testPciLoading,
    setTestPciLoading,
    testPciActiveTab,
    setTestPciActiveTab,
    testPciSource,
    setTestPciSource,
    taskDmiItems,
    setTaskDmiItems,
    assessmentDmiItems,
    setAssessmentDmiItems,
    taskDmiVersions,
    setTaskDmiVersions,
    assessmentDmiVersions,
    setAssessmentDmiVersions,
    showDmiVersionList,
    setShowDmiVersionList,
    previewDmiVersion,
    setPreviewDmiVersion,
    dmiGenerating,
    setDmiGenerating,
    loadTaskIntoBuilder,
    loadAssessmentIntoBuilder,
    handlePciSend,
    handleTestPciSubmit,
    handleGenerateDMI,
    handleLoadDmiVersion,
    handleDeleteDmiVersion,
    formatPciTranscript,
  }
}
