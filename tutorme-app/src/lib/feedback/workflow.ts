/**
 * AI Feedback Workflow Service
 * Manages AI-generated feedback pending tutor approval
 */

import { and, asc, eq, gte, inArray } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import { builderTask, feedbackWorkflow, profile, taskSubmission, user } from '@/lib/db/schema'
import { generateWithFallback } from '@/lib/agents'

export type FeedbackType = 'task_feedback' | 'progress_report' | 'encouragement' | 'correction'
export type FeedbackStatus =
  | 'ai_generated'
  | 'tutor_modified'
  | 'approved'
  | 'sent_to_student'
  | 'rejected'

export interface FeedbackRequest {
  studentId: string
  submissionId: string // Required by schema
  type: FeedbackType
  context: {
    taskId?: string
    subject?: string
    recentPerformance?: number
    strengths?: string[]
    weaknesses?: string[]
    specificIssue?: string
  }
  priority: 'low' | 'medium' | 'high'
  requestedBy?: string // tutor ID if manually requested
}

export interface GeneratedFeedback {
  content: string
  score?: number
  tone: 'positive' | 'neutral' | 'constructive'
  strengths: string[]
  improvements: string[]
  resources: string[]
  aiConfidence: number // 0-1
}

// Auto-approve threshold - feedback with confidence above this is auto-approved
const AUTO_APPROVE_THRESHOLD = 0.85

/**
 * Generate feedback using AI based on context
 */
export async function generateFeedback(
  request: FeedbackRequest
): Promise<{ success: boolean; feedback?: GeneratedFeedback; error?: string }> {
  try {
    let prompt = ''

    switch (request.type) {
      case 'task_feedback':
        prompt = createTaskFeedbackPrompt(request)
        break
      case 'progress_report':
        prompt = createProgressReportPrompt(request)
        break
      case 'encouragement':
        prompt = createEncouragementPrompt(request)
        break
      case 'correction':
        prompt = createCorrectionPrompt(request)
        break
      default:
        return { success: false, error: '未知的反馈类型' }
    }

    const result = await generateWithFallback(prompt, { temperature: 0.7 })
    const parsed = parseFeedbackResponse(result.content, request.type)

    // Calculate confidence based on context completeness
    const confidence = calculateConfidence(request)

    const feedback: GeneratedFeedback = {
      content: parsed.content,
      score: parsed.score,
      tone: parsed.tone,
      strengths: parsed.strengths,
      improvements: parsed.improvements,
      resources: parsed.resources,
      aiConfidence: confidence,
    }

    return { success: true, feedback }
  } catch (error) {
    console.error('Feedback generation failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '生成反馈失败',
    }
  }
}

/**
 * Create prompt for task feedback
 */
function createTaskFeedbackPrompt(request: FeedbackRequest): string {
  return `作为一位经验丰富的教育导师，请为学生的作业提供详细反馈。

学生信息：
- 学生ID: ${request.studentId}
- 科目: ${request.context.subject || '未指定'}
- 最近表现: ${request.context.recentPerformance || '未记录'}%
- 优势领域: ${(request.context.strengths || []).join('、') || '暂无'}
- 薄弱领域: ${(request.context.weaknesses || []).join('、') || '暂无'}

请提供：
1. 具体、建设性的反馈内容（200-500字）
2. 建议分数（0-100）
3. 3-5个表现出的优势
4. 3-5个需要改进的方面
5. 2-3个相关学习资源推荐

请以下面JSON格式返回：
{
  "content": "反馈内容...",
  "score": 85,
  "tone": "constructive",
  "strengths": ["优势1", "优势2", "优势3"],
  "improvements": ["改进1", "改进2", "改进3"],
  "resources": ["资源1", "资源2"]
}`
}

/**
 * Create prompt for progress report
 */
function createProgressReportPrompt(request: FeedbackRequest): string {
  return `作为一位教育导师，请为学生生成一份进度报告。

学生表现数据：
- 最近表现分数: ${request.context.recentPerformance || '未记录'}%
- 优势领域: ${(request.context.strengths || []).join('、') || '暂无'}
- 需要改进的领域: ${(request.context.weaknesses || []).join('、') || '暂无'}

请生成一份鼓励性的进度报告，包含：
1. 整体进度总结（150-300字）
2. 建议分数（0-100）
3. 3-5个表现出的优势
4. 3-5个需要改进的方面
5. 下一步学习资源（2-3个）

请以下面JSON格式返回：
{
  "content": "进度报告内容...",
  "score": 88,
  "tone": "positive",
  "strengths": ["优势1", "优势2", "优势3"],
  "improvements": ["改进1", "改进2"],
  "resources": ["资源1", "资源2"]
}`
}

/**
 * Create prompt for encouragement
 */
function createEncouragementPrompt(request: FeedbackRequest): string {
  return `作为一位支持性的教育导师，请为需要鼓励的学生写一段激励话语。

学生情况：
- 可能遇到的困难: ${request.context.specificIssue || '学习挑战'}
- 优势领域: ${(request.context.strengths || []).join('、') || '努力上进'}

请写一段温暖、鼓励性的反馈（100-200字），帮助学生建立信心，保持学习动力。
语调必须是 positive。

请以下面JSON格式返回：
{
  "content": "鼓励内容...",
  "score": 90,
  "tone": "positive",
  "strengths": ["态度积极", "持续努力"],
  "improvements": ["继续保持"],
  "resources": []
}`
}

/**
 * Create prompt for correction feedback
 */
function createCorrectionPrompt(request: FeedbackRequest): string {
  return `作为一位耐心的教育导师，请指出学生的错误并提供纠正指导。

需要纠正的问题: ${request.context.specificIssue || '学习方法或理解错误'}
相关科目: ${request.context.subject || '通用'}

请提供：
1. 温和但明确地指出错误（150-300字）
2. 建议分数（0-100）
3. 正确理解方面的优势
4. 需要改进的具体方面
5. 相关学习资源

语调应该是 constructive。

请以下面JSON格式返回：
{
  "content": "纠正反馈内容...",
  "score": 65,
  "tone": "constructive",
  "strengths": ["勇于尝试", "基础知识扎实"],
  "improvements": ["需要仔细审题", "注意计算过程"],
  "resources": ["相关练习题", "知识点讲解视频"]
}`
}

/**
 * Parse AI response into structured feedback
 */
function parseFeedbackResponse(response: string, type: FeedbackType): GeneratedFeedback {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }

    const parsed = JSON.parse(jsonMatch[0])

    return {
      content: parsed.content || response,
      score: parsed.score,
      tone: parsed.tone || 'neutral',
      strengths: parsed.strengths || [],
      improvements: parsed.improvements || [],
      resources: parsed.resources || [],
      aiConfidence: 0.7,
    }
  } catch (error) {
    // Fallback to raw response
    return {
      content: response,
      tone: 'neutral',
      strengths: [],
      improvements: [],
      resources: [],
      aiConfidence: 0.5,
    }
  }
}

/**
 * Calculate AI confidence based on context completeness
 */
function calculateConfidence(request: FeedbackRequest): number {
  let score = 0.7 // Base confidence

  if (request.context.strengths?.length) score += 0.05
  if (request.context.weaknesses?.length) score += 0.05
  if (request.context.recentPerformance) score += 0.05
  if (request.context.subject) score += 0.05
  if (request.context.taskId) score += 0.05

  return Math.min(0.95, score)
}

/**
 * Submit feedback for tutor review
 */
export async function submitFeedbackForReview(
  feedback: GeneratedFeedback,
  request: FeedbackRequest
): Promise<{ success: boolean; workflowId?: string; autoApproved: boolean; error?: string }> {
  try {
    const autoApproved = feedback.aiConfidence >= AUTO_APPROVE_THRESHOLD
    const workflowId = crypto.randomUUID()
    const now = new Date()

    await drizzleDb.insert(feedbackWorkflow).values({
      workflowId: workflowId,
      submissionId: request.submissionId,
      studentId: request.studentId,
      aiScore: feedback.score ?? null,
      aiComments: feedback.content,
      aiStrengths: feedback.strengths,
      aiImprovements: feedback.improvements,
      aiResources: feedback.resources,
      status: autoApproved ? 'approved' : 'ai_generated',
      autoApproved,
      approvedBy: autoApproved ? 'SYSTEM' : null,
      approvedAt: autoApproved ? now : null,
    })

    if (autoApproved) {
      await drizzleDb
        .update(feedbackWorkflow)
        .set({ status: 'sent_to_student' })
        .where(eq(feedbackWorkflow.workflowId, workflowId))
    }

    return {
      success: true,
      workflowId,
      autoApproved,
    }
  } catch (error) {
    console.error('Failed to submit feedback:', error)
    return {
      success: false,
      autoApproved: false,
      error: error instanceof Error ? error.message : '提交反馈失败',
    }
  }
}

/**
 * Get pending feedback for tutor review
 */
export async function getPendingFeedback(
  tutorId?: string,
  options?: {
    priority?: 'low' | 'medium' | 'high'
    type?: FeedbackType
    limit?: number
    offset?: number
  }
): Promise<{
  items: {
    workflowId: string
    studentId: string
    submissionId: string
    type: FeedbackType
    priority: string
    aiContent: GeneratedFeedback
    createdAt: Date
    studentName?: string
  }[]
  total: number
}> {
  const statusFilter = inArray(feedbackWorkflow.status, ['ai_generated', 'tutor_modified'])

  const [workflowsRows, countResult] = await Promise.all([
    drizzleDb
      .select({
        workflowId: feedbackWorkflow.workflowId,
        studentId: feedbackWorkflow.studentId,
        submissionId: feedbackWorkflow.submissionId,
        aiScore: feedbackWorkflow.aiScore,
        aiComments: feedbackWorkflow.aiComments,
        aiStrengths: feedbackWorkflow.aiStrengths,
        aiImprovements: feedbackWorkflow.aiImprovements,
        aiResources: feedbackWorkflow.aiResources,
        autoApproved: feedbackWorkflow.autoApproved,
        createdAt: feedbackWorkflow.createdAt,
        studentName: profile.name,
      })
      .from(feedbackWorkflow)
      .leftJoin(user, eq(feedbackWorkflow.studentId, user.userId))
      .leftJoin(profile, eq(user.userId, profile.userId))
      .where(statusFilter)
      .orderBy(asc(feedbackWorkflow.createdAt))
      .limit(options?.limit ?? 20)
      .offset(options?.offset ?? 0),
    drizzleDb
      .select({ workflowId: feedbackWorkflow.workflowId })
      .from(feedbackWorkflow)
      .where(statusFilter),
  ])

  const total = countResult.length
  const workflows = workflowsRows

  return {
    items: workflows.map(w => ({
      workflowId: w.workflowId,
      studentId: w.studentId,
      submissionId: w.submissionId,
      type: 'task_feedback' as FeedbackType,
      priority: 'medium',
      aiContent: {
        content: w.aiComments ?? '',
        score: w.aiScore ?? undefined,
        tone: 'neutral' as const,
        strengths: (w.aiStrengths as string[]) ?? [],
        improvements: (w.aiImprovements as string[]) ?? [],
        resources: (w.aiResources as string[]) ?? [],
        aiConfidence: w.autoApproved ? 0.9 : 0.7,
      },
      createdAt: w.createdAt,
      studentName: w.studentName ?? undefined,
    })),
    total,
  }
}

/**
 * Approve or reject feedback
 */
export async function reviewFeedback(
  workflowId: string,
  decision: 'approve' | 'reject' | 'modify',
  reviewerId: string,
  modifications?: {
    modifiedScore?: number
    modifiedComments?: string
    addedNotes?: string
  },
  options?: { bypassOwnership?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const [workflow] = await drizzleDb
      .select()
      .from(feedbackWorkflow)
      .where(eq(feedbackWorkflow.workflowId, workflowId))
      .limit(1)

    if (!workflow) {
      return { success: false, error: '反馈记录不存在' }
    }

    // Ownership: only the tutor who owns the task behind the submission may review
    // its feedback (admins bypass). Prevents IDOR where any tutor could approve/reject
    // any feedback by knowing the workflow id.
    if (!options?.bypassOwnership) {
      const [owner] = await drizzleDb
        .select({ tutorId: builderTask.tutorId })
        .from(taskSubmission)
        .innerJoin(builderTask, eq(taskSubmission.taskId, builderTask.taskId))
        .where(eq(taskSubmission.submissionId, workflow.submissionId))
        .limit(1)

      if (!owner || owner.tutorId !== reviewerId) {
        return { success: false, error: '无权审核此反馈' }
      }
    }

    if (workflow.status === 'sent_to_student' || workflow.status === 'rejected') {
      return { success: false, error: '该反馈已被处理' }
    }

    const isApproveOrModify = decision === 'approve' || decision === 'modify'
    const firstUpdate =
      decision === 'modify' && modifications
        ? {
            status: 'tutor_modified' as const,
            approvedAt: new Date(),
            approvedBy: reviewerId,
            modifiedScore: modifications.modifiedScore ?? undefined,
            modifiedComments: modifications.modifiedComments ?? undefined,
            addedNotes: modifications.addedNotes ?? undefined,
          }
        : {
            status: (isApproveOrModify ? 'approved' : 'rejected') as 'approved' | 'rejected',
            approvedAt: new Date(),
            approvedBy: reviewerId,
          }

    await drizzleDb
      .update(feedbackWorkflow)
      .set(firstUpdate)
      .where(eq(feedbackWorkflow.workflowId, workflowId))

    if (isApproveOrModify) {
      await drizzleDb
        .update(feedbackWorkflow)
        .set({ status: 'sent_to_student' })
        .where(eq(feedbackWorkflow.workflowId, workflowId))
    }

    return { success: true }
  } catch (error) {
    console.error('Feedback review failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '审核反馈失败',
    }
  }
}

/**
 * Get feedback statistics for a tutor
 */
export async function getFeedbackStats(tutorId?: string): Promise<{
  pendingCount: number
  approvedToday: number
  rejectedToday: number
  averageConfidence: number
  autoApprovedRate: number
}> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [pendingRows, approvedTodayRows, rejectedTodayRows, allWorkflows] = await Promise.all([
    drizzleDb
      .select({ workflowId: feedbackWorkflow.workflowId })
      .from(feedbackWorkflow)
      .where(inArray(feedbackWorkflow.status, ['ai_generated', 'tutor_modified'])),
    drizzleDb
      .select({ workflowId: feedbackWorkflow.workflowId })
      .from(feedbackWorkflow)
      .where(
        and(
          inArray(feedbackWorkflow.status, ['approved', 'sent_to_student']),
          gte(feedbackWorkflow.approvedAt, today)
        )
      ),
    drizzleDb
      .select({ workflowId: feedbackWorkflow.workflowId })
      .from(feedbackWorkflow)
      .where(and(eq(feedbackWorkflow.status, 'rejected'), gte(feedbackWorkflow.approvedAt, today))),
    drizzleDb.select({ autoApproved: feedbackWorkflow.autoApproved }).from(feedbackWorkflow),
  ])

  const pendingCount = pendingRows.length
  const approvedToday = approvedTodayRows.length
  const rejectedToday = rejectedTodayRows.length
  const totalWorkflows = allWorkflows.length
  const autoApprovedCount = allWorkflows.filter(w => w.autoApproved).length

  return {
    pendingCount,
    approvedToday,
    rejectedToday,
    averageConfidence: totalWorkflows > 0 ? 0.75 : 0, // Estimate since we don't store confidence
    autoApprovedRate: totalWorkflows > 0 ? autoApprovedCount / totalWorkflows : 0,
  }
}

/**
 * Batch approve feedback
 */
export async function batchApproveFeedback(
  workflowIds: string[],
  reviewerId: string,
  options?: { bypassOwnership?: boolean }
): Promise<{ success: boolean; approved: number; failed: number; error?: string }> {
  let approved = 0
  let failed = 0

  for (const id of workflowIds) {
    const result = await reviewFeedback(id, 'approve', reviewerId, undefined, options)
    if (result.success) {
      approved++
    } else {
      failed++
    }
  }

  return { success: failed === 0, approved, failed }
}
