/**
 * Phase 4 — Reactivity subscription setup script
 *
 * Registers three on-chain Solidity subscriptions via the Somnia Reactivity SDK:
 *   1. MilestoneApproved  → handler auto-releases funds
 *   2. DeadlineReached    → handler triggers timeout release
 *   3. DisputeResolved    → handler distributes resolution
 *
 * All subscriptions filter by emitter = ReactEscrow address so the handler
 * is only called for events from our contract.
 *
 * NOTE: This script is a no-op on local Hardhat (chainId 31337 / 1337) because
 * the precompile at address(0x0100) doesn't exist in the Hardhat EVM.
 *
 * Usage:
 *   npm run setup-subscriptions
 *   (runs: hardhat run scripts/setup-subscriptions.ts --network somniaTestnet)
 */

import hre, { ethers } from 'hardhat'
import fs from 'fs'
import path from 'path'
import { createPublicClient, createWalletClient, http, parseGwei } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { defineChain } from 'viem'
import { SDK } from '@somnia-chain/reactivity'
import * as dotenv from 'dotenv'
dotenv.config()

// ── Somnia Testnet viem chain definition ─────────────────────────────────────
const somniaTestnet = defineChain({
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network/'] },
  },
  blockExplorers: {
    default: { name: 'Somnia Explorer', url: 'https://shannon-explorer.somnia.network/' },
  },
})

// ── Event topic hashes (must match ReactiveHandlers.sol constants) ────────────
const MILESTONE_APPROVED_TOPIC  = ethers.id('MilestoneApproved(uint256,uint256,uint256)')
const DEADLINE_REACHED_TOPIC    = ethers.id('DeadlineReached(uint256,uint256)')
const DISPUTE_RESOLVED_TOPIC    = ethers.id('DisputeResolved(uint256,uint256,uint8)')

// ── Base subscription gas config ──────────────────────────────────────────────
const BASE_SUB = {
  priorityFeePerGas: parseGwei('2'),    // minimum required by protocol
  maxFeePerGas:      parseGwei('10'),
  gasLimit:          2_000_000n,         // minimum required by protocol
  isGuaranteed:      true,               // always deliver even if delayed
  isCoalesced:       false,              // fire per-event (not coalesced)
}

async function main() {
  const network = hre.network.name
  const { chainId } = await ethers.provider.getNetwork()
  console.log(`\n Setting up subscriptions on: ${network} (chainId: ${chainId})\n`)

  // ── Local guard ───────────────────────────────────────────────────────────
  if (chainId === 31337n || chainId === 1337n) {
    console.log(' Local Hardhat network detected — skipping subscription setup.')
    console.log(' (Somnia Reactivity precompile does not exist in Hardhat EVM)')
    console.log(' Subscriptions are only created on Somnia Testnet / Mainnet.\n')
    return
  }

  // ── Load deployment ───────────────────────────────────────────────────────
  const deploymentPath = path.join(__dirname, '..', 'deployment.json')
  if (!fs.existsSync(deploymentPath)) {
    throw new Error('deployment.json not found — run deploy script first')
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'))
  const { ReactEscrow: escrowAddress, ReactiveHandlers: handlerAddress } = deployment.contracts
  console.log(` ReactEscrow:      ${escrowAddress}`)
  console.log(` ReactiveHandlers: ${handlerAddress}\n`)

  // ── Validate private key ──────────────────────────────────────────────────
  const rawKey = process.env.PRIVATE_KEY
  if (!rawKey) throw new Error('PRIVATE_KEY not set in .env')
  const privateKey = rawKey.startsWith('0x') ? rawKey as `0x${string}` : `0x${rawKey}` as `0x${string}`
  const account = privateKeyToAccount(privateKey)

  // ── Build viem clients ────────────────────────────────────────────────────
  const rpcUrl = process.env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network/'
  const publicClient = createPublicClient({ chain: somniaTestnet, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ account, chain: somniaTestnet, transport: http(rpcUrl) })

  // ── Check deployer balance (subscription owner must hold ≥ 32 STT) ──────────
  // The Somnia Reactivity precompile checks SUBSCRIPTION_OWNER_MINIMUM_BALANCE
  // against msg.sender (the deployer), not the handler contract.
  // Callbacks are charged against the subscription owner's on-chain balance.
  const deployerAddress = account.address
  const balance = await publicClient.getBalance({ address: deployerAddress })
  const MIN_BALANCE = 32n * 10n ** 18n
  console.log(` Deployer balance: ${Number(balance) / 1e18} STT`)
  if (balance < MIN_BALANCE) {
    console.warn(` WARNING: Deployer balance < 32 STT. subscribe() will revert.`)
    console.warn(`          The subscription owner (deployer) must hold ≥32 STT.\n`)
  }

  // ── Create SDK instance ───────────────────────────────────────────────────
  const sdk = new SDK({ public: publicClient, wallet: walletClient })

  // ── Create subscriptions ──────────────────────────────────────────────────
  const subscriptions: Array<{
    name: string
    topic: string
    txHash?: string
    error?: string
  }> = []

  const createSub = async (name: string, topic: string) => {
    console.log(` Creating subscription: ${name}`)
    const result = await sdk.createSoliditySubscription({
      ...BASE_SUB,
      emitter:                escrowAddress as `0x${string}`,   // contract that emits the event
      eventTopics:            [topic as `0x${string}`],
      handlerContractAddress: handlerAddress as `0x${string}`,  // contract called when event fires
    })

    if (result instanceof Error) {
      console.error(`   ERROR: ${result.message}`)
      subscriptions.push({ name, topic, error: result.message })
    } else {
      console.log(`   tx: ${result}`)
      subscriptions.push({ name, topic, txHash: result })
    }
  }

  await createSub('MilestoneApproved → releaseMilestoneFunds', MILESTONE_APPROVED_TOPIC)
  await createSub('DeadlineReached → executeTimeoutRelease',    DEADLINE_REACHED_TOPIC)
  await createSub('DisputeResolved → executeResolutionDistribution', DISPUTE_RESOLVED_TOPIC)

  // ── Save subscription results ─────────────────────────────────────────────
  const subsPath = path.join(__dirname, '..', 'subscriptions.json')
  const subsOutput = {
    network,
    chainId: chainId.toString(),
    handlerAddress,
    escrowAddress,
    createdAt: new Date().toISOString(),
    subscriptions,
  }
  fs.writeFileSync(subsPath, JSON.stringify(subsOutput, null, 2))
  console.log(`\n subscriptions.json written to: ${subsPath}`)

  // ── Summary ───────────────────────────────────────────────────────────────
  const ok  = subscriptions.filter(s => !s.error).length
  const err = subscriptions.filter(s => s.error).length
  console.log(`\n ── Subscription summary ─────────────────────────────────────`)
  console.log(`   Created:  ${ok} / ${subscriptions.length}`)
  if (err > 0) console.log(`   Failed:   ${err} (see subscriptions.json)`)
  console.log(` ──────────────────────────────────────────────────────────────\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
