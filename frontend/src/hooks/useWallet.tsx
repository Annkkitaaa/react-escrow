import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { ADD_NETWORK_PARAMS, CHAIN_ID } from '../lib/somnia'

// ============================================================
// Wallet Context — MetaMask + Somnia Testnet
// Full implementation in Phase 6
// ============================================================

interface WalletContextType {
  address: string | null
  isConnected: boolean
  isCorrectNetwork: boolean
  isConnecting: boolean
  connect: () => Promise<void>
  disconnect: () => void
  switchToSomnia: () => Promise<void>
}

const WalletContext = createContext<WalletContextType | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [chainId, setChainId] = useState<number | null>(null)

  const isCorrectNetwork = chainId === CHAIN_ID

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert('MetaMask not found. Please install MetaMask.')
      return
    }
    setIsConnecting(true)
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      setAddress(accounts[0] ?? null)
      const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' }) as string
      setChainId(parseInt(chainIdHex, 16))
    } catch (err) {
      console.error('Connect error:', err)
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setAddress(null)
  }, [])

  const switchToSomnia = useCallback(async () => {
    if (!window.ethereum) return
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ADD_NETWORK_PARAMS.chainId }],
      })
    } catch (err: unknown) {
      // Error code 4902 = chain not added yet
      if ((err as { code?: number }).code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [ADD_NETWORK_PARAMS],
        })
      }
    }
  }, [])

  // Listen for account/chain changes
  useEffect(() => {
    if (!window.ethereum) return
    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[]
      setAddress(accs[0] ?? null)
    }
    const handleChainChanged = (chainIdHex: unknown) => {
      setChainId(parseInt(chainIdHex as string, 16))
    }
    window.ethereum.on('accountsChanged', handleAccountsChanged)
    window.ethereum.on('chainChanged', handleChainChanged)
    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged)
      window.ethereum?.removeListener('chainChanged', handleChainChanged)
    }
  }, [])

  // Check if already connected on mount
  useEffect(() => {
    if (!window.ethereum) return
    ;(async () => {
      const accounts = await window.ethereum!.request({ method: 'eth_accounts' }) as string[]
      if (accounts.length > 0) {
        setAddress(accounts[0])
        const chainIdHex = await window.ethereum!.request({ method: 'eth_chainId' }) as string
        setChainId(parseInt(chainIdHex, 16))
      }
    })()
  }, [])

  return (
    <WalletContext.Provider value={{
      address,
      isConnected: !!address,
      isCorrectNetwork,
      isConnecting,
      connect,
      disconnect,
      switchToSomnia,
    }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet(): WalletContextType {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within WalletProvider')
  return ctx
}

// Extend window type for MetaMask
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      on: (event: string, handler: (data: unknown) => void) => void
      removeListener: (event: string, handler: (data: unknown) => void) => void
    }
  }
}
