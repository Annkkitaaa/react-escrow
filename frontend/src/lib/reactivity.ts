// ============================================================
// Somnia Reactivity — Off-chain SDK client setup
// Real implementation in Phase 5 (reactive-service) +
// Phase 8 (frontend WebSocket hook)
// ============================================================

// The off-chain reactive service runs on port 3001 and
// exposes a WebSocket endpoint that forwards Somnia Reactivity
// push notifications to the frontend.

export const REACTIVE_SERVICE_WS_URL =
  import.meta.env.VITE_REACTIVE_SERVICE_WS_URL || 'ws://localhost:3001'

// Event topic signatures for ABI decoding
// Generated from: keccak256("EventName(types...)")
export const EVENT_TOPICS = {
  EscrowCreated:       '0x' as string,       // filled after compile
  FundsDeposited:      '0x' as string,
  MilestoneSubmitted:  '0x' as string,
  MilestoneApproved:   '0x' as string,
  FundsReleased:       '0x' as string,
  DeadlineReached:     '0x' as string,
  DisputeRaised:       '0x' as string,
  DisputeResolved:     '0x' as string,
  EscrowCompleted:     '0x' as string,
} as const
