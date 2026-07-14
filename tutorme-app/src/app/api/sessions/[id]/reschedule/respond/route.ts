/**
 * Session reschedule consent — student response.
 *
 *  POST { proposalId, response: 'AGREE' | 'DISAGREE' }
 *    AGREE    → applies the move once every rostered student has agreed
 *    DISAGREE → rejects the proposal; the session keeps its current time
 *
 * See src/lib/schedule/reschedule-consent.ts for the state machine.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, withCsrf } from '@/lib/api/middleware'
import { z } from 'zod'
import { respondToProposal } from '@/lib/schedule/reschedule-consent'

const RespondSchema = z.object({
  proposalId: z.string().min(1),
  response: z.enum(['AGREE', 'DISAGREE']),
})

export const POST = withCsrf(
  withAuth(async (req: NextRequest, session) => {
    const parsed = RespondSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const result = await respondToProposal({
      proposalId: parsed.data.proposalId,
      studentId: session.user.id,
      response: parsed.data.response,
    })

    if (result.status === 'ERROR') {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json(result)
  })
)
