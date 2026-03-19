import { useState } from 'react'

const WITHOUT_STEPS = [
  { n: 1, text: 'Client approves milestone' },
  { n: 2, text: 'Event emitted on-chain' },
  { n: 3, text: 'Keeper bot polls for event', sub: '30s – 5 min delay', warn: true },
  { n: 4, text: 'Keeper sends release transaction', sub: 'Separate tx, separate gas cost', warn: true },
  { n: 5, text: 'Freelancer waits for second confirmation', warn: true },
  { n: 6, text: '2+ transactions · $2–5 gas · minutes of delay', summary: true, bad: true },
]

const WITH_STEPS = [
  { n: 1, text: 'Client approves milestone' },
  { n: 2, text: 'Event emitted on-chain' },
  { n: 3, text: 'Validator detects event', sub: 'Same block · ~0s', good: true },
  { n: 4, text: '_onEvent() called atomically', sub: 'ReactiveHandlers.sol', good: true },
  { n: 5, text: 'Funds + NFT receipt released', sub: 'Same block as approval', good: true },
  { n: 6, text: '1 transaction · <$0.01 gas · zero delay', summary: true, good: true },
]

const COMPARISONS = [
  { label: 'Latency',        without: 'Minutes',                    with: 'Zero (same block)' },
  { label: 'Cost',           without: '$2–5 per trigger (est.)',    with: '< $0.01 per trigger (est.)' },
  { label: 'Infrastructure', without: 'Keeper bots + monitoring',   with: 'None' },
  { label: 'Trust model',    without: 'Trust the keeper operator',  with: 'Trust the validator (protocol-level)' },
]

interface Props {
  /** When true, renders as a collapsible section (for Dashboard). Default: expanded. */
  collapsible?: boolean
}

export default function ReactivityComparison({ collapsible = false }: Props) {
  const [open, setOpen] = useState(!collapsible)

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #252525' }}>
      {collapsible && (
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between px-6 py-4 text-left transition-colors"
          style={{ backgroundColor: '#141414' }}
        >
          <span className="text-sm font-semibold text-white">
            ⚡ Somnia Reactivity vs Traditional Approach
          </span>
          <span className="text-gray-500 text-xs">{open ? '▲ hide' : '▼ show'}</span>
        </button>
      )}

      {open && (
        <div
          className="p-6 space-y-6"
          style={{ backgroundColor: collapsible ? '#0d0d0d' : undefined }}
        >
          {!collapsible && (
            <div className="text-center">
              <h3 className="text-lg font-bold text-white">Somnia Reactivity vs Traditional Approach</h3>
              <p className="text-gray-500 text-sm mt-1">Why ReactEscrow couldn't exist on any other chain</p>
            </div>
          )}

          {/* Two columns */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Without column */}
            <div
              className="rounded-xl p-5 space-y-3"
              style={{ backgroundColor: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              <h4 className="text-sm font-bold text-red-400 mb-1">❌ Without Somnia Reactivity</h4>
              {WITHOUT_STEPS.map(s => (
                <div key={s.n} className="flex items-start gap-3">
                  <span className="text-xs font-mono text-gray-700 w-4 flex-shrink-0 mt-0.5">{s.n}</span>
                  <div>
                    <p
                      className={`text-sm ${
                        s.summary ? 'font-semibold text-red-400' :
                        s.warn    ? 'text-yellow-500' :
                        'text-gray-300'
                      }`}
                    >
                      {s.text}
                    </p>
                    {s.sub && <p className="text-xs text-gray-600 mt-0.5">{s.sub}</p>}
                  </div>
                </div>
              ))}
            </div>

            {/* With column */}
            <div
              className="rounded-xl p-5 space-y-3"
              style={{ backgroundColor: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.15)' }}
            >
              <h4 className="text-sm font-bold text-green-400 mb-1">✅ With Somnia Reactivity (ReactEscrow)</h4>
              {WITH_STEPS.map(s => (
                <div key={s.n} className="flex items-start gap-3">
                  <span className="text-xs font-mono text-gray-700 w-4 flex-shrink-0 mt-0.5">{s.n}</span>
                  <div>
                    <p
                      className={`text-sm ${
                        s.summary ? 'font-semibold text-green-400' :
                        s.good    ? 'text-green-300' :
                        'text-gray-300'
                      }`}
                    >
                      {s.text}
                    </p>
                    {s.sub && <p className="text-xs text-gray-500 mt-0.5">{s.sub}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Comparison table */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #252525' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#1c1c1c' }}>
                  <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs uppercase tracking-wide w-1/4">Metric</th>
                  <th className="text-left px-4 py-2 text-red-500 font-medium text-xs uppercase tracking-wide">Traditional</th>
                  <th className="text-left px-4 py-2 text-green-500 font-medium text-xs uppercase tracking-wide">ReactEscrow</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISONS.map((c, i) => (
                  <tr
                    key={c.label}
                    style={{
                      borderTop: '1px solid #1c1c1c',
                      backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    }}
                  >
                    <td className="px-4 py-2.5 text-gray-500 font-medium">{c.label}</td>
                    <td className="px-4 py-2.5 text-yellow-600">{c.without}</td>
                    <td className="px-4 py-2.5 text-green-400 font-medium">{c.with}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-center text-xs text-gray-500">
            <span className="font-semibold" style={{ color: '#ff8c24' }}>
              0 keeper bots · 0 cron jobs · 0 off-chain triggers
            </span>
            {' '}— Somnia validators enforce all callbacks at the protocol level.
          </p>
        </div>
      )}
    </div>
  )
}
