// ============================================================
// Reputation Merkle Tree — Feature 5
//
// Maintains a per-user off-chain StandardMerkleTree that records
// every escrow the user participated in. After each EscrowCompleted
// event the tree is rebuilt and the new root is pushed on-chain to
// ReputationSBT.mintOrUpdate().
//
// On-chain root update requires MERKLE_UPDATER_PRIVATE_KEY to be
// set in .env, pointing to the account that is set as trustedUpdater
// on the ReputationSBT contract.  If the key is absent the module
// still maintains the tree in memory and logs proofs — useful for
// local development and frontend proof generation.
// ============================================================

import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import {
  createWalletClient,
  http,
  encodeFunctionData,
  defineChain,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { config } from './config'

// ── Leaf type: [address user, uint256 escrowId, uint256 amount, uint256 timestamp]
type LeafValues = [string, bigint, bigint, bigint]

// ── Per-user history ──────────────────────────────────────────────────────────
const userLeaves = new Map<string, LeafValues[]>()

// Rebuild tree from all leaves for a user and return the root + tree object
function buildTree(leaves: LeafValues[]): StandardMerkleTree<LeafValues> {
  return StandardMerkleTree.of(leaves, ['address', 'uint256', 'uint256', 'uint256'])
}

// ── ReputationSBT ABI (minimal — just mintOrUpdate) ───────────────────────────
const SBT_ABI = [
  {
    name: 'mintOrUpdate',
    type: 'function',
    inputs: [
      { name: 'user',          type: 'address' },
      { name: 'newEscrows',    type: 'uint256' },
      { name: 'newAmount',     type: 'uint256' },
      { name: 'hadDispute',    type: 'bool'    },
      { name: 'newMerkleRoot', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

// ── Somnia chain ──────────────────────────────────────────────────────────────
const somniaChain = defineChain({
  id: config.somnia.chainId,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: {
    default: { http: [config.somnia.rpcUrl] },
  },
})

// ── Wallet client (optional — only if MERKLE_UPDATER_PRIVATE_KEY is set) ──────
function getWalletClient() {
  const key = config.merkle.updaterPrivateKey
  if (!key || key === '0x') return null
  const account = privateKeyToAccount(key)
  return {
    client: createWalletClient({ account, chain: somniaChain, transport: http(config.somnia.rpcUrl) }),
    account,
  }
}

// ── Push new root on-chain ────────────────────────────────────────────────────
async function pushRootOnChain(user: string, newRoot: Hex): Promise<void> {
  const sbtAddress = config.contracts.reputationSbt
  if (!sbtAddress) {
    console.log(`[Merkle] ReputationSBT address not set — skipping on-chain root update.`)
    return
  }

  const wallet = getWalletClient()
  if (!wallet) {
    console.log(`[Merkle] MERKLE_UPDATER_PRIVATE_KEY not set — skipping on-chain root update.`)
    console.log(`[Merkle] To enable: set MERKLE_UPDATER_PRIVATE_KEY in .env (must be trustedUpdater on SBT).`)
    return
  }

  try {
    const calldata = encodeFunctionData({
      abi: SBT_ABI,
      functionName: 'mintOrUpdate',
      // newEscrows=0, newAmount=0: stats are tracked by ReputationHook on-chain
      // We're only updating the Merkle root here
      args: [user as `0x${string}`, 0n, 0n, false, newRoot],
    })

    const hash = await wallet.client.sendTransaction({
      account: wallet.account,
      to: sbtAddress,
      data: calldata,
    })
    console.log(`[Merkle] Root updated on-chain for ${user}: ${newRoot} (tx: ${hash})`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[Merkle] Failed to push root on-chain for ${user}: ${msg}`)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Called on every EscrowCompleted or FundsReleased event.
 * Adds a leaf for `user` (freelancer or client), rebuilds the Merkle tree,
 * logs the new root, and optionally pushes it on-chain.
 */
export async function recordEscrowCompletion(
  user: string,
  escrowId: bigint,
  amount: bigint,
): Promise<void> {
  const normalised = user.toLowerCase()
  const existing   = userLeaves.get(normalised) ?? []
  const leaf: LeafValues = [user, escrowId, amount, BigInt(Math.floor(Date.now() / 1000))]
  const updated = [...existing, leaf]
  userLeaves.set(normalised, updated)

  const tree    = buildTree(updated)
  const newRoot = tree.root as Hex

  console.log(`[Merkle] Tree updated for ${user} | escrows: ${updated.length} | root: ${newRoot}`)

  // Push on-chain if configured
  await pushRootOnChain(user, newRoot)
}

/**
 * Generate a Merkle proof for a specific leaf so the frontend can call
 * ReputationSBT.verifyReputationClaim(user, leaf, proof).
 *
 * Returns null if the user has no history.
 */
export function generateProof(
  user: string,
  escrowId: bigint,
  amount: bigint,
  timestamp: bigint,
): { leaf: Hex; proof: Hex[] } | null {
  const normalised = user.toLowerCase()
  const leaves = userLeaves.get(normalised)
  if (!leaves || leaves.length === 0) return null

  try {
    const tree = buildTree(leaves)
    const targetLeaf: LeafValues = [user, escrowId, amount, timestamp]

    // Find the leaf index
    for (const [i, l] of tree.entries()) {
      if (
        l[0].toLowerCase() === targetLeaf[0].toLowerCase() &&
        l[1] === targetLeaf[1] &&
        l[2] === targetLeaf[2] &&
        l[3] === targetLeaf[3]
      ) {
        const proof = tree.getProof(i) as Hex[]
        const leaf  = tree.leafHash(l) as Hex
        return { leaf, proof }
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Returns the current Merkle root for a user, or null if no history.
 */
export function getCurrentRoot(user: string): Hex | null {
  const normalised = user.toLowerCase()
  const leaves = userLeaves.get(normalised)
  if (!leaves || leaves.length === 0) return null
  return buildTree(leaves).root as Hex
}

/**
 * Returns the full escrow history (leaf values) for a user.
 */
export function getUserHistory(user: string): LeafValues[] {
  return userLeaves.get(user.toLowerCase()) ?? []
}
