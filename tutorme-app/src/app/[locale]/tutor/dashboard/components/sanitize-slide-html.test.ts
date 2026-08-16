import { describe, it, expect } from 'vitest'
import { sanitizeSlideHtml, isSlideHtml } from './sanitize-slide-html'

describe('sanitizeSlideHtml', () => {
  it('leaves plain text unchanged', () => {
    expect(sanitizeSlideHtml('hello world')).toBe('hello world')
    expect(isSlideHtml('hello world')).toBe(false)
  })

  it('keeps allowed span formatting', () => {
    const html = '<span style="font-size: 18px; color: red; font-family: Arial;">hi</span>'
    // Browsers normalize the trailing semicolon out of the style attribute.
    expect(sanitizeSlideHtml(html)).toBe(
      '<span style="font-size: 18px; color: red; font-family: Arial">hi</span>'
    )
  })

  it('removes disallowed styles and attributes from spans', () => {
    const html =
      '<span style="font-size: 18px; background-color: yellow;" class="foo" onclick="alert(1)">hi</span>'
    expect(sanitizeSlideHtml(html)).toBe('<span style="font-size: 18px">hi</span>')
  })

  it('unwraps unknown tags while preserving text', () => {
    expect(sanitizeSlideHtml('<b>bold</b> and <script>evil()</script>')).toBe('bold and ')
  })

  it('preserves table markup and strips dangerous attributes', () => {
    const html =
      '<table style="border-collapse: collapse; width: 100%" class="data"><thead><tr><th>Name</th></tr></thead><tbody><tr><td style="border: 1px solid #ccc">A</td></tr></tbody></table>'
    expect(sanitizeSlideHtml(html)).toBe(
      '<table style="border-collapse: collapse; width: 100%"><thead><tr><th>Name</th></tr></thead><tbody><tr><td style="border: 1px solid #ccc">A</td></tr></tbody></table>'
    )
  })

  it('keeps images with safe http/https or relative src', () => {
    const html =
      '<img src="https://example.com/img.png" alt="test" width="100" style="max-width:100%">'
    expect(sanitizeSlideHtml(html)).toBe(html)
    expect(sanitizeSlideHtml('<img src="/storage/img.png" alt="test">')).toBe(
      '<img src="/storage/img.png" alt="test">'
    )
  })

  it('removes images with javascript or data urls', () => {
    expect(sanitizeSlideHtml('<img src="javascript:alert(1)" alt="x">')).toBe('')
    expect(sanitizeSlideHtml('<img src="data:image/svg+xml,<svg></svg>" alt="x">')).toBe('')
  })

  it('preserves formula SVG from MathJax', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100" height="50"><g transform="scale(1)"><rect x="0" y="0" width="10" height="10" fill="#000"></rect><text x="5" y="5">x</text></g></svg>'
    expect(sanitizeSlideHtml(svg)).toBe(svg)
  })

  it('strips event handlers and scripts from SVG', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script></svg>'
    expect(sanitizeSlideHtml(svg)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>'
    )
  })

  it('replaces empty block elements with line breaks', () => {
    expect(sanitizeSlideHtml('<div></div><p>   </p>')).toBe('<br><br>')
  })
})
