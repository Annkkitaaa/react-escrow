import { Navigate } from 'react-router-dom'
import { useWallet } from '../hooks/useWallet'
import ReactivityComparison from './ReactivityComparison'

// ── Inline icons (no extra deps) ──────────────────────────────────────────────
function MetaMaskIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 212 189" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M200.9 0L119.8 59.6l14.7-34.9L200.9 0z" fill="#E2761B"/>
      <path d="M10.9 0l80.4 60.2L76.8 24.7 10.9 0z" fill="#E4761B"/>
      <path d="M172.4 136.7l-21.6 33.1 46.3 12.7 13.3-45.2-38-0.6z" fill="#E4761B"/>
      <path d="M1.4 137.3l13.2 45.2 46.2-12.7-21.5-33.1-37.9 0.6z" fill="#E4761B"/>
      <path d="M58.1 81.7L45.3 101l45.8 2-1.6-49.3-31.4 28z" fill="#E4761B"/>
      <path d="M153.7 81.7l-31.9-28.5-1 49.8 45.6-2-12.7-19.3z" fill="#E4761B"/>
      <path d="M60.8 169.8l27.4-13.3-23.6-18.4-3.8 31.7z" fill="#E4761B"/>
      <path d="M123.6 156.5l27.5 13.3-3.9-31.7-23.6 18.4z" fill="#E4761B"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

const KEY_STATS = [
  { value: '168+',  label: 'Tests Passing' },
  { value: '5',     label: 'Reactive Event Types' },
  { value: '6',     label: 'Deployed Contracts' },
  { value: '0',     label: 'Off-Chain Infrastructure Required' },
]

export default function WalletConnect() {
  const { isConnected, isConnecting, isCorrectNetwork, connect, switchToSomnia } = useWallet()

  if (isConnected && isCorrectNetwork) return <Navigate to="/dashboard" replace />

  const noMetaMask = typeof window !== 'undefined' && !window.ethereum

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 gap-12">

      {/* ── Hero section ── */}
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-10 items-center">

        {/* ── Left: hero copy ── */}
        <div className="space-y-6">
          <div
            className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ color: '#ff6b00', backgroundColor: 'rgba(255,107,0,0.1)', border: '1px solid rgba(255,107,0,0.2)' }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
            Somnia Reactivity Mini Hackathon
          </div>

          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight tracking-tight">
              ReactEscrow
            </h1>
            <p className="text-xl font-semibold mt-2" style={{ color: '#ff8c24' }}>
              Trustless Milestone Payments<br />Powered by Somnia Reactivity
            </p>
            <p className="text-gray-500 text-sm mt-3 leading-relaxed">
              No keeper bots. No polling. No manual releases.<br />
              Funds move the instant conditions are met.
            </p>
          </div>

          {/* Key stats */}
          <div className="grid grid-cols-2 gap-3">
            {KEY_STATS.map(s => (
              <div
                key={s.label}
                className="rounded-xl px-4 py-3"
                style={{ backgroundColor: '#141414', border: '1px solid #252525' }}
              >
                <p className="text-xl font-bold text-white tabular-nums">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span
              className="px-2.5 py-1 rounded-full font-medium"
              style={{ backgroundColor: 'rgba(255,107,0,0.08)', color: '#ff8c24', border: '1px solid rgba(255,107,0,0.15)' }}
            >
              Somnia Testnet
            </span>
            Chain ID: 50312 · STT
          </div>
        </div>

        {/* ── Right: connect card ── */}
        <div
          className="rounded-2xl p-8"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)' }}
        >
          {/* Card header */}
          <div className="flex items-center gap-3 mb-6">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #ff6b00, #e55e00)' }}
            >RE</div>
            <div>
              <p className="text-white font-semibold text-sm">ReactEscrow</p>
              <p className="text-xs text-gray-500">Connect to get started</p>
            </div>
          </div>

          {/* ── No MetaMask ── */}
          {noMetaMask && (
            <div className="space-y-4">
              <div
                className="rounded-xl p-4 text-sm"
                style={{ backgroundColor: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}
              >
                MetaMask not detected. Install the browser extension to continue.
              </div>
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full justify-center"
              >
                Install MetaMask
              </a>
            </div>
          )}

          {/* ── Wrong network ── */}
          {!noMetaMask && isConnected && !isCorrectNetwork && (
            <div className="space-y-4">
              <div
                className="rounded-xl p-4 text-sm"
                style={{ backgroundColor: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}
              >
                Wrong network. Switch to Somnia Testnet to continue.
              </div>
              <button onClick={switchToSomnia} className="btn-primary w-full">
                Switch to Somnia Testnet
              </button>
              <p className="text-center text-xs text-gray-600">
                This will add Somnia Testnet to MetaMask if not already present
              </p>
            </div>
          )}

          {/* ── Not connected ── */}
          {!noMetaMask && !isConnected && (
            <div className="space-y-5">
              <button
                onClick={connect}
                disabled={isConnecting}
                className="btn-primary w-full h-12 text-base gap-3"
              >
                <MetaMaskIcon />
                {isConnecting ? 'Connecting…' : 'Connect MetaMask'}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ backgroundColor: '#252525' }} />
                <span className="text-xs text-gray-600">what you can do</span>
                <div className="flex-1 h-px" style={{ backgroundColor: '#252525' }} />
              </div>

              <ul className="space-y-2.5 text-sm text-gray-400">
                {[
                  'Create milestone-based escrow agreements',
                  'Fund, approve, and release payments',
                  'Raise & resolve disputes with arbiter',
                  'Watch live events via Somnia Reactivity',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex-shrink-0" style={{ color: '#ff6b00' }}>
                      <CheckIcon />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>

              <p className="text-center text-xs text-gray-600 pt-1">
                MetaMask only · No sign-up · Non-custodial
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Comparison section (visible before connecting) ── */}
      <div className="w-full max-w-4xl">
        <ReactivityComparison />
      </div>

    </div>
  )
}
