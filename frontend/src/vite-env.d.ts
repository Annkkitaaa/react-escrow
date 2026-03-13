/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REACT_ESCROW_ADDRESS: string
  readonly VITE_REACTIVE_HANDLERS_ADDRESS: string
  readonly VITE_SOMNIA_RPC_URL: string
  readonly VITE_CHAIN_ID: string
  readonly VITE_BLOCK_EXPLORER: string
  readonly VITE_REACTIVE_SERVICE_WS_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
