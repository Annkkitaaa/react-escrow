import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { formatEther } from 'viem'
import { useWallet } from '../hooks/useWallet'
import { useEscrow, type EscrowData, type MilestoneData } from '../hooks/useEscrow'
import { useReactivity } from '../hooks/useReactivity'
import {
  EscrowStatus, MilestoneStatus,
  ESCROW_STATUS_LABELS, MILESTONE_STATUS_LABELS,
} from '../types/escrow'
import { getExplorerAddressUrl, getExplorerTxUrl } from '../lib/somnia'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(addr: string) { return `${addr.slice(0,6)}…${addr.slice(-4)}` }
function fmtDate(ts: bigint) {
  return new Date(Number(ts) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function isExpired(deadline: bigint) { return Number(deadline) * 1000 < Date.now() }

function Addr({ address, label }: { address: string; label: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs text-gray-500 w-24 flex-shrink-0">{label}</span>
      <a
        href={getExplorerAddressUrl(address)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-gray-300 hover:text-brand-400 transition-colors"
      >
        {fmt(address)}
      </a>
    </div>
  )
}

// ── Status badges ─────────────────────────────────────────────────────────────
function EscrowBadge({ status }: { status: EscrowStatus }) {
  const cls = ({
    [EscrowStatus.Created]:   'badge-created',
    [EscrowStatus.Funded]:    'badge-funded',
    [EscrowStatus.Active]:    'badge-active',
    [EscrowStatus.Completed]: 'badge-completed',
    [EscrowStatus.Disputed]:  'badge-disputed',
    [EscrowStatus.Cancelled]: 'badge-cancelled',
  } as Record<number, string>)[status] ?? 'badge-created'
  return <span className={cls}>{ESCROW_STATUS_LABELS[status]}</span>
}

function MilestoneBadge({ status }: { status: MilestoneStatus }) {
  const cls = ({
    [MilestoneStatus.Pending]:   'badge-pending',
    [MilestoneStatus.Submitted]: 'badge-submitted',
    [MilestoneStatus.Approved]:  'badge-approved',
    [MilestoneStatus.Disputed]:  'badge-disputed',
    [MilestoneStatus.Released]:  'badge-released',
  } as Record<number, string>)[status] ?? 'badge-pending'
  return <span className={cls}>{MILESTONE_STATUS_LABELS[status]}</span>
}

// ── Milestone action buttons ──────────────────────────────────────────────────
interface ActionProps {
  escrow: EscrowData
  milestone: MilestoneData
  index: number
  isClient: boolean
  isFreelancer: boolean
  isArbiter: boolean
  isCurrent: boolean
  isTxPending: boolean
  onAction: (action: string, idx: number, resolution?: number) => void
}

function MilestoneActions({
  escrow, milestone, index, isClient, isFreelancer, isArbiter,
  isCurrent, isTxPending, onAction,
}: ActionProps) {
  const [resolution, setResolution] = useState(0)
  const s = milestone.status
  const escrowActive = escrow.status === EscrowStatus.Active

  const actions: { label: string; action: string; variant: string; condition: boolean }[] = [
    // Freelancer: submit when current + active + pending
    {
      label: 'Submit Milestone', action: 'submit', variant: 'btn-primary',
      condition: isFreelancer && escrowActive && isCurrent && s === MilestoneStatus.Pending,
    },
    // Client: approve submitted
    {
      label: 'Approve', action: 'approve', variant: 'btn-primary',
      condition: isClient && escrowActive && isCurrent && s === MilestoneStatus.Submitted,
    },
    // Client or Freelancer: raise dispute on submitted
    {
      label: 'Raise Dispute', action: 'dispute', variant: 'btn-danger',
      condition: (isClient || isFreelancer) && escrowActive && isCurrent && s === MilestoneStatus.Submitted,
    },
    // Client: manual release (if reactive service offline)
    {
      label: 'Release Funds', action: 'release', variant: 'btn-secondary',
      condition: isClient && escrowActive && isCurrent && s === MilestoneStatus.Approved,
    },
    // Anyone: timeout release if deadline passed + approved
    {
      label: 'Trigger Timeout Release', action: 'timeout', variant: 'btn-secondary',
      condition: escrowActive && isCurrent && s === MilestoneStatus.Approved && isExpired(milestone.deadline),
    },
  ]

  const visible = actions.filter(a => a.condition)

  if (visible.length === 0 && !(isArbiter && s === MilestoneStatus.Disputed)) return null

  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-3" style={{ borderTop: '1px solid #252525' }}>
      {visible.map(a => (
        <button
          key={a.action}
          disabled={isTxPending}
          onClick={() => onAction(a.action, index)}
          className={`${a.variant} text-xs py-1.5 px-3`}
        >
          {a.label}
        </button>
      ))}

      {/* Arbiter: resolve dispute */}
      {isArbiter && s === MilestoneStatus.Disputed && (
        <div className="flex items-center gap-2 w-full mt-1">
          <select
            value={resolution}
            onChange={e => setResolution(Number(e.target.value))}
            className="input text-xs py-1.5 h-auto w-auto flex-shrink-0"
            style={{ minWidth: '150px' }}
          >
            <option value={0}>Freelancer wins</option>
            <option value={1}>Client wins (refund)</option>
            <option value={2}>Split 50/50</option>
          </select>
          <button
            disabled={isTxPending}
            onClick={() => onAction('resolve', index, resolution)}
            className="btn-primary text-xs py-1.5 px-3"
          >
            Resolve Dispute
          </button>
        </div>
      )}
    </div>
  )
}

// ── Milestone timeline row ────────────────────────────────────────────────────
function MilestoneRow({
  milestone, index, isCurrent, isLast,
  escrow, isClient, isFreelancer, isArbiter,
  isTxPending, onAction,
}: {
  milestone: MilestoneData
  index: number
  isCurrent: boolean
  isLast: boolean
  escrow: EscrowData
  isClient: boolean
  isFreelancer: boolean
  isArbiter: boolean
  isTxPending: boolean
  onAction: (action: string, idx: number, resolution?: number) => void
}) {
  const s = milestone.status
  const circleClass = s === MilestoneStatus.Released
    ? 'timeline-circle-done'
    : s === MilestoneStatus.Disputed
      ? 'timeline-circle-disputed'
      : isCurrent
        ? 'timeline-circle-active'
        : 'timeline-circle'

  return (
    <div className="timeline-step">
      {/* Line connector */}
      {!isLast && <div className="timeline-line" />}

      {/* Circle */}
      <div className={circleClass}>{index + 1}</div>

      {/* Content */}
      <div className="flex-1 pb-6">
        <div
          className="rounded-xl p-4"
          style={{
            backgroundColor: isCurrent ? 'rgba(255,107,0,0.03)' : '#141414',
            border: isCurrent ? '1px solid rgba(255,107,0,0.15)' : '1px solid #252525',
          }}
        >
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <p className="text-white font-medium text-sm">{milestone.description}</p>
              <p className="text-brand-400 font-semibold mt-0.5">
                {parseFloat(formatEther(milestone.amount)).toFixed(4)} STT
              </p>
            </div>
            <MilestoneBadge status={milestone.status} />
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>Deadline: {fmtDate(milestone.deadline)}</span>
            {isExpired(milestone.deadline) && s !== MilestoneStatus.Released && (
              <span className="text-red-400">Expired</span>
            )}
          </div>

          <MilestoneActions
            escrow={escrow}
            milestone={milestone}
            index={index}
            isClient={isClient}
            isFreelancer={isFreelancer}
            isArbiter={isArbiter}
            isCurrent={isCurrent}
            isTxPending={isTxPending}
            onAction={onAction}
          />
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EscrowDetail() {
  const { id } = useParams<{ id: string }>()
  const { address } = useWallet()
  const {
    isTxPending,
    getEscrow, getMilestones,
    depositFunds, submitMilestone, approveMilestone,
    raiseDispute, resolveDispute, releaseFunds, executeTimeoutRelease,
  } = useEscrow()

  const { subscribe } = useReactivity()

  const [escrow,      setEscrow]      = useState<EscrowData | null>(null)
  const [milestones,  setMilestones]  = useState<MilestoneData[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [lastTxHash,  setLastTxHash]  = useState<string | null>(null)
  const [autoUpdated, setAutoUpdated] = useState(false)

  const escrowId = id ? BigInt(id) : null

  const reload = useCallback(async () => {
    if (!escrowId) return
    try {
      const [e, ms] = await Promise.all([getEscrow(escrowId), getMilestones(escrowId)])
      setEscrow(e)
      setMilestones(ms)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [escrowId, getEscrow, getMilestones])

  useEffect(() => { reload() }, [reload])

  // Auto-reload when Somnia Reactivity pushes an event for this escrow
  useEffect(() => {
    if (!id) return
    return subscribe((event) => {
      if (event.escrowId === id) {
        reload()
        setAutoUpdated(true)
        setTimeout(() => setAutoUpdated(false), 3000)
      }
    })
  }, [id, subscribe, reload])

  // ── Roles ──────────────────────────────────────────────────────────────────
  const addrLower = address?.toLowerCase() ?? ''
  const isClient     = escrow ? escrow.client.toLowerCase()     === addrLower : false
  const isFreelancer = escrow ? escrow.freelancer.toLowerCase() === addrLower : false
  const isArbiter    = escrow ? escrow.arbiter.toLowerCase()    === addrLower : false

  // ── Action handler ─────────────────────────────────────────────────────────
  const handleAction = async (action: string, idx: number, resolution?: number) => {
    if (!escrowId || !escrow) return
    try {
      let hash: `0x${string}`
      const midx = BigInt(idx)
      switch (action) {
        case 'deposit':
          hash = await depositFunds(escrowId, escrow.totalAmount)
          break
        case 'submit':
          hash = await submitMilestone(escrowId, midx)
          break
        case 'approve':
          hash = await approveMilestone(escrowId, midx)
          break
        case 'dispute':
          hash = await raiseDispute(escrowId, midx)
          break
        case 'release':
          hash = await releaseFunds(escrowId, midx)
          break
        case 'timeout':
          hash = await executeTimeoutRelease(escrowId, midx)
          break
        case 'resolve':
          hash = await resolveDispute(escrowId, midx, resolution ?? 0)
          break
        default:
          return
      }
      setLastTxHash(hash)
      await reload()
    } catch {
      // errors surfaced via toast in useEscrow
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 rounded" style={{ backgroundColor: '#252525', width: '40%' }} />
        <div className="card space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-4 rounded" style={{ backgroundColor: '#252525', width: `${70-i*10}%` }} />)}
        </div>
        <div className="card space-y-3">
          {[1,2].map(i => <div key={i} className="h-16 rounded" style={{ backgroundColor: '#252525' }} />)}
        </div>
      </div>
    )
  }

  if (error || !escrow) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card" style={{ borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.05)' }}>
          <p className="text-red-400 text-sm">
            {error ?? `Escrow #${id} not found`}
          </p>
          <Link to="/dashboard" className="btn-secondary mt-4 inline-flex text-sm">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/dashboard" className="text-gray-500 hover:text-white transition-colors text-sm">
          ← Dashboard
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="section-title mb-0">Escrow #{escrow.id.toString()}</h1>
            <EscrowBadge status={escrow.status} />
          </div>
          <p className="text-gray-500 text-sm">
            {parseFloat(formatEther(escrow.totalAmount)).toFixed(4)} STT total
          </p>
        </div>
        {/* Role badge */}
        {(isClient || isFreelancer || isArbiter) && (
          <div className="flex gap-2 flex-wrap">
            {isClient     && <span className="badge" style={{ color: '#ff8c24', backgroundColor: 'rgba(255,107,0,0.08)', border: '1px solid rgba(255,107,0,0.2)' }}>You: Client</span>}
            {isFreelancer && <span className="badge" style={{ color: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>You: Freelancer</span>}
            {isArbiter    && <span className="badge" style={{ color: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)' }}>You: Arbiter</span>}
          </div>
        )}
      </div>

      {/* Parties */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">Parties</h2>
        <div className="divider mb-2" />
        <Addr address={escrow.client}     label="Client" />
        <div className="divider" />
        <Addr address={escrow.freelancer} label="Freelancer" />
        <div className="divider" />
        <Addr address={escrow.arbiter}    label="Arbiter" />
      </div>

      {/* Deposit banner (Created state) */}
      {escrow.status === EscrowStatus.Created && isClient && (
        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: 'rgba(255,107,0,0.06)', border: '1px solid rgba(255,107,0,0.2)' }}
        >
          <p className="text-sm text-white font-medium mb-1">Fund this escrow to activate it</p>
          <p className="text-xs text-gray-400 mb-3">
            Lock {parseFloat(formatEther(escrow.totalAmount)).toFixed(4)} STT to start the work.
          </p>
          <button
            disabled={isTxPending}
            onClick={() => handleAction('deposit', 0)}
            className="btn-primary text-sm"
          >
            {isTxPending ? 'Depositing…' : `Deposit ${parseFloat(formatEther(escrow.totalAmount)).toFixed(4)} STT`}
          </button>
        </div>
      )}

      {/* Reactive auto-update flash */}
      {autoUpdated && (
        <div
          className="rounded-xl px-4 py-2 text-xs flex items-center gap-2 transition-opacity"
          style={{ backgroundColor: 'rgba(255,107,0,0.06)', border: '1px solid rgba(255,107,0,0.2)', color: '#ff8c24' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse flex-shrink-0" />
          Auto-updated via Somnia Reactivity
        </div>
      )}

      {/* Last tx */}
      {lastTxHash && (
        <div
          className="rounded-xl px-4 py-3 text-xs flex items-center justify-between"
          style={{ backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', color: '#86efac' }}
        >
          <span>Transaction confirmed</span>
          <a
            href={getExplorerTxUrl(lastTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline"
          >
            {lastTxHash.slice(0,8)}…
          </a>
        </div>
      )}

      {/* Milestone timeline */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">Milestones</h2>
        <div className="relative">
          {milestones.map((m, i) => (
            <MilestoneRow
              key={i}
              milestone={m}
              index={i}
              isCurrent={i === Number(escrow.currentMilestone)}
              isLast={i === milestones.length - 1}
              escrow={escrow}
              isClient={isClient}
              isFreelancer={isFreelancer}
              isArbiter={isArbiter}
              isTxPending={isTxPending}
              onAction={handleAction}
            />
          ))}
        </div>
      </div>

      {/* Reactivity note */}
      <div
        className="rounded-xl px-4 py-3 text-xs"
        style={{ backgroundColor: 'rgba(255,107,0,0.04)', border: '1px solid rgba(255,107,0,0.1)', color: '#6b7280' }}
      >
        <span style={{ color: '#ff6b00' }}>⚡ Somnia Reactivity: </span>
        Approving a milestone emits an on-chain event. The{' '}
        <span className="font-mono">ReactiveHandlers</span> contract receives a
        push notification from validators and auto-releases funds — no manual step needed.
      </div>
    </div>
  )
}
