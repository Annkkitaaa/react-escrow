/**
 * Deployment script
 *
 * Deploys all contracts, links them together, and writes
 * deployment.json + frontend/.env + root .env.
 *
 * Contracts deployed (in order):
 *   1. ReactEscrow
 *   2. ReactiveHandlers  (needs ReactEscrow)
 *   3. HookRegistry      (needs ReactiveHandlers)
 *   4. EscrowReceiptNFT  (needs HookRegistry)
 *   5. ReputationSBT
 *   6. ReputationHook    (needs HookRegistry + ReputationSBT)
 *
 * Wiring:
 *   - escrow.setReactiveHandler(handler)
 *   - handlers.setHookRegistry(registry)
 *   - registry.registerHook(nft)
 *   - registry.registerHook(repHook)
 *   - sbt.setTrustedUpdater(repHook)
 *
 * Usage:
 *   Local:    npx hardhat run scripts/deploy.ts
 *   Testnet:  npx hardhat run scripts/deploy.ts --network somniaTestnet
 */

import hre, { ethers } from 'hardhat'
import fs from 'fs'
import path from 'path'

async function main() {
  const network = hre.network.name
  const chainId = (await ethers.provider.getNetwork()).chainId
  console.log(`\n Deploying to network: ${network} (chainId: ${chainId})\n`)

  const [deployer] = await ethers.getSigners()
  console.log(` Deployer: ${deployer.address}`)
  console.log(` Balance : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`)

  // ── 1. Deploy ReactEscrow ──────────────────────────────────────────────────
  console.log(' [1/6] Deploying ReactEscrow…')
  const ReactEscrow = await ethers.getContractFactory('ReactEscrow')
  const escrow = await ReactEscrow.deploy()
  await escrow.waitForDeployment()
  const escrowAddress = await escrow.getAddress()
  console.log(`       ReactEscrow deployed at: ${escrowAddress}`)

  // ── 2. Deploy ReactiveHandlers ─────────────────────────────────────────────
  console.log(' [2/6] Deploying ReactiveHandlers…')
  const ReactiveHandlers = await ethers.getContractFactory('ReactiveHandlers')
  const handler = await ReactiveHandlers.deploy(escrowAddress)
  await handler.waitForDeployment()
  const handlerAddress = await handler.getAddress()
  console.log(`       ReactiveHandlers deployed at: ${handlerAddress}`)

  // ── 3. Deploy HookRegistry ─────────────────────────────────────────────────
  console.log(' [3/6] Deploying HookRegistry…')
  const HookRegistry = await ethers.getContractFactory('HookRegistry')
  const registry = await HookRegistry.deploy(handlerAddress)
  await registry.waitForDeployment()
  const registryAddress = await registry.getAddress()
  console.log(`       HookRegistry deployed at: ${registryAddress}`)

  // ── 4. Deploy EscrowReceiptNFT ─────────────────────────────────────────────
  console.log(' [4/6] Deploying EscrowReceiptNFT…')
  const EscrowReceiptNFT = await ethers.getContractFactory('EscrowReceiptNFT')
  const nft = await EscrowReceiptNFT.deploy(registryAddress)
  await nft.waitForDeployment()
  const nftAddress = await nft.getAddress()
  console.log(`       EscrowReceiptNFT deployed at: ${nftAddress}`)

  // ── 5. Deploy ReputationSBT ────────────────────────────────────────────────
  console.log(' [5/6] Deploying ReputationSBT…')
  const ReputationSBT = await ethers.getContractFactory('ReputationSBT')
  const sbt = await ReputationSBT.deploy()
  await sbt.waitForDeployment()
  const sbtAddress = await sbt.getAddress()
  console.log(`       ReputationSBT deployed at: ${sbtAddress}`)

  // ── 6. Deploy ReputationHook ───────────────────────────────────────────────
  console.log(' [6/6] Deploying ReputationHook…')
  const ReputationHook = await ethers.getContractFactory('ReputationHook')
  const repHook = await ReputationHook.deploy(registryAddress, sbtAddress)
  await repHook.waitForDeployment()
  const repHookAddress = await repHook.getAddress()
  console.log(`       ReputationHook deployed at: ${repHookAddress}`)

  // ── Wiring ─────────────────────────────────────────────────────────────────
  console.log('\n Wiring contracts…')

  let tx = await escrow.setReactiveHandler(handlerAddress)
  await tx.wait()
  console.log(`   escrow.setReactiveHandler(handler)           ✓`)

  tx = await handler.setHookRegistry(registryAddress)
  await tx.wait()
  console.log(`   handler.setHookRegistry(registry)            ✓`)

  tx = await registry.registerHook(nftAddress)
  await tx.wait()
  console.log(`   registry.registerHook(EscrowReceiptNFT)      ✓`)

  tx = await registry.registerHook(repHookAddress)
  await tx.wait()
  console.log(`   registry.registerHook(ReputationHook)        ✓`)

  tx = await sbt.setTrustedUpdater(repHookAddress)
  await tx.wait()
  console.log(`   sbt.setTrustedUpdater(ReputationHook)        ✓`)

  // ── Save deployment.json ───────────────────────────────────────────────────
  const deploymentPath = path.join(__dirname, '..', 'deployment.json')
  const deployment = {
    network,
    chainId: chainId.toString(),
    deployer: deployer.address,
    contracts: {
      ReactEscrow:       escrowAddress,
      ReactiveHandlers:  handlerAddress,
      HookRegistry:      registryAddress,
      EscrowReceiptNFT:  nftAddress,
      ReputationSBT:     sbtAddress,
      ReputationHook:    repHookAddress,
    },
    deployedAt: new Date().toISOString(),
  }
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2))
  console.log(`\n deployment.json written to: ${deploymentPath}`)

  // ── Write frontend/.env ────────────────────────────────────────────────────
  const frontendEnvPath = path.join(__dirname, '..', 'frontend', '.env')
  const frontendEnv = [
    `VITE_REACT_ESCROW_ADDRESS=${escrowAddress}`,
    `VITE_REACTIVE_HANDLERS_ADDRESS=${handlerAddress}`,
    `VITE_HOOK_REGISTRY_ADDRESS=${registryAddress}`,
    `VITE_ESCROW_RECEIPT_NFT_ADDRESS=${nftAddress}`,
    `VITE_REPUTATION_SBT_ADDRESS=${sbtAddress}`,
    `VITE_REPUTATION_HOOK_ADDRESS=${repHookAddress}`,
    `VITE_CHAIN_ID=${chainId}`,
    `VITE_NETWORK_NAME=${network}`,
  ].join('\n') + '\n'
  fs.writeFileSync(frontendEnvPath, frontendEnv)
  console.log(` frontend/.env written to:   ${frontendEnvPath}`)

  // ── Write root .env ────────────────────────────────────────────────────────
  const rootEnvPath = path.join(__dirname, '..', '.env')
  const existingEnv = fs.existsSync(rootEnvPath) ? fs.readFileSync(rootEnvPath, 'utf8') : ''

  const upsertEnvVar = (src: string, key: string, value: string): string => {
    const regex = new RegExp(`^${key}=.*$`, 'm')
    return regex.test(src) ? src.replace(regex, `${key}=${value}`) : src + `\n${key}=${value}`
  }

  let updatedEnv = existingEnv
  updatedEnv = upsertEnvVar(updatedEnv, 'REACT_ESCROW_ADDRESS',      escrowAddress)
  updatedEnv = upsertEnvVar(updatedEnv, 'REACTIVE_HANDLERS_ADDRESS', handlerAddress)
  updatedEnv = upsertEnvVar(updatedEnv, 'HOOK_REGISTRY_ADDRESS',     registryAddress)
  updatedEnv = upsertEnvVar(updatedEnv, 'ESCROW_RECEIPT_NFT_ADDRESS', nftAddress)
  updatedEnv = upsertEnvVar(updatedEnv, 'REPUTATION_SBT_ADDRESS',    sbtAddress)
  updatedEnv = upsertEnvVar(updatedEnv, 'REPUTATION_HOOK_ADDRESS',   repHookAddress)
  if (!updatedEnv.endsWith('\n')) updatedEnv += '\n'
  fs.writeFileSync(rootEnvPath, updatedEnv)
  console.log(` .env updated with contract addresses\n`)

  console.log(' ── Deployment summary ───────────────────────────────────────────')
  console.log(`   ReactEscrow:       ${escrowAddress}`)
  console.log(`   ReactiveHandlers:  ${handlerAddress}`)
  console.log(`   HookRegistry:      ${registryAddress}`)
  console.log(`   EscrowReceiptNFT:  ${nftAddress}`)
  console.log(`   ReputationSBT:     ${sbtAddress}`)
  console.log(`   ReputationHook:    ${repHookAddress}`)
  console.log(`   Network:           ${network} (${chainId})`)
  console.log(' ─────────────────────────────────────────────────────────────────\n')

  if (chainId !== 31337n && chainId !== 1337n) {
    console.log(' Next step: npm run setup-subscriptions')
    console.log('            (fund handler with ≥32 STT first)\n')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
