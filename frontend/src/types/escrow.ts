// ============================================================
// ReactEscrow — Core Types
// ============================================================

export enum EscrowStatus {
  Created = 0,
  Funded = 1,
  Active = 2,
  Completed = 3,
  Disputed = 4,
  Cancelled = 5,
}

export enum MilestoneStatus {
  Pending = 0,
  Submitted = 1,
  Approved = 2,
  Disputed = 3,
  Released = 4,
}

export interface Milestone {
  description: string
  amount: bigint
  deadline: bigint // unix timestamp
  status: MilestoneStatus
}

export interface Escrow {
  id: bigint
  client: string
  freelancer: string
  arbiter: string
  totalAmount: bigint
  status: EscrowStatus
  milestones: Milestone[]
  currentMilestone: bigint
}

// ---- Reactivity event types ----

export type ReactiveEventType =
  | 'EscrowCreated'
  | 'FundsDeposited'
  | 'MilestoneSubmitted'
  | 'MilestoneApproved'
  | 'FundsReleased'
  | 'DeadlineReached'
  | 'DisputeRaised'
  | 'DisputeResolved'
  | 'EscrowCompleted'

export interface ReactiveEvent {
  id: string // random uuid for React key
  type: ReactiveEventType
  escrowId: string          // uint256 as decimal string (JSON wire format)
  milestoneIndex?: string   // uint256 as decimal string
  amount?: string           // uint256 wei as decimal string
  address?: string
  resolution?: number
  timestamp: number         // Date.now()
  blockNumber?: string      // uint256 as decimal string
  raw: {
    topics: string[]
    data: string
  }
}

export const ESCROW_STATUS_LABELS: Record<EscrowStatus, string> = {
  [EscrowStatus.Created]: 'Created',
  [EscrowStatus.Funded]: 'Funded',
  [EscrowStatus.Active]: 'Active',
  [EscrowStatus.Completed]: 'Completed',
  [EscrowStatus.Disputed]: 'Disputed',
  [EscrowStatus.Cancelled]: 'Cancelled',
}

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  [MilestoneStatus.Pending]: 'Pending',
  [MilestoneStatus.Submitted]: 'Submitted',
  [MilestoneStatus.Approved]: 'Approved',
  [MilestoneStatus.Disputed]: 'Disputed',
  [MilestoneStatus.Released]: 'Released',
}

export interface CreateEscrowParams {
  freelancer: string
  arbiter: string
  milestones: {
    description: string
    amount: bigint
    deadline: bigint
  }[]
  totalAmount: bigint
}
