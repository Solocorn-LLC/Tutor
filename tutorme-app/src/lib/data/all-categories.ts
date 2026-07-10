/**
 * Flattened catalog of every selectable course category (the "subjects" the
 * Guided form's Subject dropdown offers). These are the same category strings
 * the Course details page stores in `course.categories`, so the PCI Guided form
 * and Course details share one vocabulary — Model A: category is the source of
 * truth for Board/Subject.
 */

import {
  NATIONAL_EXAMS_DATA,
  GLOBAL_EXAMS_CATEGORIES,
  AP_CATEGORIES,
  A_LEVEL_CATEGORIES,
  IB_CATEGORIES,
  IGCSE_CATEGORIES,
  type ExamCategory,
} from './tutor-categories'
import {
  LANGUAGE_CATEGORIES,
  PROFESSIONAL_CATEGORIES,
  UNIVERSITY_CATEGORIES,
  SPECIALTY_CATEGORIES,
} from '@/lib/tutoring/specialty-categories'

let cached: string[] | null = null

/** Every distinct course-category string, sorted. Memoized (the source lists are static). */
export function getAllCourseCategoryOptions(): string[] {
  if (cached) return cached
  const out = new Set<string>()
  const groups: ExamCategory[][] = [
    GLOBAL_EXAMS_CATEGORIES,
    AP_CATEGORIES,
    A_LEVEL_CATEGORIES,
    IB_CATEGORIES,
    IGCSE_CATEGORIES,
    LANGUAGE_CATEGORIES,
    PROFESSIONAL_CATEGORIES,
    UNIVERSITY_CATEGORIES,
    SPECIALTY_CATEGORIES,
  ]
  for (const group of groups) {
    for (const cat of group) for (const exam of cat.exams) out.add(exam)
  }
  for (const list of Object.values(NATIONAL_EXAMS_DATA)) {
    for (const cat of list) for (const exam of cat.exams) out.add(exam)
  }
  cached = Array.from(out).sort((a, b) => a.localeCompare(b))
  return cached
}
