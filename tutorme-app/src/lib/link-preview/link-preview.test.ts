import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectUrls } from './detect-urls'
import { extractYoutubeVideoId, fetchLinkPreview } from './extract'
import { appendUrlToHtml, removeStandaloneUrlsFromHtml } from './html'

describe('detectUrls', () => {
  it('returns standalone URLs only', () => {
    const text = 'Check https://example.com here and https://youtu.be/abc123 now'
    expect(detectUrls(text)).toEqual(['https://example.com', 'https://youtu.be/abc123'])
  })

  it('ignores URLs attached to punctuation or words', () => {
    const text = 'See:https://example.com or visit(https://example.com) or https://example.com,next'
    expect(detectUrls(text)).toEqual([])
  })

  it('deduplicates URLs', () => {
    const text = 'https://example.com https://example.com'
    expect(detectUrls(text)).toEqual(['https://example.com'])
  })
})

describe('extractYoutubeVideoId', () => {
  it('extracts id from watch URLs', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=VIDEO_ID')).toBe('VIDEO_ID')
    expect(extractYoutubeVideoId('https://youtube.com/watch?v=VIDEO_ID&feature=share')).toBe(
      'VIDEO_ID'
    )
  })

  it('extracts id from short URLs', () => {
    expect(extractYoutubeVideoId('https://youtu.be/VIDEO_ID')).toBe('VIDEO_ID')
  })

  it('extracts id from embed and shorts URLs', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/embed/VIDEO_ID')).toBe('VIDEO_ID')
    expect(extractYoutubeVideoId('https://www.youtube.com/shorts/VIDEO_ID')).toBe('VIDEO_ID')
  })

  it('returns undefined for non-youtube URLs', () => {
    expect(extractYoutubeVideoId('https://example.com/watch?v=VIDEO_ID')).toBeUndefined()
  })
})

describe('removeStandaloneUrlsFromHtml', () => {
  it('removes standalone URLs from text nodes', () => {
    const html = '<div>Hello https://example.com world</div>'
    expect(removeStandaloneUrlsFromHtml(html, ['https://example.com'])).toBe(
      '<div>Hello world</div>'
    )
  })

  it('does not remove URLs inside attributes', () => {
    const html = '<a href="https://example.com">link</a>'
    expect(removeStandaloneUrlsFromHtml(html, ['https://example.com'])).toBe(html)
  })

  it('removes multiple URLs', () => {
    const html = '<div>https://a.com</div><div>https://b.com</div>'
    expect(removeStandaloneUrlsFromHtml(html, ['https://a.com', 'https://b.com'])).toBe(
      '<div></div><div></div>'
    )
  })
})

describe('appendUrlToHtml', () => {
  it('appends URL to empty html', () => {
    expect(appendUrlToHtml('', 'https://example.com')).toBe('<div>https://example.com</div>')
  })

  it('adds a break separator when html does not end with br', () => {
    expect(appendUrlToHtml('<div>hello</div>', 'https://example.com')).toBe(
      '<div>hello</div><br><div>https://example.com</div>'
    )
  })

  it('does not add double break when html already ends with br', () => {
    expect(appendUrlToHtml('<div>hello</div><br>', 'https://example.com')).toBe(
      '<div>hello</div><br><div>https://example.com</div>'
    )
  })
})

describe('fetchLinkPreview', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('uses YouTube oEmbed API for youtube.com/watch URLs', async () => {
    const mockedFetch = vi.mocked(globalThis.fetch)
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        title: 'Test Video',
        author_name: 'Test Author',
        provider_name: 'YouTube',
        thumbnail_url: 'https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg',
      }),
    } as Response)

    const meta = await fetchLinkPreview('https://www.youtube.com/watch?v=VIDEO_ID')

    expect(mockedFetch).toHaveBeenCalledTimes(1)
    const requestUrl = mockedFetch.mock.calls[0][0] as string
    expect(requestUrl).toContain('https://www.youtube.com/oembed')
    expect(requestUrl).toContain(encodeURIComponent('https://www.youtube.com/watch?v=VIDEO_ID'))

    expect(meta).toMatchObject({
      url: 'https://www.youtube.com/watch?v=VIDEO_ID',
      title: 'Test Video',
      description: 'Test Author',
      imageUrl: 'https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg',
      siteName: 'YouTube',
      isFile: false,
    })
  })

  it('falls back to a generated thumbnail when YouTube oEmbed has no thumbnail_url', async () => {
    const mockedFetch = vi.mocked(globalThis.fetch)
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ title: 'No Thumb' }),
    } as Response)

    const meta = await fetchLinkPreview('https://youtu.be/VIDEO_ID')
    expect(meta.imageUrl).toBe('https://img.youtube.com/vi/VIDEO_ID/hqdefault.jpg')
  })

  it('throws a readable error when the response body is too large', async () => {
    const mockedFetch = vi.mocked(globalThis.fetch)
    // Create a buffer that exceeds 5 MB to simulate an oversized HTML response.
    const largeBuffer = new ArrayBuffer(6 * 1024 * 1024)
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      arrayBuffer: async () => largeBuffer,
    } as Response)

    await expect(fetchLinkPreview('https://example.com')).rejects.toThrow('Response body too large')
  })
})
