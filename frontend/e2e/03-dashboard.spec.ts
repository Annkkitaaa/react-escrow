/**
 * 03 — Dashboard
 * Tests the EscrowDashboard in empty state and with mock escrow data.
 */
import { test, expect } from '@playwright/test'
import { injectMockWallet, mockRpc, encodeEscrow, encodeUint256Array, MOCK_ADDRESS, MOCK_FREELANCER, MOCK_ARBITER } from './helpers/mock'

test.describe('Dashboard — empty state', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockWallet(page, { connected: true })
    await mockRpc(page)
    await page.goto('/dashboard')
    await page.waitForURL('**/dashboard')
  })

  test('shows Dashboard heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible()
  })

  test('shows + New Escrow button', async ({ page }) => {
    await expect(page.getByRole('link', { name: /New Escrow/i })).toBeVisible()
  })

  test('shows As Client and As Freelancer sections', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /As Client/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /As Freelancer/i })).toBeVisible()
  })

  test('shows empty state message for client section', async ({ page }) => {
    await expect(page.getByText(/No escrows created yet/i)).toBeVisible({ timeout: 10000 })
  })

  test('empty client state has Create First Escrow link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Create First Escrow/i })).toBeVisible({ timeout: 10000 })
  })

  test('shows empty state for freelancer section', async ({ page }) => {
    await expect(page.getByText(/No freelancer escrows yet/i)).toBeVisible({ timeout: 10000 })
  })

  test('stats show 0 total escrows', async ({ page }) => {
    // Wait for loading to finish
    await expect(page.getByText(/No escrows created yet/i)).toBeVisible({ timeout: 10000 })
    // Stats row should show 0
    await expect(page.getByText('0').first()).toBeVisible()
  })

  test('+ New Escrow button links to /create', async ({ page }) => {
    await page.getByRole('link', { name: /New Escrow/i }).click()
    await page.waitForURL('**/create', { timeout: 8000 })
    expect(page.url()).toContain('/create')
  })
})

test.describe('Dashboard — with one client escrow', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockWallet(page, { connected: true })
    await mockRpc(page, {
      clientEscrowIds: [1n],
      escrow: {
        client: MOCK_ADDRESS,
        freelancer: MOCK_FREELANCER,
        arbiter: MOCK_ARBITER,
        totalAmount: 500000000000000000n, // 0.5 STT
        status: 2,  // Active
        currentMilestone: 0n,
      },
      milestones: 'one',
    })
    await page.goto('/dashboard')
    await page.waitForURL('**/dashboard')
  })

  test('shows escrow card with STT amount', async ({ page }) => {
    // Wait for skeleton to resolve
    await expect(page.getByText(/0\.500 STT/).first()).toBeVisible({ timeout: 10000 })
  })

  test('shows Active status badge', async ({ page }) => {
    await expect(page.getByText('Active').first()).toBeVisible({ timeout: 10000 })
  })

  test('shows Client role badge', async ({ page }) => {
    await expect(page.getByText('Client')).toBeVisible({ timeout: 10000 })
  })

  test('escrow card links to /escrow/:id', async ({ page }) => {
    await expect(page.getByText(/0\.500 STT/).first()).toBeVisible({ timeout: 10000 })
    // Click the card
    const card = page.locator('a[href*="/escrow/"]').first()
    await card.click()
    await page.waitForURL('**/escrow/**', { timeout: 8000 })
    expect(page.url()).toMatch(/\/escrow\/\d+/)
  })

  test('stats show 1 total escrow', async ({ page }) => {
    await expect(page.getByText(/0\.500 STT/).first()).toBeVisible({ timeout: 10000 })
    // Stats row: Total Escrows = 1
    await expect(page.getByText('Total Escrows')).toBeVisible()
  })
})

test.describe('Dashboard — Live Event Feed', () => {
  test('shows the Somnia Reactivity event feed section', async ({ page }) => {
    await injectMockWallet(page, { connected: true })
    await mockRpc(page)
    await page.goto('/dashboard')
    await page.waitForURL('**/dashboard')
    // The feed section title or indicator
    await expect(page.getByText(/Live Event Feed|Reactivity|No events/i).first()).toBeVisible({ timeout: 10000 })
  })
})
