/**
 * Demo seed script — creates the exact escrows needed for a clean demo recording.
 *
 * Usage: npx hardhat run scripts/seed-demo.ts --network somniaTestnet
 *        (or: npm run seed-demo)
 *
 * Creates three escrows and pre-stages them for demo:
 *   Escrow 1 — Standard: Milestone 0 pre-submitted (client just clicks Approve)
 *   Escrow 2 — Proof-of-Delivery: deliverable hash pre-submitted, challenge period 60s
 *   Escrow 3 — Streaming: 4 checkpoints added, ready for client to approve one-by-one
 *
 * The freelancer is a deterministic throwaway wallet derived from your deployer key.
 * It is funded automatically with enough STT for gas.
 * The live demo only needs YOUR deployer wallet in MetaMask (acting as client).
 */

import hre, { ethers } from 'hardhat'
import path from 'path'
import fs from 'fs'

const SECONDS_PER_DAY = 86_400n

// Deterministic demo freelancer — derived from deployer key so no extra config needed.
// This is testnet-only; the wallet holds only a few STT for gas.
function getDemoFreelancer(deployerKey: string): ethers.Wallet {
  // Normalize: .env keys are stored without 0x prefix
  const keyHex = deployerKey.startsWith('0x') ? deployerKey : '0x' + deployerKey
  const seed = ethers.keccak256(
    ethers.concat([ethers.toUtf8Bytes('react-escrow-demo-freelancer-v1'), ethers.getBytes(keyHex)])
  )
  return new ethers.Wallet(seed, ethers.provider)
}

async function main() {
  const network = hre.network.name
  const { chainId } = await ethers.provider.getNetwork()
  console.log(`\n[seed-demo] Network: ${network} (chainId: ${chainId})\n`)

  // ── Load deployment ────────────────────────────────────────────────────────
  const deploymentPath = path.join(__dirname, '..', 'deployment.json')
  let escrowAddress: string

  const isLocal = chainId === 31337n || chainId === 1337n

  if (isLocal) {
    console.log('[seed-demo] Local network — deploying contracts inline…')
    const ReactEscrow = await ethers.getContractFactory('ReactEscrow')
    const ReactiveHandlers = await ethers.getContractFactory('ReactiveHandlers')
    const e = await ReactEscrow.deploy()
    await e.waitForDeployment()
    escrowAddress = await e.getAddress()
    const h = await ReactiveHandlers.deploy(escrowAddress)
    await h.waitForDeployment()
    await (await e.setReactiveHandler(await h.getAddress())).wait()
    console.log(` ReactEscrow: ${escrowAddress}\n`)
  } else {
    if (!fs.existsSync(deploymentPath)) throw new Error('deployment.json not found — run deploy script first')
    escrowAddress = JSON.parse(fs.readFileSync(deploymentPath, 'utf8')).contracts.ReactEscrow
    console.log(`[seed-demo] ReactEscrow: ${escrowAddress}\n`)
  }

  const escrow = await ethers.getContractAt('ReactEscrow', escrowAddress)

  // ── Signers ───────────────────────────────────────────────────────────────
  const [client] = await ethers.getSigners()
  const deployerKey = process.env.PRIVATE_KEY!
  const freelancer  = getDemoFreelancer(deployerKey)
  // arbiter = client (client can also resolve disputes for demo purposes)
  const arbiter = client

  console.log(` deployer/client: ${client.address}`)
  console.log(` demo freelancer: ${freelancer.address}  (derived from deployer key)`)
  console.log(` arbiter:         ${arbiter.address}\n`)

  // ── Check balances ────────────────────────────────────────────────────────
  const clientBal = await ethers.provider.getBalance(client.address)
  const flBal     = await ethers.provider.getBalance(freelancer.address)
  console.log(` client balance:     ${ethers.formatEther(clientBal)} STT`)
  console.log(` freelancer balance: ${ethers.formatEther(flBal)} STT`)

  if (clientBal < ethers.parseEther('5')) {
    throw new Error('Client balance < 5 STT — top up your wallet before running this script')
  }

  // Fund freelancer wallet if it needs gas money (0.1 STT is plenty for submissions)
  if (flBal < ethers.parseEther('0.05')) {
    console.log('\n Freelancer wallet needs gas — sending 0.1 STT from deployer…')
    const fundTx = await client.sendTransaction({
      to: freelancer.address,
      value: ethers.parseEther('0.1'),
    })
    await fundTx.wait()
    console.log(` Funded freelancer: ${fundTx.hash}`)
  }

  const now = BigInt(Math.floor(Date.now() / 1000))

  // ═══════════════════════════════════════════════════════════════════════════
  // Escrow 1 — Standard reactive flow  (3 milestones, milestone 0 pre-submitted)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[1/3] Standard reactive flow escrow…')

  const milestones1 = [
    { amount: ethers.parseEther('0.3'), description: 'UI Mockups',     deadline: now + SECONDS_PER_DAY * 7n  },
    { amount: ethers.parseEther('0.5'), description: 'Frontend Build', deadline: now + SECONDS_PER_DAY * 14n },
    { amount: ethers.parseEther('0.2'), description: 'Final Handoff',  deadline: now + SECONDS_PER_DAY * 21n },
  ]
  const total1 = milestones1.reduce((s, m) => s + m.amount, 0n)

  const tx1c = await escrow.connect(client).createEscrow(freelancer.address, arbiter.address, milestones1)
  const r1   = await tx1c.wait()
  const id1  = getEscrowId(r1!)
  console.log(`   Created: ID ${id1}`)

  await (await escrow.connect(client).depositFunds(id1, { value: total1 })).wait()
  console.log(`   Funded: ${ethers.formatEther(total1)} STT`)

  // Pre-submit milestone 0 so the demo only needs a single "Approve" click
  await (await escrow.connect(freelancer).submitMilestone(id1, 0)).wait()
  console.log(`   Milestone 0 pre-submitted by freelancer ✓`)
  console.log(`   → DEMO: open this escrow as client and click Approve`)

  // ═══════════════════════════════════════════════════════════════════════════
  // Escrow 2 — Proof-of-delivery  (deliverable hash pre-submitted, 60s challenge)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[2/3] Proof-of-delivery escrow…')

  const DELIVERABLE_TEXT = 'design-v1-final.pdf'
  const deliverableHash  = ethers.keccak256(ethers.toUtf8Bytes(DELIVERABLE_TEXT))

  const milestones2 = [
    { amount: ethers.parseEther('0.5'), description: 'Design Deliverable', deadline: now + SECONDS_PER_DAY * 7n },
  ]
  const total2 = milestones2.reduce((s, m) => s + m.amount, 0n)

  // createEscrowWithDelivery sets expectedHash + challengePeriod at creation time
  const tx2c = await escrow.connect(client).createEscrowWithDelivery(
    freelancer.address,
    arbiter.address,
    milestones2,
    [deliverableHash],  // expectedHash per milestone
    60n,                // 60s challenge period for demo
  )
  const r2  = await tx2c.wait()
  const id2 = getEscrowId(r2!)
  console.log(`   Created: ID ${id2}  (60s challenge period, expected hash committed)`)

  await (await escrow.connect(client).depositFunds(id2, { value: total2 })).wait()
  console.log(`   Funded: ${ethers.formatEther(total2)} STT`)

  // Freelancer submits matching hash → DeliverableVerified fires, 60s challenge starts on-chain
  await (await escrow.connect(freelancer).submitMilestoneWithDeliverable(id2, 0, deliverableHash)).wait()
  console.log(`   Deliverable submitted with matching hash ✓`)
  console.log(`   DeliverableVerified event fired — 60s challenge countdown started on-chain`)
  console.log(`   → DEMO: open escrow #${id2}, wait ~60s, click "Trigger Release" to fire reactive auto-release`)

  // ═══════════════════════════════════════════════════════════════════════════
  // Escrow 3 — Streaming checkpoints  (4 × 25%)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[3/3] Streaming checkpoints escrow…')

  const milestones3 = [
    { amount: ethers.parseEther('1.0'), description: 'Full Project Build', deadline: now + SECONDS_PER_DAY * 30n },
  ]

  const tx3c = await escrow.connect(client).createEscrow(freelancer.address, arbiter.address, milestones3)
  const r3   = await tx3c.wait()
  const id3  = getEscrowId(r3!)
  console.log(`   Created: ID ${id3}`)

  await (await escrow.connect(client).depositFunds(id3, { value: milestones3[0].amount })).wait()
  console.log(`   Funded: ${ethers.formatEther(milestones3[0].amount)} STT`)

  try {
    const cpDescriptions = ['Phase 1 — Research', 'Phase 2 — Design', 'Phase 3 — Build', 'Phase 4 — Deploy']
    const cpWeights      = [25, 25, 25, 25]
    await (await escrow.connect(client).addMilestoneCheckpoints(id3, 0, cpDescriptions, cpWeights)).wait()
    console.log(`   4 checkpoints added (25% each) ✓`)
    console.log(`   → DEMO: open this escrow as client and approve checkpoints one by one`)
  } catch (e) {
    console.log(`   Note: checkpoints skipped (${(e as Error).message.slice(0, 80)})`)
  }

  // ── Write summary ─────────────────────────────────────────────────────────
  const summary = {
    network,
    chainId: chainId.toString(),
    seededAt: new Date().toISOString(),
    wallets: {
      client:     client.address,
      freelancer: freelancer.address,
      arbiter:    arbiter.address,
    },
    escrows: [
      { id: id1.toString(), label: 'Standard — 3 milestones, M0 submitted, awaiting client approval' },
      { id: id2.toString(), label: 'Proof-of-Delivery — hash submitted, ~60s challenge period', deliverableText: DELIVERABLE_TEXT, deliverableHash },
      { id: id3.toString(), label: 'Streaming — 1 milestone × 4 checkpoints at 25% each' },
    ],
  }

  fs.writeFileSync(path.join(__dirname, '..', 'seed-demo.json'), JSON.stringify(summary, null, 2))

  console.log('\n══════════════════════════════════════════════════════════════')
  console.log('  DEMO SEED COMPLETE')
  console.log('══════════════════════════════════════════════════════════════')
  console.log(`  Escrow 1 (Standard):      #${id1}`)
  console.log(`  Escrow 2 (Proof-of-Del):  #${id2}`)
  console.log(`  Escrow 3 (Checkpoints):   #${id3}`)
  console.log('')
  console.log('  YOUR METAMASK WALLET (client): all actions use this wallet')
  console.log(`  ${client.address}`)
  console.log('')
  console.log('  TO RECORD DEMO:')
  console.log('  1. npm run reactive-service   (Terminal 1)')
  console.log('  2. npm run frontend           (Terminal 2)')
  console.log('  3. Open http://localhost:5173 and connect your wallet')
  console.log('══════════════════════════════════════════════════════════════\n')
}

function getEscrowId(receipt: Awaited<ReturnType<typeof ethers.provider.getTransactionReceipt>>): bigint {
  if (!receipt) throw new Error('No receipt')
  const iface = new ethers.Interface([
    'event EscrowCreated(uint256 indexed escrowId, address indexed client, address indexed freelancer, uint256 totalAmount)',
  ])
  for (const log of receipt.logs) {
    try {
      const p = iface.parseLog(log)
      if (p?.name === 'EscrowCreated') return p.args.escrowId as bigint
    } catch { /* skip */ }
  }
  throw new Error('EscrowCreated event not found in receipt')
}

main().catch(err => { console.error(err); process.exit(1) })
