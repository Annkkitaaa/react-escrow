/**
 * 01 — Landing page (no wallet / wrong network)
 * Tests the WalletConnect component in all three states.
 */
import { test, expect } from '@playwright/test'
import { injectMockWallet } from './helpers/mock'

test.describe('Landing page — no wallet detected', () => {
  test.beforeEach(async ({ page }) => {
    // No window.ethereum at all
    await page.goto('/connect')
  })

  test('shows hero headline', async ({ page }) => {
    await expect(page.getByText('Milestone Escrow,')).toBeVisible()
    await expect(page.getByText('Reactive', { exact: false })).toBeVisible()
  })

  test('shows Install MetaMask button when no ethereum', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Install MetaMask/i })).toBeVisible()
  })

  test('shows the 3 feature bullets', async ({ page }) => {
    await expect(page.getByText('Trustless milestone escrow')).toBeVisible()
    await expect(page.getByText('Somnia Native Reactivity')).toBeVisible()
    await expect(page.getByText('Auto-release on approval')).toBeVisible()
  })

  test('shows Somnia Testnet badge', async ({ page }) => {
    await expect(page.getByText('Somnia Testnet').first()).toBeVisible()
    await expect(page.locator(':text("Chain ID: 50312")').first()).toBeVisible()
  })

  test('navigating to / redirects to /connect when no wallet', async ({ page }) => {
    // App redirects / → /dashboard, then RequireWallet → /connect
    await page.goto('/')
    await page.waitForURL('**/connect')
    expect(page.url()).toContain('/connect')
  })
})

test.describe('Landing page — wallet present, not connected', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockWallet(page, { connected: false })
    await page.goto('/connect')
  })

  test('shows Connect MetaMask button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Connect MetaMask/i })).toBeVisible()
  })

  test('shows what-you-can-do feature list', async ({ page }) => {
    await expect(page.getByText('Create milestone-based escrow agreements')).toBeVisible()
    await expect(page.getByText('Fund, approve, and release payments')).toBeVisible()
    await expect(page.getByText('Raise & resolve disputes with arbiter')).toBeVisible()
  })

  test('shows MetaMask-only disclaimer', async ({ page }) => {
    await expect(page.getByText(/MetaMask only/i)).toBeVisible()
  })
})

test.describe('Landing page — wrong network', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockWallet(page, { connected: true, wrongNetwork: true })
    await page.goto('/connect')
  })

  test('shows Switch to Somnia Testnet button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Switch to Somnia Testnet/i })).toBeVisible()
  })

  test('shows wrong network warning', async ({ page }) => {
    await expect(page.getByText(/Wrong network/i)).toBeVisible()
  })
})

test.describe('Landing page — wallet connected and correct network', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockWallet(page, { connected: true })
  })

  test('redirects to /dashboard when already connected', async ({ page }) => {
    await page.goto('/connect')
    await page.waitForURL('**/dashboard', { timeout: 8000 })
    expect(page.url()).toContain('/dashboard')
  })
})
