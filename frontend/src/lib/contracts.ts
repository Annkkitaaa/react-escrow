// ============================================================
// Contract addresses and ABIs
// ============================================================

import ReactEscrowABIJson    from './ReactEscrowABI.json'
import ReputationSBTABIJson  from './ReputationSBTABI.json'

export const CONTRACT_ADDRESSES = {
  ReactEscrow:      (import.meta.env.VITE_REACT_ESCROW_ADDRESS       || '') as `0x${string}`,
  ReactiveHandlers: (import.meta.env.VITE_REACTIVE_HANDLERS_ADDRESS  || '') as `0x${string}`,
  HookRegistry:     (import.meta.env.VITE_HOOK_REGISTRY_ADDRESS      || '') as `0x${string}`,
  EscrowReceiptNFT: (import.meta.env.VITE_ESCROW_RECEIPT_NFT_ADDRESS || '') as `0x${string}`,
  ReputationSBT:    (import.meta.env.VITE_REPUTATION_SBT_ADDRESS     || '') as `0x${string}`,
  ReputationHook:   (import.meta.env.VITE_REPUTATION_HOOK_ADDRESS    || '') as `0x${string}`,
}

export const REACT_ESCROW_ABI   = ReactEscrowABIJson   as typeof ReactEscrowABIJson
export const REPUTATION_SBT_ABI = ReputationSBTABIJson as typeof ReputationSBTABIJson
