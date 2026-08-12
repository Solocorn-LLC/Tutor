#!/usr/bin/env node
/**
 * Scheduling conflict / concurrency test
 *
 * Simulates many tutors/publishers creating schedules for the same course at the
 * same time and checks whether the backend allows overlapping sessions or
 * over-enrollment.
 *
 * Requires a running Solocorn app with a seeded test tutor and student.
 *
 * Usage:
 *   node scripts/load/scheduling-conflicts.js
 *
 * Environment:
 *   BASE_URL                 default: http://localhost:3003
 *   TUTOR_EMAIL              required
 *   TUTOR_PASSWORD           required
 *   STUDENT_EMAIL            required
 *   STUDENT_PASSWORD         required
 *   VUS                      default: 10
 *   DURATION_SECONDS         default: 10
 *   COURSE_ID                optional (a new course is created if omitted)
 *   MAX_STUDENTS_PER_SLOT    default: 5
 *   WEEKS_TO_SCHEDULE        default: 1
 *
 * Example:
 *   BASE_URL=http://localhost:3003 \
 *   TUTOR_EMAIL=tutor@example.com \
 *   TUTOR_PASSWORD=Password1 \
 *   STUDENT_EMAIL=student@example.com \
 *   STUDENT_PASSWORD=Password1 \
 *   VUS=20 \
 *   DURATION_SECONDS=15 \
 *   node scripts/load/scheduling-conflicts.js
 */

const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads')
const { performance } = require('node:perf_hooks')

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3003').replace(/\/$/, '')
const TUTOR_EMAIL = process.env.TUTOR_EMAIL
const TUTOR_PASSWORD = process.env.TUTOR_PASSWORD
const STUDENT_EMAIL = process.env.STUDENT_EMAIL
const STUDENT_PASSWORD = process.env.STUDENT_PASSWORD
const VUS = parseInt(process.env.VUS || '10', 10)
const DURATION_SECONDS = parseInt(process.env.DURATION_SECONDS || '10', 10)
const MAX_STUDENTS = parseInt(process.env.MAX_STUDENTS_PER_SLOT || '5', 10)
const WEEKS = parseInt(process.env.WEEKS_TO_SCHEDULE || '1', 10)

function parseCookies(response) {
  const raw = response.headers.getSetCookie ? response.headers.getSetCookie() : []
  const cookies = {}
  for (const c of raw) {
    const [nameValue] = c.split(';')
    const [name, value] = nameValue.split('=')
    if (name && value !== undefined) cookies[name.trim()] = value.trim()
  }
  return cookies
}

function cookieString(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

async function login(email, password) {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`, { credentials: 'include' })
  if (!csrfRes.ok) throw new Error(`Auth CSRF failed: ${csrfRes.status}`)
  const csrfData = await csrfRes.json()
  const authCookies = parseCookies(csrfRes)

  const body = new URLSearchParams()
  body.append('csrfToken', csrfData.csrfToken)
  body.append('email', email)
  body.append('password', password)
  body.append('callbackUrl', `${BASE_URL}/tutor/dashboard`)
  body.append('json', 'true')

  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieString(authCookies),
    },
    body: body.toString(),
    credentials: 'include',
    redirect: 'manual',
  })

  if (!loginRes.ok && loginRes.status !== 302) {
    const text = await loginRes.text().catch(() => '')
    throw new Error(`Login failed: ${loginRes.status} ${text}`)
  }

  const cookies = parseCookies(loginRes)
  const sessionToken =
    cookies['next-auth.session-token'] ||
    cookies['__Secure-next-auth.session-token'] ||
    cookies['__Host-next-auth.session-token']

  if (!sessionToken) {
    throw new Error('No session cookie returned after login')
  }

  return { 'next-auth.session-token': sessionToken }
}

async function getCsrfToken(sessionCookies) {
  const res = await fetch(`${BASE_URL}/api/csrf`, {
    headers: { Cookie: cookieString(sessionCookies) },
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`CSRF endpoint failed: ${res.status}`)
  const data = await res.json()
  const cookies = parseCookies(res)
  return { token: data.token, cookies: { ...sessionCookies, ...cookies } }
}

async function createTestCourse(sessionCookies, csrfToken) {
  const res = await fetch(`${BASE_URL}/api/tutor/courses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieString(sessionCookies),
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({
      title: `Scheduling Load Test ${Date.now()}`,
      categories: ['LoadTest'],
      isLiveOnline: true,
    }),
  })
  if (!res.ok) throw new Error(`Create course failed: ${res.status}`)
  const data = await res.json()
  const course = data.courses?.[0]
  if (!course?.id) throw new Error(`No course id in response: ${JSON.stringify(data)}`)
  return course.id
}

async function getSessions(courseId, sessionCookies) {
  const res = await fetch(`${BASE_URL}/api/tutor/courses/${courseId}/sessions`, {
    headers: { Cookie: cookieString(sessionCookies) },
  })
  if (!res.ok) throw new Error(`Get sessions failed: ${res.status}`)
  const data = await res.json()
  return data.sessions || []
}

async function createSchedule(courseId, sessionCookies, csrfToken) {
  const res = await fetch(`${BASE_URL}/api/tutor/courses/${courseId}/schedules`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieString(sessionCookies),
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({
      schedule: [{ dayOfWeek: 'Monday', startTime: '10:00', durationMinutes: 60 }],
      weeksToSchedule: WEEKS,
      maxStudents: MAX_STUDENTS,
    }),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, scheduleId: body.schedule?.scheduleId, body }
}

async function enrollStudent(studentCookies, csrfToken, courseId, scheduleId) {
  const res = await fetch(`${BASE_URL}/api/courses/${courseId}/enroll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieString(studentCookies),
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ scheduleId }),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

function runWorker(workerId, courseId, cookies, csrfToken, durationSeconds) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: { workerId, courseId, cookies, csrfToken, durationSeconds },
    })
    worker.on('message', resolve)
    worker.on('error', reject)
    worker.on('exit', code => {
      if (code !== 0) reject(new Error(`Worker ${workerId} exited with code ${code}`))
    })
  })
}

if (isMainThread) {
  async function main() {
    console.log('Scheduling conflict / concurrency test')
    console.log(`BASE_URL: ${BASE_URL}`)
    console.log(
      `VUs: ${VUS}, Duration: ${DURATION_SECONDS}s, Weeks: ${WEEKS}, MaxStudents: ${MAX_STUDENTS}`
    )

    if (!TUTOR_EMAIL || !TUTOR_PASSWORD || !STUDENT_EMAIL || !STUDENT_PASSWORD) {
      console.error(
        'Set TUTOR_EMAIL, TUTOR_PASSWORD, STUDENT_EMAIL, and STUDENT_PASSWORD to run this test.'
      )
      process.exit(1)
    }

    const health = await fetch(`${BASE_URL}/api/health`).catch(() => null)
    if (!health?.ok) {
      console.error('App does not appear to be running at', BASE_URL)
      process.exit(1)
    }
    console.log('Health check OK')

    console.log(`Logging in tutor ${TUTOR_EMAIL}...`)
    const tutorCookies = await login(TUTOR_EMAIL, TUTOR_PASSWORD)
    console.log('Tutor logged in')

    const csrf = await getCsrfToken(tutorCookies)
    console.log('CSRF token acquired')

    const courseId = process.env.COURSE_ID || (await createTestCourse(csrf.cookies, csrf.token))
    console.log(`Using course: ${courseId}`)

    const sessionsBefore = await getSessions(courseId, csrf.cookies)
    console.log(`Sessions before test: ${sessionsBefore.length}`)

    const start = performance.now()
    const workers = []
    for (let i = 0; i < VUS; i++) {
      workers.push(runWorker(i, courseId, csrf.cookies, csrf.token, DURATION_SECONDS))
    }
    const workerResults = await Promise.all(workers)
    const elapsed = (performance.now() - start) / 1000

    const totalAttempts = workerResults.reduce((s, r) => s + r.attempts, 0)
    const totalSuccess = workerResults.reduce((s, r) => s + r.success, 0)
    const totalFailures = workerResults.reduce((s, r) => s + r.failures, 0)
    const total409 = workerResults.reduce((s, r) => s + r.conflicts, 0)
    const statusCounts = {}
    const latencies = []
    for (const r of workerResults) {
      for (const [status, count] of Object.entries(r.statusCounts)) {
        statusCounts[status] = (statusCounts[status] || 0) + count
      }
      latencies.push(...r.latencies)
    }
    latencies.sort((a, b) => a - b)
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0

    console.log(`\n--- Schedule creation load complete ---`)
    console.log(`Elapsed: ${elapsed.toFixed(2)}s`)
    console.log(`Attempts: ${totalAttempts}`)
    console.log(`Success (2xx): ${totalSuccess}`)
    console.log(`Failures (non-2xx/exception): ${totalFailures}`)
    console.log(`409 Conflict responses: ${total409}`)
    console.log('Status distribution:', statusCounts)
    console.log(`p95 latency: ${p95.toFixed(1)}ms`)
    console.log(`p99 latency: ${p99.toFixed(1)}ms`)

    const sessionsAfter = await getSessions(courseId, csrf.cookies)
    const actualNew = sessionsAfter.length - sessionsBefore.length
    const expectedNew = totalSuccess * WEEKS // each successful schedule creates WEEKS sessions per slot
    console.log(`\n--- Session count audit ---`)
    console.log(`Sessions after test: ${sessionsAfter.length} (new: ${actualNew})`)
    console.log(`Expected new sessions (successes × weeks): ${expectedNew}`)

    const byTime = {}
    for (const s of sessionsAfter) {
      const key = s.scheduledAt ? new Date(s.scheduledAt).toISOString() : 'unknown'
      byTime[key] = (byTime[key] || 0) + 1
    }
    const overlaps = Object.entries(byTime).filter(([, count]) => count > 1)
    if (overlaps.length > 0) {
      console.warn(`\n⚠️  CONFLICT DETECTED: overlapping sessions at the same time`)
      for (const [time, count] of overlaps) {
        console.warn(`   ${time}: ${count} sessions`)
      }
      if (actualNew > WEEKS) {
        console.warn(`   The backend allowed ${actualNew} sessions for the same slot instead of 1.`)
      }
    } else if (actualNew === expectedNew) {
      console.log('\nNo overlapping sessions detected.')
    } else {
      console.warn(`\nUnexpected session count. Some schedule creations may have failed silently.`)
    }

    console.log(`\n--- Enrollment capacity test ---`)
    const studentCookies = await login(STUDENT_EMAIL, STUDENT_PASSWORD)
    const studentCsrf = await getCsrfToken(studentCookies)
    const scheduleId = sessionsAfter[0]?.scheduleId
    if (!scheduleId) {
      console.warn('No scheduleId available; skipping capacity test.')
      process.exit(0)
    }

    // One account cannot meaningfully race itself because enrollments are
    // idempotent. We do a single enrollment here to verify the happy path and
    // report capacity. For a true capacity race you would supply many distinct
    // student accounts via STUDENT_ACCOUNTS_CSV.
    const enroll = await enrollStudent(studentCsrf.cookies, studentCsrf.token, courseId, scheduleId)
    console.log(`Student enrollment status: ${enroll.status}`)
    if (enroll.status >= 200 && enroll.status < 300) {
      console.log('Enrollment succeeded')
    } else if (enroll.status === 409) {
      console.log('Enrollment rejected (capacity or conflict)')
    } else {
      console.warn('Enrollment failed:', enroll.body)
    }

    const sessionsFinal = await getSessions(courseId, csrf.cookies)
    const finalSlot = sessionsFinal.find(s => s.scheduleId === scheduleId)
    console.log(
      `Final enrolled count for schedule ${scheduleId}: ${finalSlot?.enrolledStudents ?? 'n/a'} / ${MAX_STUDENTS}`
    )
  }

  main().catch(e => {
    console.error(e)
    process.exit(1)
  })
} else {
  const { courseId, cookies, csrfToken, durationSeconds } = workerData
  const results = {
    attempts: 0,
    success: 0,
    failures: 0,
    conflicts: 0,
    statusCounts: {},
    latencies: [],
  }
  const endTime = performance.now() + durationSeconds * 1000
  let iteration = 0

  async function tick() {
    while (performance.now() < endTime) {
      iteration++
      results.attempts++
      const start = performance.now()
      try {
        const r = await createSchedule(courseId, cookies, csrfToken)
        results.statusCounts[r.status] = (results.statusCounts[r.status] || 0) + 1
        if (r.status >= 200 && r.status < 300) {
          results.success++
        } else if (r.status === 409) {
          results.conflicts++
        } else {
          results.failures++
        }
      } catch (e) {
        results.failures++
        results.statusCounts.exception = (results.statusCounts.exception || 0) + 1
      }
      results.latencies.push(performance.now() - start)
      // small think time to avoid hammering the event loop
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    parentPort.postMessage(results)
  }

  tick().catch(e => {
    console.error('Worker error:', e)
    process.exit(1)
  })
}
