import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '../hooks/useWallet'
import { useReactivity } from '../hooks/useReactivity'
import { clsx } from 'clsx'

// ============================================================
// App Layout — DoraHacks orange / black / white theme
// ============================================================

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { address, isConnected, connect, disconnect, isCorrectNetwork, switchToSomnia } = useWallet()
  const { isConnected: reactivityConnected } = useReactivity()
  const location = useLocation()

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/create',    label: 'Create Escrow' },
  ]

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>

      {/* Navbar */}
      <nav
        className="sticky top-0 z-50 border-b backdrop-blur-xl"
        style={{ borderColor: '#252525', backgroundColor: 'rgba(10,10,10,0.85)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <Link to="/dashboard" className="flex items-center gap-3 group">
              {/* Orange diamond icon */}
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ background: 'linear-gradient(135deg, #ff6b00, #e55e00)' }}
              >
                RE
              </div>
              <span className="text-lg font-bold text-white tracking-tight">
                React<span style={{ color: '#ff6b00' }}>Escrow</span>
              </span>
              <span
                className="hidden sm:inline text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ color: '#ff6b00', backgroundColor: 'rgba(255,107,0,0.1)', border: '1px solid rgba(255,107,0,0.2)' }}
              >
                Somnia Testnet
              </span>
            </Link>

            {/* Nav links */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={clsx(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                    location.pathname === link.to
                      ? 'text-white bg-white/8'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Right side: Reactivity indicator + wallet */}
            <div className="flex items-center gap-3">

              {/* Somnia Reactivity live indicator */}
              <div
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={
                  reactivityConnected
                    ? { color: '#ff6b00', backgroundColor: 'rgba(255,107,0,0.1)', border: '1px solid rgba(255,107,0,0.25)' }
                    : { color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }
                }
              >
                <span
                  className={clsx('h-1.5 w-1.5 rounded-full', reactivityConnected ? 'animate-pulse' : '')}
                  style={{ backgroundColor: reactivityConnected ? '#ff6b00' : '#ef4444' }}
                />
                {reactivityConnected ? 'LIVE' : 'OFFLINE'}
              </div>

              {isConnected ? (
                <div className="flex items-center gap-2">
                  {!isCorrectNetwork && (
                    <button
                      onClick={switchToSomnia}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                      style={{ color: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)' }}
                    >
                      Switch to Somnia
                    </button>
                  )}
                  <button
                    onClick={disconnect}
                    className="text-xs px-3 py-1.5 rounded-xl font-mono font-medium transition-all"
                    style={{ color: '#9ca3af', backgroundColor: '#141414', border: '1px solid #252525' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = 'rgba(255,107,0,0.3)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = '#252525' }}
                  >
                    {address?.slice(0, 6)}…{address?.slice(-4)}
                  </button>
                </div>
              ) : (
                <button onClick={connect} className="btn-primary text-sm">
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer
        className="border-t py-5 text-center text-xs"
        style={{ borderColor: '#252525', color: '#3f3f3f' }}
      >
        <span className="font-semibold" style={{ color: '#ff6b00' }}>ReactEscrow</span>
        {' · '}Built on Somnia Testnet{' · '}Powered by{' '}
        <span style={{ color: '#ff6b00' }}>Somnia Reactivity</span>
      </footer>
    </div>
  )
}
