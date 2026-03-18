// ============================================================
// useEscrow — Contract interaction hook
// All reads via viem publicClient; writes via MetaMask walletClient
// ============================================================

import { useCallback, useState } from 'react'
import {
  createPublicClient,
  createWalletClient,
  http,
  custom,
  type Address,
} from 'viem'
import toast from 'react-hot-toast'
import { somniaTestnet } from '../lib/somnia'
import { CONTRACT_ADDRESSES, REACT_ESCROW_ABI, REPUTATION_SBT_ABI } from '../lib/contracts'
import { EscrowStatus, MilestoneStatus } from '../types/escrow'

// ── Public client (module-level — no re-creation on renders) ─────────────────
const publicClient = createPublicClient({
  chain: somniaTestnet,
  transport: http(),
})

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EscrowData {
  id: bigint
  client: Address
  freelancer: Address
  arbiter: Address
  totalAmount: bigint
  status: EscrowStatus
  currentMilestone: bigint
}

export interface MilestoneData {
  description: string
  amount: bigint
  deadline: bigint
  status: MilestoneStatus
  resolution: number
}

export interface MilestoneInput {
  description: string
  amount: bigint
  deadline: bigint
}

export interface PrivateMilestoneInput {
  description: string
  commitment: `0x${string}`
  deadline: bigint
}

export interface CheckpointData {
  description: string
  weightPercent: number
  status: number // 0=Pending,1=Submitted,2=Approved,3=Released
}

export interface DeliveryData {
  expectedHash: `0x${string}`
  submittedHash: `0x${string}`
  challengeDeadline: bigint
  challenged: boolean
}

export interface ReputationData {
  merkleRoot: `0x${string}`
  totalEscrows: bigint
  totalAmountEarned: bigint
  disputeCount: bigint
  lastUpdated: bigint
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useEscrow() {
  const [isTxPending, setIsTxPending] = useState(false)

  const addr    = CONTRACT_ADDRESSES.ReactEscrow
  const sbtAddr = CONTRACT_ADDRESSES.ReputationSBT

  // ── Reads ──────────────────────────────────────────────────────────────────

  const getEscrow = useCallback(async (id: bigint): Promise<EscrowData> => {
    // viem v2 returns multiple outputs as an array (not a named object)
    const raw = await publicClient.readContract({
      address: addr, abi: REACT_ESCROW_ABI, functionName: 'getEscrow', args: [id],
    }) as readonly [Address, Address, Address, bigint, number, bigint]
    return { id, client: raw[0], freelancer: raw[1], arbiter: raw[2], totalAmount: raw[3], status: raw[4] as EscrowStatus, currentMilestone: raw[5] }
  }, [addr])

  const getMilestones = useCallback(async (id: bigint): Promise<MilestoneData[]> => {
    const raw = await publicClient.readContract({
      address: addr, abi: REACT_ESCROW_ABI, functionName: 'getMilestones', args: [id],
    }) as Array<{ description: string; amount: bigint; deadline: bigint; status: number; resolution: number }>
    return raw.map(m => ({ description: m.description, amount: m.amount, deadline: m.deadline, status: m.status as MilestoneStatus, resolution: m.resolution }))
  }, [addr])

  const getEscrowsByClient = useCallback(async (client: Address): Promise<bigint[]> => {
    return publicClient.readContract({ address: addr, abi: REACT_ESCROW_ABI, functionName: 'getEscrowsByClient', args: [client] }) as Promise<bigint[]>
  }, [addr])

  const getEscrowsByFreelancer = useCallback(async (freelancer: Address): Promise<bigint[]> => {
    return publicClient.readContract({ address: addr, abi: REACT_ESCROW_ABI, functionName: 'getEscrowsByFreelancer', args: [freelancer] }) as Promise<bigint[]>
  }, [addr])

  const getDeliveryData = useCallback(async (escrowId: bigint, milestoneIndex: bigint): Promise<DeliveryData> => {
    return publicClient.readContract({
      address: addr, abi: REACT_ESCROW_ABI, functionName: 'getDeliveryData', args: [escrowId, milestoneIndex],
    }) as Promise<DeliveryData>
  }, [addr])

  const getChallengePeriod = useCallback(async (escrowId: bigint): Promise<bigint> => {
    return publicClient.readContract({ address: addr, abi: REACT_ESCROW_ABI, functionName: 'getChallengePeriod', args: [escrowId] }) as Promise<bigint>
  }, [addr])

  const getCheckpoints = useCallback(async (escrowId: bigint, milestoneIndex: bigint): Promise<CheckpointData[]> => {
    const raw = await publicClient.readContract({
      address: addr, abi: REACT_ESCROW_ABI, functionName: 'getCheckpoints', args: [escrowId, milestoneIndex],
    }) as Array<{ description: string; weightPercent: number; status: number }>
    return raw.map(c => ({ description: c.description, weightPercent: Number(c.weightPercent), status: Number(c.status) }))
  }, [addr])

  const getMilestoneReleasedAmount = useCallback(async (escrowId: bigint, milestoneIndex: bigint): Promise<bigint> => {
    return publicClient.readContract({ address: addr, abi: REACT_ESCROW_ABI, functionName: 'getMilestoneReleasedAmount', args: [escrowId, milestoneIndex] }) as Promise<bigint>
  }, [addr])

  const getReputation = useCallback(async (user: Address): Promise<ReputationData | null> => {
    if (!sbtAddr) return null
    try {
      // viem v2 returns multiple outputs as array; map by index
      const raw = await publicClient.readContract({ address: sbtAddr, abi: REPUTATION_SBT_ABI, functionName: 'reputation', args: [user] }) as readonly [`0x${string}`, bigint, bigint, bigint, bigint]
      return { merkleRoot: raw[0], totalEscrows: raw[1], totalAmountEarned: raw[2], disputeCount: raw[3], lastUpdated: raw[4] }
    } catch { return null }
  }, [sbtAddr])

  const hasReputationToken = useCallback(async (user: Address): Promise<boolean> => {
    if (!sbtAddr) return false
    try {
      return publicClient.readContract({ address: sbtAddr, abi: REPUTATION_SBT_ABI, functionName: 'hasToken', args: [user] }) as Promise<boolean>
    } catch { return false }
  }, [sbtAddr])

  // ── Write helper ───────────────────────────────────────────────────────────

  const sendTx = useCallback(async (
    functionName: string,
    args: unknown[],
    value?: bigint,
    pendingMsg = 'Sending transaction…',
    successMsg = 'Transaction confirmed!',
  ): Promise<`0x${string}`> => {
    if (!window.ethereum) throw new Error('MetaMask not found')
    const walletClient = createWalletClient({
      chain: somniaTestnet,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transport: custom(window.ethereum as any),
    })
    const [account] = await walletClient.getAddresses()
    setIsTxPending(true)
    const toastId = toast.loading(pendingMsg)
    try {
      const hash = await walletClient.writeContract({
        address: addr, abi: REACT_ESCROW_ABI,
        functionName: functionName as never, args: args as never[],
        account, value,
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status === 'success') {
        toast.success(successMsg, { id: toastId })
      } else {
        toast.error('Transaction reverted', { id: toastId })
        throw new Error('Transaction reverted')
      }
      return hash
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      const msg = e?.shortMessage ?? e?.message ?? 'Transaction failed'
      toast.error(msg, { id: toastId })
      throw err
    } finally {
      setIsTxPending(false)
    }
  }, [addr])

  // ── Writes — Core ──────────────────────────────────────────────────────────

  const createEscrow = useCallback((freelancer: Address, arbiter: Address, milestones: MilestoneInput[]) =>
    sendTx('createEscrow', [freelancer, arbiter, milestones], undefined, 'Creating escrow…', 'Escrow created!'),
  [sendTx])

  const depositFunds = useCallback((escrowId: bigint, amount: bigint) =>
    sendTx('depositFunds', [escrowId], amount, 'Depositing funds…', 'Funds deposited!'),
  [sendTx])

  const submitMilestone = useCallback((escrowId: bigint, milestoneIndex: bigint) =>
    sendTx('submitMilestone', [escrowId, milestoneIndex], undefined, 'Submitting milestone…', 'Milestone submitted!'),
  [sendTx])

  const approveMilestone = useCallback((escrowId: bigint, milestoneIndex: bigint) =>
    sendTx('approveMilestone', [escrowId, milestoneIndex], undefined, 'Approving milestone…', 'Milestone approved — funds releasing via Reactivity!'),
  [sendTx])

  const raiseDispute = useCallback((escrowId: bigint, milestoneIndex: bigint) =>
    sendTx('raiseDispute', [escrowId, milestoneIndex], undefined, 'Raising dispute…', 'Dispute raised!'),
  [sendTx])

  const resolveDispute = useCallback((escrowId: bigint, milestoneIndex: bigint, resolution: number) =>
    sendTx('resolveDispute', [escrowId, milestoneIndex, resolution], undefined, 'Resolving dispute…', 'Dispute resolved!'),
  [sendTx])

  const releaseFunds = useCallback((escrowId: bigint, milestoneIndex: bigint) =>
    sendTx('releaseMilestoneFunds', [escrowId, milestoneIndex], undefined, 'Releasing funds…', 'Funds released!'),
  [sendTx])

  const executeTimeoutRelease = useCallback((escrowId: bigint, milestoneIndex: bigint) =>
    sendTx('executeTimeoutRelease', [escrowId, milestoneIndex], undefined, 'Triggering timeout release…', 'Timeout release executed!'),
  [sendTx])

  const checkAndTriggerTimeout = useCallback((escrowId: bigint, milestoneIndex: bigint) =>
    sendTx('checkAndTriggerTimeout', [escrowId, milestoneIndex], undefined, 'Checking deadline…', 'DeadlineReached emitted — Reactivity will auto-release!'),
  [sendTx])

  const cancelEscrow = useCallback((escrowId: bigint) =>
    sendTx('cancelEscrow', [escrowId], undefined, 'Cancelling escrow…', 'Escrow cancelled.'),
  [sendTx])

  // ── Writes — Feature 1: Commit-Reveal ─────────────────────────────────────

  const createPrivateEscrow = useCallback((
    freelancer: Address, arbiter: Address,
    milestones: PrivateMilestoneInput[], totalAmount: bigint,
  ) => sendTx('createPrivateEscrow', [freelancer, arbiter, milestones, totalAmount],
    totalAmount, 'Creating private escrow…', 'Private escrow created!'),
  [sendTx])

  const approvePrivateMilestone = useCallback((
    escrowId: bigint, milestoneIndex: bigint, amount: bigint, salt: string,
  ) => sendTx('approvePrivateMilestone', [escrowId, milestoneIndex, amount, salt],
    undefined, 'Revealing & approving…', 'Amount revealed — funds releasing via Reactivity!'),
  [sendTx])

  // ── Writes — Feature 2: Proof-of-Delivery ─────────────────────────────────

  const createEscrowWithDelivery = useCallback((
    freelancer: Address, arbiter: Address,
    milestones: MilestoneInput[], deliverableHashes: string[], challengePeriodSeconds: bigint,
  ) => {
    const total = milestones.reduce((s, m) => s + m.amount, 0n)
    return sendTx('createEscrowWithDelivery', [freelancer, arbiter, milestones, deliverableHashes, challengePeriodSeconds],
      total, 'Creating delivery escrow…', 'Delivery escrow created!')
  }, [sendTx])

  const submitMilestoneWithDeliverable = useCallback((
    escrowId: bigint, milestoneIndex: bigint, deliverableHash: string,
  ) => sendTx('submitMilestoneWithDeliverable', [escrowId, milestoneIndex, deliverableHash],
    undefined, 'Submitting with deliverable…', 'Deliverable submitted!'),
  [sendTx])

  const checkAndTriggerChallengeExpiry = useCallback((escrowId: bigint, milestoneIndex: bigint) =>
    sendTx('checkAndTriggerChallengeExpiry', [escrowId, milestoneIndex],
      undefined, 'Triggering challenge expiry…', 'Challenge period expired — funds releasing!'),
  [sendTx])

  const challengeDeliverable = useCallback((escrowId: bigint, milestoneIndex: bigint) =>
    sendTx('challengeDeliverable', [escrowId, milestoneIndex],
      undefined, 'Challenging deliverable…', 'Deliverable challenged — dispute raised!'),
  [sendTx])

  // ── Writes — Feature 3: Streaming Checkpoints ─────────────────────────────

  const addMilestoneCheckpoints = useCallback((
    escrowId: bigint, milestoneIndex: bigint,
    descriptions: string[], weights: number[],
  ) => sendTx('addMilestoneCheckpoints', [escrowId, milestoneIndex, descriptions, weights],
    undefined, 'Adding checkpoints…', 'Checkpoints added!'),
  [sendTx])

  const submitCheckpoint = useCallback((
    escrowId: bigint, milestoneIndex: bigint, checkpointIndex: bigint,
  ) => sendTx('submitCheckpoint', [escrowId, milestoneIndex, checkpointIndex],
    undefined, 'Submitting checkpoint…', 'Checkpoint submitted!'),
  [sendTx])

  const approveCheckpoint = useCallback((
    escrowId: bigint, milestoneIndex: bigint, checkpointIndex: bigint,
  ) => sendTx('approveCheckpoint', [escrowId, milestoneIndex, checkpointIndex],
    undefined, 'Approving checkpoint…', 'Checkpoint approved — partial payment releasing!'),
  [sendTx])

  return {
    isTxPending,
    // Reads
    getEscrow, getMilestones, getEscrowsByClient, getEscrowsByFreelancer,
    getDeliveryData, getChallengePeriod, getCheckpoints, getMilestoneReleasedAmount,
    getReputation, hasReputationToken,
    // Writes — Core
    createEscrow, depositFunds, submitMilestone, approveMilestone,
    raiseDispute, resolveDispute, releaseFunds, executeTimeoutRelease, checkAndTriggerTimeout, cancelEscrow,
    // Feature 1
    createPrivateEscrow, approvePrivateMilestone,
    // Feature 2
    createEscrowWithDelivery, submitMilestoneWithDeliverable, checkAndTriggerChallengeExpiry, challengeDeliverable,
    // Feature 3
    addMilestoneCheckpoints, submitCheckpoint, approveCheckpoint,
  }
}
