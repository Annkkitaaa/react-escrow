import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseEther, isAddress, keccak256, toHex } from 'viem'
import { useEscrow, type MilestoneInput, type PrivateMilestoneInput } from '../hooks/useEscrow'
import { useWallet } from '../hooks/useWallet'
import { buildCommitment, saveCommitment } from '../lib/commitment'

type EscrowMode = 'standard' | 'private' | 'delivery'

interface MilestoneRow {
  description: string
  amountEth: string
  deadlineDate: string
  deliverableSpec?: string // only used in delivery mode
}

const EMPTY_MILESTONE: MilestoneRow = { description: '', amountEth: '', deadlineDate: '', deliverableSpec: '' }

function MilestoneRowInput({
  index, row, onChange, onRemove, canRemove, mode,
}: {
  index: number
  row: MilestoneRow
  onChange: (field: keyof MilestoneRow, value: string) => void
  onRemove: () => void
  canRemove: boolean
  mode: EscrowMode
}) {
  return (
    <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#141414', border: '1px solid #252525' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-400">Milestone {index + 1}</span>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-gray-600 hover:text-red-400 transition-colors">Remove</button>
        )}
      </div>

      <div>
        <label className="label" htmlFor={`milestone-${index}-description`}>Description</label>
        <input id={`milestone-${index}-description`} className="input" placeholder="Describe the deliverable…" value={row.description} onChange={e => onChange('description', e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`milestone-${index}-amount`}>{mode === 'private' ? 'Amount (hidden)' : 'Amount (STT)'}</label>
          <input id={`milestone-${index}-amount`} className="input" type="number" min="0" step="0.01" placeholder="0.5" value={row.amountEth} onChange={e => onChange('amountEth', e.target.value)} />
          {mode === 'private' && <p className="text-xs text-gray-600 mt-1">Amount is hidden on-chain via commit-reveal</p>}
        </div>
        <div>
          <label className="label" htmlFor={`milestone-${index}-deadline`}>Deadline</label>
          <input id={`milestone-${index}-deadline`} className="input" type="date" value={row.deadlineDate} onChange={e => onChange('deadlineDate', e.target.value)} />
        </div>
      </div>

      {mode === 'delivery' && (
        <div>
          <label className="label" htmlFor={`milestone-${index}-spec`}>Deliverable Spec (keccak256 hash or plain text)</label>
          <input id={`milestone-${index}-spec`} className="input font-mono text-xs" placeholder="e.g. Requirements Doc v1.0 — will be hashed" value={row.deliverableSpec || ''} onChange={e => onChange('deliverableSpec', e.target.value)} />
          <p className="text-xs text-gray-600 mt-1">Freelancer must submit matching hash. Plain text will be keccak256-hashed.</p>
        </div>
      )}
    </div>
  )
}

function validateForm(freelancer: string, arbiter: string, milestones: MilestoneRow[], currentAddress: string): string | null {
  if (!isAddress(freelancer)) return 'Invalid freelancer address'
  if (!isAddress(arbiter)) return 'Invalid arbiter address'
  if (currentAddress && freelancer.toLowerCase() === currentAddress.toLowerCase()) return 'Freelancer cannot be your own address'
  if (currentAddress && arbiter.toLowerCase() === currentAddress.toLowerCase()) return 'Arbiter cannot be your own address'
  if (arbiter.toLowerCase() === freelancer.toLowerCase()) return 'Arbiter cannot be the same as the freelancer'
  if (milestones.length === 0) return 'Add at least one milestone'
  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i]
    if (!m.description.trim()) return `Milestone ${i+1}: description required`
    const amt = parseFloat(m.amountEth)
    if (isNaN(amt) || amt <= 0) return `Milestone ${i+1}: amount must be > 0`
    if (!m.deadlineDate) return `Milestone ${i+1}: deadline required`
    const deadline = new Date(m.deadlineDate).getTime() / 1000
    if (deadline <= Date.now() / 1000) return `Milestone ${i+1}: deadline must be in the future`
  }
  return null
}

export default function CreateEscrow() {
  const navigate = useNavigate()
  const { createEscrow, createPrivateEscrow, createEscrowWithDelivery, isTxPending } = useEscrow()
  const { address } = useWallet()
  const currentAddress = address ?? ''

  const [mode, setMode] = useState<EscrowMode>('standard')
  const [freelancer, setFreelancer] = useState('')
  const [arbiter, setArbiter] = useState('')
  const [milestones, setMilestones] = useState<MilestoneRow[]>([{ ...EMPTY_MILESTONE }])
  const [challengeHours, setChallengeHours] = useState('48')
  const [validationError, setValidationError] = useState<string | null>(null)

  const updateMilestone = (index: number, field: keyof MilestoneRow, value: string) => {
    setMilestones(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m))
  }
  const addMilestone = () => setMilestones(prev => [...prev, { ...EMPTY_MILESTONE }])
  const removeMilestone = (index: number) => setMilestones(prev => prev.filter((_, i) => i !== index))

  const totalEth = milestones.reduce((sum, m) => {
    const v = parseFloat(m.amountEth)
    return sum + (isNaN(v) ? 0 : v)
  }, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validateForm(freelancer, arbiter, milestones, currentAddress)
    if (err) { setValidationError(err); return }
    setValidationError(null)

    try {
      if (mode === 'standard') {
        const inputs: MilestoneInput[] = milestones.map(m => ({
          description: m.description.trim(),
          amount: parseEther(m.amountEth),
          deadline: BigInt(Math.floor(new Date(m.deadlineDate).getTime() / 1000)),
        }))
        await createEscrow(freelancer as `0x${string}`, arbiter as `0x${string}`, inputs)

      } else if (mode === 'private') {
        const commitmentInputs: PrivateMilestoneInput[] = []
        const commitmentSecrets: Array<{ amountEth: string; salt: string }> = []
        for (const m of milestones) {
          const { commitment, salt } = buildCommitment(m.amountEth)
          commitmentInputs.push({
            description: m.description.trim(),
            commitment,
            deadline: BigInt(Math.floor(new Date(m.deadlineDate).getTime() / 1000)),
          })
          commitmentSecrets.push({ amountEth: m.amountEth, salt })
        }
        const totalAmount = milestones.reduce((s, m) => s + parseEther(m.amountEth), 0n)
        const hash = await createPrivateEscrow(freelancer as `0x${string}`, arbiter as `0x${string}`, commitmentInputs, totalAmount)
        // Save secrets to localStorage (escrow ID extracted from tx after navigation)
        // We store under a temp key and move once we have the escrow ID
        localStorage.setItem('pending_commitment_secrets', JSON.stringify(commitmentSecrets))
        void hash

      } else if (mode === 'delivery') {
        const inputs: MilestoneInput[] = milestones.map(m => ({
          description: m.description.trim(),
          amount: parseEther(m.amountEth),
          deadline: BigInt(Math.floor(new Date(m.deadlineDate).getTime() / 1000)),
        }))
        // Hash plain-text specs to bytes32
        const deliverableHashes = milestones.map(m => {
          const spec = (m.deliverableSpec || '').trim()
          if (!spec) return ('0x' + '0'.repeat(64)) as `0x${string}`
          if (/^0x[0-9a-fA-F]{64}$/.test(spec)) return spec as `0x${string}`
          return keccak256(toHex(spec))
        })
        const challengePeriodSeconds = BigInt(Math.floor(parseFloat(challengeHours) * 3600))
        await createEscrowWithDelivery(freelancer as `0x${string}`, arbiter as `0x${string}`, inputs, deliverableHashes, challengePeriodSeconds)
      }

      navigate('/dashboard')
    } catch {
      // error handled by sendTx via toast
    }
  }

  // suppress unused import warning — saveCommitment is used indirectly via the pattern
  void saveCommitment

  const modeButtons: { id: EscrowMode; label: string; desc: string }[] = [
    { id: 'standard', label: 'Standard', desc: 'Public milestone amounts' },
    { id: 'private',  label: 'Private',  desc: 'Commit-reveal amounts' },
    { id: 'delivery', label: 'Delivery Proof', desc: 'Hash-verified deliverables + challenge window' },
  ]

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="section-title">Create Escrow</h1>
        <p className="section-subtitle">Define parties and milestones for your agreement</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Mode selector */}
        <div className="card space-y-3">
          <h2 className="text-base font-semibold text-white">Escrow Mode</h2>
          <div className="grid grid-cols-3 gap-2">
            {modeButtons.map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => setMode(b.id)}
                className="rounded-xl p-3 text-left transition-all"
                style={{
                  backgroundColor: mode === b.id ? 'rgba(255,107,0,0.08)' : '#141414',
                  border: mode === b.id ? '1px solid rgba(255,107,0,0.4)' : '1px solid #252525',
                }}
              >
                <p className="text-xs font-semibold" style={{ color: mode === b.id ? '#ff6b00' : '#e5e7eb' }}>{b.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{b.desc}</p>
              </button>
            ))}
          </div>
          {mode === 'private' && (
            <div className="rounded-xl px-3 py-2 text-xs" style={{ backgroundColor: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', color: '#93c5fd' }}>
              Milestone amounts are hidden on-chain using keccak256 commit-reveal. The salt is stored in your browser. When you approve, you reveal the amount and salt — the contract verifies before releasing funds.
            </div>
          )}
          {mode === 'delivery' && (
            <div className="rounded-xl px-3 py-2 text-xs" style={{ backgroundColor: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)', color: '#c4b5fd' }}>
              Freelancer must submit a matching deliverable hash. A challenge window opens — if unchallenged, funds auto-release via Reactivity. Client can raise a dispute during the window.
            </div>
          )}
        </div>

        {/* Challenge period (delivery mode only) */}
        {mode === 'delivery' && (
          <div className="card">
            <h2 className="text-base font-semibold text-white mb-3">Challenge Period</h2>
            <div className="flex items-center gap-3">
              <input
                className="input w-32"
                type="number"
                min="1"
                max="720"
                value={challengeHours}
                onChange={e => setChallengeHours(e.target.value)}
              />
              <span className="text-sm text-gray-400">hours after deliverable verified</span>
            </div>
            <p className="text-xs text-gray-600 mt-2">48h recommended. During this window the client can raise a dispute. After expiry anyone can trigger auto-release.</p>
          </div>
        )}

        {/* Parties */}
        <div className="card space-y-4">
          <h2 className="text-base font-semibold text-white">Parties</h2>
          <div>
            <label className="label" htmlFor="freelancer-address">Freelancer Address</label>
            <input id="freelancer-address" className="input" placeholder="0x…" value={freelancer} onChange={e => setFreelancer(e.target.value)} />
            <p className="text-xs text-gray-600 mt-1">The party delivering the work and receiving payment</p>
          </div>
          <div>
            <label className="label" htmlFor="arbiter-address">Arbiter Address</label>
            <input id="arbiter-address" className="input" placeholder="0x… (trusted third party for disputes)" value={arbiter} onChange={e => setArbiter(e.target.value)} />
            <p className="text-xs text-gray-600 mt-1">Resolves disputes. Can be a multisig, DAO, or trusted wallet</p>
          </div>
        </div>

        {/* Milestones */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Milestones</h2>
            <button type="button" onClick={addMilestone} className="btn-ghost text-sm" style={{ color: '#ff6b00' }}>+ Add Milestone</button>
          </div>
          <div className="space-y-3">
            {milestones.map((m, i) => (
              <MilestoneRowInput key={i} index={i} row={m} onChange={(f, v) => updateMilestone(i, f, v)} onRemove={() => removeMilestone(i)} canRemove={milestones.length > 1} mode={mode} />
            ))}
          </div>
          <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ backgroundColor: 'rgba(255,107,0,0.06)', border: '1px solid rgba(255,107,0,0.15)' }}>
            <span className="text-sm text-gray-400">Total you will lock</span>
            <span className="text-white font-bold">{totalEth.toFixed(4)} STT</span>
          </div>
        </div>

        {/* Reactivity note */}
        <div className="rounded-xl px-4 py-3 text-xs" style={{ backgroundColor: 'rgba(255,107,0,0.04)', border: '1px solid rgba(255,107,0,0.12)', color: '#9ca3af' }}>
          <span style={{ color: '#ff6b00' }} className="font-semibold">Somnia Reactivity: </span>
          When a milestone is approved, <span className="font-mono text-xs">ReactiveHandlers</span> receives a push notification and auto-releases funds — no manual release needed.
        </div>

        {validationError && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
            {validationError}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={isTxPending} className="btn-primary flex-1">
            {isTxPending ? 'Creating…' : `Create ${mode === 'private' ? 'Private ' : mode === 'delivery' ? 'Delivery ' : ''}Escrow`}
          </button>
          <button type="button" onClick={() => navigate('/dashboard')} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  )
}
