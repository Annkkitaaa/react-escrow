/**
 * 02 — Wallet connect flow
 * Tests clicking Connect, chain switch, and the RequireWallet guard.
 */
import { test, expect } from '@playwright/test'
import { injectMockWallet, mockRpc } from './helpers/mock'

test.describe('Connect flow — click to connect', () => {
  test('clicking Connect MetaMask navigates to dashboard', async ({ page }) => {
    // Wallet present but not yet connected; auto-approve the eth_requestAccounts call
    await injectMockWallet(page, { connected: false, autoApprove: true })
    await mockRpc(page)
    await page.goto('/connect')

    const connectBtn = page.getByRole('button', { name: /Connect MetaMask/i })
    await expect(connectBtn).toBeVisible()
    await connectBtn.click()

    // After connect() the wallet context sets isConnected=true + isCorrectNetwork=true
    // WalletConnect renders <Navigate to="/dashboard"> → browser navigates
    await page.waitForURL('**/dashboard', { timeout: 10000 })
    expect(page.url()).toContain('/dashboard')
  })
})

test.describe('Switch network flow', () => {
  test('clicking Switch button updates network and redirects', async ({ page }) => {
    await injectMockWallet(page, { connected: true, wrongNetwork: true })
    await mockRpc(page)
    await page.goto('/connect')

    await expect(page.getByRole('button', { name: /Switch to Somnia Testnet/i })).toBeVisible()
    await page.getByRole('button', { name: /Switch to Somnia Testnet/i }).click()

    // After switchToSomnia() succeeds, isCorrectNetwork becomes true → redirect
    await page.waitForURL('**/dashboard', { timeout: 10000 })
    expect(page.url()).toContain('/dashboard')
  })
})

test.describe('RequireWallet guard', () => {
  test('redirects to /connect when accessing /dashboard without wallet', async ({ page }) => {
    // No wallet injected
    await page.goto('/dashboard')
    await page.waitForURL('**/connect', { timeout: 8000 })
    expect(page.url()).toContain('/connect')
  })

  test('redirects to /connect when accessing /create without wallet', async ({ page }) => {
    await page.goto('/create')
    await page.waitForURL('**/connect', { timeout: 8000 })
    expect(page.url()).toContain('/connect')
  })

  test('redirects to /connect when accessing /reputation without wallet', async ({ page }) => {
    await page.goto('/reputation')
    await page.waitForURL('**/connect', { timeout: 8000 })
    expect(page.url()).toContain('/connect')
  })

  test('allows /dashboard access with connected wallet', async ({ page }) => {
    await injectMockWallet(page, { connected: true })
    await mockRpc(page)
    await page.goto('/dashboard')
    // Should not be redirected to /connect
    await page.waitForURL('**/dashboard', { timeout: 8000 })
    expect(page.url()).toContain('/dashboard')
  })
})

test.describe('Layout navigation', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockWallet(page, { connected: true })
    await mockRpc(page)
    await page.goto('/dashboard')
    await page.waitForURL('**/dashboard', { timeout: 8000 })
  })

  test('nav shows Dashboard, Create, Reputation links', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Dashboard/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Create/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Reputation/i })).toBeVisible()
  })

  test('clicking Create navigates to /create', async ({ page }) => {
    await page.getByRole('link', { name: /Create/i }).click()
    await page.waitForURL('**/create', { timeout: 8000 })
    expect(page.url()).toContain('/create')
  })

  test('clicking Reputation navigates to /reputation', async ({ page }) => {
    await page.getByRole('link', { name: /Reputation/i }).click()
    await page.waitForURL('**/reputation', { timeout: 8000 })
    expect(page.url()).toContain('/reputation')
  })
})
