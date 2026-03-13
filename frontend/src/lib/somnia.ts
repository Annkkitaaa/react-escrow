import { defineChain } from 'viem'

// ============================================================
// Somnia Testnet (Shannon) — Chain Configuration
// Chain ID: 50312 | Currency: STT
// ============================================================

export const somniaTestnet = defineChain({
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Somnia Test Token',
    symbol: 'STT',
  },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network/'],
      webSocket: ['wss://dream-rpc.somnia.network/'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Somnia Explorer',
      url: 'https://shannon-explorer.somnia.network/',
    },
  },
  testnet: true,
})

export const CHAIN_ID = 50312
export const CHAIN_ID_HEX = '0xC488' // 50312 in hex

// MetaMask add-network params
export const ADD_NETWORK_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: 'Somnia Testnet',
  nativeCurrency: {
    name: 'Somnia Test Token',
    symbol: 'STT',
    decimals: 18,
  },
  rpcUrls: ['https://dream-rpc.somnia.network/'],
  blockExplorerUrls: ['https://shannon-explorer.somnia.network/'],
}

export function getExplorerTxUrl(txHash: string): string {
  return `https://shannon-explorer.somnia.network/tx/${txHash}`
}

export function getExplorerAddressUrl(address: string): string {
  return `https://shannon-explorer.somnia.network/address/${address}`
}
