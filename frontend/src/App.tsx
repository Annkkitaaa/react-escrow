import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard          from './components/EscrowDashboard'
import CreateEscrow       from './components/CreateEscrow'
import EscrowDetail       from './components/EscrowDetail'
import ReputationProfile  from './components/ReputationProfile'
import Layout             from './components/Layout'
import WalletConnect      from './components/WalletConnect'
import RequireWallet      from './components/RequireWallet'
import { WalletProvider }     from './hooks/useWallet'
import { ReactivityProvider } from './hooks/useReactivity'

export default function App() {
  return (
    <WalletProvider>
      <ReactivityProvider>
        <Layout>
          <Routes>
            {/* Public */}
            <Route path="/"        element={<Navigate to="/dashboard" replace />} />
            <Route path="/connect" element={<WalletConnect />} />

            {/* Wallet-gated */}
            <Route path="/dashboard" element={
              <RequireWallet><Dashboard /></RequireWallet>
            } />
            <Route path="/create" element={
              <RequireWallet><CreateEscrow /></RequireWallet>
            } />
            <Route path="/escrow/:id" element={
              <RequireWallet><EscrowDetail /></RequireWallet>
            } />
            <Route path="/reputation" element={
              <RequireWallet><ReputationProfile /></RequireWallet>
            } />
          </Routes>
        </Layout>
      </ReactivityProvider>
    </WalletProvider>
  )
}
