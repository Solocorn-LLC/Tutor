const URL_REGEX =
  /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,24}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/g

const TRAILING_PUNCTUATION = /[.,;:!?\)\]\}]+$/
const OPENING_BOUNDARY_CHARS = new Set([' ', '\t', '\n', '\r', '(', '[', '{', '"', "'", '<', ''])
const CLOSING_BOUNDARY_CHARS = new Set([' ', '\t', '\n', '\r', ')', ']', '}', '"', "'", '>', '.', ',', ';', ':', '!', '?', ''])

function isBoundaryChar(char: string | undefined, type: 'before' | 'after'): boolean {
  if (char === undefined || char === '') return true
  if (type === 'before') return OPENING_BOUNDARY_CHARS.has(char)
  return CLOSING_BOUNDARY_CHARS.has(char)
}

export function detectUrls(text: string): string[] {
  const matches = text.match(URL_REGEX)
  if (!matches) return []

  return Array.from(
    new Set(
      matches
        .map(url => url.replace(TRAILING_PUNCTUATION, ''))
        .filter(url => {
          if (!isValidPreviewUrl(url)) return false
          const index = text.indexOf(url)
          if (index === -1) return false
          const before = text[index - 1]
          const after = text[index + url.length]
          return isBoundaryChar(before, 'before') && isBoundaryChar(after, 'after')
        })
    )
  )
}

export function isValidPreviewUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
