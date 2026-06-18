/**
 * Human-readable name for a course variant.
 *
 * A published course is a variant of its template, identified by a
 * (category × nationality) pair. The tutor-typed course name is shared across
 * variants, so cards should also show the variant so students/tutors can tell
 * them apart. Returns e.g. "Mathematics — Hong Kong", or just "Mathematics"
 * when the variant is Global / has no nationality. Returns '' when there is no
 * variant info to show.
 */
export function formatCourseVariantName(
  category?: string | null,
  nationality?: string | null
): string {
  const cat = (category ?? '').trim()
  const nat = (nationality ?? '').trim()
  if (!cat && !nat) return ''
  if (!nat || nat.toLowerCase() === 'global') return cat
  if (!cat) return nat
  return `${cat} — ${nat}`
}
