/**
 * MCQ answer-key helpers for the DMI editor. Choice options are labelled A, B,
 * C… and the answer key stores those letters. These map an option index to its
 * letter and read which letters an item's free-text `answer` currently marks as
 * correct — tolerant of "A", "A, C", "A C", or the option's exact text.
 */

export function dmiOptionLetter(index: number): string {
  return String.fromCharCode(65 + index)
}

export function dmiSelectedOptionLetters(
  answer: string | undefined,
  options: readonly string[]
): Set<string> {
  const selected = new Set<string>()
  const ans = (answer ?? '').trim()
  if (!ans) return selected
  const tokens = ans
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
  options.forEach((opt, i) => {
    const letter = dmiOptionLetter(i)
    const text = (opt ?? '').trim().toLowerCase()
    if (tokens.includes(letter) || (text && ans.toLowerCase() === text)) selected.add(letter)
  })
  return selected
}
