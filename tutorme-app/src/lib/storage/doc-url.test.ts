import { describe, it, expect } from 'vitest'
import { resolveImageUrlsInHtml } from './doc-url'

describe('resolveImageUrlsInHtml', () => {
  it('rewrites img src to by-key proxy when data-file-key is present', () => {
    const html = '<p><img src="https://storage.googleapis.com/bucket/documents/u/x.png?sig=abc" data-file-key="documents/u/x.png" alt="x"></p>'
    const out = resolveImageUrlsInHtml(html)
    expect(out).toContain('src="/api/proxy-file?key=documents%2Fu%2Fx.png"')
  })

  it('recovers the key from a path-style GCS URL when data-file-key is absent', () => {
    const html = '<p><img src="https://storage.googleapis.com/bucket/documents/u/y.png?sig=abc" alt="y"></p>'
    const out = resolveImageUrlsInHtml(html)
    expect(out).toContain('src="/api/proxy-file?key=documents%2Fu%2Fy.png"')
  })

  it('leaves blob/data URLs untouched', () => {
    const html = '<p><img src="blob:abc" alt="z"></p>'
    const out = resolveImageUrlsInHtml(html)
    expect(out).toContain('src="blob:abc"')
  })

  it('returns the original HTML when document is undefined', () => {
    const doc = global.document
    // @ts-expect-error testing SSR guard
    global.document = undefined
    const html = '<p><img src="https://storage.googleapis.com/bucket/documents/u/z.png" data-file-key="documents/u/z.png"></p>'
    expect(resolveImageUrlsInHtml(html)).toBe(html)
    global.document = doc
  })
})
