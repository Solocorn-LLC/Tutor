import { describe, it, expect } from 'vitest'
import { detectUrls } from './detect-urls'
import { extractYoutubeVideoId } from './extract'
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
