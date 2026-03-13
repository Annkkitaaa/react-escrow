# ReactEscrow

**Reactive Milestone-Based Escrow Protocol on Somnia Testnet**

Built for the [Somnia Reactivity Mini Hackathon](https://dorahacks.io) (Feb 25 – Mar 20, 2026).

ReactEscrow lets a client lock funds on-chain for a freelancer across multiple milestones. When the client approves a milestone, **Somnia Reactivity** automatically pushes a callback to an on-chain handler contract — releasing funds to the freelancer with no manual step, no keeper bot, and no polling.

---

## Demo Video

> **TODO:** Replace this placeholder with the actual demo video link after recording.

<!-- Record a 2-5 min screen capture showing:
     1. Connect MetaMask to Somnia Testnet
     2. Create an escrow (freelancer + arbiter + 1 milestone)
     3. Deposit funds → escrow goes Active
     4. (Freelancer wallet) Submit milestone
     5. (Client wallet) Approve milestone
     6. Watch ReactiveHandlers auto-release funds on-chain (no user action needed)
     7. Show live event feed updating in real-time
-->

**[▶ Watch Demo](YOUR_VIDEO_URL_HERE)** ← replace with YouTube / Loom link

---

## How It Works

Traditional escrow requires someone to manually release funds after approval — a middleman, a cron job, or the user pressing "Release" a second time. ReactEscrow eliminates that entirely using **Somnia Native Reactivity**.

**End-to-end flow:**

1. **Client creates an escrow** — sets milestones (description, STT amount, deadline) and locks funds in the smart contract.
2. **Freelancer submits work** — marks the milestone as submitted when the deliverable is ready.
3. **Client approves** — one click. The contract emits a `MilestoneApproved` event on-chain.
4. **Somnia validators detect the event** — because `ReactiveHandlers.sol` is a registered subscriber via the Somnia Reactivity precompile (`0x0100`). No keeper bot, no oracle, no polling.
5. **Funds auto-release** — validators atomically call `ReactiveHandlers._onEvent()` → `ReactEscrow.releaseMilestoneFunds()`. The freelancer receives payment in the same block as the approval.
6. **Frontend updates in real-time** — the off-chain `reactive-service` subscribes to the same events via Somnia's WebSocket SDK and pushes live updates to the browser. The event feed and escrow detail auto-refresh.

The same reactive pattern handles disputes (arbiter resolves → `DisputeResolved` → funds distributed instantly) and missed deadlines (`DeadlineReached` → timeout auto-release).

> Somnia Reactivity is not a webhook or an oracle. It is a validator-enforced, on-chain primitive — the callback is atomic with the triggering transaction, with no trusted intermediary.

**Reactivity is used in two ways:**
- **On-chain** — `ReactiveHandlers.sol` auto-executes fund releases via validator callbacks
- **Off-chain** — `reactive-service` streams live event data to the frontend via the Somnia SDK WebSocket

---

## Live Deployment (Somnia Testnet)

| Contract | Address |
|---|---|
| ReactEscrow | [`0xbf8f142b2eb8eB79c98296CB1dC58Cb2c7885f5B`](https://shannon-explorer.somnia.network/address/0xbf8f142b2eb8eB79c98296CB1dC58Cb2c7885f5B) |
| ReactiveHandlers | [`0xfBF46805a3F3AFD485232b441E8E88E19c7dd06F`](https://shannon-explorer.somnia.network/address/0xfBF46805a3F3AFD485232b441E8E88E19c7dd06F) |

- **Network:** Somnia Testnet (Shannon) · Chain ID `50312` · Currency `STT`
- **Explorer:** https://shannon-explorer.somnia.network
- **RPC:** https://dream-rpc.somnia.network/

---

## How Somnia Reactivity Works Here

```
Client approves milestone
        │
        ▼
ReactEscrow.sol emits  MilestoneApproved(escrowId, milestoneIndex, amount)
        │
        ▼ (Somnia validators detect subscribed event)
ReactiveHandlers._onEvent() is called atomically
        │
        ▼
ReactiveHandlers calls ReactEscrow.releaseMilestoneFunds()
        │
        ▼
Funds transferred to freelancer — no user action needed
```

Three subscriptions are registered via `setup-subscriptions.ts`:

| Event | Handler Action |
|---|---|
| `MilestoneApproved` | calls `releaseMilestoneFunds()` → pay freelancer |
| `DeadlineReached` | calls `executeTimeoutRelease()` → timeout auto-release |
| `DisputeResolved` | calls `executeResolutionDistribution()` → split per arbiter ruling |

---

## Project Structure

```
react-escrow/
├── contracts/
│   ├── interfaces/IReactEscrow.sol   # Contract interface
│   ├── ReactEscrow.sol               # Core escrow logic (68 tests)
│   └── ReactiveHandlers.sol          # Somnia Reactivity on-chain handler
│
├── scripts/
│   ├── deploy.ts                     # Deploy both contracts + write .env
│   ├── setup-subscriptions.ts        # Register 3 Somnia Reactivity subscriptions
│   └── seed.ts                       # Create sample escrows for testing
│
├── test/
│   └── ReactEscrow.test.ts           # 68 Hardhat tests (all passing)
│
├── reactive-service/                 # Off-chain Node.js event listener
│   └── src/
│       ├── config.ts                 # RPC/WS URLs, contract addresses
│       ├── handlers.ts               # Decode all 9 ReactEscrow events
│       └── index.ts                  # WS server + Somnia SDK subscription
│
├── frontend/                         # React + Vite + Tailwind UI
│   └── src/
│       ├── components/
│       │   ├── WalletConnect.tsx     # Landing / MetaMask connect page
│       │   ├── EscrowDashboard.tsx   # List all escrows as client/freelancer
│       │   ├── CreateEscrow.tsx      # Create new escrow with milestones
│       │   ├── EscrowDetail.tsx      # Full milestone timeline + actions
│       │   └── LiveEventFeed.tsx     # Real-time Reactivity event feed
│       ├── hooks/
│       │   ├── useWallet.tsx         # MetaMask connection + network guard
│       │   ├── useEscrow.ts          # All contract reads + writes via viem
│       │   └── useReactivity.tsx     # WebSocket hook → live event push
│       └── lib/
│           ├── somnia.ts             # Chain config + explorer URL helpers
│           └── contracts.ts          # ABI + deployed address
│
├── hardhat.config.ts
├── .env.example                      # All required environment variables
└── deployment.json                   # Written by deploy script
```

---

## Escrow Lifecycle

```
Created ──[depositFunds]──▶ Active ──[all milestones released]──▶ Completed
                                │
                    ┌───────────┴───────────┐
                    │                       │
           [submitMilestone]        [deadline passes]
                    │                       │
           [approveMilestone]    [checkAndTriggerTimeout]
                    │                       │
             MilestoneApproved        DeadlineReached
                    │                       │
           ReactiveHandlers        ReactiveHandlers
           releaseMilestoneFunds   executeTimeoutRelease
                    │
           [raiseDispute] ──▶ Disputed
                                │
                        [resolveDispute (arbiter)]
                                │
                          DisputeResolved
                                │
                        ReactiveHandlers
                   executeResolutionDistribution
                      (0=freelancer, 1=client, 2=split)
```

**Escrow Statuses:** `Created` → `Active` → `Completed` / `Cancelled`
**Milestone Statuses:** `Pending` → `Submitted` → `Approved` → `Released` (or `Disputed`)

---

## Prerequisites

- Node.js ≥ 18
- MetaMask browser extension
- STT tokens on Somnia Testnet — get from the [faucet](https://testnet.somnia.network)
- For testnet subscriptions: **34+ STT** in the deployer wallet

---

## Local Setup

```bash
# 1. Clone and install root deps (Hardhat + contracts)
git clone <repo-url>
cd react-escrow
npm install

# 2. Install frontend deps
cd frontend && npm install && cd ..

# 3. Install reactive-service deps
cd reactive-service && npm install && cd ..

# 4. Copy and fill environment variables
cp .env.example .env
# Edit .env — set PRIVATE_KEY (without 0x prefix)
```

---

## Environment Variables

`.env` (project root):

```env
# Deployer wallet private key (no 0x prefix)
PRIVATE_KEY=your_private_key_here

# Somnia Testnet endpoints
SOMNIA_RPC_URL=https://dream-rpc.somnia.network/
SOMNIA_WS_URL=wss://dream-rpc.somnia.network/

# Filled automatically by deploy script:
REACT_ESCROW_ADDRESS=
REACTIVE_HANDLERS_ADDRESS=
```

`frontend/.env` (filled automatically by `deploy.ts`):

```env
VITE_REACT_ESCROW_ADDRESS=
VITE_REACTIVE_HANDLERS_ADDRESS=
VITE_CHAIN_ID=50312
VITE_NETWORK_NAME=somniaTestnet
```

---

## NPM Scripts

Run all from the project root:

| Command | Description |
|---|---|
| `npm run compile` | Compile Solidity contracts |
| `npm test` | Run 68 Hardhat unit tests |
| `npm run deploy:local` | Deploy to local Hardhat node |
| `npm run deploy:testnet` | Deploy to Somnia Testnet |
| `npm run setup-subscriptions` | Register 3 Somnia Reactivity subscriptions |
| `npm run seed` | Create sample escrows on testnet |
| `npm run frontend` | Start React dev server (http://localhost:5173) |
| `npm run reactive-service` | Start off-chain WebSocket event service (ws://localhost:3001) |

---

## Deploy to Testnet (Step-by-Step)

```bash
# 1. Add MetaMask — Somnia Testnet
# Chain ID: 50312 | RPC: https://dream-rpc.somnia.network/ | Symbol: STT

# 2. Get STT from the faucet (need 34+ STT in deployer wallet)

# 3. Set PRIVATE_KEY in .env

# 4. Deploy both contracts
npm run deploy:testnet
# → writes deployment.json, updates .env, updates frontend/.env

# 5. Register on-chain Somnia Reactivity subscriptions
#    (Deployer wallet must hold ≥ 34 STT — the precompile checks msg.sender balance)
npm run setup-subscriptions

# 6. Start the off-chain reactive service
npm run reactive-service

# 7. Start the frontend
npm run frontend
# → open http://localhost:5173
```

> **Note on STT balance:** The Somnia Reactivity precompile (`0x0100`) deducts gas from the **subscription owner's wallet** (the deployer) on each callback. Keep 34+ STT in the deployer address to keep subscriptions active. The `ReactiveHandlers` contract also needs STT to receive callbacks — fund it via its `receive()` function.

---

## Running Tests

```bash
npm test
```

68 tests across all contract paths:
- Escrow creation and validation
- Fund deposit and activation
- Milestone submit / approve / release flow
- Dispute raise and arbiter resolution (freelancer / client / split)
- Timeout release (deadline passed)
- Somnia Reactivity handler simulation (via precompile impersonation)
- Reentrancy protection
- Access control (NotClient, NotFreelancer, NotArbiter errors)

---

## Key Technical Notes

### Somnia Reactivity — On-Chain Path

- `ReactiveHandlers` inherits `SomniaEventHandler` from `@somnia-chain/reactivity-contracts@^0.1.6`
- The base `onEvent()` validates `msg.sender == 0x0100` before calling `_onEvent()`
- Event topics are decoded from `eventTopics[0]` (keccak256 of event signature)
- `escrowId` is always `eventTopics[1]` (first indexed param)
- Non-indexed params decoded from `data` via `abi.decode`
- All handler calls use `_safeCall()` — errors don't revert the validator invocation

### Somnia Reactivity — Off-Chain Path

- `reactive-service` uses `@somnia-chain/reactivity@^0.1.10` SDK
- Connects via WebSocket transport (`wss://dream-rpc.somnia.network/`)
- `sdk.subscribe()` receives raw `{ topics, data }` from Somnia push
- `handlers.ts` decodes all 9 event types and converts to `ParsedEvent` JSON
- Broadcasts to all connected frontend clients over a local WebSocket server on port 3001

### Frontend

- Reads via `createPublicClient` + HTTP (viem v2)
- Writes via `createWalletClient` + `custom(window.ethereum)` (MetaMask)
- `useReactivity` hook maintains a WebSocket connection to the reactive-service with auto-reconnect
- Live event feed renders real-time on the Dashboard and auto-reloads EscrowDetail on matching events
- Solidity version: **0.8.30** (required by `SomniaEventHandler.sol`)

---

## Contract Addresses & Links

| | |
|---|---|
| ReactEscrow on Explorer | https://shannon-explorer.somnia.network/address/0xbf8f142b2eb8eB79c98296CB1dC58Cb2c7885f5B |
| ReactiveHandlers on Explorer | https://shannon-explorer.somnia.network/address/0xfBF46805a3F3AFD485232b441E8E88E19c7dd06F |
| Somnia Testnet Faucet | https://testnet.somnia.network |
| Somnia Explorer | https://shannon-explorer.somnia.network |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.30, OpenZeppelin ReentrancyGuard |
| Reactivity (on-chain) | `@somnia-chain/reactivity-contracts` SomniaEventHandler |
| Reactivity (off-chain) | `@somnia-chain/reactivity` SDK, Node.js WebSocket |
| Contract Tests | Hardhat, Ethers v6, Chai |
| Frontend | React 18, Vite, Tailwind CSS v3 |
| Blockchain Client | viem v2 |
| Wallet | MetaMask (EIP-1193) |
| Network | Somnia Testnet (Shannon), Chain ID 50312 |
