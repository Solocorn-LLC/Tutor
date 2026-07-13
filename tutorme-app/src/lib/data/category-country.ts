/**
 * The country a category belongs to, for course-country logic at publish time.
 *
 * National exams (HKDSE, Gaokao, SAT, …) are country-specific — their country is
 * derivable from the category string via NATIONAL_EXAMS_DATA. This drives
 * prefilling the publish country picker for a national-exam course.
 *
 * Global boards (AP / IB / IGCSE / A-Level / Global / Languages / Professional),
 * university categories, and custom categories return null — they are treated as
 * country-agnostic at publish. Universities are intentionally excluded (product
 * decision: leave them as-is, not country-bound).
 */

import { NATIONAL_EXAMS_DATA, REGIONS } from './tutor-categories'
import { getCategoryBoard } from './category-board'

/**
 * exam string -> set of owning country codes. Some generic exam names appear
 * under more than one country in the dataset, so an exam can map to several
 * codes — those are ambiguous and treated as country-agnostic (see below).
 */
const NATIONAL_EXAM_COUNTRY_MAP = new Map<string, Set<string>>()
for (const [countryCode, categories] of Object.entries(NATIONAL_EXAMS_DATA)) {
  for (const category of categories) {
    for (const exam of category.exams) {
      const set = NATIONAL_EXAM_COUNTRY_MAP.get(exam) ?? new Set<string>()
      set.add(countryCode)
      NATIONAL_EXAM_COUNTRY_MAP.set(exam, set)
    }
  }
}

/**
 * The country code a category is bound to, or null if it is country-agnostic.
 *
 * Only an UNAMBIGUOUS national exam is country-bound:
 * - A category that is also a global board (AP / IB / IGCSE / … / Universities)
 *   is country-agnostic — the board takes precedence.
 * - A generic exam name shared across multiple countries is ambiguous → null.
 */
export function getCategoryCountryCode(category: string): string | null {
  if (!category) return null
  // A global board (or university) category is never a country-bound national exam.
  if (getCategoryBoard(category) !== null) return null
  const codes = NATIONAL_EXAM_COUNTRY_MAP.get(category)
  if (!codes || codes.size !== 1) return null // unknown, or ambiguous across countries
  return [...codes][0]
}

/** Whether a category is tied to a single country (a national exam). */
export function isCountryBoundCategory(category: string): boolean {
  return getCategoryCountryCode(category) !== null
}

/** Display name for a country code (e.g. 'HK' -> 'Hong Kong'), or null. */
export function getCountryNameByCode(code: string): string | null {
  if (!code) return null
  if (code === 'GL') return 'Global'
  for (const region of REGIONS) {
    const country = region.countries.find(c => c.code === code)
    if (country) return country.name
  }
  return null
}

/** The region id that contains a country code (e.g. 'HK' -> 'asia'), or null. */
export function getRegionIdForCountry(code: string): string | null {
  if (!code || code === 'GL') return null
  for (const region of REGIONS) {
    if (region.countries.some(c => c.code === code)) return region.id
  }
  return null
}
