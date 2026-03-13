import { Link } from 'react-router-dom'
import { formatEther } from 'viem'
import { useReactivity } from '../hooks/useReactivity'
import type { ReactiveEvent, ReactiveEventType } from '../types/escrow'

// ── Human-readable event descriptions ─────────────────────────────────────────
function describeEvent(ev: ReactiveEvent): string {
  const eid = `#${ev.escrowId}`
  const midx = ev.milestoneIndex !== undefined ? ` · milestone ${ev.milestoneIndex}` : ''
  const amt = ev.amount ? ` · ${parseFloat(formatEther(BigInt(ev.amount))).toFixed(4)} STT` : ''

  switch (ev.type as ReactiveEventType) {
    case 'EscrowCreated':      return `Escrow ${eid} created${amt}`
    case 'FundsDeposited':     return `Escrow ${eid} funded${amt}`
    case 'MilestoneSubmitted': return `Escrow ${eid}${midx} submitted for review`
    case 'MilestoneApproved':  return `Escrow ${eid}${midx} approved${amt}`
    case 'FundsReleased':      return `Escrow ${eid}${midx} funds released${amt}`
    case 'DeadlineReached':    return `Escrow ${eid}${midx} deadline reached`
    case 'DisputeRaised':      return `Escrow ${eid}${midx} dispute raised`
    case 'DisputeResolved':    return `Escrow ${eid}${midx} dispute resolved`
    case 'EscrowCompleted':    return `Escrow ${eid} completed`
    default:                   return `Event from escrow ${eid}`
  }
}

// Dot color per event type
function eventColor(type: string): string {
  if (type.includes('Dispute'))   return '#ef4444'
  if (type === 'FundsReleased')   return '#22c55e'
  if (type === 'EscrowCompleted') return '#22c55e'
  if (type === 'MilestoneApproved') return '#22c55e'
  return '#ff6b00'
}

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 60)   return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function LiveEventFeed() {
  const { isConnected, events, clearEvents } = useReactivity()

  // Filter to only real escrow events (not status pings)
  const feed = events.filter(e => e.escrowId !== undefined).slice(0, 12)

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
        <div
          className="rounded-xl p-6 text-center"
          style={{ border: '1px dashed #252525' }}
        >
          <p className="text-gray-600 text-sm">
            {isConnected
              ? 'Waiting for on-chain events…'
              : 'Connect your wallet to see live events'}
          </p>
          <p className="text-gray-700 text-xs mt-1">
            Somnia Reactivity pushes events in real-time
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {feed.map(ev => (
            <Link
              key={ev.id}
              to={`/escrow/${ev.escrowId}`}
              className="flex items-center gap-3 rounded-xl px-4 py-3 transition-all group"
              style={{ backgroundColor: '#141414', border: '1px solid #252525' }}
            >
              {/* Colored dot */}
              <span
                className="h-2 w-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: eventColor(ev.type) }}
              />

              {/* Text */}
              <span className="text-sm text-gray-300 group-hover:text-white transition-colors flex-1 truncate">
                {describeEvent(ev)}
              </span>

              {/* Time */}
              <span className="text-xs text-gray-600 flex-shrink-0 tabular-nums">
                {timeAgo(ev.timestamp)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
