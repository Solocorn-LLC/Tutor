// Automated AI code review for pull requests.
//
// This team ships AI-generated code with no human review, so this is a safety
// net, not a nicety. It reviews the PR diff for correctness/security issues and
// posts a single sticky comment. ADVISORY: it never fails the job (so a flaky
// LLM call can't block merges). To make it a real gate later, have it exit(1)
// on a high-severity verdict and add the check to branch protection.
//
// Uses the project's Kimi (Moonshot, OpenAI-compatible) key.

import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const { KIMI_API_KEY, PR, BASE, HEAD, GITHUB_REPOSITORY: REPO } = process.env
const BASE_URL = (process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1').replace(/\/+$/, '')
const MODEL = process.env.KIMI_MODEL || 'moonshot-v1-32k'
const MARKER = '<!-- ai-review-bot -->'

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()

async function main() {
  if (!KIMI_API_KEY) return console.log('No KIMI_API_KEY — skipping AI review.')

  let diff = ''
  try {
    diff = sh(
      `git diff ${BASE}...${HEAD} -- . ':(exclude)**/package-lock.json' ':(exclude)**/*.lock' ':(exclude)**/dist/**'`
    )
  } catch (e) {
    return console.log('Could not compute diff:', e.message)
  }
  if (!diff) return console.log('Empty diff — skipping.')

  const MAX = 45000
  const truncated = diff.length > MAX
  const body = truncated ? diff.slice(0, MAX) + '\n\n…[diff truncated]…' : diff

  const system =
    'You are a senior engineer reviewing a pull-request diff for a team that ships ' +
    'AI-generated code with NO human review — your review is the safety net. Focus ONLY ' +
    'on: correctness bugs, security holes, cross-tenant/data-loss risks, race conditions, ' +
    'and broken error handling. Ignore style and nits. Be terse. If nothing blocking, reply ' +
    'exactly "No blocking issues found." Otherwise list each as: **[High|Medium]** `file:line` ' +
    '— one-line problem. Do not restate the diff or add preamble.'
  const user = `Review this diff:\n\n\`\`\`diff\n${body}\n\`\`\``

  let review = ''
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KIMI_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
    if (!res.ok) return console.log('LLM error', res.status, (await res.text()).slice(0, 500))
    const json = await res.json()
    review = (json.choices?.[0]?.message?.content || '').trim()
  } catch (e) {
    return console.log('LLM call failed:', e.message)
  }
  if (!review) return console.log('Empty review — skipping.')

  const comment =
    `${MARKER}\n### 🤖 Automated AI review\n\n${review}\n\n---\n` +
    `<sub>Advisory (Kimi ${MODEL}) — correctness/security focus, not a substitute for tests; ` +
    `does not block merge.${truncated ? ' ⚠️ Diff was truncated.' : ''}</sub>`
  writeFileSync('/tmp/ai-review.md', comment)

  // Sticky: edit the existing bot comment if present, else create one.
  try {
    const existing = sh(
      `gh api repos/${REPO}/issues/${PR}/comments --jq '[.[] | select(.body | contains("${MARKER}")) | .id] | first // empty'`
    )
    if (existing) {
      sh(`gh api -X PATCH repos/${REPO}/issues/comments/${existing} -F body=@/tmp/ai-review.md`)
      console.log('Updated existing review comment', existing)
    } else {
      sh(`gh pr comment ${PR} --repo ${REPO} --body-file /tmp/ai-review.md`)
      console.log('Posted new review comment')
    }
  } catch (e) {
    console.log('Could not post comment:', e.message)
  }
}

main()
