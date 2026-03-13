import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react'
import { ReactiveEvent } from '../types/escrow'
import { REACTIVE_SERVICE_WS_URL } from '../lib/reactivity'

// ============================================================
// Reactivity Context — WebSocket connection to reactive-service
// Receives Somnia push events and broadcasts to subscribers
// Full implementation in Phase 8
// ============================================================

type EventListener = (event: ReactiveEvent) => void

interface ReactivityContextType {
  isConnected: boolean
  events: ReactiveEvent[]
  subscribe: (listener: EventListener) => () => void
  clearEvents: () => void
}

const ReactivityContext = createContext<ReactivityContextType | null>(null)

export function ReactivityProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [events, setEvents] = useState<ReactiveEvent[]>([])
  const listenersRef = useRef<Set<EventListener>>(new Set())
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    try {
      const ws = new WebSocket(REACTIVE_SERVICE_WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
        console.log('[Reactivity] WebSocket connected')
      }

      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as ReactiveEvent
          setEvents(prev => [event, ...prev].slice(0, 100)) // keep last 100
          listenersRef.current.forEach(l => l(event))
        } catch (err) {
          console.error('[Reactivity] Parse error:', err)
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        if (!mountedRef.current) return
        console.log('[Reactivity] WebSocket disconnected. Reconnecting in 3s...')
        reconnectTimeoutRef.current = setTimeout(connect, 3000)
      }

      ws.onerror = (err) => {
        console.error('[Reactivity] WebSocket error:', err)
        ws.close()
      }
    } catch (err) {
      console.error('[Reactivity] Connection failed:', err)
      if (mountedRef.current) {
        reconnectTimeoutRef.current = setTimeout(connect, 3000)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      clearTimeout(reconnectTimeoutRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  const subscribe = useCallback((listener: EventListener) => {
    listenersRef.current.add(listener)
    return () => listenersRef.current.delete(listener)
  }, [])

  const clearEvents = useCallback(() => setEvents([]), [])

  return (
    <ReactivityContext.Provider value={{ isConnected, events, subscribe, clearEvents }}>
      {children}
    </ReactivityContext.Provider>
  )
}

export function useReactivity(): ReactivityContextType {
  const ctx = useContext(ReactivityContext)
  if (!ctx) throw new Error('useReactivity must be used within ReactivityProvider')
  return ctx
}
