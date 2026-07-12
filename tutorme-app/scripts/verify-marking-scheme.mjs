// Live verification: extract the AP 2023 scoring guide and run the REAL route
// prompt against Moonshot/Kimi, printing per-question answer/variants/marks/rubric.
// Usage: KIMI_API_KEY=sk-... node scripts/verify-marking-scheme.mjs
//   (or put KIMI_API_KEY=... in tutorme-app/.env.local)
import { getDocument } from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync, existsSync } from 'fs'

function loadKey() {
  if (process.env.KIMI_API_KEY) return process.env.KIMI_API_KEY
  for (const f of ['.env.local', '.env']) {
    if (existsSync(f)) {
      const m = readFileSync(f, 'utf8').match(/^KIMI_API_KEY=(.*)$/m)
      if (m && m[1].trim()) return m[1].trim().replace(/^["']|["']$/g, '')
    }
  }
  return null
}

// Pull the real TASK_PROMPT straight out of the route so we test exactly what ships.
function routeTaskPrompt() {
  const src = readFileSync('src/app/api/ai/parse-marking-scheme/route.ts', 'utf8')
  const m = src.match(/const TASK_PROMPT = `([\s\S]*?)`\n/)
  if (!m) throw new Error('Could not extract TASK_PROMPT from route')
  return m[1]
}

async function extractPdf(path, maxPages = 40) {
  const data = new Uint8Array(readFileSync(path))
  const doc = await getDocument({ data, useSystemFonts: true }).promise
  const parts = []
  for (let i = 1; i <= Math.min(maxPages, doc.numPages); i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    parts.push(tc.items.map(it => it.str ?? '').join(' ').replace(/[ \t]+/g, ' ').trim())
  }
  return parts.join('\n\n')
}

const key = loadKey()
if (!key) {
  console.error('KIMI_API_KEY not set. Put it in tutorme-app/.env.local or pass it inline.')
  process.exit(2)
}

const content = (await extractPdf('../ap23-sg-statistics.pdf')).slice(0, 80000)
// AP Stats 2023 has 6 free-response questions.
const questions = [
  { number: 1, label: 'Question 1: Focus on Exploring Data' },
  { number: 2, label: 'Question 2: Focus on Collecting Data' },
  { number: 3, label: 'Question 3: Focus on Probability and Sampling Distributions' },
  { number: 4, label: 'Question 4: Focus on Statistical Inference' },
  { number: 5, label: 'Question 5: Focus on Statistical Inference' },
  { number: 6, label: 'Question 6: Investigative Task' },
]
const questionList = questions.map(q => `#${q.number}: ${q.label}`).join('\n')
const systemPrompt = routeTaskPrompt()
const userPrompt = `Question references to match (use the leading #N as "number"):\n${questionList}\n\nMarking scheme:\n${content}`

const base = process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1'
const model = process.env.KIMI_MODEL || 'kimi-k2.5'
console.log(`Calling ${base} (model ${model}) with ${content.length} chars of scoring guide…\n`)

const resp = await fetch(`${base}/chat/completions`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model,
    temperature: 0.2,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  }),
})
if (!resp.ok) {
  console.error('API error', resp.status, await resp.text())
  process.exit(1)
}
const json = await resp.json()
const raw = json.choices?.[0]?.message?.content ?? ''
const text = raw.replace(/```json|```/g, '').trim()
const obj = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
for (const m of obj.matches || []) {
  console.log(`\n=== Q${m.number} === marks: ${m.marks ?? '(none)'}`)
  console.log(`answer:   ${m.answer}`)
  console.log(`variants: ${JSON.stringify(m.variants ?? [])}`)
  console.log(`rubric:   ${(m.rubric ?? '').slice(0, 300)}${(m.rubric ?? '').length > 300 ? '…' : ''}`)
}
console.log(`\nMatched ${obj.matches?.length ?? 0} of ${questions.length} questions.`)
