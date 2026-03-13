import { useWallet } from '../hooks/useWallet'
import { Navigate } from 'react-router-dom'

// ============================================================
// WalletConnect — Standalone connect page
// Full implementation in Phase 6
// ============================================================

export default function WalletConnect() {
  const { isConnected, connect, isConnecting } = useWallet()

  if (isConnected) return <Navigate to="/dashboard" replace />

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="card max-w-md w-full text-center">
        <h1 className="text-2xl font-bold mb-2">Connect Your Wallet</h1>
        <p className="text-gray-400 mb-6">Connect MetaMask to start using ReactEscrow on Somnia Testnet</p>
        <button onClick={connect} disabled={isConnecting} className="btn-primary w-full">
          {isConnecting ? 'Connecting...' : 'Connect MetaMask'}
        </button>
      </div>
    </div>
  )
}
