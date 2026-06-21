/**
 * E2E: live auto-grading, two-user flow (tutor + student).
 *
 * Verifies the full live-session path that the auto-grading feature drives:
 * a student completes a task in a live session, the server grades their answers
 * against the task's DMI answer key, and the tutor's Monitor tab shows the
 * resulting "Understanding" within seconds — no manual grading.
 *
 * This test exercises real infrastructure, so (like live-task-policy-toggle) it
 * is ENV-GATED and skips unless prerequisites are provided.
 *
 * PREREQUISITES
 *   1. The app must run with the FULL socket server (`npm run dev`, NOT
 *      `dev:next`) — point Playwright at it via PLAYWRIGHT_BASE_URL, or start it
 *      on :3003 before running. `task:complete` is a Socket.io event.
 *   2. An ACTIVE live session whose course has a deployed task that carries a
 *      DMI answer key (BuilderTaskDmi.items with `answer`s).
 *   3. A tutor account that owns the session and a student enrolled in its
 *      course.
 *
 * REQUIRED ENV
 *   E2E_LIVE_SESSION_ID   the active session id (also the socket roomId)
 *   E2E_LIVE_TASK_ID      id of a deployed task in that session with an answer key
 *
 * OPTIONAL ENV
 *   E2E_LIVE_ROOM_ID            socket room id (default: session id)
 *   E2E_TUTOR_EMAIL / _PASSWORD (default tutor@example.com / Password1)
 *   E2E_STUDENT_EMAIL / _PASSWORD (default student@example.com / Password1)
 *   E2E_STUDENT_NAME            student display name, to locate their roster card
 *   E2E_LIVE_TASK_ANSWERS       JSON object of answers keyed by DMI item id,
 *                               e.g. '{"q1":"Paris","q2":"42"}' (default: {})
 *   E2E_EXPECTED_UNDERSTANDING  exact expected percentage to assert (e.g. "67")
 *   E2E_LOCALE                  locale segment (default: en)
 *
 * RUN
 *   E2E_LIVE_SESSION_ID=... E2E_LIVE_TASK_ID=... \
 *   E2E_TUTOR_EMAIL=... E2E_TUTOR_PASSWORD=... \
 *   E2E_STUDENT_EMAIL=... E2E_STUDENT_PASSWORD=... \
 *   npx playwright test e2e/live-auto-grading.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'

interface TestSocket {
  connected: boolean
  on: (event: string, cb: (payload?: unknown) => void) => void
  emit: (event: string, payload: unknown) => void
  disconnect: () => void
}

interface SocketIoFactory {
  (options: { path: string; transports: string[]; auth: { token: string } }): TestSocket
}

interface WindowWithIo extends Window {
  io?: SocketIoFactory
  __e2eGradingSocket?: TestSocket
}

async function login(page: Page, email: string, password: string, expectedPath: RegExp) {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /login/i }).click()
  await expect(page).toHaveURL(expectedPath, { timeout: 15000 })
}

/**
 * Joins the live room as the authenticated student and completes a task — the
 * exact two emits the real student client sends (`join_class`, then
 * `task:complete` with answers keyed by DMI item id). The socket is kept alive
 * on `window.__e2eGradingSocket` so the student stays in the roster while the
 * tutor reads it; disconnect with `disconnectStudentSocket` afterwards.
 *
 * Returns the server's response: 'completed', 'error:...', or 'timeout'.
 */
async function joinAndCompleteTask(
  page: Page,
  payload: { roomId: string; taskId: string; answers: Record<string, string> }
): Promise<string> {
  return page.evaluate(async args => {
    const ensureIo = async (): Promise<SocketIoFactory | undefined> => {
      const w = window as WindowWithIo
      if (w.io) return w.io
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = '/socket.io/socket.io.js'
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Failed to load socket.io client'))
        document.head.appendChild(script)
      })
      return (window as WindowWithIo).io
    }

    const tokenRes = await fetch('/api/socket-token', { credentials: 'include' })
    if (!tokenRes.ok) throw new Error(`socket-token fetch failed: ${tokenRes.status}`)
    const { token } = (await tokenRes.json()) as { token?: string }
    if (!token) throw new Error('No socket token returned')

    const io = await ensureIo()
    if (!io) throw new Error('Socket.io client unavailable in page context')

    const socket = io({
      path: '/api/socket',
      transports: ['websocket', 'polling'],
      auth: { token },
    })
    ;(window as WindowWithIo).__e2eGradingSocket = socket

    return await new Promise<string>(resolve => {
      let settled = false
      const finish = (msg: string) => {
        if (!settled) {
          settled = true
          resolve(msg)
        }
      }
      socket.on('connect', () => {
        socket.emit('join_class', { roomId: args.roomId })
        // Small delay so the join is processed (room membership) before completing.
        setTimeout(() => {
          socket.emit('task:complete', {
            roomId: args.roomId,
            taskId: args.taskId,
            answers: args.answers,
          })
        }, 800)
      })
      // task:completed is broadcast to the whole room, including the emitter.
      socket.on('task:completed', () => finish('completed'))
      socket.on('task:complete:error', p => finish(`error:${JSON.stringify(p)}`))
      socket.on('connect_error', e => finish(`connect_error:${JSON.stringify(e)}`))
      setTimeout(() => finish('timeout'), 10000)
    })
  }, payload)
}

async function disconnectStudentSocket(page: Page) {
  await page.evaluate(() => {
    ;(window as WindowWithIo).__e2eGradingSocket?.disconnect()
  })
}

async function openTutorMonitor(page: Page, locale: string, sessionId: string) {
  // /tutor/classroom redirects to the canonical insights classroom (view=classroom).
  await page.goto(`/${locale}/tutor/classroom?sessionId=${encodeURIComponent(sessionId)}`)
  await expect(page).toHaveURL(/\/tutor\/insights/, { timeout: 20000 })

  // Open the Monitor tab (CourseBuilder live tab id 'student-monitor', label 'Monitor').
  const tab = page.getByRole('tab', { name: /^Monitor$/ })
  const button = page.getByRole('button', { name: /^Monitor$/ })
  if (await tab.count()) {
    await tab.first().click()
  } else if (await button.count()) {
    await button.first().click()
  } else {
    await page.getByText('Monitor', { exact: true }).first().click()
  }
}

test.describe('Live auto-grading (tutor + student)', () => {
  test('student task completion populates the tutor Monitor Understanding', async ({ browser }) => {
    test.skip(
      !process.env.E2E_LIVE_SESSION_ID || !process.env.E2E_LIVE_TASK_ID,
      'Set E2E_LIVE_SESSION_ID and E2E_LIVE_TASK_ID to run this test.'
    )

    const locale = process.env.E2E_LOCALE ?? 'en'
    const sessionId = process.env.E2E_LIVE_SESSION_ID as string
    const taskId = process.env.E2E_LIVE_TASK_ID as string
    const roomId = process.env.E2E_LIVE_ROOM_ID ?? sessionId

    const tutorEmail = process.env.E2E_TUTOR_EMAIL ?? 'tutor@example.com'
    const tutorPassword = process.env.E2E_TUTOR_PASSWORD ?? 'Password1'
    const studentEmail = process.env.E2E_STUDENT_EMAIL ?? 'student@example.com'
    const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? 'Password1'
    const studentName = process.env.E2E_STUDENT_NAME
    const expectedUnderstanding = process.env.E2E_EXPECTED_UNDERSTANDING

    let answers: Record<string, string> = {}
    if (process.env.E2E_LIVE_TASK_ANSWERS) {
      answers = JSON.parse(process.env.E2E_LIVE_TASK_ANSWERS) as Record<string, string>
    }

    const tutorCtx = await browser.newContext()
    const studentCtx = await browser.newContext()
    const tutorPage = await tutorCtx.newPage()
    const studentPage = await studentCtx.newPage()

    try {
      await login(tutorPage, tutorEmail, tutorPassword, /\/tutor\//)
      await login(studentPage, studentEmail, studentPassword, /\/student\//)

      // 1) Tutor opens the live Monitor first, so it receives the student_joined
      //    and task:completed broadcasts that drive the live roster + refetch.
      await openTutorMonitor(tutorPage, locale, sessionId)

      // 2) Student must be on a same-origin authenticated page to mint a socket
      //    token; the dashboard is enough. The socket itself does the join.
      await studentPage.goto(`/${locale}/student`)
      await expect(studentPage).toHaveURL(/\/student/, { timeout: 15000 })

      // 3) Student joins the room and completes the task (real socket events).
      const result = await joinAndCompleteTask(studentPage, { roomId, taskId, answers })
      expect(result, `task:complete server response was "${result}"`).toBe('completed')

      // 4) Roster shows the student (if a name was provided to locate them).
      if (studentName) {
        await expect(tutorPage.getByText(studentName, { exact: false })).toBeVisible({
          timeout: 30000,
        })
      }

      // 5) The Monitor's Understanding fills from the live auto-grade. The label
      //    "Understanding (N graded)" only renders once a real score exists
      //    (vs. "awaiting grading"), so it's the precise success signal. Allow
      //    for the ~3s post-completion refetch and the 20s poll backstop.
      await expect(tutorPage.getByText(/Understanding \(\d+ graded\)/i).first()).toBeVisible({
        timeout: 45000,
      })

      // 6) If an exact value was supplied, assert the rendered percentage.
      if (expectedUnderstanding) {
        await expect(
          tutorPage.getByText(new RegExp(`\\b${expectedUnderstanding}%`)).first()
        ).toBeVisible({ timeout: 10000 })
      }
    } finally {
      await disconnectStudentSocket(studentPage).catch(() => {})
      await tutorCtx.close()
      await studentCtx.close()
    }
  })
})
