import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { formatEther } from 'viem'
import { useWallet } from '../hooks/useWallet'
import { useEscrow, type EscrowData } from '../hooks/useEscrow'
import { useReactivity } from '../hooks/useReactivity'
import { EscrowStatus, ESCROW_STATUS_LABELS } from '../types/escrow'
import { getExplorerAddressUrl } from '../lib/somnia'
import LiveEventFeed from './LiveEventFeed'

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: EscrowStatus }) {
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

function Addr({ address }: { address: string }) {
  return (
    <a
      href={getExplorerAddressUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs text-gray-400 hover:text-brand-400 transition-colors"
      onClick={e => e.stopPropagation()}
    >
      {address.slice(0, 6)}…{address.slice(-4)}
    </a>
  )
}

function MilestoneProgress({ current, total }: { current: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((current / total) * 100)
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{current}/{total} milestones</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1 rounded-full" style={{ backgroundColor: '#252525' }}>
        <div
          className="h-1 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#22c55e' : '#ff6b00' }}
        />
      </div>
    </div>
  )
}

// ── Escrow card ───────────────────────────────────────────────────────────────
function EscrowCard({ escrow, role, milestoneCount }: {
  escrow: EscrowData
  role: 'client' | 'freelancer'
  milestoneCount: number
}) {
  const counterpart = role === 'client' ? escrow.freelancer : escrow.client
  const counterpartLabel = role === 'client' ? 'Freelancer' : 'Client'

  return (
    <Link to={`/escrow/${escrow.id}`} className="card-hover block">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-500 font-mono">#{escrow.id.toString()}</span>
            <StatusBadge status={escrow.status} />
          </div>
          <p className="text-white font-semibold text-base">
            {parseFloat(formatEther(escrow.totalAmount)).toFixed(3)} STT
          </p>
        </div>
        <span
          className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
          style={{
            color: role === 'client' ? '#ff8c24' : '#60a5fa',
            backgroundColor: role === 'client' ? 'rgba(255,107,0,0.08)' : 'rgba(96,165,250,0.08)',
            border: `1px solid ${role === 'client' ? 'rgba(255,107,0,0.2)' : 'rgba(96,165,250,0.2)'}`,
          }}
        >
          {role === 'client' ? 'Client' : 'Freelancer'}
        </span>
      </div>

      <div className="space-y-1.5 mb-4 text-xs">
        <div className="flex items-center gap-2 text-gray-500">
          <span className="w-20 flex-shrink-0">{counterpartLabel}</span>
          <Addr address={counterpart} />
        </div>
      </div>

      <MilestoneProgress current={Number(escrow.currentMilestone)} total={milestoneCount} />
    </Link>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ role }: { role: 'client' | 'freelancer' }) {
  return (
    <div className="rounded-2xl p-8 text-center" style={{ border: '1px dashed #252525' }}>
      <p className="text-gray-600 text-sm">
        {role === 'client' ? "No escrows created yet." : "No freelancer escrows yet."}
      </p>
      {role === 'client' && (
        <Link to="/create" className="btn-primary mt-4 inline-flex text-sm">
          Create First Escrow
        </Link>
      )}
    </div>
  )
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="card animate-pulse">
      <div className="h-4 rounded mb-3" style={{ backgroundColor: '#252525', width: '60%' }} />
      <div className="h-6 rounded mb-4" style={{ backgroundColor: '#252525', width: '40%' }} />
      <div className="h-3 rounded mb-2" style={{ backgroundColor: '#252525' }} />
      <div className="h-1 rounded-full mt-4" style={{ backgroundColor: '#252525' }} />
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
type EscrowWithCount = EscrowData & { milestoneCount: number }

export default function EscrowDashboard() {
  const { address } = useWallet()
  const { getEscrow, getMilestones, getEscrowsByClient, getEscrowsByFreelancer } = useEscrow()
  const { subscribe } = useReactivity()

  const [clientEscrows,    setClientEscrows]    = useState<EscrowWithCount[]>([])
  const [freelancerEscrows,setFreelancerEscrows] = useState<EscrowWithCount[]>([])
  const [loadingClient,    setLoadingClient]    = useState(true)
  const [loadingFreelancer,setLoadingFreelancer] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadEscrows = useCallback(async (
    ids: bigint[],
    setter: (v: EscrowWithCount[]) => void,
    setLoading: (v: boolean) => void,
  ) => {
    try {
      const results = await Promise.all(
        ids.map(async id => {
          const [escrow, milestones] = await Promise.all([getEscrow(id), getMilestones(id)])
          return { ...escrow, milestoneCount: milestones.length }
        })
      )
      results.sort((a, b) => Number(b.id - a.id))
      setter(results)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [getEscrow, getMilestones])

  const loadAll = useCallback(() => {
    if (!address) return
    const addr = address as `0x${string}`
    setError(null)
    setLoadingClient(true)
    setLoadingFreelancer(true)

    getEscrowsByClient(addr)
      .then(ids => loadEscrows(ids, setClientEscrows, setLoadingClient))
      .catch(e => { setError(e.message); setLoadingClient(false) })

    getEscrowsByFreelancer(addr)
      .then(ids => loadEscrows(ids, setFreelancerEscrows, setLoadingFreelancer))
      .catch(e => { setError(e.message); setLoadingFreelancer(false) })
  }, [address, getEscrowsByClient, getEscrowsByFreelancer, loadEscrows])

  useEffect(() => { loadAll() }, [loadAll])

  // Refresh when user returns to this tab (stale data prevention)
  useEffect(() => {
    const onFocus = () => loadAll()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadAll])

  // Build a set of escrow IDs we're watching so reactive events trigger targeted reloads
  const watchedIds = useMemo(
    () => new Set([...clientEscrows, ...freelancerEscrows].map(e => e.id.toString())),
    [clientEscrows, freelancerEscrows],
  )

  // Auto-reload affected escrow when Somnia Reactivity pushes an event
  useEffect(() => {
    return subscribe((event) => {
      if (watchedIds.has(event.escrowId) || event.type === 'EscrowCreated') {
        loadAll()
      }
    })
  }, [watchedIds, subscribe, loadAll])

  // ── Stats ──────────────────────────────────────────────────────────────────
  const all = [...clientEscrows, ...freelancerEscrows]
  const active = all.filter(e => e.status === EscrowStatus.Active || e.status === EscrowStatus.Disputed).length
  const totalLocked = all
    .filter(e => e.status !== EscrowStatus.Completed && e.status !== EscrowStatus.Cancelled)
    .reduce((s, e) => s + e.totalAmount, 0n)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p className="section-subtitle">Your escrow agreements on Somnia Testnet</p>
        </div>
        <Link to="/create" className="btn-primary">
          + New Escrow
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="card" style={{ borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.05)' }}>
          <p className="text-red-400 text-sm">Failed to load: {error}</p>
        </div>
      )}

      {/* Stats */}
      {!loadingClient && !loadingFreelancer && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Escrows', value: all.length.toString() },
            { label: 'Active',        value: active.toString() },
            { label: 'Total Locked',  value: `${parseFloat(formatEther(totalLocked)).toFixed(3)} STT` },
          ].map(s => (
            <div key={s.label} className="card text-center">
              <p className="stat-value">{s.value}</p>
              <p className="stat-label mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* As Client */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-bold text-white">As Client</h2>
          {!loadingClient && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#1c1c1c', color: '#6b7280' }}>
              {clientEscrows.length}
            </span>
          )}
        </div>
        {loadingClient ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1,2,3].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : clientEscrows.length === 0 ? (
          <EmptyState role="client" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clientEscrows.map(e => (
              <EscrowCard key={e.id.toString()} escrow={e} role="client" milestoneCount={e.milestoneCount} />
            ))}
          </div>
        )}
      </div>

      {/* As Freelancer */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-bold text-white">As Freelancer</h2>
          {!loadingFreelancer && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#1c1c1c', color: '#6b7280' }}>
              {freelancerEscrows.length}
            </span>
          )}
        </div>
        {loadingFreelancer ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1,2,3].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : freelancerEscrows.length === 0 ? (
          <EmptyState role="freelancer" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {freelancerEscrows.map(e => (
              <EscrowCard key={e.id.toString()} escrow={e} role="freelancer" milestoneCount={e.milestoneCount} />
            ))}
          </div>
        )}
      </div>

      {/* Live Somnia Reactivity feed */}
      <div className="pt-2" style={{ borderTop: '1px solid #1c1c1c' }}>
        <LiveEventFeed />
      </div>
    </div>
  )
}
