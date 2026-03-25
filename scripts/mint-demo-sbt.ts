/**
 * mint-demo-sbt.ts — Manually mints/updates Reputation SBT for the demo freelancer.
 *
 * Usage: npx hardhat run scripts/mint-demo-sbt.ts --network somniaTestnet
 *
 * Temporarily sets deployer as trustedUpdater on ReputationSBT,
 * mints the SBT for the demo freelancer, then restores ReputationHook.
 */

import hre, { ethers } from 'hardhat'
import path from 'path'
import fs from 'fs'

async function main() {
  const deploymentPath = path.join(__dirname, '..', 'deployment.json')
  const seedPath       = path.join(__dirname, '..', 'seed-demo.json')

  if (!fs.existsSync(deploymentPath)) throw new Error('deployment.json not found')
  if (!fs.existsSync(seedPath))       throw new Error('seed-demo.json not found — run seed-demo first')

  const dep  = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'))
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))

  const [deployer] = await ethers.getSigners()
  const freelancer = seed.wallets.freelancer
  const repHookAddr = dep.contracts.ReputationHook

  console.log(`\n[mint-demo-sbt] Deployer:   ${deployer.address}`)
  console.log(`[mint-demo-sbt] Freelancer: ${freelancer}`)
  console.log(`[mint-demo-sbt] SBT:        ${dep.contracts.ReputationSBT}`)

  const sbt = await ethers.getContractAt('ReputationSBT', dep.contracts.ReputationSBT)

  // Check current state
  const hasToken = await sbt.hasToken(freelancer)
  console.log(`\nCurrent hasSBT: ${hasToken}`)
  if (hasToken) {
    console.log('Freelancer already has SBT — nothing to do.')
    return
  }

  // Step 1: Set deployer as trustedUpdater temporarily
  console.log('\n[1/3] Setting deployer as trustedUpdater…')
  await (await sbt.setTrustedUpdater(deployer.address)).wait()
  console.log('      Done ✓')

  // Step 2: Mint SBT for freelancer (use last seeded escrow as escrowId)
  const lastEscrowId = BigInt(seed.escrows[0].id) // Standard escrow
  const amount = ethers.parseEther('0.3') // UI Mockups milestone amount

  console.log(`\n[2/3] Minting SBT for freelancer (escrowId ${lastEscrowId}, amount 0.3 STT)…`)
  await (await sbt.mintOrUpdate(freelancer, lastEscrowId, amount, false, ethers.ZeroHash)).wait()
  console.log('      Done ✓')

  // Step 3: Restore ReputationHook as trustedUpdater
  console.log(`\n[3/3] Restoring trustedUpdater → ReputationHook (${repHookAddr})…`)
  await (await sbt.setTrustedUpdater(repHookAddr)).wait()
  console.log('      Done ✓')

  // Verify
  const hasTokenNow = await sbt.hasToken(freelancer)
  const rep = await sbt.reputation(freelancer)
  console.log(`\n✅ SBT minted!`)
  console.log(`   hasToken:       ${hasTokenNow}`)
  console.log(`   totalEscrows:   ${rep.totalEscrows.toString()}`)
  console.log(`   totalEarned:    ${ethers.formatEther(rep.totalAmountEarned)} STT`)
  console.log(`\nNow look up ${freelancer} in the Reputation page.`)
}

main().catch(err => { console.error(err); process.exit(1) })
