import { describe, it, expect } from 'vitest'
import {
  analyzeDocumentSignals,
  documentKindLooksWrong,
  resolveDocumentKind,
  type DocumentSignals,
} from './document-signals'

const signalsWith = (paperSignal: DocumentSignals['paperSignal']): DocumentSignals => ({
  markAllocations: 0,
  questionLines: 0,
  mcqOptionLines: 0,
  mcqOptionMarkers: 0,
  answerBlanks: 0,
  imperativeCues: 0,
  proseChars: 0,
  paperSignal,
})

// SAT-style: pdfjs collapses each question's options onto one line, so the
// options/numbers are INLINE (not line-anchored) amid heavy reading passages.
const SAT_COLLAPSED = `--- Page 4 ---
Module 1 Reading and Writing 33 QUESTIONS DIRECTIONS ... All questions in this section are multiple-choice with four answer choices. ${Array.from(
  { length: 12 },
  (_, i) =>
    `${i + 1} A long reading passage sets up the context for the question in considerable detail here. Which choice completes the text with the most logical and precise word? A) alpha B) beta C) gamma D) delta`
).join(' ')}`

// Numbered study notes: numbered headings + prose, but NO marks / MCQ / blanks.
const STUDY_NOTES = [
  '1. AGENT MARKETPLACE INTERFACE',
  'The agent marketplace interface lets buyers and sellers discover each other and transact. '.repeat(
    3
  ),
  '2. TRUST AND SAFETY',
  'Trust and safety mechanisms include reputation scores, escrow, and dispute resolution flows. '.repeat(
    3
  ),
  '3. PRICING MODELS',
  'Pricing can be fixed, auction-based, or negotiated depending on the category and demand. '.repeat(
    3
  ),
].join('\n')

const REAL_PAPER = `Section A
1. Calculate the mean of the data set. [3]
2. Determine the standard deviation. [4]
(a) State one advantage.
(b) State one disadvantage.`

describe('analyzeDocumentSignals', () => {
  it('flags a real question paper as a strong paper signal', () => {
    const paper = `Section A
1. Calculate the mean of the data set. [3]
2. Determine the standard deviation. [4]
3. Explain why the median is more robust. [5]
(a) State one advantage.
(b) State one disadvantage.`
    const s = analyzeDocumentSignals(paper)
    expect(s.paperSignal).toBe('strong')
    expect(s.markAllocations).toBeGreaterThanOrEqual(2)
  })

  it('flags an MCQ paper as strong via lettered options', () => {
    const mcq = `1. What is 2 + 2?
A. 3
B. 4
C. 5
D. 6
2. Which is prime?
A. 4
B. 9
C. 7
D. 8`
    const s = analyzeDocumentSignals(mcq)
    expect(s.mcqOptionLines).toBeGreaterThanOrEqual(4)
    expect(s.paperSignal).toBe('strong')
  })

  it('reports NO paper signal for explanatory study notes', () => {
    const notes = `Photosynthesis is the process by which green plants convert light energy into chemical energy stored in glucose, using carbon dioxide and water.
The process occurs mainly in the chloroplasts, which contain the pigment chlorophyll that absorbs light most strongly in the blue and red parts of the spectrum.
There are two main stages: the light-dependent reactions and the light-independent reactions, which together sustain almost all life on Earth.`
    const s = analyzeDocumentSignals(notes)
    expect(s.paperSignal).toBe('none')
    expect(s.markAllocations).toBe(0)
    expect(s.proseChars).toBeGreaterThan(0)
  })

  it('does not call a numbered outline a strong paper on its own', () => {
    const outline = `1. Introduction to cells
2. The cell membrane
3. Organelles and their functions
4. Cell division`
    const s = analyzeDocumentSignals(outline)
    // Numbered headings alone (no marks, no options, no answer blanks, no task
    // verbs) must not read as a strong question paper.
    expect(s.paperSignal).not.toBe('strong')
  })

  it('sees prose (not hard markers) in numbered study notes', () => {
    const s = analyzeDocumentSignals(STUDY_NOTES)
    expect(s.markAllocations).toBe(0)
    expect(s.answerBlanks).toBe(0)
    expect(s.mcqOptionLines).toBeLessThan(2)
    expect(s.proseChars).toBeGreaterThan(400)
    expect(s.paperSignal).not.toBe('strong')
  })
})

describe('documentKindLooksWrong', () => {
  it('flags an unclassified document', () => {
    expect(documentKindLooksWrong(null, analyzeDocumentSignals(REAL_PAPER))).toBe(true)
    expect(documentKindLooksWrong(null, null)).toBe(true)
  })

  it('flags prose study notes mislabelled as a question paper (the reported bug)', () => {
    expect(documentKindLooksWrong('question_paper', analyzeDocumentSignals(STUDY_NOTES))).toBe(true)
  })

  it('does NOT flag a genuine question paper called a question paper', () => {
    expect(documentKindLooksWrong('question_paper', analyzeDocumentSignals(REAL_PAPER))).toBe(false)
  })

  it('flags a marker-rich paper mislabelled as study material', () => {
    expect(documentKindLooksWrong('study_material', analyzeDocumentSignals(REAL_PAPER))).toBe(true)
  })

  it('does NOT flag study notes correctly called study material', () => {
    expect(documentKindLooksWrong('study_material', analyzeDocumentSignals(STUDY_NOTES))).toBe(
      false
    )
  })

  it('does not flag a classified doc when signals are unavailable (image-only PDF)', () => {
    expect(documentKindLooksWrong('question_paper', null)).toBe(false)
  })
})

describe('analyzeDocumentSignals — inline MCQ options (SAT / collapsed extraction)', () => {
  it('detects an MCQ paper as STRONG even when options are inline, not line-anchored', () => {
    const s = analyzeDocumentSignals(SAT_COLLAPSED)
    // The line-anchored counts are defeated by the collapsed layout...
    expect(s.mcqOptionLines).toBeLessThan(4)
    // ...but the inline option markers catch it.
    expect(s.mcqOptionMarkers).toBeGreaterThanOrEqual(8)
    expect(s.paperSignal).toBe('strong')
  })

  it('a bit of prose with one or two lettered items is NOT strong', () => {
    const s = analyzeDocumentSignals(
      'The framework has two parts. A) the parser and B) the evaluator, described below at length in prose that continues.'
    )
    expect(s.mcqOptionMarkers).toBeLessThan(8)
    expect(s.paperSignal).not.toBe('strong')
  })
})

describe('resolveDocumentKind', () => {
  it('a strong paper signal forces question_paper (the SAT/exam-paper backstop)', () => {
    const r = resolveDocumentKind(undefined, signalsWith('strong'), 'study_material')
    expect(r.settled).toBe('question_paper')
    expect(r.documentKind).toBe('question_paper')
  })

  it('the tutor override always wins — even over a strong signal', () => {
    const r = resolveDocumentKind('study_material', signalsWith('strong'), 'question_paper')
    expect(r.settled).toBe('study_material')
    expect(r.documentKind).toBe('study_material')
  })

  it('a weak/none signal defers to the model classification', () => {
    expect(resolveDocumentKind(undefined, signalsWith('weak'), 'study_material').documentKind).toBe(
      'study_material'
    )
    expect(resolveDocumentKind(undefined, signalsWith('weak')).settled).toBeUndefined()
  })

  it('no signals (image-only PDF) → defers to the model', () => {
    expect(resolveDocumentKind(undefined, null, 'question_paper').documentKind).toBe(
      'question_paper'
    )
    expect(resolveDocumentKind(undefined, null, null).documentKind).toBeNull()
  })

  it('resolves a collapsed SAT paper to question_paper against a study_material model call', () => {
    const r = resolveDocumentKind(
      undefined,
      analyzeDocumentSignals(SAT_COLLAPSED),
      'study_material'
    )
    expect(r.documentKind).toBe('question_paper')
  })
})
