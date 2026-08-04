/**
 * E2E smoke: a tutor can log in and the insights course-builder mounts.
 *
 * A deliberately small, robust guard that catches gross regressions before prod
 * — a broken build, an auth break, or the builder failing to mount / hitting its
 * PanelErrorBoundary. It mirrors the login + navigation convention proven by
 * insights-tab-loop.spec.ts (the only spec wired into CI today) and is likewise
 * run in the advisory (non-blocking) e2e job. Extend it with deeper builder
 * interactions (load a course, open the DMI editor, configure MCQ) when running
 * e2e locally against seeded data.
 */

import { test, expect } from '@playwright/test'

test.describe('Tutor builder — smoke', () => {
  test('tutor can log in and the insights builder mounts', async ({ page }) => {
    // Fail the test if the builder throws React #185 / update-depth even when the
    // error boundary contains it (it logs to console).
    const fatal: string[] = []
    page.on('pageerror', e => {
      if (/#185|Maximum update depth/i.test(e.message)) fatal.push(`pageerror: ${e.message}`)
    })
    page.on('console', m => {
      const t = m.text()
      if (/#185|Maximum update depth|insights builder/i.test(t)) fatal.push(`console: ${t}`)
    })

    // Log in as the seeded e2e tutor (same convention as the other tutor specs).
    await page.goto('/login')
    await page.locator('#email').fill(process.env.E2E_TUTOR_EMAIL ?? 'tutor@example.com')
    await page.locator('#password').fill(process.env.E2E_TUTOR_PASSWORD ?? 'Password1')
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page).toHaveURL(/\/tutor\/dashboard/, { timeout: 10000 })

    // Open the standalone insights builder shell and confirm it mounts.
    await page.goto('/tutor/insights')
    // The controls panel starts collapsed, so expand it before looking for the mode tabs.
    await page.getByRole('button', { name: 'Controls' }).click()
    const modeTabs = page.getByTestId('builder-mode-tabs')
    await expect(modeTabs.getByRole('tab', { name: 'Edit', exact: true })).toBeVisible({
      timeout: 15000,
    })

    // The builder must not have fallen back to its error boundary.
    await expect(
      page.getByText(
        /Couldn.t display the insights builder|Maximum update depth|Minified React error #185/i
      )
    ).toHaveCount(0)

    // Landing on Edit mode shows the builder body (Curriculum column).
    await modeTabs.getByRole('tab', { name: 'Edit', exact: true }).click()
    await expect(page.getByText(/Curriculum/i).first()).toBeVisible({ timeout: 10000 })

    expect(fatal, `unexpected render-loop errors:\n${fatal.join('\n')}`).toEqual([])
  })
})
