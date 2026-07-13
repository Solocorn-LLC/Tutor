import { describe, it, expect } from 'vitest'
import {
  getCategoryCountryCode,
  isCountryBoundCategory,
  getCountryNameByCode,
  getRegionIdForCountry,
} from './category-country'
import { NATIONAL_EXAMS_DATA, AP_CATEGORIES } from './tutor-categories'

describe('getCategoryCountryCode', () => {
  it('maps a specific HKDSE national exam to HK', () => {
    expect(getCategoryCountryCode('S5 HKDSE Chinese Language Preparation')).toBe('HK')
  })

  it('never returns a WRONG country for any national exam (full dataset sweep)', () => {
    // Some generic exam names are shared across countries or overlap with global
    // boards; the helper must return that exam's own country OR null — never a
    // different country. This is the safety property that guards a prefill.
    for (const [code, categories] of Object.entries(NATIONAL_EXAMS_DATA)) {
      for (const category of categories) {
        for (const exam of category.exams) {
          const result = getCategoryCountryCode(exam)
          expect(result === null || result === code).toBe(true)
        }
      }
    }
  })

  it('returns null for a global board category (AP) — board takes precedence', () => {
    for (const cat of AP_CATEGORIES) {
      for (const exam of cat.exams) {
        expect(getCategoryCountryCode(exam)).toBeNull()
      }
    }
  })

  it('returns null for unknown/custom categories and empty input', () => {
    expect(getCategoryCountryCode('Totally Custom Category')).toBeNull()
    expect(getCategoryCountryCode('')).toBeNull()
  })
})

describe('isCountryBoundCategory', () => {
  it('is true for a national exam and false for global/custom', () => {
    expect(isCountryBoundCategory('S5 HKDSE Chinese Language Preparation')).toBe(true)
    expect(isCountryBoundCategory(AP_CATEGORIES[0].exams[0])).toBe(false)
    expect(isCountryBoundCategory('Totally Custom Category')).toBe(false)
  })
})

describe('getCountryNameByCode', () => {
  it('resolves country codes to display names', () => {
    expect(getCountryNameByCode('HK')).toBe('Hong Kong')
    expect(getCountryNameByCode('SG')).toBe('Singapore')
    expect(getCountryNameByCode('GL')).toBe('Global')
  })

  it('returns null for an unknown code or empty input', () => {
    expect(getCountryNameByCode('ZZ')).toBeNull()
    expect(getCountryNameByCode('')).toBeNull()
  })
})

describe('getRegionIdForCountry', () => {
  it('resolves a country code to its region id', () => {
    expect(getRegionIdForCountry('HK')).toBe('asia')
  })

  it('returns null for Global or unknown', () => {
    expect(getRegionIdForCountry('GL')).toBeNull()
    expect(getRegionIdForCountry('ZZ')).toBeNull()
  })
})
