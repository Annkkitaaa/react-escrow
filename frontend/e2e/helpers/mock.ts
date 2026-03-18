/**
 * Shared test helpers — wallet mock + RPC intercept
 *
 * window.ethereum mock: injected via page.addInitScript before React mounts
 * RPC mock: intercepts POST https://dream-rpc.somnia.network/ via page.route()
 */
import { Page, Route } from '@playwright/test'
import { encodeAbiParameters, parseAbiParameters, keccak256, toBytes } from 'viem'

// ── Constants ────────────────────────────────────────────────────────────────

export const MOCK_ADDRESS    = '0x984a1dB53b989fd3977bf07EF4cae068BDE17bd4'
export const MOCK_FREELANCER = '0x1111111111111111111111111111111111111111'
export const MOCK_ARBITER    = '0x2222222222222222222222222222222222222222'

/** Somnia Testnet chain ID */
const CHAIN_ID     = 50312
/** 0xC488 = 50312 — must match CHAIN_ID_HEX in somnia.ts */
const CHAIN_ID_HEX = '0xc488'

// ── ABI encoding helpers (viem-backed) ───────────────────────────────────────

/** ABI-encode an empty uint256[] array */
export const EMPTY_UINT256_ARRAY: `0x${string}` = encodeAbiParameters(
  parseAbiParameters('uint256[]'),
  [[]]
)

/** ABI-encode a uint256[] with given values */
export function encodeUint256Array(values: bigint[]): `0x${string}` {
  return encodeAbiParameters(parseAbiParameters('uint256[]'), [values])
}

/** ABI-encode the Escrow struct returned by getEscrow(uint256) */
export function encodeEscrow(e: {
  client: `0x${string}`
  freelancer: `0x${string}`
  arbiter: `0x${string}`
  totalAmount: bigint
  status: number          // 0=Created,1=Funded,2=Active,3=Completed,4=Disputed,5=Cancelled
  currentMilestone: bigint
}): `0x${string}` {
  return encodeAbiParameters(
    parseAbiParameters('address,address,address,uint256,uint8,uint256'),
    [e.client, e.freelancer, e.arbiter, e.totalAmount, e.status, e.currentMilestone]
  )
}

/** ABI-encode a single-element MilestoneData[] */
export function encodeSingleMilestone(m: {
  description: string
  amount: bigint
  deadline: bigint
  status: number
  resolution: number
}): `0x${string}` {
  // tuple(string,uint256,uint256,uint8,uint8)[]
  return encodeAbiParameters(
    [{ type: 'tuple[]', components: [
      { name: 'description', type: 'string' },
      { name: 'amount',      type: 'uint256' },
      { name: 'deadline',    type: 'uint256' },
      { name: 'status',      type: 'uint8' },
      { name: 'resolution',  type: 'uint8' },
    ]}],
    [[{
      description: m.description,
      amount:      m.amount,
      deadline:    m.deadline,
      status:      m.status,
      resolution:  m.resolution,
    }]]
  )
}

/** ABI-encode an empty MilestoneData[] */
export const EMPTY_MILESTONE_ARRAY: `0x${string}` = encodeAbiParameters(
  [{ type: 'tuple[]', components: [
    { name: 'description', type: 'string'  },
    { name: 'amount',      type: 'uint256' },
    { name: 'deadline',    type: 'uint256' },
    { name: 'status',      type: 'uint8'   },
    { name: 'resolution',  type: 'uint8'   },
  ]}],
  [[]]
)

/** ABI-encode a uint256 */
export function encodeUint256(v: bigint): `0x${string}` {
  return encodeAbiParameters(parseAbiParameters('uint256'), [v])
}

/** ABI-encode a bool */
export function encodeBool(v: boolean): `0x${string}` {
  return encodeAbiParameters(parseAbiParameters('bool'), [v])
}

/** ABI-encode an empty tuple[] (for getCheckpoints, getDeliveryData fallback) */
export const EMPTY_BYTES = '0x' as `0x${string}`

// ── Function selectors (computed from keccak256) ─────────────────────────────

function sel(sig: string): string {
  return keccak256(toBytes(sig)).slice(0, 10)
}

const SEL: Record<string, string> = {
  getEscrowsByClient:         sel('getEscrowsByClient(address)'),
  getEscrowsByFreelancer:     sel('getEscrowsByFreelancer(address)'),
  getEscrow:                  sel('getEscrow(uint256)'),
  getMilestones:              sel('getMilestones(uint256)'),
  getDeliveryData:            sel('getDeliveryData(uint256,uint256)'),
  getChallengePeriod:         sel('getChallengePeriod(uint256)'),
  getCheckpoints:             sel('getCheckpoints(uint256,uint256)'),
  getMilestoneReleasedAmount: sel('getMilestoneReleasedAmount(uint256,uint256)'),
  reputation:                 sel('reputation(address)'),
  hasToken:                   sel('hasToken(address)'),
}

function matchSelector(calldata: string, name: string): boolean {
  return calldata.toLowerCase().startsWith(SEL[name].toLowerCase())
}

// ── RPC route handler ─────────────────────────────────────────────────────────

type RpcBody = { id: number; method: string; params?: unknown[] }

function ok(id: number, result: string): string {
  return JSON.stringify({ id, jsonrpc: '2.0', result })
}

export interface MockRpcOptions {
  clientEscrowIds?: bigint[]
  freelancerEscrowIds?: bigint[]
  escrow?: Parameters<typeof encodeEscrow>[0]
  milestones?: 'empty' | 'one'
}

/**
 * Intercept all calls to the Somnia RPC and return mock data.
 * Must be called BEFORE page.goto().
 */
export async function mockRpc(page: Page, opts: MockRpcOptions = {}) {
  const {
    clientEscrowIds = [],
    freelancerEscrowIds = [],
    milestones = 'empty',
  } = opts

  await page.route('**/dream-rpc.somnia.network/**', async (route: Route) => {
    const body = route.request().postDataJSON() as RpcBody
    const id = body.id ?? 1

    switch (body.method) {
      case 'eth_chainId':
        return route.fulfill({ contentType: 'application/json', body: ok(id, CHAIN_ID_HEX) })

      case 'net_version':
        return route.fulfill({ contentType: 'application/json', body: ok(id, String(CHAIN_ID)) })

      case 'eth_blockNumber':
        return route.fulfill({ contentType: 'application/json', body: ok(id, '0x13f9f337') })

      case 'eth_getBalance':
        return route.fulfill({ contentType: 'application/json', body: ok(id, '0x1bc16d674ec80000') })

      case 'eth_getTransactionCount':
        return route.fulfill({ contentType: 'application/json', body: ok(id, '0x1') })

      case 'eth_estimateGas':
        return route.fulfill({ contentType: 'application/json', body: ok(id, '0x186a0') })

      case 'eth_gasPrice':
        return route.fulfill({ contentType: 'application/json', body: ok(id, '0x77359400') })

      case 'eth_call': {
        const calldata = ((body.params as Array<{ data?: string }>)?.[0]?.data ?? '') as string

        if (matchSelector(calldata, 'getEscrowsByClient'))
          return route.fulfill({ contentType: 'application/json',
            body: ok(id, clientEscrowIds.length ? encodeUint256Array(clientEscrowIds) : EMPTY_UINT256_ARRAY) })

        if (matchSelector(calldata, 'getEscrowsByFreelancer'))
          return route.fulfill({ contentType: 'application/json',
            body: ok(id, freelancerEscrowIds.length ? encodeUint256Array(freelancerEscrowIds) : EMPTY_UINT256_ARRAY) })

        if (matchSelector(calldata, 'getEscrow') && opts.escrow)
          return route.fulfill({ contentType: 'application/json', body: ok(id, encodeEscrow(opts.escrow)) })

        if (matchSelector(calldata, 'getMilestones'))
          return route.fulfill({ contentType: 'application/json', body: ok(id,
            milestones === 'one'
              ? encodeSingleMilestone({
                  description: 'Design mockups',
                  amount: 500000000000000000n,
                  deadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 7),
                  status: 1, resolution: 0,
                })
              : EMPTY_MILESTONE_ARRAY) })

        if (matchSelector(calldata, 'getChallengePeriod'))
          return route.fulfill({ contentType: 'application/json', body: ok(id, encodeUint256(172800n)) })

        if (matchSelector(calldata, 'getMilestoneReleasedAmount'))
          return route.fulfill({ contentType: 'application/json', body: ok(id, encodeUint256(0n)) })

        if (matchSelector(calldata, 'hasToken'))
          return route.fulfill({ contentType: 'application/json', body: ok(id, encodeBool(false)) })

        if (matchSelector(calldata, 'reputation'))
          return route.fulfill({ contentType: 'application/json', body: ok(id, '0x' + '00'.repeat(160)) })

        if (matchSelector(calldata, 'getCheckpoints') || matchSelector(calldata, 'getDeliveryData'))
          return route.fulfill({ contentType: 'application/json', body: ok(id, EMPTY_UINT256_ARRAY) })

        // Unknown call — return empty bytes (best-effort, won't crash)
        return route.fulfill({ contentType: 'application/json', body: ok(id, '0x') })
      }

      default:
        return route.continue()
    }
  })
}

// ── window.ethereum mock ──────────────────────────────────────────────────────

/**
 * Inject a fake MetaMask into the page before it loads.
 * connected: true  → auto-detect wallet, correct network
 * connected: false → wallet present but no accounts
 * wrongNetwork: true → connected but wrong chain
 */
export async function injectMockWallet(page: Page, opts: {
  connected?: boolean
  wrongNetwork?: boolean
  autoApprove?: boolean
} = {}) {
  const { connected = true, wrongNetwork = false, autoApprove = true } = opts

  const address = connected ? MOCK_ADDRESS : null
  const chainId = wrongNetwork ? '0x1' : CHAIN_ID_HEX

  await page.addInitScript(({ addr, connectAddr, cid, conn, aa }: {
    addr: string | null; connectAddr: string; cid: string; conn: boolean; aa: boolean
  }) => {
    const listeners: Record<string, Array<(d: unknown) => void>> = {}

    const eth = {
      isMetaMask: true,
      selectedAddress: addr,
      chainId: cid,

      request: async ({ method }: { method: string; params?: unknown[] }): Promise<unknown> => {
        switch (method) {
          case 'eth_accounts':
            return conn ? [eth.selectedAddress] : []
          case 'eth_requestAccounts':
            if (!aa) throw Object.assign(new Error('User rejected'), { code: 4001 })
            // Always connect with the mock address (whether or not initially connected)
            eth.selectedAddress = connectAddr
            if (!conn) {
              ;(listeners['accountsChanged'] ?? []).forEach(fn => fn([connectAddr]))
            }
            return [connectAddr]
          case 'eth_chainId':
            return cid
          case 'net_version':
            return String(parseInt(cid, 16))
          case 'wallet_switchEthereumChain':
            eth.chainId = '0xc488'
            ;(listeners['chainChanged'] ?? []).forEach(fn => fn('0xc488'))
            return null
          case 'wallet_addEthereumChain':
            eth.chainId = '0xc488'
            ;(listeners['chainChanged'] ?? []).forEach(fn => fn('0xc488'))
            return null
          default:
            return null
        }
      },
      on:             (event: string, fn: (d: unknown) => void) => {
        listeners[event] = listeners[event] ?? []
        listeners[event].push(fn)
      },
      removeListener: (event: string, fn: (d: unknown) => void) => {
        listeners[event] = (listeners[event] ?? []).filter(f => f !== fn)
      },
    }

    ;(window as unknown as Record<string, unknown>).__mockEth = eth
    Object.defineProperty(window, 'ethereum', { value: eth, writable: true })
  }, { addr: address, connectAddr: MOCK_ADDRESS, cid: chainId, conn: connected, aa: autoApprove })
}
