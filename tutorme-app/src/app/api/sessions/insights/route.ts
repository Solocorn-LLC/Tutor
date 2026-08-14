/**
 * Post-Session Insights API
 *
 * GET /api/sessions/insights?sessionId=xxx - Get session insights report
 * POST /api/sessions/insights - Generate new insights report (triggered after session)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, handleApiError } from '@/lib/api/middleware'
import crypto from 'node:crypto'
import { drizzleDb } from '@/lib/db/drizzle'
import {
  postSessionReport,
  studentSessionInsight,
  sessionBookmark,
  sessionEngagementSummary,
  engagementSnapshot,
  liveSession,
  user,
  profile,
} from '@/lib/db/schema'
import { eq, desc, asc, inArray } from 'drizzle-orm'
import { z } from 'zod'

const generateInsightsSchema = z.object({
  sessionId: z.string().uuid(),
})

// GET - Retrieve session insights
export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
  }

  try {
    const [report] = await drizzleDb
      .select()
      .from(postSessionReport)
      .where(eq(postSessionReport.sessionId, sessionId))
      .limit(1)

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const insights = await drizzleDb
      .select()
      .from(studentSessionInsight)
      .where(eq(studentSessionInsight.sessionId, sessionId))

    const studentIds = [...new Set(insights.map(i => i.studentId))]
    const profiles = studentIds.length
      ? await drizzleDb.select().from(profile).where(inArray(profile.userId, studentIds))
      : []
    const profileByUserId = Object.fromEntries(profiles.map(p => [p.userId, p]))

    const studentInsights = insights.map(i => ({
      ...i,
      student: {
        id: i.studentId,
        profile: profileByUserId[i.studentId] ? { name: profileByUserId[i.studentId].name } : null,
      },
    }))

    const bookmarks = await drizzleDb
      .select()
      .from(sessionBookmark)
      .where(eq(sessionBookmark.sessionId, sessionId))
      .orderBy(asc(sessionBookmark.timestampSeconds))

    return NextResponse.json({
      report,
      studentInsights,
      bookmarks,
    })
  } catch (error) {
    console.error('Error fetching session insights:', error)
    return handleApiError(error, 'Failed to fetch insights', 'api/sessions/insights/route.ts')
  }
})

// POST - Generate new insights report
export const POST = withAuth(
  async (req: NextRequest, session) => {
    try {
      const body = await req.json()
      const data = generateInsightsSchema.parse(body)

      const [existing] = await drizzleDb
        .select()
        .from(postSessionReport)
        .where(eq(postSessionReport.sessionId, data.sessionId))
        .limit(1)

      if (existing) {
        return NextResponse.json(
          { error: 'Report already exists for this session' },
          { status: 400 }
        )
      }

      const [live] = await drizzleDb
        .select()
        .from(liveSession)
        .where(eq(liveSession.sessionId, data.sessionId))
        .limit(1)

      if (!live) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }

      const [engagementSummary] = await drizzleDb
        .select()
        .from(sessionEngagementSummary)
        .where(eq(sessionEngagementSummary.summarySessionId, data.sessionId))
        .limit(1)

      const allSnapshots = await drizzleDb
        .select()
        .from(engagementSnapshot)
        .where(eq(engagementSnapshot.sessionId, data.sessionId))
        .orderBy(desc(engagementSnapshot.timestamp))

      const byStudent = new Map<string, (typeof allSnapshots)[0]>()
      for (const s of allSnapshots) {
        if (!byStudent.has(s.studentId)) byStudent.set(s.studentId, s)
      }
      const snapshots = Array.from(byStudent.values())

      const studentInsightsData = snapshots.map(s => ({
        insightId: crypto.randomUUID(),
        sessionId: data.sessionId,
        studentId: s.studentId,
        engagement: s.engagementScore,
        participation: s.participationCount,
        questionsAsked: s.chatMessages,
        timeAwayMinutes: 0,
        flaggedForFollowUp: s.engagementScore < 50 || s.struggleIndicators > 0,
        followUpReason:
          s.struggleIndicators > 0
            ? 'Showing signs of struggle'
            : s.engagementScore < 50
              ? 'Low engagement'
              : null,
      }))

      for (const row of studentInsightsData) {
        await drizzleDb.insert(studentSessionInsight).values(row)
      }

      const reportId = crypto.randomUUID()
      await drizzleDb.insert(postSessionReport).values({
        reportId,
        sessionId: data.sessionId,
        tutorId: session.user.id,
        status: 'processing',
        keyConcepts: [],
        mainTopics: [],
        studentQuestions: [],
        challengingConcepts: [],
        overallAssessment: '',
        averageEngagement: engagementSummary?.averageEngagement ?? 0,
        peakEngagement: engagementSummary?.peakEngagement ?? 0,
        lowEngagement: engagementSummary?.lowEngagement ?? 0,
        participationRate: engagementSummary?.participationRate ?? 0,
        chatActivity: engagementSummary?.totalChatMessages ?? 0,
        handRaises: engagementSummary?.totalHandRaises ?? 0,
        timeOnTask: engagementSummary?.timeOnTaskPercentage ?? 0,
      })

      // New code to safely handle engagementSummary
      const engagementMetrics = engagementSummary
        ? {
            averageEngagement: engagementSummary.averageEngagement,
            peakEngagement: engagementSummary.peakEngagement,
            lowEngagement: engagementSummary.lowEngagement,
            participationRate: engagementSummary.participationRate,
            chatActivity: engagementSummary.totalChatMessages,
            handRaises: engagementSummary.totalHandRaises,
            timeOnTask: engagementSummary.timeOnTaskPercentage,
          }
        : {
            averageEngagement: 0,
            peakEngagement: 0,
            lowEngagement: 0,
            participationRate: 0,
            chatActivity: 0,
            handRaises: 0,
            timeOnTask: 0,
          }

      const [report] = await drizzleDb
        .select()
        .from(postSessionReport)
        .where(eq(postSessionReport.reportId, reportId))
        .limit(1)

      return NextResponse.json({ success: true, report: report ?? null })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: 'Invalid data', issues: error.issues }, { status: 400 })
      }
      console.error('Error generating insights:', error)
      return handleApiError(error, 'Failed to generate insights', 'api/sessions/insights/route.ts')
    }
  },
  { role: 'TUTOR' }
)
