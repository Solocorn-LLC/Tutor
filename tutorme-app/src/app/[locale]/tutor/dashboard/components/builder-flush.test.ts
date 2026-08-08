import { describe, it, expect } from 'vitest'
import { buildTaskFlushedNodes, buildAssessmentFlushedNodes } from './builder-flush'
import { DEFAULT_NODE, DEFAULT_LESSON, DEFAULT_TASK, DEFAULT_HOMEWORK } from './builder-utils'
import type { CourseBuilderNode, DMIQuestion } from './builder-types'

function makeNodeWithTask(task = DEFAULT_TASK(0)): CourseBuilderNode {
  const node = DEFAULT_NODE(0)
  node.lessons = [{ ...DEFAULT_LESSON(0), tasks: [task], homework: [] }]
  return node
}

function makeNodeWithAssessment(assessment = DEFAULT_HOMEWORK(0, 'assessment')): CourseBuilderNode {
  const node = DEFAULT_NODE(0)
  node.lessons = [{ ...DEFAULT_LESSON(0), tasks: [], homework: [assessment] }]
  return node
}

describe('buildTaskFlushedNodes', () => {
  it('returns the same nodes reference when no task is loaded', () => {
    const nodes = [makeNodeWithTask()]
    const { nextNodes, changed } = buildTaskFlushedNodes(
      nodes,
      null,
      { title: '', details: '', taskContent: '', taskPci: '', extensions: [] },
      [],
      [],
      undefined,
      'task',
      'pdf'
    )
    expect(changed).toBe(false)
    expect(nextNodes).toBe(nodes)
  })

  it('returns the same nodes reference when builder state already matches the task', () => {
    const task = DEFAULT_TASK(0)
    const nodes = [makeNodeWithTask(task)]
    const { nextNodes, changed } = buildTaskFlushedNodes(
      nodes,
      task.id,
      {
        title: task.title,
        details: task.shortDescription ?? '',
        taskContent: task.description,
        taskPci: task.instructions,
        pciHistory: task.pciHistory,
        pciSpec: task.pciSpec,
        pciThread: task.pciThread,
        extensions: task.extensions ?? [],
        sourceDocument: task.sourceDocument,
      },
      task.dmiItems,
      task.dmiVersions,
      task.documentKind,
      'task',
      'pdf'
    )
    expect(changed).toBe(false)
    expect(nextNodes).toBe(nodes)
  })

  it('merges pending DMI items and builder edits into the loaded task', () => {
    const task = DEFAULT_TASK(0)
    const nodes = [makeNodeWithTask(task)]
    const newDmi: DMIQuestion[] = [
      {
        id: 'q-1',
        questionNumber: 1,
        questionText: 'What is 2+2?',
        answer: '4',
        marks: 1,
      },
    ]

    const { nextNodes, changed } = buildTaskFlushedNodes(
      nodes,
      task.id,
      {
        title: 'Updated task title',
        details: 'Updated details',
        taskContent: 'Updated content',
        taskPci: 'Updated PCI',
        extensions: [],
      },
      newDmi,
      [],
      undefined,
      'task',
      'pdf'
    )

    expect(changed).toBe(true)
    expect(nextNodes).not.toBe(nodes)
    const flushedTask = nextNodes[0].lessons[0].tasks[0]
    expect(flushedTask.title).toBe('Updated task title')
    expect(flushedTask.shortDescription).toBe('Updated details')
    expect(flushedTask.description).toBe('Updated content')
    expect(flushedTask.instructions).toBe('Updated PCI')
    expect(flushedTask.dmiItems).toBe(newDmi)
  })

  it('sets activeDmiVersionId from testPciViewMode when viewing a task DMI', () => {
    const task = DEFAULT_TASK(0)
    const nodes = [makeNodeWithTask(task)]
    const versionId = 'version-123'

    const { nextNodes, changed } = buildTaskFlushedNodes(
      nodes,
      task.id,
      {
        title: task.title,
        details: task.shortDescription ?? '',
        taskContent: task.description,
        taskPci: task.instructions,
        extensions: task.extensions ?? [],
      },
      [],
      [{ id: versionId, versionNumber: 1, items: [], createdAt: 0 }],
      undefined,
      'task',
      `dmi_${versionId}`
    )

    expect(changed).toBe(true)
    expect(nextNodes[0].lessons[0].tasks[0].activeDmiVersionId).toBe(versionId)
  })
})

describe('buildAssessmentFlushedNodes', () => {
  it('returns the same nodes reference when no assessment is loaded', () => {
    const nodes = [makeNodeWithAssessment()]
    const { nextNodes, changed } = buildAssessmentFlushedNodes(
      nodes,
      null,
      { title: '', taskContent: '', taskPci: '', details: '', extensions: [] },
      [],
      undefined
    )
    expect(changed).toBe(false)
    expect(nextNodes).toBe(nodes)
  })

  it('returns the same nodes reference when builder state already matches the assessment', () => {
    const assessment = DEFAULT_HOMEWORK(0, 'assessment')
    const nodes = [makeNodeWithAssessment(assessment)]
    const { nextNodes, changed } = buildAssessmentFlushedNodes(
      nodes,
      assessment.id,
      {
        title: assessment.title,
        taskContent: assessment.description,
        taskPci: assessment.instructions,
        pciHistory: assessment.pciHistory,
        pciSpec: assessment.pciSpec,
        pciThread: assessment.pciThread,
        extensions: [],
        sourceDocument: assessment.sourceDocument,
        pages: assessment.pages,
        dmiExamBody: assessment.dmiExamBody,
        dmiSubject: assessment.dmiSubject,
      },
      assessment.dmiItems,
      assessment.documentKind
    )
    expect(changed).toBe(false)
    expect(nextNodes).toBe(nodes)
  })

  it('merges pending DMI items and builder edits into the loaded assessment', () => {
    const assessment = DEFAULT_HOMEWORK(0, 'assessment')
    const nodes = [makeNodeWithAssessment(assessment)]
    const newDmi: DMIQuestion[] = [
      {
        id: 'q-1',
        questionNumber: 1,
        questionText: 'Explain photosynthesis.',
        answer: 'Plants use sunlight to make food.',
        marks: 5,
      },
    ]

    const { nextNodes, changed } = buildAssessmentFlushedNodes(
      nodes,
      assessment.id,
      {
        title: 'Updated assessment title',
        taskContent: 'Updated content',
        taskPci: 'Updated PCI',
        extensions: [],
      },
      newDmi,
      undefined
    )

    expect(changed).toBe(true)
    expect(nextNodes).not.toBe(nodes)
    const flushedAssessment = nextNodes[0].lessons[0].homework[0]
    expect(flushedAssessment.title).toBe('Updated assessment title')
    expect(flushedAssessment.description).toBe('Updated content')
    expect(flushedAssessment.instructions).toBe('Updated PCI')
    expect(flushedAssessment.dmiItems).toBe(newDmi)
    expect(flushedAssessment.dmiVersions).toBeUndefined()
    expect(flushedAssessment.activeDmiVersionId).toBeUndefined()
  })
})
