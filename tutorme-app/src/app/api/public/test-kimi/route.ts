/**
 * Test endpoint to verify Kimi API connectivity
 * GET /api/public/test-kimi
 */

import { NextResponse } from 'next/server'

const KIMI_BASE_URL = 'https://api.moonshot.cn/v1'
const DEFAULT_MODEL = 'kimi-k3'

export async function GET() {
  const isProd = process.env.NODE_ENV === 'production'
  const allowPublicTests = process.env.ALLOW_PUBLIC_TEST_ENDPOINTS === 'true'
  if (isProd && !allowPublicTests) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const apiKey = process.env.KIMI_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'KIMI_API_KEY not configured',
      },
      { status: 500 }
    )
  }

  try {
    const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say "Kimi API is working!" and nothing else.' },
        ],
        temperature: 1, // Kimi only accepts temperature=1
        max_tokens: 50,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        {
          status: 'error',
          httpStatus: response.status,
          error: errorText,
        },
        { status: 500 }
      )
    }

    const data = await response.json()

    const aiResponse = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || ''

    return NextResponse.json({
      status: 'success',
      response: aiResponse,
      model: data.model,
      usage: data.usage,
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
