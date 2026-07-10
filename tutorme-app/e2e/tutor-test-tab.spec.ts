/**
 * E2E smoke: the tutor "Test" tab renders and is interactive.
 *
 * Skeleton/starter (extend with a seeded course + generated DMI to exercise the
 * inline per-question grading end-to-end). It guards that switching into Test
 * mode renders the Test-tab shell — its student sub-tabs and the marking-policy
 * area — without crashing. Requires E2E_TUTOR_EMAIL / E2E_TUTOR_PASSWORD; the
 * navigation mirrors insights-tab-loop.spec.ts (the known-good builder path).
 */

import { test, expect } from '@playwright/test'

test.describe('Tutor Test tab', () => {
  test('switching to Test mode renders the Test-tab shell without crashing', async ({ page }) => {
    const fatal: string[] = []
    page.on('pageerror', e => {
      if (/#185|Maximum update depth|Minified React error/i.test(e.message)) {
        fatal.push(`pageerror: ${e.message}`)
      }
    })

    // Log in as a tutor (same convention as the other tutor specs).
    await page.goto('/login')
    await page.locator('#email').fill(process.env.E2E_TUTOR_EMAIL ?? 'tutor@example.com')
    await page.locator('#password').fill(process.env.E2E_TUTOR_PASSWORD ?? 'Password1')
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page).toHaveURL(/\/tutor\/dashboard/, { timeout: 10000 })

    // Open the builder shell and switch to Test mode.
    await page.goto('/tutor/insights')
    const modeTabs = page.getByTestId('builder-mode-tabs')
    await expect(modeTabs.getByRole('tab', { name: 'Test', exact: true })).toBeVisible({
      timeout: 15000,
    })
    await modeTabs.getByRole('tab', { name: 'Test', exact: true }).click()

    // The Test-tab shell should appear (its student sub-tabs / marking-policy
    // area) and nothing should have crashed the builder.
    const crashText = page.getByText(
      /Couldn.t display the insights builder|Maximum update depth|Minified React error/i
    )
    await expect(crashText).toHaveCount(0)

    await expect(
      page.getByText(/Classroom|Test Student|marking policy|Start a PCI chat/i).first()
    ).toBeVisible({ timeout: 10000 })

    expect(fatal, `unexpected fatal errors:\n${fatal.join('\n')}`).toEqual([])
  })
})
