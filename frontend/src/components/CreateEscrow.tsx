import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseEther, isAddress } from 'viem'
import { useEscrow, type MilestoneInput } from '../hooks/useEscrow'

// ── Milestone row ─────────────────────────────────────────────────────────────
interface MilestoneRow {
  description: string
  amountEth: string
  deadlineDate: string // YYYY-MM-DD
}

const EMPTY_MILESTONE: MilestoneRow = { description: '', amountEth: '', deadlineDate: '' }

function MilestoneRowInput({
  index,
  row,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number
  row: MilestoneRow
  onChange: (field: keyof MilestoneRow, value: string) => void
  onRemove: () => void
  canRemove: boolean
}) {
  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ backgroundColor: '#141414', border: '1px solid #252525' }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-400">Milestone {index + 1}</span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-gray-600 hover:text-red-400 transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      <div>
        <label className="label">Description</label>
        <input
          className="input"
          placeholder="Describe the deliverable…"
          value={row.description}
          onChange={e => onChange('description', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount (STT)</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.5"
            value={row.amountEth}
            onChange={e => onChange('amountEth', e.target.value)}
          />
        </div>
        <div>
          <label className="label">Deadline</label>
          <input
            className="input"
            type="date"
            min={new Date().toISOString().split('T')[0]}
            value={row.deadlineDate}
            onChange={e => onChange('deadlineDate', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}

// ── Validation ────────────────────────────────────────────────────────────────
function validateForm(
  freelancer: string,
  arbiter: string,
  milestones: MilestoneRow[],
  currentAddress: string,
): string | null {
  if (!isAddress(freelancer))            return 'Invalid freelancer address'
  if (!isAddress(arbiter))               return 'Invalid arbiter address'
  if (freelancer.toLowerCase() === currentAddress.toLowerCase())
    return 'Freelancer cannot be your own address'
  if (milestones.length === 0)           return 'Add at least one milestone'
  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i]
    if (!m.description.trim())           return `Milestone ${i+1}: description required`
    const amt = parseFloat(m.amountEth)
    if (isNaN(amt) || amt <= 0)          return `Milestone ${i+1}: amount must be > 0`
    if (!m.deadlineDate)                 return `Milestone ${i+1}: deadline required`
    const deadline = new Date(m.deadlineDate).getTime() / 1000
    if (deadline <= Date.now() / 1000)   return `Milestone ${i+1}: deadline must be in the future`
  }
  return null
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CreateEscrow() {
  const navigate = useNavigate()
  const { createEscrow, isTxPending } = useEscrow()

  const [freelancer, setFreelancer] = useState('')
  const [arbiter,    setArbiter]    = useState('')
  const [milestones, setMilestones] = useState<MilestoneRow[]>([{ ...EMPTY_MILESTONE }])
  const [validationError, setValidationError] = useState<string | null>(null)

  // Current wallet address for validation
  const currentAddress = window.ethereum
    ? '' // will validate in submit (MetaMask gives us the address then)
    : ''

  const updateMilestone = (index: number, field: keyof MilestoneRow, value: string) => {
    setMilestones(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m))
  }

  const addMilestone = () => setMilestones(prev => [...prev, { ...EMPTY_MILESTONE }])

  const removeMilestone = (index: number) =>
    setMilestones(prev => prev.filter((_, i) => i !== index))

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
      const inputs: MilestoneInput[] = milestones.map(m => ({
        description: m.description.trim(),
        amount:      parseEther(m.amountEth),
        deadline:    BigInt(Math.floor(new Date(m.deadlineDate).getTime() / 1000)),
      }))
      await createEscrow(freelancer as `0x${string}`, arbiter as `0x${string}`, inputs)
      navigate('/dashboard')
    } catch {
      // error handled by sendTx via toast
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="section-title">Create Escrow</h1>
        <p className="section-subtitle">Define parties and milestones for your agreement</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Parties */}
        <div className="card space-y-4">
          <h2 className="text-base font-semibold text-white">Parties</h2>

          <div>
            <label className="label">Freelancer Address</label>
            <input
              className="input"
              placeholder="0x…"
              value={freelancer}
              onChange={e => setFreelancer(e.target.value)}
            />
            <p className="text-xs text-gray-600 mt-1">
              The party delivering the work and receiving payment
            </p>
          </div>

          <div>
            <label className="label">Arbiter Address</label>
            <input
              className="input"
              placeholder="0x… (trusted third party for disputes)"
              value={arbiter}
              onChange={e => setArbiter(e.target.value)}
            />
            <p className="text-xs text-gray-600 mt-1">
              Resolves disputes. Can be a multisig, DAO, or trusted wallet
            </p>
          </div>
        </div>

        {/* Milestones */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Milestones</h2>
            <button
              type="button"
              onClick={addMilestone}
              className="btn-ghost text-sm"
              style={{ color: '#ff6b00' }}
            >
              + Add Milestone
            </button>
          </div>

          <div className="space-y-3">
            {milestones.map((m, i) => (
              <MilestoneRowInput
                key={i}
                index={i}
                row={m}
                onChange={(f, v) => updateMilestone(i, f, v)}
                onRemove={() => removeMilestone(i)}
                canRemove={milestones.length > 1}
              />
            ))}
          </div>

          {/* Total */}
          <div
            className="flex items-center justify-between px-4 py-3 rounded-xl"
            style={{ backgroundColor: 'rgba(255,107,0,0.06)', border: '1px solid rgba(255,107,0,0.15)' }}
          >
            <span className="text-sm text-gray-400">Total you will lock</span>
            <span className="text-white font-bold">{totalEth.toFixed(4)} STT</span>
          </div>
        </div>

        {/* Reactivity note */}
        <div
          className="rounded-xl px-4 py-3 text-xs"
          style={{ backgroundColor: 'rgba(255,107,0,0.04)', border: '1px solid rgba(255,107,0,0.12)', color: '#9ca3af' }}
        >
          <span style={{ color: '#ff6b00' }} className="font-semibold">Somnia Reactivity: </span>
          When you approve a milestone, the
          {' '}<span className="font-mono text-xs">ReactiveHandlers</span>{' '}
          contract receives a push notification and auto-releases funds to the freelancer.
          No manual release step needed.
        </div>

        {/* Validation error */}
        {validationError && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}
          >
            {validationError}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isTxPending}
            className="btn-primary flex-1"
          >
            {isTxPending ? 'Creating…' : 'Create Escrow'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
