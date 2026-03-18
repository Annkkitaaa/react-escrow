// ============================================================
// ReactEscrow — Off-chain Reactive Service  (Phase 5)
//
// Connects to Somnia Testnet via WebSocket, subscribes to all
// ReactEscrow events, decodes them, and pushes structured JSON
// to any connected frontend client.
//
// Frontend connection: ws://localhost:3001
// ============================================================

import { WebSocketServer, WebSocket } from 'ws'
import { createPublicClient, webSocket as viemWebSocket, defineChain } from 'viem'
import { SDK } from '@somnia-chain/reactivity'
import { config } from './config'
import { parseReactiveEvent, type ParsedEvent } from './handlers'
import { recordEscrowCompletion } from './merkle'

// ── Somnia chain definition (must include wsUrl for sdk.subscribe()) ──────────
const somniaChain = defineChain({
  id: config.somnia.chainId,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: {
    default: {
      http:      [config.somnia.rpcUrl],
      webSocket: [config.somnia.wsUrl],
    },
  },
})

// ── WebSocket server for frontend clients ─────────────────────────────────────
const wss = new WebSocketServer({ port: config.service.port })

wss.on('listening', () => {
  console.log(`[ReactiveService] WebSocket server listening on ws://localhost:${config.service.port}`)
})

wss.on('connection', (ws: WebSocket) => {
  const ip = (ws as any)._socket?.remoteAddress ?? 'unknown'
  console.log(`[ReactiveService] Frontend client connected (${ip})`)
  // Send current status to newly connected client
  ws.send(JSON.stringify({ type: 'status', connected: true, timestamp: Date.now() }))
  ws.on('close', () => console.log(`[ReactiveService] Frontend client disconnected (${ip})`))
})

// Broadcast a ParsedEvent to all connected frontend clients
function broadcast(event: ParsedEvent): void {
  const msg = JSON.stringify(event)
  let count = 0
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg)
      count++
    }
  })
  if (count > 0) {
    console.log(`[ReactiveService] Broadcast ${event.type} (escrowId=${event.escrowId}) to ${count} client(s)`)
  }
}

// ── Somnia Reactivity subscription with retry ─────────────────────────────────

let retryCount = 0
const MAX_RETRY_DELAY_MS = 30_000

function retryDelay(): number {
  return Math.min(1_000 * Math.pow(2, retryCount), MAX_RETRY_DELAY_MS)
}

async function startReactivitySubscription(): Promise<void> {
  const escrowAddress = config.contracts.reactEscrow
  if (!escrowAddress) {
    console.warn('[ReactiveService] REACT_ESCROW_ADDRESS not set — Somnia subscription disabled.')
    console.warn('[ReactiveService] Set it in .env after deploying to Somnia Testnet.')
    return
  }

  console.log(`[ReactiveService] Connecting to Somnia at ${config.somnia.wsUrl}`)
  console.log(`[ReactiveService] Watching ReactEscrow: ${escrowAddress}`)

  try {
    // Public client MUST use webSocket transport for sdk.subscribe()
    const publicClient = createPublicClient({
      chain: somniaChain,
      transport: viemWebSocket(config.somnia.wsUrl),
    })

    const sdk = new SDK({ public: publicClient })

    const result = await sdk.subscribe({
      ethCalls:             [],
      eventContractSources: [escrowAddress],
      onData: (data: any) => {
        const event = parseReactiveEvent(data)
        if (event) {
          broadcast(event)
          // Feature 5: Update Merkle tree on FundsReleased (freelancer earned funds)
          if (event.type === 'FundsReleased' && event.address && event.amount) {
            recordEscrowCompletion(
              event.address,
              BigInt(event.escrowId),
              BigInt(event.amount),
            ).catch(err => console.error('[Merkle] recordEscrowCompletion error:', err))
          }
        } else {
          // Log unknown / undecodeable events at debug level
          console.debug('[ReactiveService] Ignored unrecognized event:', JSON.stringify(data)?.slice(0, 120))
        }
      },
      onError: (err: Error) => {
        console.error('[ReactiveService] Subscription error:', err.message)
        scheduleRetry()
      },
    })

    if (result instanceof Error) {
      console.error('[ReactiveService] sdk.subscribe() failed:', result.message)
      scheduleRetry()
      return
    }

    // Successful connection — reset retry counter
    retryCount = 0
    console.log(`[ReactiveService] Subscribed to ReactEscrow events (subscriptionId: ${result.subscriptionId})`)

    // Graceful shutdown: unsubscribe when process exits
    process.once('SIGTERM', async () => {
      console.log('[ReactiveService] Shutting down…')
      try { await result.unsubscribe() } catch { /* ignore */ }
      process.exit(0)
    })
    process.once('SIGINT', async () => {
      console.log('[ReactiveService] Shutting down…')
      try { await result.unsubscribe() } catch { /* ignore */ }
      process.exit(0)
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[ReactiveService] Connection failed: ${msg}`)
    scheduleRetry()
  }
}

function scheduleRetry(): void {
  retryCount++
  const delay = retryDelay()
  console.log(`[ReactiveService] Retrying in ${delay / 1000}s (attempt ${retryCount})…`)
  setTimeout(() => startReactivitySubscription(), delay)
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
console.log('[ReactiveService] Starting…')
console.log(`[ReactiveService] Somnia RPC:   ${config.somnia.rpcUrl}`)
console.log(`[ReactiveService] Somnia WS:    ${config.somnia.wsUrl}`)
console.log(`[ReactiveService] ReactEscrow:  ${config.contracts.reactEscrow || '(not configured)'}`)
console.log(`[ReactiveService] Service port: ${config.service.port}`)

startReactivitySubscription()
