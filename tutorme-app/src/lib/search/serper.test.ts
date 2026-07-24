import { describe, it, expect, vi } from 'vitest'
import { searchAnswerKey, buildAnswerKeySearchQuery, formatSearchResultsForPrompt } from './serper'

describe('buildAnswerKeySearchQuery', () => {
  it('combines title, exam body and subject', () => {
    expect(buildAnswerKeySearchQuery('2018 AP Calculus AB', 'AP', 'Calculus AB')).toBe(
      '2018 AP Calculus AB AP Calculus AB answer key mark scheme'
    )
  })

  it('falls back to title only', () => {
    expect(buildAnswerKeySearchQuery('Sample Quiz')).toBe('Sample Quiz answer key mark scheme')
  })
})

describe('formatSearchResultsForPrompt', () => {
  it('returns an empty string for no results', () => {
    expect(formatSearchResultsForPrompt([])).toBe('')
  })

  it('formats results with title, link and snippet', () => {
    const results = [
      { title: 'Official Mark Scheme', link: 'https://example.com/ms', snippet: 'Q1: A' },
      { title: 'Answer Key', link: 'https://example.com/ak', snippet: '' },
    ]
    const formatted = formatSearchResultsForPrompt(results)
    expect(formatted).toContain('Answer-key research results')
    expect(formatted).toContain('[1] Official Mark Scheme')
    expect(formatted).toContain('URL: https://example.com/ms')
    expect(formatted).toContain('Snippet: Q1: A')
    expect(formatted).toContain('Snippet: (no snippet)')
  })
})

describe('searchAnswerKey', () => {
  it('returns an empty array when no API key is provided', async () => {
    const results = await searchAnswerKey('anything', undefined)
    expect(results).toEqual([])
  })

  it('returns parsed organic results on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        organic: [
          { title: 'Mark Scheme', link: 'https://x.com/ms', snippet: 'Answers', position: 1 },
          { title: '', link: 'https://x.com/no-title', snippet: 'ignored' },
        ],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const results = await searchAnswerKey('AP Biology 2020', 'test-key')
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      title: 'Mark Scheme',
      link: 'https://x.com/ms',
      snippet: 'Answers',
      position: 1,
    })
    expect(mockFetch).toHaveBeenCalledWith('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': 'test-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: 'AP Biology 2020', num: 5 }),
    })

    vi.unstubAllGlobals()
  })

  it('returns empty array when the fetch fails', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' })
    )

    const results = await searchAnswerKey('query', 'test-key')
    expect(results).toEqual([])
    expect(consoleWarn).toHaveBeenCalledWith('Serper search failed: 429 Too Many Requests')

    consoleWarn.mockRestore()
    vi.unstubAllGlobals()
  })

  it('returns empty array on network error', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const results = await searchAnswerKey('query', 'test-key')
    expect(results).toEqual([])
    expect(consoleWarn).toHaveBeenCalledWith('Serper search error:', expect.any(Error))

    consoleWarn.mockRestore()
    vi.unstubAllGlobals()
  })
})
