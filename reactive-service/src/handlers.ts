// ============================================================
// Event Handlers — process Somnia Reactivity push notifications
// and structure them for frontend consumption
// Full implementation in Phase 5
// ============================================================

import type { SubscriptionCallback } from '@somnia-chain/reactivity'

export interface ParsedEvent {
  id: string
  type: string
  escrowId?: bigint
  milestoneIndex?: bigint
  amount?: bigint
  address?: string
  resolution?: number
  timestamp: number
  blockNumber?: bigint
  raw: {
    topics: string[]
    data: string
  }
}

// Placeholder — real parsing implemented in Phase 5
export function parseReactiveEvent(_data: SubscriptionCallback): ParsedEvent | null {
  return null
}
