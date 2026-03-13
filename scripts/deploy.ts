/**
 * Phase 4 — Deployment script
 *
 * Deploys ReactEscrow + ReactiveHandlers, links them via setReactiveHandler,
 * and writes deployment.json + frontend/.env for use by other scripts.
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

  // ── 1. Deploy ReactEscrow ─────────────────────────────────────────────────
  console.log(' [1/3] Deploying ReactEscrow…')
  const ReactEscrow = await ethers.getContractFactory('ReactEscrow')
  const escrow = await ReactEscrow.deploy()
  await escrow.waitForDeployment()
  const escrowAddress = await escrow.getAddress()
  console.log(`       ReactEscrow deployed at: ${escrowAddress}`)

  // ── 2. Deploy ReactiveHandlers ────────────────────────────────────────────
  console.log(' [2/3] Deploying ReactiveHandlers…')
  const ReactiveHandlers = await ethers.getContractFactory('ReactiveHandlers')
  const handler = await ReactiveHandlers.deploy(escrowAddress)
  await handler.waitForDeployment()
  const handlerAddress = await handler.getAddress()
  console.log(`       ReactiveHandlers deployed at: ${handlerAddress}`)

  // ── 3. Link: ReactEscrow.setReactiveHandler ───────────────────────────────
  console.log(' [3/3] Linking: escrow.setReactiveHandler(handler)…')
  const tx = await escrow.setReactiveHandler(handlerAddress)
  await tx.wait()
  console.log(`       Linked (tx: ${tx.hash})`)

  // ── Save deployment.json ──────────────────────────────────────────────────
  const deploymentPath = path.join(__dirname, '..', 'deployment.json')
  const deployment = {
    network,
    chainId: chainId.toString(),
    deployer: deployer.address,
    contracts: {
      ReactEscrow: escrowAddress,
      ReactiveHandlers: handlerAddress,
    },
    deployedAt: new Date().toISOString(),
  }
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2))
  console.log(`\n deployment.json written to: ${deploymentPath}`)

  // ── Write frontend/.env ───────────────────────────────────────────────────
  const frontendEnvPath = path.join(__dirname, '..', 'frontend', '.env')
  const frontendEnv = [
    `VITE_REACT_ESCROW_ADDRESS=${escrowAddress}`,
    `VITE_REACTIVE_HANDLERS_ADDRESS=${handlerAddress}`,
    `VITE_CHAIN_ID=${chainId}`,
    `VITE_NETWORK_NAME=${network}`,
  ].join('\n') + '\n'
  fs.writeFileSync(frontendEnvPath, frontendEnv)
  console.log(` frontend/.env written to:   ${frontendEnvPath}`)

  // ── Write root .env (reactive-service + scripts) ──────────────────────────
  const rootEnvPath = path.join(__dirname, '..', '.env')
  const existingEnv = fs.existsSync(rootEnvPath) ? fs.readFileSync(rootEnvPath, 'utf8') : ''

  // Update or append contract address vars
  const upsertEnvVar = (src: string, key: string, value: string): string => {
    const regex = new RegExp(`^${key}=.*$`, 'm')
    return regex.test(src) ? src.replace(regex, `${key}=${value}`) : src + `\n${key}=${value}`
  }

  let updatedEnv = existingEnv
  updatedEnv = upsertEnvVar(updatedEnv, 'REACT_ESCROW_ADDRESS', escrowAddress)
  updatedEnv = upsertEnvVar(updatedEnv, 'REACTIVE_HANDLERS_ADDRESS', handlerAddress)
  if (!updatedEnv.endsWith('\n')) updatedEnv += '\n'
  fs.writeFileSync(rootEnvPath, updatedEnv)
  console.log(` .env updated with contract addresses\n`)

  console.log(' ── Deployment summary ──────────────────────────────────────')
  console.log(`   ReactEscrow:      ${escrowAddress}`)
  console.log(`   ReactiveHandlers: ${handlerAddress}`)
  console.log(`   Network:          ${network} (${chainId})`)
  console.log(' ─────────────────────────────────────────────────────────────\n')

  if (chainId !== 31337n && chainId !== 1337n) {
    console.log(' Next step: npm run setup-subscriptions')
    console.log('            (fund handler with ≥32 STT first)\n')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
