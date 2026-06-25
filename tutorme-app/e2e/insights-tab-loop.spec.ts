/**
 * E2E regression: the insights builder must survive repeated mode-tab clicks.
 *
 * Clicking the Build / Test / Classroom mode tabs used to trigger React error
 * #185 ("Maximum update depth exceeded") — a render loop from CourseBuilder
 * mirroring its `mainTab` prop into local state and echoing it back to the
 * parent one render apart. The PanelErrorBoundary then swapped the builder for
 * "Couldn't display the insights builder." Fixed by removing the upward-push
 * effect (PR #264). This guards against any recurrence of that bug class.
 */

import { test, expect } from '@playwright/test'

test.describe('Insights builder — mode tabs', () => {
  test('clicking Build/Test/Classroom repeatedly does not crash the builder', async ({ page }) => {
    // Surface React #185 / update-depth as a test failure even when the error
    // boundary contains it (the boundary swallows the throw but logs to console).
    const loopErrors: string[] = []
    page.on('pageerror', e => {
      if (/#185|Maximum update depth/i.test(e.message)) loopErrors.push(`pageerror: ${e.message}`)
    })
    page.on('console', m => {
      const t = m.text()
      if (/#185|Maximum update depth|insights builder/i.test(t)) loopErrors.push(`console: ${t}`)
    })

    // Log in as a tutor (same convention as tutor-course-config.spec.ts).
    await page.goto('/login')
    await page.locator('#email').fill(process.env.E2E_TUTOR_EMAIL ?? 'tutor@example.com')
    await page.locator('#password').fill(process.env.E2E_TUTOR_PASSWORD ?? 'Password1')
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page).toHaveURL(/\/tutor\/dashboard/, { timeout: 10000 })

    // Open the standalone insights builder shell.
    await page.goto('/tutor/insights')

    // The mode tabs are part of the builder shell (TutorControlsPanel). Scope to
    // that tablist so we don't collide with the panel's own inner tabs (which
    // also include "Build" / "Classroom" labels).
    const modeTabs = page.getByTestId('builder-mode-tabs')
    await expect(modeTabs.getByRole('tab', { name: 'Build', exact: true })).toBeVisible({
      timeout: 15000,
    })

    const crashText = page.getByText(
      /Couldn.t display the insights builder|Maximum update depth|Minified React error #185/i
    )
    await expect(crashText).toHaveCount(0)

    // Cycle through the mode tabs several times — this is the exact gesture that
    // used to crash on the first click.
    const sequence = ['Test', 'Build', 'Classroom', 'Build', 'Test', 'Classroom']
    for (const label of sequence) {
      await modeTabs.getByRole('tab', { name: label, exact: true }).click()
      // Give any (now-removed) render loop a chance to blow the stack.
      await page.waitForTimeout(500)
      await expect(
        crashText,
        `builder crashed after clicking "${label}"`
      ).toHaveCount(0)
    }

    expect(loopErrors, `unexpected render-loop errors:\n${loopErrors.join('\n')}`).toEqual([])
  })
})
