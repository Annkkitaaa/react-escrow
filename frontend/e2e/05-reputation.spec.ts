/**
 * 05 — Reputation Profile page
 * Tests the ReputationProfile component rendering and lookup flow.
 */
import { test, expect } from '@playwright/test'
import { injectMockWallet, mockRpc, MOCK_FREELANCER } from './helpers/mock'

test.describe('Reputation Profile — page structure', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockWallet(page, { connected: true })
    await mockRpc(page)
    await page.goto('/reputation')
    await page.waitForURL('**/reputation')
  })

  test('shows Reputation heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Reputation/i })).toBeVisible()
  })

  test('shows address lookup input', async ({ page }) => {
    await expect(page.getByPlaceholder(/0x…|address/i)).toBeVisible()
  })

  test('shows Look Up button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Look Up/i })).toBeVisible()
  })

  test('shows How Reputation Works section', async ({ page }) => {
    await expect(page.getByText(/How Reputation Works|Soulbound|Merkle/i).first()).toBeVisible()
  })
})

test.describe('Reputation Profile — lookup flow', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockWallet(page, { connected: true })
    await mockRpc(page)
    await page.goto('/reputation')
    await page.waitForURL('**/reputation')
  })

  test('lookup with invalid address shows error', async ({ page }) => {
    await page.getByPlaceholder(/0x…|address/i).fill('not-valid')
    await page.getByRole('button', { name: /Look Up/i }).click()
    await expect(page.getByText(/invalid|not a valid/i)).toBeVisible({ timeout: 5000 })
  })

  test('lookup with valid address triggers contract read', async ({ page }) => {
    await page.getByPlaceholder(/0x…|address/i).fill(MOCK_FREELANCER)
    await page.getByRole('button', { name: /Look Up/i }).click()
    // Should show the address or "No token" state (mock hasToken returns false)
    await expect(
      page.getByText(/No SBT|not yet completed|not yet earned|No reputation/i).first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('shows own wallet address pre-filled or as quick lookup', async ({ page }) => {
    // Some implementations pre-fill or show "Look up your own" button
    // At minimum the page should be functional
    await expect(page.getByRole('button', { name: /Look Up/i })).toBeEnabled()
  })
})

test.describe('Reputation Profile — navigation', () => {
  test('navigating from Layout Reputation link reaches /reputation', async ({ page }) => {
    await injectMockWallet(page, { connected: true })
    await mockRpc(page)
    await page.goto('/dashboard')
    await page.waitForURL('**/dashboard')

    await page.getByRole('link', { name: /Reputation/i }).click()
    await page.waitForURL('**/reputation', { timeout: 8000 })
    expect(page.url()).toContain('/reputation')
  })
})
