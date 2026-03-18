// ============================================================
// ReactEscrow — Reactive Event Handlers
// Decodes Somnia Reactivity push notifications into structured
// ParsedEvent objects for broadcast to frontend clients.
// ============================================================

import {
  decodeAbiParameters,
  keccak256,
  stringToBytes,
  getAddress,
  type Hex,
} from 'viem'
import { randomUUID } from 'crypto'
import type { SubscriptionCallback } from '@somnia-chain/reactivity'

// ── Serializable event shape (bigints as strings for JSON wire) ───────────────
//   Matches frontend ReactiveEvent — bigint fields sent as strings
export interface ParsedEvent {
  id: string
  type: string
  escrowId: string         // uint256 as string
  milestoneIndex?: string  // uint256 as string
  checkpointIndex?: string // uint256 as string (Feature 3)
  amount?: string          // uint256 as string (wei)
  address?: string
  deliverableHash?: string // bytes32 hex (Feature 2)
  resolution?: number
  timestamp: number
  blockNumber?: string     // uint256 as string
  raw: {
    topics: string[]
    data: string
  }
}

// ── Event topic selectors ──────────────────────────────────────────────────────
const TOPIC = {
  // Original events
  EscrowCreated:      keccak256(stringToBytes('EscrowCreated(uint256,address,address,uint256)')),
  FundsDeposited:     keccak256(stringToBytes('FundsDeposited(uint256,uint256)')),
  MilestoneSubmitted: keccak256(stringToBytes('MilestoneSubmitted(uint256,uint256)')),
  MilestoneApproved:  keccak256(stringToBytes('MilestoneApproved(uint256,uint256,uint256)')),
  FundsReleased:      keccak256(stringToBytes('FundsReleased(uint256,uint256,address,uint256)')),
  DeadlineReached:    keccak256(stringToBytes('DeadlineReached(uint256,uint256)')),
  DisputeRaised:      keccak256(stringToBytes('DisputeRaised(uint256,uint256,address)')),
  DisputeResolved:    keccak256(stringToBytes('DisputeResolved(uint256,uint256,uint8)')),
  EscrowCompleted:    keccak256(stringToBytes('EscrowCompleted(uint256)')),
  EscrowCancelled:    keccak256(stringToBytes('EscrowCancelled(uint256)')),
  // Feature 1 — Commit-Reveal
  PrivateMilestoneRevealed: keccak256(stringToBytes('PrivateMilestoneRevealed(uint256,uint256,uint256)')),
  // Feature 2 — Proof-of-Delivery
  DeliverableVerified:             keccak256(stringToBytes('DeliverableVerified(uint256,uint256,bytes32)')),
  DeliverableChallengePeriodExpired: keccak256(stringToBytes('DeliverableChallengePeriodExpired(uint256,uint256)')),
  DeliverableChallenged:           keccak256(stringToBytes('DeliverableChallenged(uint256,uint256)')),
  // Feature 3 — Streaming Checkpoints
  CheckpointSubmitted: keccak256(stringToBytes('CheckpointSubmitted(uint256,uint256,uint256)')),
  CheckpointApproved:  keccak256(stringToBytes('CheckpointApproved(uint256,uint256,uint256,uint256)')),
  CheckpointReleased:  keccak256(stringToBytes('CheckpointReleased(uint256,uint256,uint256,uint256)')),
} as const

// ── Decoding helpers ───────────────────────────────────────────────────────────

// Indexed uint256 topic → string
function topicToU256(topic: Hex): string {
  return BigInt(topic).toString()
}

// Indexed address topic → checksummed address (strip 12-byte zero padding)
function topicToAddr(topic: Hex): string {
  return getAddress(`0x${topic.slice(-40)}`)
}

// ── Main parse function ───────────────────────────────────────────────────────

export function parseReactiveEvent(raw: SubscriptionCallback | any): ParsedEvent | null {
  try {
    // Defensively handle both { result: { topics, data } } and { topics, data } shapes
    const payload = raw?.result ?? raw
    const topics: Hex[] = payload?.topics ?? []
    const data: Hex = payload?.data ?? '0x'

    if (!topics.length) return null

    const selector = topics[0]
    const timestamp = Date.now()
    const id = randomUUID()
    const rawObj = { topics: topics as string[], data }

    // ── Original events ───────────────────────────────────────────────────────

    // EscrowCreated(uint256 indexed escrowId, address indexed client, address indexed freelancer, uint256 totalAmount)
    if (selector === TOPIC.EscrowCreated) {
      const escrowId = topicToU256(topics[1])
      const [totalAmount] = decodeAbiParameters([{ type: 'uint256' }], data)
      return {
        id, type: 'EscrowCreated', timestamp,
        escrowId,
        amount: totalAmount.toString(),
        address: topics[2] ? topicToAddr(topics[2]) : undefined,
        raw: rawObj,
      }
    }

    // FundsDeposited(uint256 indexed escrowId, uint256 amount)
    if (selector === TOPIC.FundsDeposited) {
      const escrowId = topicToU256(topics[1])
      const [amount] = decodeAbiParameters([{ type: 'uint256' }], data)
      return {
        id, type: 'FundsDeposited', timestamp,
        escrowId,
        amount: amount.toString(),
        raw: rawObj,
      }
    }

    // MilestoneSubmitted(uint256 indexed escrowId, uint256 milestoneIndex)
    if (selector === TOPIC.MilestoneSubmitted) {
      const escrowId = topicToU256(topics[1])
      const [milestoneIndex] = decodeAbiParameters([{ type: 'uint256' }], data)
      return {
        id, type: 'MilestoneSubmitted', timestamp,
        escrowId,
        milestoneIndex: milestoneIndex.toString(),
        raw: rawObj,
      }
    }

    // MilestoneApproved(uint256 indexed escrowId, uint256 milestoneIndex, uint256 amount)
    if (selector === TOPIC.MilestoneApproved) {
      const escrowId = topicToU256(topics[1])
      const [milestoneIndex, amount] = decodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint256' }], data
      )
      return {
        id, type: 'MilestoneApproved', timestamp,
        escrowId,
        milestoneIndex: milestoneIndex.toString(),
        amount: amount.toString(),
        raw: rawObj,
      }
    }

    // FundsReleased(uint256 indexed escrowId, uint256 milestoneIndex, address indexed to, uint256 amount)
    if (selector === TOPIC.FundsReleased) {
      const escrowId = topicToU256(topics[1])
      const toAddr = topics[2] ? topicToAddr(topics[2]) : undefined
      const [milestoneIndex, amount] = decodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint256' }], data
      )
      return {
        id, type: 'FundsReleased', timestamp,
        escrowId,
        milestoneIndex: milestoneIndex.toString(),
        amount: amount.toString(),
        address: toAddr,
        raw: rawObj,
      }
    }

    // DeadlineReached(uint256 indexed escrowId, uint256 milestoneIndex)
    if (selector === TOPIC.DeadlineReached) {
      const escrowId = topicToU256(topics[1])
      const [milestoneIndex] = decodeAbiParameters([{ type: 'uint256' }], data)
      return {
        id, type: 'DeadlineReached', timestamp,
        escrowId,
        milestoneIndex: milestoneIndex.toString(),
        raw: rawObj,
      }
    }

    // DisputeRaised(uint256 indexed escrowId, uint256 milestoneIndex, address indexed raisedBy)
    if (selector === TOPIC.DisputeRaised) {
      const escrowId = topicToU256(topics[1])
      const raisedBy = topics[2] ? topicToAddr(topics[2]) : undefined
      const [milestoneIndex] = decodeAbiParameters([{ type: 'uint256' }], data)
      return {
        id, type: 'DisputeRaised', timestamp,
        escrowId,
        milestoneIndex: milestoneIndex.toString(),
        address: raisedBy,
        raw: rawObj,
      }
    }

    // DisputeResolved(uint256 indexed escrowId, uint256 milestoneIndex, uint8 resolution)
    if (selector === TOPIC.DisputeResolved) {
      const escrowId = topicToU256(topics[1])
      const [milestoneIndex, resolution] = decodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint8' }], data
      )
      return {
        id, type: 'DisputeResolved', timestamp,
        escrowId,
        milestoneIndex: milestoneIndex.toString(),
        resolution: Number(resolution),
        raw: rawObj,
      }
    }

    // EscrowCompleted(uint256 indexed escrowId)
    if (selector === TOPIC.EscrowCompleted) {
      const escrowId = topicToU256(topics[1])
      return {
        id, type: 'EscrowCompleted', timestamp,
        escrowId,
        raw: rawObj,
      }
    }

    // EscrowCancelled(uint256 indexed escrowId)
    if (selector === TOPIC.EscrowCancelled) {
      const escrowId = topicToU256(topics[1])
      return {
        id, type: 'EscrowCancelled', timestamp,
        escrowId,
        raw: rawObj,
      }
    }

    // ── Feature 1: Commit-Reveal ──────────────────────────────────────────────

    // PrivateMilestoneRevealed(uint256 indexed escrowId, uint256 milestoneIndex, uint256 amount)
    if (selector === TOPIC.PrivateMilestoneRevealed) {
      const escrowId = topicToU256(topics[1])
      const [milestoneIndex, amount] = decodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint256' }], data
      )
      return {
        id, type: 'PrivateMilestoneRevealed', timestamp,
        escrowId,
        milestoneIndex: milestoneIndex.toString(),
        amount: amount.toString(),
        raw: rawObj,
      }
    }

    // ── Feature 2: Proof-of-Delivery ─────────────────────────────────────────

    // DeliverableVerified(uint256 indexed escrowId, uint256 indexed milestoneIndex, bytes32 deliverableHash)
    if (selector === TOPIC.DeliverableVerified) {
      const escrowId      = topicToU256(topics[1])
      const milestoneIndex = topicToU256(topics[2])
      const [deliverableHash] = decodeAbiParameters([{ type: 'bytes32' }], data)
      return {
        id, type: 'DeliverableVerified', timestamp,
        escrowId,
        milestoneIndex,
        deliverableHash: deliverableHash as string,
        raw: rawObj,
      }
    }

    // DeliverableChallengePeriodExpired(uint256 indexed escrowId, uint256 indexed milestoneIndex)
    if (selector === TOPIC.DeliverableChallengePeriodExpired) {
      const escrowId       = topicToU256(topics[1])
      const milestoneIndex = topicToU256(topics[2])
      return {
        id, type: 'DeliverableChallengePeriodExpired', timestamp,
        escrowId,
        milestoneIndex,
        raw: rawObj,
      }
    }

    // DeliverableChallenged(uint256 indexed escrowId, uint256 indexed milestoneIndex)
    if (selector === TOPIC.DeliverableChallenged) {
      const escrowId       = topicToU256(topics[1])
      const milestoneIndex = topicToU256(topics[2])
      return {
        id, type: 'DeliverableChallenged', timestamp,
        escrowId,
        milestoneIndex,
        raw: rawObj,
      }
    }

    // ── Feature 3: Streaming Checkpoints ─────────────────────────────────────

    // CheckpointSubmitted(uint256 indexed escrowId, uint256 indexed milestoneIndex, uint256 checkpointIndex)
    if (selector === TOPIC.CheckpointSubmitted) {
      const escrowId       = topicToU256(topics[1])
      const milestoneIndex = topicToU256(topics[2])
      const [checkpointIndex] = decodeAbiParameters([{ type: 'uint256' }], data)
      return {
        id, type: 'CheckpointSubmitted', timestamp,
        escrowId,
        milestoneIndex,
        checkpointIndex: checkpointIndex.toString(),
        raw: rawObj,
      }
    }

    // CheckpointApproved(uint256 indexed escrowId, uint256 indexed milestoneIndex, uint256 checkpointIndex, uint256 amount)
    if (selector === TOPIC.CheckpointApproved) {
      const escrowId       = topicToU256(topics[1])
      const milestoneIndex = topicToU256(topics[2])
      const [checkpointIndex, amount] = decodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint256' }], data
      )
      return {
        id, type: 'CheckpointApproved', timestamp,
        escrowId,
        milestoneIndex,
        checkpointIndex: checkpointIndex.toString(),
        amount: amount.toString(),
        raw: rawObj,
      }
    }

    // CheckpointReleased(uint256 indexed escrowId, uint256 milestoneIndex, uint256 checkpointIndex, uint256 amount)
    // Note: only escrowId is indexed; milestoneIndex, checkpointIndex, amount are in data
    if (selector === TOPIC.CheckpointReleased) {
      const escrowId = topicToU256(topics[1])
      const [milestoneIndex, checkpointIndex, amount] = decodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], data
      )
      return {
        id, type: 'CheckpointReleased', timestamp,
        escrowId,
        milestoneIndex: milestoneIndex.toString(),
        checkpointIndex: checkpointIndex.toString(),
        amount: amount.toString(),
        raw: rawObj,
      }
    }

    // Unknown topic — ignore
    return null
  } catch (err) {
    console.error('[handlers] Failed to parse event:', err)
    return null
  }
}
