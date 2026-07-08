import { describe, it, expect } from 'vitest'
import { analyzeDocumentSignals, documentKindLooksWrong } from './document-signals'

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
