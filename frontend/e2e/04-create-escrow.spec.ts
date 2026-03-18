/**
 * 04 — Create Escrow form
 * Tests mode switching, field rendering, and form validation.
 */
import { test, expect } from '@playwright/test'
import { injectMockWallet, mockRpc, MOCK_FREELANCER, MOCK_ARBITER, MOCK_ADDRESS } from './helpers/mock'

const TOMORROW = new Date(Date.now() + 86400 * 1000).toISOString().split('T')[0]
const PAST_DATE = '2020-01-01'

test.describe('Create Escrow — page structure', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockWallet(page, { connected: true })
    await mockRpc(page)
    await page.goto('/create')
    await page.waitForURL('**/create')
  })

  test('shows Create Escrow heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Create Escrow/i })).toBeVisible()
  })

  test('shows 3 mode buttons: Standard, Private, Delivery Proof', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Standard/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Private/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Delivery Proof/i })).toBeVisible()
  })

  test('Standard mode is selected by default', async ({ page }) => {
    // Standard button should have orange/active styling
    const standardBtn = page.getByRole('button', { name: /Standard/i })
    await expect(standardBtn).toBeVisible()
    // Private info banner should NOT be visible in standard mode
    await expect(page.getByText(/keccak256 commit-reveal/i)).not.toBeVisible()
  })

  test('shows Freelancer Address and Arbiter Address fields', async ({ page }) => {
    await expect(page.getByLabel(/Freelancer Address/i)).toBeVisible()
    await expect(page.getByLabel(/Arbiter Address/i)).toBeVisible()
  })

  test('shows Milestones section with Add Milestone button', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Milestones/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /\+ Add Milestone/i })).toBeVisible()
  })

  test('shows default milestone row', async ({ page }) => {
    await expect(page.getByPlaceholder(/Describe the deliverable/i)).toBeVisible()
    await expect(page.getByLabel(/Amount \(STT\)/i)).toBeVisible()
    await expect(page.getByLabel(/Deadline/i)).toBeVisible()
  })

  test('shows Somnia Reactivity info note', async ({ page }) => {
    await expect(page.getByText(/Somnia Reactivity/i).first()).toBeVisible()
  })

  test('shows Cancel button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible()
  })

  test('Cancel navigates back to dashboard', async ({ page }) => {
    await page.getByRole('button', { name: /Cancel/i }).click()
    await page.waitForURL('**/dashboard', { timeout: 8000 })
    expect(page.url()).toContain('/dashboard')
  })
})

test.describe('Create Escrow — mode switching', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockWallet(page, { connected: true })
    await mockRpc(page)
    await page.goto('/create')
    await page.waitForURL('**/create')
  })

  test('switching to Private shows commit-reveal info banner', async ({ page }) => {
    await page.getByRole('button', { name: /Private/i }).click()
    await expect(page.getByText(/keccak256 commit-reveal/i)).toBeVisible()
    await expect(page.getByText(/Amount \(hidden\)/i)).toBeVisible()
  })

  test('switching to Delivery Proof shows challenge period section', async ({ page }) => {
    await page.getByRole('button', { name: /Delivery Proof/i }).click()
    await expect(page.getByRole('heading', { name: /Challenge Period/i })).toBeVisible()
    await expect(page.getByText(/hours after deliverable verified/i)).toBeVisible()
  })

  test('Delivery Proof mode shows Deliverable Spec field in milestone', async ({ page }) => {
    await page.getByRole('button', { name: /Delivery Proof/i }).click()
    await expect(page.getByLabel(/Deliverable Spec/i)).toBeVisible()
  })

  test('challenge period defaults to 48 hours', async ({ page }) => {
    await page.getByRole('button', { name: /Delivery Proof/i }).click()
    const input = page.locator('input[type="number"]').first()
    await expect(input).toHaveValue('48')
  })

  test('switching back to Standard hides Private info', async ({ page }) => {
    await page.getByRole('button', { name: /Private/i }).first().click()
    await expect(page.getByText(/keccak256 commit-reveal/i).first()).toBeVisible()
    await page.getByRole('button', { name: /Standard/i }).first().click()
    await expect(page.getByText(/keccak256 commit-reveal/i).first()).not.toBeVisible()
  })
})

test.describe('Create Escrow — milestone management', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockWallet(page, { connected: true })
    await mockRpc(page)
    await page.goto('/create')
    await page.waitForURL('**/create')
  })

  test('Add Milestone button adds a second milestone row', async ({ page }) => {
    await page.getByRole('button', { name: /\+ Add Milestone/i }).click()
    // Should now see two "Milestone N" labels
    await expect(page.getByText('Milestone 1')).toBeVisible()
    await expect(page.getByText('Milestone 2')).toBeVisible()
  })

  test('Remove button appears when there are multiple milestones', async ({ page }) => {
    await page.getByRole('button', { name: /\+ Add Milestone/i }).click()
    await expect(page.getByRole('button', { name: /Remove/i }).first()).toBeVisible()
  })

  test('Remove button disappears when only one milestone remains', async ({ page }) => {
    // Only one row → no Remove button
    await expect(page.getByRole('button', { name: /Remove/i })).not.toBeVisible()
  })

  test('total STT updates as amounts are entered', async ({ page }) => {
    // Initially shows 0.0000 STT
    await expect(page.getByText(/0\.0000 STT/)).toBeVisible()

    await page.locator('input[type="number"]').first().fill('1.5')
    await expect(page.getByText(/1\.5000 STT/)).toBeVisible()
  })
})

test.describe('Create Escrow — validation', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockWallet(page, { connected: true })
    await mockRpc(page)
    await page.goto('/create')
    await page.waitForURL('**/create')
  })

  async function fillValidForm(page: import('@playwright/test').Page) {
    await page.getByLabel(/Freelancer Address/i).fill(MOCK_FREELANCER)
    await page.getByLabel(/Arbiter Address/i).fill(MOCK_ARBITER)
    await page.getByPlaceholder(/Describe the deliverable/i).fill('Design mockups')
    await page.locator('input[type="number"]').first().fill('0.5')
    await page.locator('input[type="date"]').first().fill(TOMORROW)
  }

  test('shows error for invalid freelancer address', async ({ page }) => {
    await page.getByLabel(/Freelancer Address/i).fill('not-an-address')
    await page.getByRole('button', { name: /Create.*Escrow/i }).click()
    await expect(page.getByText(/Invalid freelancer address/i)).toBeVisible()
  })

  test('shows error for invalid arbiter address', async ({ page }) => {
    await page.getByLabel(/Freelancer Address/i).fill(MOCK_FREELANCER)
    await page.getByLabel(/Arbiter Address/i).fill('bad')
    await page.getByRole('button', { name: /Create.*Escrow/i }).click()
    await expect(page.getByText(/Invalid arbiter address/i)).toBeVisible()
  })

  test('shows error when freelancer is own address', async ({ page }) => {
    await page.getByLabel(/Freelancer Address/i).fill(MOCK_ADDRESS)
    await page.getByLabel(/Arbiter Address/i).fill(MOCK_ARBITER)
    await page.getByRole('button', { name: /Create.*Escrow/i }).click()
    await expect(page.getByText(/Freelancer cannot be your own address/i)).toBeVisible()
  })

  test('shows error when arbiter is own address', async ({ page }) => {
    await page.getByLabel(/Freelancer Address/i).fill(MOCK_FREELANCER)
    await page.getByLabel(/Arbiter Address/i).fill(MOCK_ADDRESS)
    await page.getByRole('button', { name: /Create.*Escrow/i }).click()
    await expect(page.getByText(/Arbiter cannot be your own address/i)).toBeVisible()
  })

  test('shows error when freelancer and arbiter are same', async ({ page }) => {
    await page.getByLabel(/Freelancer Address/i).fill(MOCK_FREELANCER)
    await page.getByLabel(/Arbiter Address/i).fill(MOCK_FREELANCER)
    await page.getByRole('button', { name: /Create.*Escrow/i }).click()
    await expect(page.getByText(/Arbiter cannot be the same as the freelancer/i)).toBeVisible()
  })

  test('shows error for milestone missing description', async ({ page }) => {
    await page.getByLabel(/Freelancer Address/i).fill(MOCK_FREELANCER)
    await page.getByLabel(/Arbiter Address/i).fill(MOCK_ARBITER)
    // Leave description empty
    await page.locator('input[type="number"]').first().fill('0.5')
    await page.locator('input[type="date"]').first().fill(TOMORROW)
    await page.getByRole('button', { name: /Create.*Escrow/i }).click()
    await expect(page.getByText(/description required/i)).toBeVisible()
  })

  test('shows error for milestone with zero amount', async ({ page }) => {
    await page.getByLabel(/Freelancer Address/i).fill(MOCK_FREELANCER)
    await page.getByLabel(/Arbiter Address/i).fill(MOCK_ARBITER)
    await page.getByPlaceholder(/Describe the deliverable/i).fill('Design')
    await page.locator('input[type="number"]').first().fill('0')
    await page.locator('input[type="date"]').first().fill(TOMORROW)
    await page.getByRole('button', { name: /Create.*Escrow/i }).click()
    await expect(page.getByText(/amount must be > 0/i)).toBeVisible()
  })

  test('shows error for past deadline', async ({ page }) => {
    await page.getByLabel(/Freelancer Address/i).fill(MOCK_FREELANCER)
    await page.getByLabel(/Arbiter Address/i).fill(MOCK_ARBITER)
    await page.getByPlaceholder(/Describe the deliverable/i).fill('Design')
    await page.locator('input[type="number"]').first().fill('0.5')
    await page.locator('input[type="date"]').first().fill(PAST_DATE)
    await page.getByRole('button', { name: /Create.*Escrow/i }).click()
    await expect(page.getByText(/deadline must be in the future/i)).toBeVisible()
  })

  test('Create button label changes per mode', async ({ page }) => {
    // Standard
    await expect(page.getByRole('button', { name: 'Create Escrow' })).toBeVisible()
    // Private — use the mode button which starts with "Private" (not "Create Private Escrow")
    await page.getByRole('button', { name: /^Private/ }).first().click()
    await expect(page.getByRole('button', { name: 'Create Private Escrow' })).toBeVisible()
    // Delivery
    await page.getByRole('button', { name: /Delivery Proof/ }).click()
    await expect(page.getByRole('button', { name: 'Create Delivery Escrow' })).toBeVisible()
  })
})
