// ============================================================
// Contract addresses and ABI — filled after deployment
// ============================================================

export const CONTRACT_ADDRESSES = {
  ReactEscrow: (import.meta.env.VITE_REACT_ESCROW_ADDRESS || '') as `0x${string}`,
  ReactiveHandlers: (import.meta.env.VITE_REACTIVE_HANDLERS_ADDRESS || '') as `0x${string}`,
}

// ABI is imported from build artifacts after `npx hardhat compile`
// Placeholder — real ABI injected in Phase 7
export const REACT_ESCROW_ABI = [] as const
