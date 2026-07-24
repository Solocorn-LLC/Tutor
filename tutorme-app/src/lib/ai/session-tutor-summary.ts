/**
 * Shared summary request builder for the tutor-facing Session AI (SAI).
 *
 * Used in both:
 *   - the course builder Test tab, when a test student clicks "Task Complete"
 *   - the live classroom tutor view, when a real student submits a chat task
 *
 * Keeping the prompt and context shape identical in both places guarantees that
 * the AI summary behaves the same way in Test mode and live sessions.
 */

import type { PciSpec } from '@/lib/assessment/pci-spec'

export interface ClassroomSummaryStudentAnswers {
  studentName?: string
  answers: string[]
}

export interface ClassroomSummaryContext {
  taskId?: string
  taskName?: string
  courseName?: string
  taskContent?: string
  taskPci?: string
  taskPciSpec?: PciSpec | null
  extensionName?: string | null
  enrolledStudents?: number
  currentDate?: string
  sessionNumber?: number
  attendance?: string
}

export function buildClassroomSummaryRequest(
  students: ClassroomSummaryStudentAnswers[],
  context: ClassroomSummaryContext
): { message: string; context: ClassroomSummaryContext } {
  const allAnswers = students.flatMap(s => s.answers)
  const summaryRequest = [
    'The following student answers have been submitted for this task.',
    context.enrolledStudents != null
      ? `Total students enrolled in this session: ${context.enrolledStudents}.`
      : undefined,
    `Students who have submitted/completed so far: ${students.length}.`,
    'Provide 2-3 concise bullets summarizing class-level patterns, common misconceptions, or completion status only.',
    'Do NOT name, number, or describe individual students.',
    'Do NOT evaluate, judge, or comment on any individual answer.',
    'Do NOT add meta-commentary about what you are not doing or what guidelines you are following.',
    'Do NOT say all students completed unless the submitted count equals the enrolled count.',
    '',
    'Submitted answers:',
    ...allAnswers.map(a => `- ${a}`),
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n')

  return { message: summaryRequest, context }
}
