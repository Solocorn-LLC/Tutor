/**
 * Course Lesson Controller
 * Manages structured lesson flow with AI tutor (Drizzle ORM)
 */

import { and, eq, inArray, sql } from 'drizzle-orm'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  course,
  courseLesson,
  courseLessonProgress,
  courseProgress,
  lessonLearningSession,
} from '@/lib/db/schema'
import { chatWithFallback } from '@/lib/agents'

export type LessonSection = 'introduction' | 'concept' | 'example' | 'practice' | 'review'

export interface LessonSessionType {
  sessionId: string
  lessonId: string
  studentId: string
  status: string
  currentSection: LessonSection
  conceptMastery: Record<string, number>
  misconceptions: string[]
  sessionContext: any
  whiteboardItems: any[]
  startedAt: Date
  lastActivityAt: Date
  completedAt?: Date
}

export interface LessonAdvanceResult {
  newSection: LessonSection
  sectionComplete: boolean
  lessonComplete: boolean
}

export interface UnderstandingAssessment {
  understandingLevel: number
  masteredConcepts: string[]
  strugglingConcepts: string[]
  readyToAdvance: boolean
  recommendedAction: 'continue' | 'advance' | 'remediate'
}

export interface LessonContent {
  lessonId: string
  title: string
  description?: string
  duration?: number
  difficulty?: string
  learningObjectives?: string[]
  teachingPoints?: string[]
  keyConcepts?: string[]
  examples?: any[]
  practiceProblems?: any[]
  commonMisconceptions?: string[]
}

const SECTIONS: LessonSection[] = ['introduction', 'concept', 'example', 'practice', 'review']

/**
 * Start a new lesson session
 */
export async function startLesson(studentId: string, lessonId: string): Promise<LessonSessionType> {
  const [lessonRow] = await drizzleDb
    .select()
    .from(courseLesson)
    .where(eq(courseLesson.lessonId, lessonId))
    .limit(1)
  if (!lessonRow) throw new Error('Lesson not found')

  // Handle case where lesson may have a module (legacy support)
  const courseId = lessonRow.courseId
  if (!courseId) throw new Error('Course not found for lesson')

  // Note: prerequisiteLessonIds removed from schema - now in builderData
  // For now, we'll skip prerequisite checking or check via builderData if available
  const prerequisiteIds: string[] = []
  if (prerequisiteIds.length > 0) {
    const [countRow] = await drizzleDb
      .select({ count: sql<number>`count(*)::int` })
      .from(courseLessonProgress)
      .where(
        and(
          eq(courseLessonProgress.studentId, studentId),
          inArray(courseLessonProgress.lessonId, prerequisiteIds),
          eq(courseLessonProgress.status, 'COMPLETED')
        )
      )
    if ((countRow?.count ?? 0) < prerequisiteIds.length) {
      throw new Error('Prerequisites not met')
    }
  }

  const [existingSession] = await drizzleDb
    .select()
    .from(lessonLearningSession)
    .where(and(eq(lessonLearningSession.studentId, studentId), eq(lessonLearningSession.lessonId, lessonId)))
    .limit(1)
  if (existingSession && existingSession.status !== 'completed') {
    return existingSession as LessonSessionType
  }

  await drizzleDb
    .insert(courseLessonProgress)
    .values({
      progressId: crypto.randomUUID(),
      lessonId,
      studentId,
      status: 'IN_PROGRESS',
      currentSection: 'introduction',
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [courseLessonProgress.lessonId, courseLessonProgress.studentId],
      set: {
        status: 'IN_PROGRESS',
        currentSection: 'introduction',
      },
    })

  const [session] = await drizzleDb
    .insert(lessonLearningSession)
    .values({
      sessionId: crypto.randomUUID(),
      studentId,
      lessonId,
      status: 'active',
      currentSection: 'introduction',
      conceptMastery: {},
      misconceptions: [],
      whiteboardItems: [],
      sessionContext: {
        messages: [],
        currentStep: 0,
        introductionDone: false,
        conceptExplained: false,
        exampleWalked: false,
        practiceDone: false,
        reviewDone: false,
      },
    })
    .returning()
  if (!session) throw new Error('Failed to create lesson session')
  return session as LessonSessionType
}

/**
 * Advance lesson to next section based on student response
 */
export async function advanceLesson(
  session: LessonSessionType,
  studentResponse: string
): Promise<LessonAdvanceResult> {
  const currentIndex = SECTIONS.indexOf(session.currentSection)

  // Check if we're at the end
  if (currentIndex >= SECTIONS.length - 1) {
    // Mark as complete
    await completeLesson(session.sessionId)
    return {
      newSection: 'review',
      sectionComplete: true,
      lessonComplete: true,
    }
  }

  const nextSection = SECTIONS[currentIndex + 1]

  // Update session context
  const context = session.sessionContext || {}
  context[`${session.currentSection}Done`] = true
  context.currentStep = 0

  await drizzleDb
    .update(lessonLearningSession)
    .set({ currentSection: nextSection, sessionContext: context })
    .where(eq(lessonLearningSession.sessionId, session.sessionId))

  await drizzleDb
    .update(courseLessonProgress)
    .set({ currentSection: nextSection })
    .where(
      and(
        eq(courseLessonProgress.lessonId, session.lessonId),
        eq(courseLessonProgress.studentId, session.studentId)
      )
    )

  return {
    newSection: nextSection,
    sectionComplete: true,
    lessonComplete: false,
  }
}

/**
 * Assess student understanding from conversation
 */
export async function assessUnderstanding(
  conversation: Array<{ role: string; content: string }>,
  objectives: string[]
): Promise<UnderstandingAssessment> {
  // Get recent student messages
  const studentMessages = conversation
    .filter(m => m.role === 'user')
    .slice(-3)
    .map(m => m.content.toLowerCase())
    .join(' ')

  // Understanding indicators
  const positiveIndicators = [
    'understand',
    'got it',
    'makes sense',
    'clear',
    'yes',
    'okay',
    'right',
    'correct',
    '我知道了',
    '明白',
    '懂了',
    '对的',
    '正确',
  ]

  const negativeIndicators = [
    'confused',
    "don't understand",
    'lost',
    'difficult',
    'hard',
    'what?',
    "don't get",
    '不懂',
    '不明白',
    '困惑',
    '难',
    '不会',
  ]

  let understandingScore = 50 // baseline

  positiveIndicators.forEach(indicator => {
    if (studentMessages.includes(indicator)) understandingScore += 15
  })

  negativeIndicators.forEach(indicator => {
    if (studentMessages.includes(indicator)) understandingScore -= 20
  })

  // Clamp score
  understandingScore = Math.max(0, Math.min(100, understandingScore))

  // Determine recommendation
  let recommendedAction: 'continue' | 'advance' | 'remediate' = 'continue'
  if (understandingScore >= 75) {
    recommendedAction = 'advance'
  } else if (understandingScore < 40) {
    recommendedAction = 'remediate'
  }

  return {
    understandingLevel: understandingScore,
    masteredConcepts: understandingScore >= 70 ? objectives : [],
    strugglingConcepts: understandingScore < 50 ? objectives : [],
    readyToAdvance: understandingScore >= 75,
    recommendedAction,
  }
}

/**
 * Build course-aware prompt for AI
 */
export function buildCoursePrompt(
  session: LessonSessionType,
  lesson: any,
  studentMessage: string
): string {
  const sectionInstructions: Record<LessonSection, string> = {
    introduction: `
【引入阶段】
- 简要介绍本节课的重要性和应用场景（1-2句话）
- 预览学生将要学习的内容
- 与之前的知识建立联系（如果相关）
- 保持简洁有趣，激发学习兴趣
- 询问学生是否准备好开始学习`,

    concept: `
【概念教学阶段】
- 清晰地讲解核心概念
- 使用提供的教学要点
- 定义关键术语
- 提出检查理解的问题
- 在学生表现出理解之前不要继续
- 使用苏格拉底式提问引导学生思考`,

    example: `
【示例讲解阶段】
- 逐步展示示例
- 清晰地讲解每一步
- 让学生预测下一步
- 解释推理过程
- 确保学生能跟上节奏`,

    practice: `
【练习阶段】
- 给学生一道练习题
- 先让他们自己尝试
- 如果卡住了提供提示（不要立即给出答案）
- 庆祝正确的尝试
- 解决误解`,

    review: `
【回顾阶段】
- 总结关键要点
- 确认学习目标已达成
- 预览接下来的内容
- 祝贺学生完成学习
- 询问是否还有疑问`,
  }

  const currentSection = session.currentSection
  const context = session.sessionContext || {}

  return `你是 Solocorn 的 AI 导师，正在进行结构化课程教学。

## 当前课程信息
课程名称: ${lesson.title}
课程描述: ${lesson.description || 'N/A'}

## 当前教学阶段
${sectionInstructions[currentSection]}

## 学习进度
当前阶段: ${currentSection}
引入完成: ${context.introductionDone ? '是' : '否'}
概念讲解完成: ${context.conceptExplained ? '是' : '否'}
示例讲解完成: ${context.exampleWalked ? '是' : '否'}
练习完成: ${context.practiceDone ? '是' : '否'}
回顾完成: ${context.reviewDone ? '是' : '否'}

## 概念掌握度
${
  Object.entries(session.conceptMastery || {})
    .map(([concept, level]) => `- ${concept}: ${level}%`)
    .join('\n') || '暂无数据'
}

## 教学原则
1. 严格遵循当前阶段的教学指导
2. 不要跳到后面的阶段
3. 在继续之前检查学生的理解
4. 当学生卡住时使用提示，不要直接给答案
5. 保持回应集中和结构化
6. 对公式、定义和步骤使用白板
7. 使用苏格拉底式教学法，引导学生自己发现答案
8. 用中文进行教学

## 学生消息
${studentMessage}

请根据当前阶段指导提供回应。如果需要显示公式、代码或步骤，请在回应后用 JSON 格式提供白板内容。

白板 JSON 格式示例:
{
  "whiteboardItems": [
    {"type": "formula", "content": "E = mc²", "caption": "质能方程"},
    {"type": "code", "content": "x = 5 + 3", "caption": "示例代码"}
  ],
  "understandingLevel": 80,
  "nextSection": "concept"
}`
}

/**
 * Get remediation path for struggling student
 */
export function getRemediationPath(concept: string, misconception: string): string {
  const remediationStrategies: Record<string, string> = {
    基础概念不牢: '建议先复习相关前置知识，使用更简单的例子重新讲解',
    计算错误: '建议加强基础运算练习，强调计算步骤的重要性',
    理解偏差: '建议用类比和可视化方法重新解释概念',
    应用困难: '建议从更简单的应用题开始，逐步增加难度',
    default: '建议回顾相关知识点，多做练习巩固理解',
  }

  return remediationStrategies[misconception] || remediationStrategies['default']
}

/**
 * Complete a lesson session
 */
export async function completeLesson(sessionId: string): Promise<void> {
  const [sessionRow] = await drizzleDb
    .select()
    .from(lessonLearningSession)
    .where(eq(lessonLearningSession.sessionId, sessionId))
    .limit(1)
  if (!sessionRow) return

  const [lessonRow] = await drizzleDb
    .select()
    .from(courseLesson)
    .where(eq(courseLesson.lessonId, sessionRow.lessonId))
    .limit(1)
  if (!lessonRow) return

  const courseId = lessonRow.courseId
  if (!courseId) return

  const mastery = (sessionRow.conceptMastery as Record<string, number>) || {}
  const avgScore =
    Object.keys(mastery).length > 0
      ? Object.values(mastery).reduce((a, b) => a + b, 0) / Object.keys(mastery).length
      : 0

  await drizzleDb.transaction(async tx => {
    await tx
      .update(lessonLearningSession)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(lessonLearningSession.sessionId, sessionId))

    await tx
      .update(courseLessonProgress)
      .set({
        status: 'COMPLETED',
        completedAt: new Date(),
        score: Math.round(avgScore),
      })
      .where(
        and(
          eq(courseLessonProgress.lessonId, sessionRow.lessonId),
          eq(courseLessonProgress.studentId, sessionRow.studentId)
        )
      )

    // Get total lessons for this course
    const [totalRow] = await tx
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(courseLesson)
      .where(eq(courseLesson.courseId, courseId))
    const totalLessons = totalRow?.count ?? 0

    const [existing] = await tx
      .select()
      .from(courseProgress)
      .where(
        and(
          eq(courseProgress.studentId, sessionRow.studentId),
          eq(courseProgress.courseId, courseId)
        )
      )
      .limit(1)

    if (existing) {
      await tx
        .update(courseProgress)
        .set({
          lessonsCompleted: existing.lessonsCompleted + 1,
          currentLessonId: sessionRow.lessonId,
          averageScore: avgScore,
        })
        .where(
          and(
            eq(courseProgress.studentId, sessionRow.studentId),
            eq(courseProgress.courseId, courseId)
          )
        )
    } else {
      await tx.insert(courseProgress).values({
        progressId: crypto.randomUUID(),
        studentId: sessionRow.studentId,
        courseId,
        lessonsCompleted: 1,
        totalLessons,
        currentLessonId: sessionRow.lessonId,
        averageScore: avgScore,
        isCompleted: false,
      })
    }
  })
}

/**
 * Get next lesson for student
 */
export async function getNextLesson(
  studentId: string,
  courseId: string
): Promise<{ lessonId: string; title: string; moduleTitle: string } | null> {
  // Get all lessons for this course ordered by order
  const lessons = await drizzleDb
    .select()
    .from(courseLesson)
    .where(eq(courseLesson.courseId, courseId))
    .orderBy(courseLesson.order)

  for (const lesson of lessons) {
    const [progress] = await drizzleDb
      .select()
      .from(courseLessonProgress)
      .where(
        and(
          eq(courseLessonProgress.lessonId, lesson.lessonId),
          eq(courseLessonProgress.studentId, studentId)
        )
      )
      .limit(1)
    if (progress?.status === 'COMPLETED') continue

    // Note: prerequisiteLessonIds removed from schema - now in builderData
    // Skip prerequisite checking for now or implement via builderData

    return {
      lessonId: lesson.lessonId,
      title: lesson.title,
      moduleTitle: '', // Modules are deprecated
    }
  }
  return null
}

/**
 * Get student progress overview
 */
export async function getStudentProgressOverview(
  studentId: string,
  courseId: string
): Promise<{
  totalLessons: number
  completedLessons: number
  overallProgress: number
}> {
  const [courseRow] = await drizzleDb
    .select()
    .from(course)
    .where(eq(course.courseId, courseId))
    .limit(1)
  if (!courseRow) throw new Error('Course not found')

  const lessons = await drizzleDb
    .select()
    .from(courseLesson)
    .where(eq(courseLesson.courseId, courseId))
    .orderBy(courseLesson.order)

  let totalLessons = 0
  let completedLessons = 0

  for (const lesson of lessons) {
    totalLessons++
    const [progress] = await drizzleDb
      .select()
      .from(courseLessonProgress)
      .where(
        and(
          eq(courseLessonProgress.lessonId, lesson.lessonId),
          eq(courseLessonProgress.studentId, studentId)
        )
      )
      .limit(1)
    if (progress?.status === 'COMPLETED') {
      completedLessons++
    }
  }

  return {
    totalLessons,
    completedLessons,
    overallProgress: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
  }
}

/**
 * Get lesson content for teaching
 */
export async function getLessonContent(lessonId: string): Promise<LessonContent> {
  const [lesson] = await drizzleDb
    .select()
    .from(courseLesson)
    .where(eq(courseLesson.lessonId, lessonId))
    .limit(1)
  if (!lesson) throw new Error('Lesson not found')

  // Legacy fields removed from schema - now stored in builderData
  return {
    lessonId: lesson.lessonId,
    title: lesson.title,
    description: lesson.description || undefined,
  }
}

/**
 * Extract whiteboard items from AI response
 */
export function extractWhiteboardItems(
  content: string
): Array<{ type: string; content: string; caption?: string }> {
  const items: Array<{ type: string; content: string; caption?: string }> = []

  // Extract formulas
  const formulaMatches = content.match(/(?:Formula|公式):?\s*[`$]?([^`$\n]+)[`$]?/gi)
  if (formulaMatches) {
    formulaMatches.forEach(match => {
      const clean = match.replace(/(?:Formula|公式):?\s*[`$]?|[`$]?$/gi, '').trim()
      if (clean) items.push({ type: 'formula', content: clean })
    })
  }

  // Extract code blocks
  const codeMatches = content.match(/```[\s\S]*?```/g)
  if (codeMatches) {
    codeMatches.forEach(match => {
      const clean = match.replace(/```(\w+)?\n?/g, '').trim()
      if (clean) items.push({ type: 'code', content: clean })
    })
  }

  // Extract key definitions (simpler regex)
  const definitionMatches = content.match(/(?:Definition|定义|Key Concept|关键概念):?\s*([^\n]+)/gi)
  if (definitionMatches) {
    definitionMatches.forEach(match => {
      const clean = match.replace(/(?:Definition|定义|Key Concept|关键概念):?\s*/gi, '').trim()
      if (clean && clean.length < 200) {
        items.push({ type: 'definition', content: clean })
      }
    })
  }

  return items.slice(0, 5)
}
