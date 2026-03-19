import { useState, useEffect } from 'react'
import { useReactivity } from '../hooks/useReactivity'

type PipelineType = 'standard' | 'delivery' | 'checkpoint'

interface StepDef {
  id: string
  label: string
  sub: string
  /** Event types that activate this step (string comparison, not typed union) */
  triggers: string[]
}

const PIPELINES: Record<PipelineType, StepDef[]> = {
  standard: [
    { id: 'client-approves',  label: 'Client Approves',     sub: 'on-chain tx',         triggers: ['MilestoneApproved'] },
    { id: 'event-emitted',    label: 'Event Emitted',        sub: 'MilestoneApproved',   triggers: ['MilestoneApproved'] },
    { id: 'validator',        label: 'Validator Detects',    sub: '~0s delay',            triggers: ['MilestoneApproved'] },
    { id: 'on-event',         label: '_onEvent() Called',    sub: 'ReactiveHandlers',    triggers: ['MilestoneApproved'] },
    { id: 'funds-released',   label: 'Funds Released',       sub: 'to freelancer',       triggers: ['FundsReleased'] },
    { id: 'hook-fired',       label: 'Hook Fired',           sub: 'HookRegistry',        triggers: ['FundsReleased'] },
    { id: 'nft-minted',       label: 'NFT Minted',           sub: 'EscrowReceiptNFT',    triggers: ['EscrowCompleted'] },
    { id: 'reputation',       label: 'Reputation Updated',   sub: 'ReputationSBT',       triggers: ['EscrowCompleted'] },
  ],
  delivery: [
    { id: 'submit',           label: 'Freelancer Submits',   sub: 'deliverable hash',    triggers: ['MilestoneSubmitted'] },
    { id: 'hash-verified',    label: 'Hash Verified',        sub: 'keccak256 match',     triggers: ['MilestoneSubmitted'] },
    { id: 'challenge',        label: 'Challenge Period',     sub: '60s countdown',       triggers: ['MilestoneSubmitted'] },
    { id: 'auto-approved',    label: 'Auto-Approved',        sub: 'on expiry',           triggers: ['MilestoneApproved'] },
    { id: 'funds-released',   label: 'Funds Released',       sub: 'auto-triggered',      triggers: ['FundsReleased'] },
    { id: 'hook-fired',       label: 'Hook Fired',           sub: 'HookRegistry',        triggers: ['FundsReleased'] },
    { id: 'nft-minted',       label: 'NFT Minted',           sub: 'EscrowReceiptNFT',    triggers: ['EscrowCompleted'] },
  ],
  checkpoint: [
    { id: 'checkpoint',       label: 'Checkpoint Approved',  sub: 'by client',           triggers: ['MilestoneApproved'] },
    { id: 'validator',        label: 'Validator Detects',    sub: 'CheckpointApproved',  triggers: ['MilestoneApproved'] },
    { id: 'partial-payment',  label: 'Partial Payment',      sub: '25% released',        triggers: ['FundsReleased'] },
    { id: 'repeats',          label: '↺ Repeats',            sub: 'each checkpoint',     triggers: [] },
    { id: 'complete',         label: 'Milestone Complete',   sub: 'all weights filled',  triggers: ['EscrowCompleted'] },
  ],
}

interface ActiveStep {
  activeAt: number
  blockNumber?: string
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// ── Single step node ──────────────────────────────────────────────────────────
function StepNode({
  step,
  active,
  pulsing,
}: {
  step: StepDef
  active: ActiveStep | undefined
  pulsing: boolean
}) {
  const isActive = !!active
  return (
    <div className="flex flex-col items-center" style={{ minWidth: 88 }}>
      <div
        className="relative rounded-xl px-3 py-2 text-center transition-all duration-500 w-full"
        style={
          isActive
            ? {
                backgroundColor: 'rgba(34,197,94,0.12)',
                border: '1px solid rgba(34,197,94,0.5)',
                boxShadow: pulsing ? '0 0 14px rgba(34,197,94,0.35)' : undefined,
              }
            : {
                backgroundColor: '#141414',
                border: '1px solid #252525',
              }
        }
      >
        {/* Ping dot on active pulsing step */}
        {pulsing && (
          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-green-400 animate-ping" />
        )}

        <p
          className="text-xs font-semibold leading-tight"
          style={{ color: isActive ? '#4ade80' : '#4b5563' }}
        >
          {step.label}
        </p>
        <p
          className="text-[10px] mt-0.5 leading-tight"
          style={{ color: isActive ? '#16a34a' : '#374151' }}
        >
          {step.sub}
        </p>
        {active && (
          <p className="text-[10px] font-mono mt-0.5" style={{ color: '#166534' }}>
            {fmtTime(active.activeAt)}
          </p>
        )}
        {active?.blockNumber && (
          <p className="text-[10px] font-mono" style={{ color: '#14532d' }}>
            #{active.blockNumber}
          </p>
        )}
      </div>
    </div>
  )
}

function Arrow({ lit }: { lit: boolean }) {
  return (
    <span
      className="flex-shrink-0 text-sm transition-colors duration-500 px-1 self-center mt-[-4px]"
      style={{ color: lit ? '#22c55e' : '#1f2937' }}
    >
      →
    </span>
  )
}

// ── Pipeline tab button ───────────────────────────────────────────────────────
function PipelineTab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-2.5 py-1 rounded transition-colors"
      style={
        active
          ? { color: '#ff8c24', backgroundColor: 'rgba(255,107,0,0.1)', border: '1px solid rgba(255,107,0,0.2)' }
          : { color: '#6b7280', backgroundColor: 'transparent', border: '1px solid #252525' }
      }
    >
      {label}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  escrowId: string
}

export default function ReactivityVisualizer({ escrowId }: Props) {
  const { events } = useReactivity()
  const [pipeline, setPipeline] = useState<PipelineType>('standard')
  const [activeSteps, setActiveSteps] = useState<Record<string, ActiveStep>>({})
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)

  // Recompute active steps whenever events or pipeline changes
  useEffect(() => {
    const myEvents = events.filter(e => e.escrowId === escrowId)

    if (myEvents.length === 0) {
      setActiveSteps({})
      setElapsedMs(null)
      return
    }

    const steps = PIPELINES[pipeline]
    const newActive: Record<string, ActiveStep> = {}

    for (const ev of myEvents) {
      for (const step of steps) {
        if (step.triggers.includes(ev.type)) {
          // Only store the earliest activation
          if (!newActive[step.id] || ev.timestamp < newActive[step.id].activeAt) {
            newActive[step.id] = { activeAt: ev.timestamp, blockNumber: ev.blockNumber }
          }
        }
      }
    }

    setActiveSteps(newActive)

    const times = Object.values(newActive).map(v => v.activeAt)
    if (times.length >= 2) {
      setElapsedMs(Math.max(...times) - Math.min(...times))
    } else if (times.length === 1) {
      setElapsedMs(0)
    } else {
      setElapsedMs(null)
    }
  }, [events, escrowId, pipeline])

  const steps = PIPELINES[pipeline]
  const activeCount = Object.keys(activeSteps).length
  const hasActivity = activeCount > 0

  // The most recently activated step gets the pulse animation
  const lastStepId = Object.entries(activeSteps).reduce<string | null>((best, [id, v]) => {
    if (!best) return id
    const bestTime = activeSteps[best]?.activeAt ?? 0
    return v.activeAt > bestTime ? id : best
  }, null)

  const handleReset = () => {
    setActiveSteps({})
    setElapsedMs(null)
  }

  const switchPipeline = (p: PipelineType) => {
    setPipeline(p)
    setActiveSteps({})
    setElapsedMs(null)
  }

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: '#0d0d0d', border: '1px solid #1c1c1c' }}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-bold text-white">⚡ Reactive Chain Visualizer</h3>
          <p className="text-xs text-gray-600 mt-0.5">
            Steps light up as Somnia Reactivity executes — Escrow #{escrowId}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex gap-1">
            <PipelineTab label="Standard"   active={pipeline === 'standard'}   onClick={() => switchPipeline('standard')} />
            <PipelineTab label="Delivery"   active={pipeline === 'delivery'}   onClick={() => switchPipeline('delivery')} />
            <PipelineTab label="Checkpoint" active={pipeline === 'checkpoint'} onClick={() => switchPipeline('checkpoint')} />
          </div>
          {hasActivity && (
            <button
              onClick={handleReset}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Elapsed time — the headline stat */}
      {elapsedMs !== null && (
        <div className="text-center mb-5">
          <p className="text-3xl font-bold text-green-400 tabular-nums">
            {elapsedMs === 0 ? '0 ms' : `${elapsedMs} ms`}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            total elapsed · all steps executed in the same block
          </p>
        </div>
      )}

      {/* Pipeline — horizontally scrollable */}
      <div className="overflow-x-auto pb-1">
        <div className="flex items-start gap-0 min-w-max mx-auto py-2">
          {steps.map((step, i) => {
            const active = activeSteps[step.id]
            const prevActive = i === 0 ? true : !!activeSteps[steps[i - 1].id]
            const arrowLit = prevActive && !!active

            return (
              <div key={step.id} className="flex items-center">
                {i > 0 && <Arrow lit={arrowLit} />}
                <StepNode
                  step={step}
                  active={active}
                  pulsing={lastStepId === step.id && !!active}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Status line */}
      <div className="flex items-center justify-between mt-3">
        <p className="text-xs" style={{ color: '#374151' }}>
          {hasActivity
            ? `${activeCount} / ${steps.length} steps completed`
            : `Waiting for reactive events on Escrow #${escrowId}…`}
        </p>
        {hasActivity && (
          <div className="flex gap-3 text-[11px]">
            <span className="flex items-center gap-1" style={{ color: '#374151' }}>
              <span className="h-2 w-2 rounded-sm inline-block" style={{ backgroundColor: '#141414', border: '1px solid #252525' }} />
              Dormant
            </span>
            <span className="flex items-center gap-1" style={{ color: '#16a34a' }}>
              <span className="h-2 w-2 rounded-sm inline-block" style={{ backgroundColor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.5)' }} />
              Active
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
