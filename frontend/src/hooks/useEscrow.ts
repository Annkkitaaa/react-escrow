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
import { CONTRACT_ADDRESSES, REACT_ESCROW_ABI } from '../lib/contracts'
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

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useEscrow() {
  const [isTxPending, setIsTxPending] = useState(false)

  const addr = CONTRACT_ADDRESSES.ReactEscrow

  // ── Reads ──────────────────────────────────────────────────────────────────

  const getEscrow = useCallback(async (id: bigint): Promise<EscrowData> => {
    const raw = await publicClient.readContract({
      address: addr,
      abi: REACT_ESCROW_ABI,
      functionName: 'getEscrow',
      args: [id],
    }) as {
      client: Address; freelancer: Address; arbiter: Address
      totalAmount: bigint; status: number; currentMilestone: bigint
    }
    return {
      id,
      client:           raw.client,
      freelancer:       raw.freelancer,
      arbiter:          raw.arbiter,
      totalAmount:      raw.totalAmount,
      status:           raw.status as EscrowStatus,
      currentMilestone: raw.currentMilestone,
    }
  }, [addr])

  const getMilestones = useCallback(async (id: bigint): Promise<MilestoneData[]> => {
    const raw = await publicClient.readContract({
      address: addr,
      abi: REACT_ESCROW_ABI,
      functionName: 'getMilestones',
      args: [id],
    }) as Array<{ description: string; amount: bigint; deadline: bigint; status: number; resolution: number }>
    return raw.map(m => ({
      description: m.description,
      amount:      m.amount,
      deadline:    m.deadline,
      status:      m.status as MilestoneStatus,
      resolution:  m.resolution,
    }))
  }, [addr])

  const getEscrowsByClient = useCallback(async (client: Address): Promise<bigint[]> => {
    return publicClient.readContract({
      address: addr,
      abi: REACT_ESCROW_ABI,
      functionName: 'getEscrowsByClient',
      args: [client],
    }) as Promise<bigint[]>
  }, [addr])

  const getEscrowsByFreelancer = useCallback(async (freelancer: Address): Promise<bigint[]> => {
    return publicClient.readContract({
      address: addr,
      abi: REACT_ESCROW_ABI,
      functionName: 'getEscrowsByFreelancer',
      args: [freelancer],
    }) as Promise<bigint[]>
  }, [addr])

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
        address: addr,
        abi: REACT_ESCROW_ABI,
        functionName: functionName as never,
        args: args as never[],
        account,
        value,
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

  // ── Writes ─────────────────────────────────────────────────────────────────

  const createEscrow = useCallback((
    freelancer: Address, arbiter: Address, milestones: MilestoneInput[]
  ) => sendTx('createEscrow', [freelancer, arbiter, milestones],
    undefined, 'Creating escrow…', 'Escrow created!'),
  [sendTx])

  const depositFunds = useCallback((escrowId: bigint, amount: bigint) =>
    sendTx('depositFunds', [escrowId], amount, 'Depositing funds…', 'Funds deposited!'),
  [sendTx])

  const submitMilestone = useCallback((escrowId: bigint, milestoneIndex: bigint) =>
    sendTx('submitMilestone', [escrowId, milestoneIndex],
      undefined, 'Submitting milestone…', 'Milestone submitted!'),
  [sendTx])

  const approveMilestone = useCallback((escrowId: bigint, milestoneIndex: bigint) =>
    sendTx('approveMilestone', [escrowId, milestoneIndex],
      undefined, 'Approving milestone…', 'Milestone approved — funds releasing via Reactivity!'),
  [sendTx])

  const raiseDispute = useCallback((escrowId: bigint, milestoneIndex: bigint) =>
    sendTx('raiseDispute', [escrowId, milestoneIndex],
      undefined, 'Raising dispute…', 'Dispute raised!'),
  [sendTx])

  const resolveDispute = useCallback((
    escrowId: bigint, milestoneIndex: bigint, resolution: number
  ) => sendTx('resolveDispute', [escrowId, milestoneIndex, resolution],
    undefined, 'Resolving dispute…', 'Dispute resolved!'),
  [sendTx])

  const releaseFunds = useCallback((escrowId: bigint, milestoneIndex: bigint) =>
    sendTx('releaseMilestoneFunds', [escrowId, milestoneIndex],
      undefined, 'Releasing funds…', 'Funds released!'),
  [sendTx])

  const executeTimeoutRelease = useCallback((escrowId: bigint, milestoneIndex: bigint) =>
    sendTx('executeTimeoutRelease', [escrowId, milestoneIndex],
      undefined, 'Triggering timeout release…', 'Timeout release executed!'),
  [sendTx])

  const checkAndTriggerTimeout = useCallback((escrowId: bigint, milestoneIndex: bigint) =>
    sendTx('checkAndTriggerTimeout', [escrowId, milestoneIndex],
      undefined, 'Checking deadline…', 'DeadlineReached emitted — Reactivity will auto-release!'),
  [sendTx])

  const cancelEscrow = useCallback((escrowId: bigint) =>
    sendTx('cancelEscrow', [escrowId],
      undefined, 'Cancelling escrow…', 'Escrow cancelled.'),
  [sendTx])

  return {
    isTxPending,
    getEscrow,
    getMilestones,
    getEscrowsByClient,
    getEscrowsByFreelancer,
    createEscrow,
    depositFunds,
    submitMilestone,
    approveMilestone,
    raiseDispute,
    resolveDispute,
    releaseFunds,
    executeTimeoutRelease,
    checkAndTriggerTimeout,
    cancelEscrow,
  }
}
