import { Navigate, useLocation } from 'react-router-dom'
import { useWallet } from '../hooks/useWallet'
import type { ReactNode } from 'react'

/**
 * Route guard — redirects to /connect if wallet is not connected
 * or is on the wrong network. Stores the intended path so we can
 * redirect back after connecting.
 */
export default function RequireWallet({ children }: { children: ReactNode }) {
  const { isConnected, isCorrectNetwork, isLoading } = useWallet()
  const location = useLocation()

  if (isLoading) return null

  if (!isConnected || !isCorrectNetwork) {
    return <Navigate to="/connect" state={{ from: location }} replace />
  }

  return <>{children}</>
}
