import { describe, it, expect } from 'vitest'
import { detectExamBoards, normalizeBoard, checkCurriculumMatch } from './curriculum'

describe('detectExamBoards', () => {
  it('detects A-Level / IGCSE from a Cambridge/Edexcel paper', () => {
    const d = detectExamBoards('Cambridge Assessment International Education — Pearson Edexcel')
    expect(d.families).toContain('A Level')
    expect(d.families).toContain('IGCSE')
    expect(d.markers.length).toBeGreaterThan(0)
  })

  it('pins A Level from a GCE / syllabus code', () => {
    const d = detectExamBoards('GCE Advanced Level  9709/12  Paper 1 Pure Mathematics')
    expect(d.families).toContain('A Level')
  })

  it('detects AP from College Board / Advanced Placement', () => {
    const d = detectExamBoards('AP® Statistics Exam — College Board — Advanced Placement Program')
    expect(d.families).toEqual(['AP'])
  })

  it('detects IB', () => {
    expect(detectExamBoards('International Baccalaureate Diploma Programme').families).toContain(
      'IB'
    )
  })

  it('returns no families for plain prose (no false positives)', () => {
    const d = detectExamBoards('This worksheet reviews the central limit theorem and sampling.')
    expect(d.families).toEqual([])
  })
})

describe('normalizeBoard', () => {
  it('maps common board spellings to a family', () => {
    expect(normalizeBoard('AP')).toBe('AP')
    expect(normalizeBoard('A Level')).toBe('A Level')
    expect(normalizeBoard('a-level')).toBe('A Level')
    expect(normalizeBoard('IGCSE')).toBe('IGCSE')
    expect(normalizeBoard('IB')).toBe('IB')
    expect(normalizeBoard('HKDSE')).toBeNull()
  })
})

describe('checkCurriculumMatch — layer 1 (board markers)', () => {
  it('warns: A-Level past paper attached to an AP course', () => {
    const v = checkCurriculumMatch({
      extractedText: 'Cambridge International AS & A Level  9709/13  Paper 1',
      expectedBoard: 'AP',
      expectedSubject: 'AP Statistics',
    })
    expect(v.some(x => x.ruleId === 'CURRIC-1')).toBe(true)
    expect(v[0].severity).toBe('warning')
  })

  it('does NOT warn when the detected family includes the expected board', () => {
    // Cambridge → {A Level, IGCSE}; course is A Level → no conflict.
    const v = checkCurriculumMatch({
      extractedText: 'Cambridge International AS & A Level 9709/12',
      expectedBoard: 'A Level',
      expectedSubject: 'A Level Mathematics',
    })
    expect(v.some(x => x.ruleId === 'CURRIC-1')).toBe(false)
  })

  it('warns: IGCSE paper in an A-Level course (level mismatch)', () => {
    const v = checkCurriculumMatch({
      extractedText: 'IGCSE Mathematics 0580/22',
      expectedBoard: 'A Level',
    })
    expect(v.some(x => x.ruleId === 'CURRIC-1')).toBe(true)
  })

  it('does NOT warn when no board markers are present', () => {
    const v = checkCurriculumMatch({
      extractedText: 'A set of practice questions on hypothesis testing.',
      expectedBoard: 'AP',
    })
    expect(v.some(x => x.ruleId === 'CURRIC-1')).toBe(false)
  })

  it('does NOT warn when the course board is not a detectable one', () => {
    const v = checkCurriculumMatch({
      extractedText: 'Cambridge International A Level 9709',
      expectedBoard: 'HKDSE',
    })
    expect(v).toHaveLength(0)
  })
})

describe('checkCurriculumMatch — layer 2 (AI subject)', () => {
  it('warns on a clearly different subject at high confidence', () => {
    const v = checkCurriculumMatch({
      expectedBoard: 'AP',
      expectedSubject: 'AP Statistics',
      aiSubject: 'Biology',
      aiConfidence: 'high',
    })
    expect(v.some(x => x.ruleId === 'CURRIC-2')).toBe(true)
  })

  it('does NOT warn when subjects overlap (board words stripped)', () => {
    const v = checkCurriculumMatch({
      expectedBoard: 'AP',
      expectedSubject: 'AP Statistics',
      aiSubject: 'Statistics',
      aiConfidence: 'high',
    })
    expect(v.some(x => x.ruleId === 'CURRIC-2')).toBe(false)
  })

  it('does NOT warn on subject mismatch below high confidence', () => {
    const v = checkCurriculumMatch({
      expectedBoard: 'AP',
      expectedSubject: 'AP Statistics',
      aiSubject: 'Biology',
      aiConfidence: 'medium',
    })
    expect(v.some(x => x.ruleId === 'CURRIC-2')).toBe(false)
  })

  // Subject-family bridge: related fields are not a mismatch.
  it('does NOT warn: Mathematics document in an AP Statistics course (stats ⊂ math)', () => {
    const v = checkCurriculumMatch({
      expectedBoard: 'AP',
      expectedSubject: 'AP Statistics',
      aiSubject: 'Mathematics',
      aiConfidence: 'high',
    })
    expect(v.some(x => x.ruleId === 'CURRIC-2')).toBe(false)
  })

  it('does NOT warn: Calculus document in a Mathematics course', () => {
    const v = checkCurriculumMatch({
      expectedBoard: 'A Level',
      expectedSubject: 'A Level Mathematics',
      aiSubject: 'Calculus',
      aiConfidence: 'high',
    })
    expect(v.some(x => x.ruleId === 'CURRIC-2')).toBe(false)
  })

  it('still warns: Biology document in an AP Statistics course (unrelated)', () => {
    const v = checkCurriculumMatch({
      expectedBoard: 'AP',
      expectedSubject: 'AP Statistics',
      aiSubject: 'Biology',
      aiConfidence: 'high',
    })
    expect(v.some(x => x.ruleId === 'CURRIC-2')).toBe(true)
  })

  it('still warns: Chemistry document in a Biology course (distinct sciences)', () => {
    const v = checkCurriculumMatch({
      expectedBoard: 'AP',
      expectedSubject: 'AP Biology',
      aiSubject: 'Chemistry',
      aiConfidence: 'high',
    })
    expect(v.some(x => x.ruleId === 'CURRIC-2')).toBe(true)
  })
})
