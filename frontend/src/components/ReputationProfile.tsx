import { useEffect, useState } from 'react'
import { formatEther, isAddress, type Address } from 'viem'
import { useWallet } from '../hooks/useWallet'
import { useEscrow, type ReputationData } from '../hooks/useEscrow'
import { getExplorerAddressUrl } from '../lib/somnia'

function fmt(addr: string) { return `${addr.slice(0,6)}…${addr.slice(-4)}` }

export default function ReputationProfile() {
  const { address } = useWallet()
  const { getReputation, hasReputationToken } = useEscrow()

  const [lookupAddr, setLookupAddr] = useState(address ?? '')
  const [rep, setRep] = useState<ReputationData | null>(null)
  const [hasToken, setHasToken] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lookup = async (addr: string) => {
    if (!isAddress(addr)) { setError('Invalid address'); return }
    setError(null)
    setLoading(true)
    try {
      const [r, h] = await Promise.all([getReputation(addr as Address), hasReputationToken(addr as Address)])
      setRep(r)
      setHasToken(h)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (address) {
      setLookupAddr(address)
      void lookup(address)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="section-title">Reputation Profile</h1>
        <p className="section-subtitle">On-chain reputation backed by soulbound tokens and Merkle history</p>
      </div>

      {/* Lookup */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Look up address</h2>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="0x…"
            value={lookupAddr}
            onChange={e => setLookupAddr(e.target.value)}
          />
          <button
            onClick={() => lookup(lookupAddr)}
            disabled={loading}
            className="btn-primary px-4"
          >
            {loading ? 'Loading…' : 'Look up'}
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {/* SBT badge */}
      {rep !== null && (
        <>
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <a href={getExplorerAddressUrl(lookupAddr)} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-gray-300 hover:text-white transition-colors">
                  {fmt(lookupAddr)}
                </a>
                <p className="text-xs text-gray-600 mt-0.5">
                  {address?.toLowerCase() === lookupAddr.toLowerCase() ? 'Your profile' : 'Public profile'}
                </p>
              </div>
              {hasToken ? (
                <span className="badge" style={{ color: '#34d399', backgroundColor: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
                  SBT Holder
                </span>
              ) : (
                <span className="badge" style={{ color: '#9ca3af', backgroundColor: 'rgba(156,163,175,0.06)', border: '1px solid rgba(156,163,175,0.15)' }}>
                  No SBT
                </span>
              )}
            </div>

            {hasToken ? (
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Escrows" value={rep.totalEscrows.toString()} />
                <StatCard label="Earned" value={`${parseFloat(formatEther(rep.totalAmountEarned)).toFixed(3)} STT`} />
                <StatCard label="Disputes" value={rep.disputeCount.toString()} color={rep.disputeCount > 0n ? '#f87171' : undefined} />
              </div>
            ) : (
              <p className="text-sm text-gray-500">This address has not yet completed an escrow. Reputation SBT is minted automatically on first milestone release.</p>
            )}
          </div>

          {hasToken && rep.merkleRoot !== ('0x' + '0'.repeat(64)) && (
            <div className="card space-y-3">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Merkle History Root</h2>
              <p className="font-mono text-xs text-gray-300 break-all">{rep.merkleRoot}</p>
              <p className="text-xs text-gray-600">
                This root commits to the full escrow history of this address. Third parties can verify any claim using{' '}
                <span className="font-mono">ReputationSBT.verifyReputationClaim(address, leaf, proof)</span>.
              </p>
            </div>
          )}

          {hasToken && (
            <div className="card space-y-2">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">How Reputation Works</h2>
              <div className="space-y-2 text-xs text-gray-500">
                <p><span className="text-gray-300">SBT (Soulbound Token):</span> ERC-721 token that cannot be transferred. Minted automatically when your first milestone payment is released via Somnia Reactivity.</p>
                <p><span className="text-gray-300">On-chain stats:</span> totalEscrows, totalAmountEarned, and disputeCount are updated by the ReputationHook contract on every milestone release.</p>
                <p><span className="text-gray-300">Merkle history:</span> The off-chain reactive service maintains a Merkle tree of all your escrow completions. The root is periodically committed on-chain, enabling verifiable claims without exposing full history.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ backgroundColor: '#141414', border: '1px solid #252525' }}>
      <p className="text-lg font-bold" style={{ color: color ?? '#ff6b00' }}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
