import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '../hooks/useWallet'
import { useReactivity } from '../hooks/useReactivity'
import { clsx } from 'clsx'

// ============================================================
// App Layout — Navbar + main content wrapper
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
    { to: '/create', label: 'Create Escrow' },
  ]

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Navbar */}
      <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/dashboard" className="flex items-center gap-2">
              <span className="text-xl font-bold text-white">
                React<span className="text-somnia-400">Escrow</span>
              </span>
              <span className="text-xs text-gray-500 border border-gray-700 rounded px-1.5 py-0.5">
                Somnia Testnet
              </span>
            </Link>

            {/* Nav links */}
            <div className="hidden md:flex items-center gap-6">
              {navLinks.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={clsx(
                    'text-sm font-medium transition-colors',
                    location.pathname === link.to
                      ? 'text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Right side: Reactivity indicator + wallet */}
            <div className="flex items-center gap-3">
              {/* Somnia Reactivity live indicator */}
              <div className="flex items-center gap-1.5 text-xs">
                <span
                  className={clsx(
                    'h-2 w-2 rounded-full',
                    reactivityConnected
                      ? 'bg-green-400 animate-pulse'
                      : 'bg-red-500'
                  )}
                />
                <span className={reactivityConnected ? 'text-green-400' : 'text-red-400'}>
                  {reactivityConnected ? 'LIVE' : 'OFFLINE'}
                </span>
              </div>

              {isConnected ? (
                <div className="flex items-center gap-2">
                  {!isCorrectNetwork && (
                    <button
                      onClick={switchToSomnia}
                      className="text-xs text-yellow-400 border border-yellow-700 rounded px-2 py-1 hover:bg-yellow-900/30"
                    >
                      Switch to Somnia
                    </button>
                  )}
                  <button
                    onClick={disconnect}
                    className="text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg px-3 py-1.5"
                  >
                    {address?.slice(0, 6)}...{address?.slice(-4)}
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

      {/* Main */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-4 text-center text-xs text-gray-600">
        ReactEscrow · Built on Somnia Testnet · Powered by Somnia Reactivity
      </footer>
    </div>
  )
}
