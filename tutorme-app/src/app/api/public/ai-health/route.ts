/**
 * AI health check — exercises the real provider chain (Gemini/Kimi via the
 * orchestrator) rather than calling a single vendor directly.
 *
 * GET /api/public/ai-health
 *
 * Gated behind ALLOW_PUBLIC_TEST_ENDPOINTS=true in production (404 otherwise) so it
 * isn't an open, billable AI endpoint.
 */

import { NextResponse } from 'next/server'
import { generateWithFallback, getAIProvidersStatus } from '@/lib/agents/orchestrator-llm'
import { getActiveProvider } from '@/lib/ai/provider'

export async function GET() {
  const isProd = process.env.NODE_ENV === 'production'
  const allowPublicTests = process.env.ALLOW_PUBLIC_TEST_ENDPOINTS === 'true'
  if (isProd && !allowPublicTests) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const providers = await getAIProvidersStatus()
  const activeProvider = getActiveProvider()

  try {
    const started = Date.now()
    const result = await generateWithFallback('Reply with exactly one word: PONG', {
      maxTokens: 50,
      timeoutMs: 30000,
      skipCache: true,
    })
    return NextResponse.json({
      status: 'ok',
      activeProvider,
      providers,
      respondedBy: result.provider,
      latencyMs: Date.now() - started,
      sample: result.content.slice(0, 120),
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        activeProvider,
        providers,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
