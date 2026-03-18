// ============================================================
// Commitment helpers — Feature 1 (Privacy-Preserving Milestones)
//
// Uses keccak256 commit-reveal: commitment = keccak256(amount || salt)
// The salt is stored in localStorage so the client can reveal later.
// ============================================================

import { keccak256, encodePacked, parseEther } from 'viem'

/** Compute keccak256(abi.encodePacked(amount, salt)) — mirrors Solidity */
export function computeCommitment(amountWei: bigint, salt: `0x${string}`): `0x${string}` {
  return keccak256(encodePacked(['uint256', 'bytes32'], [amountWei, salt]))
}

/** Generate a cryptographically random 32-byte salt (browser only) */
export function generateSalt(): `0x${string}` {
  const arr = new Uint8Array(32)
  globalThis.crypto.getRandomValues(arr)
  return ('0x' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function storageKey(escrowId: string, milestoneIndex: number): string {
  return `commitment:${escrowId}:${milestoneIndex}`
}

/** Save {amountEth, salt} to localStorage for later reveal */
export function saveCommitment(
  escrowId: string,
  milestoneIndex: number,
  amountEth: string,
  salt: `0x${string}`,
): void {
  try {
    localStorage.setItem(storageKey(escrowId, milestoneIndex), JSON.stringify({ amountEth, salt }))
  } catch { /* storage not available */ }
}

/** Load the saved commitment data, or null if not found */
export function loadCommitment(
  escrowId: string,
  milestoneIndex: number,
): { amountEth: string; salt: `0x${string}` } | null {
  try {
    const raw = localStorage.getItem(storageKey(escrowId, milestoneIndex))
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Compute commitment ready to pass to createPrivateEscrow */
export function buildCommitment(amountEth: string): {
  commitment: `0x${string}`
  salt: `0x${string}`
  amountWei: bigint
} {
  const salt = generateSalt()
  const amountWei = parseEther(amountEth)
  const commitment = computeCommitment(amountWei, salt)
  return { commitment, salt, amountWei }
}
