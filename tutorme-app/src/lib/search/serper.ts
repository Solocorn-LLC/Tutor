/**
 * Lightweight Serper (Google Search) client for finding answer keys / mark schemes.
 * No extra npm dependency — uses the global fetch API.
 */

export interface SerperSearchResult {
  title: string
  link: string
  snippet: string
  position?: number
}

const SERPER_API_URL = 'https://google.serper.dev/search'

/**
 * Search for an answer key / mark scheme. Returns an empty array if no API key is
 * configured or if the call fails, so the caller can fall back to AI reasoning.
 */
export async function searchAnswerKey(
  query: string,
  apiKey?: string
): Promise<SerperSearchResult[]> {
  const key = apiKey ?? process.env.SERPER_API_KEY
  if (!key) return []

  try {
    const response = await fetch(SERPER_API_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: 5 }),
    })

    if (!response.ok) {
      console.warn(`Serper search failed: ${response.status} ${response.statusText}`)
      return []
    }

    const data = (await response.json()) as {
      organic?: Array<{
        title?: string
        link?: string
        snippet?: string
        position?: number
      }>
    }

    const organic = Array.isArray(data?.organic) ? data.organic : []
    return organic
      .filter(r => r.title && r.link)
      .map(
        (r): SerperSearchResult => ({
          title: String(r.title),
          link: String(r.link),
          snippet: String(r.snippet ?? ''),
          position: typeof r.position === 'number' ? r.position : undefined,
        })
      )
      .slice(0, 5)
  } catch (error) {
    console.warn('Serper search error:', error)
    return []
  }
}

/**
 * Build a concise search query from the document title and any known board/subject.
 */
export function buildAnswerKeySearchQuery(
  title: string,
  examBody?: string | null,
  subject?: string | null
): string {
  const parts = [title, examBody, subject].filter(Boolean).join(' ')
  return `${parts} answer key mark scheme`
}

/**
 * Format the top search results as a short research block for the model prompt.
 * Returns an empty string if there are no results.
 */
export function formatSearchResultsForPrompt(results: SerperSearchResult[]): string {
  if (results.length === 0) return ''
  return (
    'Answer-key research results (use these to prepopulate answers/rubrics when trustworthy; otherwise rely on your own analysis):\n' +
    results
      .map(
        (r, i) => `[${i + 1}] ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet || '(no snippet)'}`
      )
      .join('\n\n')
  )
}
