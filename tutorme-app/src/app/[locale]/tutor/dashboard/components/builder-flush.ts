import type {
  CourseBuilderNode,
  DMIQuestion,
  DMIVersion,
  ImportedLearningResource,
  Task,
} from './builder-types'

/**
 * Flushes the in-memory task builder state into the lesson tree.
 *
 * Task edits live in dedicated local state (`taskBuilder`, DMI item arrays, etc.)
 * and are normally synced back into the lesson tree via an effect. This helper
 * lets both that effect and the save paths produce the exact same up-to-date
 * lesson tree, so a manual Save can never serialize stale `nodes` and drop a
 * newly loaded assessment/task.
 */
export function buildTaskFlushedNodes(
  nodes: CourseBuilderNode[],
  loadedTaskId: string | null,
  taskBuilder: {
    title: string
    details: string
    taskContent: string
    taskPci: string
    pciHistory?: import('@/lib/assessment/pci').PciAuditRecord[]
    pciSpec?: import('@/lib/assessment/pci-spec').PciSpec
    pciThread?: import('./hooks/pci-reducer').PciThread
    extensions: NonNullable<Task['extensions']>
    sourceDocument?: ImportedLearningResource
    linkPreviews?: import('@/lib/link-preview/types').LinkPreviewItem[]
  },
  taskDmiItems: DMIQuestion[],
  taskDmiVersions: DMIVersion[],
  dmiDocumentKindTask: 'question_paper' | 'study_material' | undefined,
  testPciSource: 'task' | 'assessment',
  testPciViewMode: string
): { nextNodes: CourseBuilderNode[]; changed: boolean } {
  if (!loadedTaskId) return { nextNodes: nodes, changed: false }
  let changed = false
  const nextNodes = nodes.map(mod => ({
    ...mod,
    lessons: mod.lessons.map(lesson => ({
      ...lesson,
      tasks: lesson.tasks.map(task => {
        if (task.id !== loadedTaskId) return task
        const nextActiveDmiVersionId =
          testPciSource === 'task' && testPciViewMode.startsWith('dmi_')
            ? testPciViewMode.replace('dmi_', '')
            : task.activeDmiVersionId
        if (
          task.title === taskBuilder.title &&
          task.shortDescription === taskBuilder.details &&
          task.description === taskBuilder.taskContent &&
          task.instructions === taskBuilder.taskPci &&
          task.pciHistory === taskBuilder.pciHistory &&
          task.pciSpec === taskBuilder.pciSpec &&
          task.pciThread === taskBuilder.pciThread &&
          task.extensions === taskBuilder.extensions &&
          task.dmiItems === taskDmiItems &&
          task.documentKind === (dmiDocumentKindTask ?? task.documentKind) &&
          task.dmiVersions === taskDmiVersions &&
          task.activeDmiVersionId === nextActiveDmiVersionId &&
          task.sourceDocument === taskBuilder.sourceDocument &&
          task.linkPreviews === taskBuilder.linkPreviews
        ) {
          return task
        }
        changed = true
        return {
          ...task,
          title: taskBuilder.title,
          shortDescription: taskBuilder.details,
          description: taskBuilder.taskContent,
          instructions: taskBuilder.taskPci,
          pciHistory: taskBuilder.pciHistory,
          pciSpec: taskBuilder.pciSpec,
          pciThread: taskBuilder.pciThread,
          extensions: taskBuilder.extensions,
          dmiItems: taskDmiItems,
          documentKind: dmiDocumentKindTask ?? task.documentKind,
          dmiVersions: taskDmiVersions,
          activeDmiVersionId: nextActiveDmiVersionId,
          sourceDocument: taskBuilder.sourceDocument,
          linkPreviews: taskBuilder.linkPreviews,
        }
      }),
    })),
  }))
  return { nextNodes: changed ? nextNodes : nodes, changed }
}

/**
 * Flushes the in-memory assessment builder state into the lesson tree.
 *
 * See `buildTaskFlushedNodes` for the rationale.
 */
export function buildAssessmentFlushedNodes(
  nodes: CourseBuilderNode[],
  loadedAssessmentId: string | null,
  assessmentBuilder: {
    title: string
    taskContent: string
    taskPci: string
    pciSpec?: import('@/lib/assessment/pci-spec').PciSpec
    pciHistory?: import('@/lib/assessment/pci').PciAuditRecord[]
    pciThread?: import('./hooks/pci-reducer').PciThread
    sourceDocument?: ImportedLearningResource
    pages?: string[]
    dmiExamBody?: string
    dmiSubject?: string
    linkPreviews?: import('@/lib/link-preview/types').LinkPreviewItem[]
  },
  assessmentDmiItems: DMIQuestion[],
  dmiDocumentKindAssessment: 'question_paper' | 'study_material' | undefined
): { nextNodes: CourseBuilderNode[]; changed: boolean } {
  if (!loadedAssessmentId) return { nextNodes: nodes, changed: false }
  let changed = false
  const nextNodes = nodes.map(mod => ({
    ...mod,
    lessons: mod.lessons.map(lesson => ({
      ...lesson,
      homework: lesson.homework.map(hw => {
        if (hw.id !== loadedAssessmentId) return hw
        if (
          hw.title === assessmentBuilder.title &&
          hw.description === assessmentBuilder.taskContent &&
          hw.instructions === assessmentBuilder.taskPci &&
          hw.pciHistory === assessmentBuilder.pciHistory &&
          hw.pciSpec === assessmentBuilder.pciSpec &&
          hw.pciThread === assessmentBuilder.pciThread &&
          hw.dmiItems === assessmentDmiItems &&
          hw.documentKind === (dmiDocumentKindAssessment ?? hw.documentKind) &&
          hw.dmiExamBody === assessmentBuilder.dmiExamBody &&
          hw.dmiSubject === assessmentBuilder.dmiSubject &&
          hw.sourceDocument === assessmentBuilder.sourceDocument &&
          hw.pages === assessmentBuilder.pages &&
          hw.linkPreviews === assessmentBuilder.linkPreviews
        ) {
          return hw
        }
        changed = true
        return {
          ...hw,
          title: assessmentBuilder.title,
          description: assessmentBuilder.taskContent,
          instructions: assessmentBuilder.taskPci,
          pciHistory: assessmentBuilder.pciHistory,
          pciSpec: assessmentBuilder.pciSpec,
          pciThread: assessmentBuilder.pciThread,
          dmiItems: assessmentDmiItems,
          documentKind: dmiDocumentKindAssessment ?? hw.documentKind,
          dmiExamBody: assessmentBuilder.dmiExamBody,
          dmiSubject: assessmentBuilder.dmiSubject,
          dmiVersions: undefined,
          activeDmiVersionId: undefined,
          sourceDocument: assessmentBuilder.sourceDocument,
          pages: assessmentBuilder.pages,
          linkPreviews: assessmentBuilder.linkPreviews,
        }
      }),
    })),
  }))
  return { nextNodes: changed ? nextNodes : nodes, changed }
}
