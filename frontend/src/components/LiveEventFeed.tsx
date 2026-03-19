import { Link } from 'react-router-dom'
import { formatEther } from 'viem'
import { useReactivity } from '../hooks/useReactivity'
import type { ReactiveEvent, ReactiveEventType } from '../types/escrow'

// ── Badge config per event type ────────────────────────────────────────────────
const BADGE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  MilestoneApproved:  { label: 'Approved',    color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.25)' },
  FundsReleased:      { label: 'Released',     color: '#22c55e', bg: 'rgba(34,197,94,0.1)',    border: 'rgba(34,197,94,0.25)' },
  MilestoneSubmitted: { label: 'Submitted',    color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)' },
  DeadlineReached:    { label: 'Deadline',     color: '#f97316', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.25)' },
  DisputeRaised:      { label: 'Disputed',     color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)' },
  DisputeResolved:    { label: 'Resolved',     color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)' },
  EscrowCreated:      { label: 'Created',      color: '#ff8c24', bg: 'rgba(255,107,0,0.1)',   border: 'rgba(255,107,0,0.25)' },
  FundsDeposited:     { label: 'Funded',       color: '#ff8c24', bg: 'rgba(255,107,0,0.08)',  border: 'rgba(255,107,0,0.2)' },
  EscrowCompleted:    { label: 'Completed',    color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)' },
}

function EventBadge({ type }: { type: string }) {
  const b = BADGE[type] ?? { label: type, color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.2)' }
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
      style={{ color: b.color, backgroundColor: b.bg, border: `1px solid ${b.border}` }}
    >
      {b.label}
    </span>
  )
}

// ── Human-readable event descriptions ─────────────────────────────────────────
function describeEvent(ev: ReactiveEvent): string {
  const eid = `#${ev.escrowId}`
  const midx = ev.milestoneIndex !== undefined ? ` milestone ${ev.milestoneIndex}` : ''
  const fmtAmt = (a?: string) =>
    a ? `${parseFloat(formatEther(BigInt(a))).toFixed(4)} STT` : null

  switch (ev.type as ReactiveEventType) {
    case 'EscrowCreated':
      return `Escrow ${eid} created${ev.amount ? ` · ${fmtAmt(ev.amount)}` : ''}`
    case 'FundsDeposited':
      return `Escrow ${eid} funded · ${fmtAmt(ev.amount) ?? '?'}`
    case 'MilestoneSubmitted':
      return `Escrow ${eid} · ${midx || 'milestone'} submitted for review`
    case 'MilestoneApproved':
      return `Escrow ${eid} · ${midx || 'milestone'} approved${ev.amount ? ` · ${fmtAmt(ev.amount)}` : ''} — reactive release triggered`
    case 'FundsReleased':
      return `Escrow ${eid} · ${fmtAmt(ev.amount) ?? '?'} automatically released${ev.address ? ` to ${ev.address.slice(0, 6)}…${ev.address.slice(-4)}` : ''}`
    case 'DeadlineReached':
      return `⏰ Escrow ${eid} · ${midx || 'milestone'} deadline passed — timeout auto-release triggered`
    case 'DisputeRaised':
      return `Escrow ${eid} · ${midx || 'milestone'} dispute raised`
    case 'DisputeResolved':
      return `⚖️ Escrow ${eid} dispute resolved — funds distributed per arbiter ruling`
    case 'EscrowCompleted':
      return `Escrow ${eid} fully completed`
    default:
      return `Event from escrow ${eid}`
  }
}

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 60)   return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

// ── Group consecutive events that share the same block number ─────────────────
interface Group {
  blockNumber: string | undefined
  events: ReactiveEvent[]
}

function groupByBlock(events: ReactiveEvent[]): Group[] {
  const groups: Group[] = []
  for (const ev of events) {
    const last = groups[groups.length - 1]
    if (last && last.blockNumber && last.blockNumber === ev.blockNumber) {
      last.events.push(ev)
    } else {
      groups.push({ blockNumber: ev.blockNumber, events: [ev] })
    }
  }
  return groups
}

// ── Single event row ──────────────────────────────────────────────────────────
function EventRow({
  ev,
  chainPrefix,
}: {
  ev: ReactiveEvent
  chainPrefix?: 'first' | 'middle' | 'last' | 'single'
}) {
  const isChained = chainPrefix !== undefined && chainPrefix !== 'single'
  const isLast = chainPrefix === 'last'

  return (
    <Link
      to={`/escrow/${ev.escrowId}`}
      className="flex items-center gap-3 px-4 py-2.5 transition-all group"
      style={{
        backgroundColor: '#141414',
        borderLeft: isChained ? `2px solid ${isLast ? 'transparent' : 'rgba(34,197,94,0.25)'}` : undefined,
        marginLeft: isChained ? 20 : 0,
        borderRadius: 0,
      }}
    >
      {/* Chain connector symbol */}
      {isChained && (
        <span className="text-xs font-mono flex-shrink-0" style={{ color: 'rgba(34,197,94,0.5)', marginLeft: -4 }}>
          {isLast ? '└' : '├'}
        </span>
      )}

      {/* Badge */}
      <EventBadge type={ev.type} />

      {/* Text */}
      <span className="text-sm text-gray-400 group-hover:text-white transition-colors flex-1 truncate">
        {describeEvent(ev)}
      </span>

      {/* Block number */}
      {ev.blockNumber && (
        <span className="text-xs text-gray-700 flex-shrink-0 font-mono tabular-nums">
          #{ev.blockNumber}
        </span>
      )}

      {/* Time */}
      <span className="text-xs text-gray-600 flex-shrink-0 tabular-nums">
        {timeAgo(ev.timestamp)}
      </span>
    </Link>
  )
}

// ── Grouped chain row header ──────────────────────────────────────────────────
function ChainGroupHeader({ blockNumber, count }: { blockNumber: string; count: number }) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-1.5"
      style={{ backgroundColor: 'rgba(34,197,94,0.04)', borderLeft: '2px solid rgba(34,197,94,0.4)' }}
    >
      <span className="text-[10px] font-semibold text-green-500 font-mono">
        ┌ Block #{blockNumber}
      </span>
      <span
        className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
        style={{ color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}
      >
        {count} same-block events
      </span>
      <span className="text-[10px] text-green-700">— reactive chain</span>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function LiveEventFeed() {
  const { isConnected, events, clearEvents } = useReactivity()

  const feed = events.filter(e => e.escrowId !== undefined).slice(0, 20)
  const groups = groupByBlock(feed)

  if (!isConnected && feed.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-white">Live Events</h2>
          <div
            className="flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full"
            style={
              isConnected
                ? { color: '#ff6b00', backgroundColor: 'rgba(255,107,0,0.1)', border: '1px solid rgba(255,107,0,0.2)' }
                : { color: '#6b7280', backgroundColor: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.2)' }
            }
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: isConnected ? '#ff6b00' : '#6b7280' }}
            />
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </div>
        </div>
        {feed.length > 0 && (
          <button
            onClick={clearEvents}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {feed.length === 0 ? (
        <div className="rounded-xl p-6 text-center" style={{ border: '1px dashed #252525' }}>
          <p className="text-gray-600 text-sm">
            {isConnected ? 'Waiting for on-chain events…' : 'Connect your wallet to see live events'}
          </p>
          <p className="text-gray-700 text-xs mt-1">
            Somnia Reactivity pushes events in real-time
          </p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #252525' }}>
          {groups.map((group, gi) => {
            const isChain = group.events.length > 1
            return (
              <div key={gi} style={{ borderBottom: gi < groups.length - 1 ? '1px solid #1c1c1c' : undefined }}>
                {/* Chain header */}
                {isChain && group.blockNumber && (
                  <ChainGroupHeader blockNumber={group.blockNumber} count={group.events.length} />
                )}
                {/* Events */}
                {group.events.map((ev, ei) => {
                  let prefix: 'single' | 'first' | 'middle' | 'last' | undefined
                  if (isChain) {
                    if (ei === 0) prefix = 'first'
                    else if (ei === group.events.length - 1) prefix = 'last'
                    else prefix = 'middle'
                  }
                  return <EventRow key={ev.id} ev={ev} chainPrefix={prefix} />
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
