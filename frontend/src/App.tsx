import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './components/EscrowDashboard'
import CreateEscrow from './components/CreateEscrow'
import EscrowDetail from './components/EscrowDetail'
import Layout from './components/Layout'
import WalletConnect from './components/WalletConnect'
import { WalletProvider } from './hooks/useWallet'
import { ReactivityProvider } from './hooks/useReactivity'

export default function App() {
  return (
    <WalletProvider>
      <ReactivityProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/create" element={<CreateEscrow />} />
            <Route path="/escrow/:id" element={<EscrowDetail />} />
            <Route path="/connect" element={<WalletConnect />} />
          </Routes>
        </Layout>
      </ReactivityProvider>
    </WalletProvider>
  )
}
