const URL_REGEX =
  /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/g

export function detectUrls(text: string): string[] {
  const matches = text.match(URL_REGEX)
  if (!matches) return []

  return Array.from(
    new Set(
      matches.filter(url => {
        const index = text.indexOf(url)
        if (index === -1) return false
        const before = text[index - 1]
        const after = text[index + url.length]
        const isStandalone = (!before || /\s/.test(before)) && (!after || /\s/.test(after))
        return isStandalone
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
