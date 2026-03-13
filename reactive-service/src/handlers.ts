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
  amount?: string          // uint256 as string (wei)
  address?: string
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
  EscrowCreated:      keccak256(stringToBytes('EscrowCreated(uint256,address,address,uint256)')),
  FundsDeposited:     keccak256(stringToBytes('FundsDeposited(uint256,uint256)')),
  MilestoneSubmitted: keccak256(stringToBytes('MilestoneSubmitted(uint256,uint256)')),
  MilestoneApproved:  keccak256(stringToBytes('MilestoneApproved(uint256,uint256,uint256)')),
  FundsReleased:      keccak256(stringToBytes('FundsReleased(uint256,uint256,address,uint256)')),
  DeadlineReached:    keccak256(stringToBytes('DeadlineReached(uint256,uint256)')),
  DisputeRaised:      keccak256(stringToBytes('DisputeRaised(uint256,uint256,address)')),
  DisputeResolved:    keccak256(stringToBytes('DisputeResolved(uint256,uint256,uint8)')),
  EscrowCompleted:    keccak256(stringToBytes('EscrowCompleted(uint256)')),
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

    // Unknown topic — ignore
    return null
  } catch (err) {
    console.error('[handlers] Failed to parse event:', err)
    return null
  }
}
