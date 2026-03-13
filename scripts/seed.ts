/**
 * Phase 4 — Seed script
 *
 * Creates two sample escrows on the deployed ReactEscrow contract.
 *
 * Escrow A — "Website Redesign"
 *   Status: Active, first milestone Submitted (awaiting client approval)
 *   Parties: signer[0]=client, signer[1]=freelancer, signer[2]=arbiter
 *   Milestones: Design Mockups (0.5 ETH), Frontend Build (1.0 ETH), Final Review (0.5 ETH)
 *
 * Escrow B — "Smart Contract Audit"
 *   Status: Funded (not yet activated — freelancer hasn't been selected)
 *   Parties: signer[0]=client, signer[1]=freelancer, signer[2]=arbiter
 *   Milestones: Audit Report (2.0 ETH)
 *
 * Usage (local):   npx hardhat run scripts/seed.ts
 * Usage (testnet): npx hardhat run scripts/seed.ts --network somniaTestnet
 *
 * NOTE: Testnet seed requires at least 3 funded accounts in the Hardhat accounts list.
 * For testnet, all 3 escrow parties are the deployer (single-signer demo mode).
 */

import hre, { ethers } from 'hardhat'
import path from 'path'
import fs from 'fs'

const SECONDS_PER_DAY = 86_400n

async function main() {
  const network = hre.network.name
  const { chainId } = await ethers.provider.getNetwork()
  console.log(`\n Seeding on: ${network} (chainId: ${chainId})\n`)

  // ── Load deployment (or deploy inline on local network) ──────────────────
  const deploymentPath = path.join(__dirname, '..', 'deployment.json')
  let escrowAddress: string

  const isLocal = chainId === 31337n || chainId === 1337n

  if (isLocal) {
    // Each `hardhat run` creates a fresh ephemeral network — deploy inline
    console.log(' Local network: deploying contracts inline for seeding…')
    const ReactEscrow = await ethers.getContractFactory('ReactEscrow')
    const ReactiveHandlers = await ethers.getContractFactory('ReactiveHandlers')
    const escrowDeployment = await ReactEscrow.deploy()
    await escrowDeployment.waitForDeployment()
    escrowAddress = await escrowDeployment.getAddress()
    const handlerDeployment = await ReactiveHandlers.deploy(escrowAddress)
    await handlerDeployment.waitForDeployment()
    const handlerAddress = await handlerDeployment.getAddress()
    const tx = await escrowDeployment.setReactiveHandler(handlerAddress)
    await tx.wait()
    console.log(` ReactEscrow:      ${escrowAddress}`)
    console.log(` ReactiveHandlers: ${handlerAddress}\n`)
  } else {
    if (!fs.existsSync(deploymentPath)) {
      throw new Error('deployment.json not found — run deploy script first')
    }
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'))
    escrowAddress = deployment.contracts.ReactEscrow
    console.log(` Using deployed ReactEscrow: ${escrowAddress}\n`)
  }

  const escrow = await ethers.getContractAt('ReactEscrow', escrowAddress)

  // ── Pick signers ──────────────────────────────────────────────────────────
  const signers = await ethers.getSigners()
  const client     = signers[0]
  const freelancer = signers.length > 1 ? signers[1] : signers[0]
  const arbiter    = signers.length > 2 ? signers[2] : signers[0]

  console.log(` client:     ${client.address}`)
  console.log(` freelancer: ${freelancer.address}`)
  console.log(` arbiter:    ${arbiter.address}\n`)

  const now = BigInt(Math.floor(Date.now() / 1000))

  // ═══════════════════════════════════════════════════════════════════════════
  // Escrow A — Website Redesign (Active, milestone 0 submitted)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(' [A] Creating "Website Redesign" escrow…')

  const milestonesA = [
    {
      amount:      ethers.parseEther('0.5'),
      description: 'Design Mockups',
      deadline:    now + SECONDS_PER_DAY * 7n,
    },
    {
      amount:      ethers.parseEther('1.0'),
      description: 'Frontend Build',
      deadline:    now + SECONDS_PER_DAY * 21n,
    },
    {
      amount:      ethers.parseEther('0.5'),
      description: 'Final Review & Handoff',
      deadline:    now + SECONDS_PER_DAY * 30n,
    },
  ]
  const totalA = milestonesA.reduce((sum, m) => sum + m.amount, 0n)

  // Create
  const createTxA = await escrow.connect(client).createEscrow(
    freelancer.address,
    arbiter.address,
    milestonesA,
  )
  const receiptA = await createTxA.wait()
  const escrowIdA = getEscrowIdFromReceipt(receiptA!)
  console.log(`   Created escrow ID: ${escrowIdA}  (tx: ${createTxA.hash})`)

  // Fund
  const fundTxA = await escrow.connect(client).depositFunds(escrowIdA, { value: totalA })
  await fundTxA.wait()
  console.log(`   Funded with ${ethers.formatEther(totalA)} ETH`)

  // Freelancer submits milestone 0
  const submitTxA = await escrow.connect(freelancer).submitMilestone(escrowIdA, 0)
  await submitTxA.wait()
  console.log(`   Milestone 0 submitted by freelancer`)
  console.log(`   → Escrow A is Active, milestone 0 awaiting client approval\n`)

  // ═══════════════════════════════════════════════════════════════════════════
  // Escrow B — Smart Contract Audit (Funded, waiting to start)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(' [B] Creating "Smart Contract Audit" escrow…')

  const milestonesB = [
    {
      amount:      ethers.parseEther('2.0'),
      description: 'Full Audit Report + Remediation Guidance',
      deadline:    now + SECONDS_PER_DAY * 14n,
    },
  ]
  const totalB = milestonesB.reduce((sum, m) => sum + m.amount, 0n)

  // Create
  const createTxB = await escrow.connect(client).createEscrow(
    freelancer.address,
    arbiter.address,
    milestonesB,
  )
  const receiptB = await createTxB.wait()
  const escrowIdB = getEscrowIdFromReceipt(receiptB!)
  console.log(`   Created escrow ID: ${escrowIdB}  (tx: ${createTxB.hash})`)

  // Fund (but don't activate yet)
  const fundTxB = await escrow.connect(client).depositFunds(escrowIdB, { value: totalB })
  await fundTxB.wait()
  console.log(`   Funded with ${ethers.formatEther(totalB)} ETH`)
  console.log(`   → Escrow B is Funded (Active, ready for freelancer to submit)\n`)

  // ── Summary ───────────────────────────────────────────────────────────────
  const seedPath = path.join(__dirname, '..', 'seed.json')
  fs.writeFileSync(seedPath, JSON.stringify({
    network,
    chainId: chainId.toString(),
    escrows: [
      { id: escrowIdA.toString(), label: 'Website Redesign', status: 'Active/Submitted', totalEth: '2.0' },
      { id: escrowIdB.toString(), label: 'Smart Contract Audit', status: 'Active/Funded', totalEth: '2.0' },
    ],
    seededAt: new Date().toISOString(),
  }, null, 2))

  console.log(` ── Seed summary ───────────────────────────────────────────────`)
  console.log(`   Escrow A: ID ${escrowIdA} — Website Redesign (Active, submitted)`)
  console.log(`   Escrow B: ID ${escrowIdB} — Smart Contract Audit (Active, funded)`)
  console.log(`   seed.json written`)
  console.log(` ──────────────────────────────────────────────────────────────\n`)
}

// Extract escrowId from EscrowCreated event log
function getEscrowIdFromReceipt(receipt: Awaited<ReturnType<typeof ethers.provider.getTransactionReceipt>>): bigint {
  if (!receipt) throw new Error('No transaction receipt')
  const iface = new ethers.Interface([
    'event EscrowCreated(uint256 indexed escrowId, address indexed client, address indexed freelancer, uint256 totalAmount)',
  ])
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log)
      if (parsed?.name === 'EscrowCreated') {
        return parsed.args.escrowId as bigint
      }
    } catch {
      // skip non-matching logs
    }
  }
  throw new Error('EscrowCreated event not found in receipt')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
