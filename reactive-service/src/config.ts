import * as dotenv from 'dotenv'
import { parseGwei } from 'viem'

dotenv.config({ path: '../.env' })

// ============================================================
// Reactive Service Config
// ============================================================

export const config = {
  somnia: {
    rpcUrl: process.env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network/',
    wsUrl: process.env.SOMNIA_WS_URL || 'wss://dream-rpc.somnia.network/',
    chainId: 50312,
  },
  contracts: {
    reactEscrow:       (process.env.REACT_ESCROW_ADDRESS       || '') as `0x${string}`,
    reactiveHandlers:  (process.env.REACTIVE_HANDLERS_ADDRESS  || '') as `0x${string}`,
    reputationSbt:     (process.env.REPUTATION_SBT_ADDRESS     || '') as `0x${string}`,
  },
  service: {
    port: parseInt(process.env.REACTIVE_SERVICE_PORT || '3001', 10),
  },
  // Optional: set MERKLE_UPDATER_PRIVATE_KEY in .env so the reactive service can
  // update the on-chain Merkle root in ReputationSBT after each EscrowCompleted.
  // The account must be set as trustedUpdater on the ReputationSBT contract.
  merkle: {
    updaterPrivateKey: (process.env.MERKLE_UPDATER_PRIVATE_KEY || '') as `0x${string}`,
  },
  // Gas config for on-chain subscriptions (per Somnia docs)
  gasConfig: {
    priorityFeePerGas: parseGwei('2'),   // 2 gwei minimum
    maxFeePerGas: parseGwei('10'),
    gasLimit: 2_000_000n,
  },
} as const

// Event topic signatures — filled after compilation
// keccak256 of "EventName(param types...)"
export const EVENT_SIGNATURES = {
  // Original
  EscrowCreated:      'EscrowCreated(uint256,address,address,uint256)',
  FundsDeposited:     'FundsDeposited(uint256,uint256)',
  MilestoneSubmitted: 'MilestoneSubmitted(uint256,uint256)',
  MilestoneApproved:  'MilestoneApproved(uint256,uint256,uint256)',
  FundsReleased:      'FundsReleased(uint256,uint256,address,uint256)',
  DeadlineReached:    'DeadlineReached(uint256,uint256)',
  DisputeRaised:      'DisputeRaised(uint256,uint256,address)',
  DisputeResolved:    'DisputeResolved(uint256,uint256,uint8)',
  EscrowCompleted:    'EscrowCompleted(uint256)',
  EscrowCancelled:    'EscrowCancelled(uint256)',
  // Feature 1
  PrivateMilestoneRevealed: 'PrivateMilestoneRevealed(uint256,uint256,uint256)',
  // Feature 2
  DeliverableVerified:              'DeliverableVerified(uint256,uint256,bytes32)',
  DeliverableChallengePeriodExpired:'DeliverableChallengePeriodExpired(uint256,uint256)',
  DeliverableChallenged:            'DeliverableChallenged(uint256,uint256)',
  // Feature 3
  CheckpointSubmitted: 'CheckpointSubmitted(uint256,uint256,uint256)',
  CheckpointApproved:  'CheckpointApproved(uint256,uint256,uint256,uint256)',
  CheckpointReleased:  'CheckpointReleased(uint256,uint256,uint256,uint256)',
} as const
