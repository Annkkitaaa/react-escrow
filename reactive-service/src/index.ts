// ============================================================
// ReactEscrow — Off-chain Reactive Service
// Phase 5: Full Somnia Reactivity WebSocket subscription
// Phase 1: Boilerplate with WebSocket server stub
// ============================================================

import { WebSocketServer } from 'ws'
import { config } from './config.js'

console.log('[ReactiveService] Starting on port', config.service.port)
console.log('[ReactiveService] Somnia RPC:', config.somnia.rpcUrl)
console.log('[ReactiveService] ReactEscrow:', config.contracts.reactEscrow || '(not configured)')

// WebSocket server — frontend connects here to receive reactive events
const wss = new WebSocketServer({ port: config.service.port })

wss.on('listening', () => {
  console.log(`[ReactiveService] WebSocket server listening on ws://localhost:${config.service.port}`)
})

wss.on('connection', (ws) => {
  console.log('[ReactiveService] Frontend client connected')
  ws.on('close', () => console.log('[ReactiveService] Frontend client disconnected'))
})

// Broadcast to all connected clients
export function broadcast(event: object) {
  const msg = JSON.stringify(event)
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg)
  })
}

// TODO Phase 5: Initialize Somnia Reactivity SDK and subscribe
// import { SDK } from '@somnia-chain/reactivity'
// const sdk = new SDK({ public: publicClient })
// await sdk.subscribe({ ethCalls: [], onData: (data) => { ... } })
