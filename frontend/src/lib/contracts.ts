// ============================================================
// Contract addresses and ABI
// ============================================================

import ReactEscrowABIJson from './ReactEscrowABI.json'

export const CONTRACT_ADDRESSES = {
  ReactEscrow:      (import.meta.env.VITE_REACT_ESCROW_ADDRESS      || '') as `0x${string}`,
  ReactiveHandlers: (import.meta.env.VITE_REACTIVE_HANDLERS_ADDRESS || '') as `0x${string}`,
}

export const REACT_ESCROW_ABI = ReactEscrowABIJson as typeof ReactEscrowABIJson
