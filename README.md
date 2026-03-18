# ReactEscrow

**Reactive Milestone-Based Escrow Protocol on Somnia Testnet**

Built for the [Somnia Reactivity Mini Hackathon](https://dorahacks.io) (Feb 25 – Mar 20, 2026).

ReactEscrow lets a client lock funds on-chain for a freelancer across multiple milestones. When the client approves a milestone, **Somnia Reactivity** automatically pushes a callback to an on-chain handler contract — releasing funds to the freelancer with no manual step, no keeper bot, and no polling.

---

## Demo Video

> **TODO:** Replace this placeholder with the actual demo video link after recording.

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
6. **Frontend updates in real-time** — the off-chain `reactive-service` subscribes to the same events via Somnia's WebSocket SDK and pushes live updates to the browser.

The same reactive pattern handles disputes (arbiter resolves → `DisputeResolved` → funds distributed instantly), missed deadlines (`DeadlineReached` → timeout auto-release), checkpoint partial payments (`CheckpointApproved` → streaming release), and proof-of-delivery challenge expiry.

> Somnia Reactivity is not a webhook or an oracle. It is a validator-enforced, on-chain primitive — the callback is atomic with the triggering transaction, with no trusted intermediary.

**Reactivity is used in two ways:**
- **On-chain** — `ReactiveHandlers.sol` auto-executes fund releases via validator callbacks
- **Off-chain** — `reactive-service` streams live event data to the frontend via the Somnia SDK WebSocket

---

## Live Deployment (Somnia Testnet)

| Contract | Address |
|---|---|
| ReactEscrow | [`0xe76069Bba704f4D3Da60d5031CC983FdB272A889`](https://shannon-explorer.somnia.network/address/0xe76069Bba704f4D3Da60d5031CC983FdB272A889) |
| ReactiveHandlers | [`0xc9a15219E15263fc04249D6a23EAF454c274FfB0`](https://shannon-explorer.somnia.network/address/0xc9a15219E15263fc04249D6a23EAF454c274FfB0) |
| HookRegistry | [`0xD7f17a9A31C7203e3D2700b76CdE6b2FFC4f40c5`](https://shannon-explorer.somnia.network/address/0xD7f17a9A31C7203e3D2700b76CdE6b2FFC4f40c5) |
| EscrowReceiptNFT | [`0x4901393B7D65cD52DA37E969C09f1036e1F66bF5`](https://shannon-explorer.somnia.network/address/0x4901393B7D65cD52DA37E969C09f1036e1F66bF5) |
| ReputationSBT | [`0xD804E2045fC4A57b45FcE4C72397383b35660bb6`](https://shannon-explorer.somnia.network/address/0xD804E2045fC4A57b45FcE4C72397383b35660bb6) |
| ReputationHook | [`0x21F4DaEaE24E6ca825315813680317F1A218f6d5`](https://shannon-explorer.somnia.network/address/0x21F4DaEaE24E6ca825315813680317F1A218f6d5) |

- **Network:** Somnia Testnet (Shannon) · Chain ID `50312` · Currency `STT`
- **Explorer:** https://shannon-explorer.somnia.network
- **RPC:** https://dream-rpc.somnia.network/

---

## 5 Advanced Features

### Feature 1 — Privacy-Preserving Milestones (Commit-Reveal)

Milestone amounts can be hidden on-chain using **keccak256 commit-reveal**:

- At escrow creation the client submits `keccak256(abi.encodePacked(amount, salt))` instead of a plain amount.
- The salt is stored in the browser (`localStorage`), invisible to on-chain observers.
- When the client approves, they call `approvePrivateMilestone(escrowId, milestoneIndex, amount, salt)`.
- The contract verifies `keccak256(amount, salt) == commitment`, sets `milestone.amount`, emits `MilestoneApproved` — and Reactivity auto-releases as normal.

Select **Private** mode in the Create Escrow form.

---

### Feature 2 — Proof-of-Delivery Oracle (Hash Verification + Challenge Period)

Escrows can require the freelancer to submit a hash matching a pre-agreed deliverable spec:

- Client specifies a `bytes32` deliverable hash per milestone at creation (plain text is keccak256-hashed in the UI).
- Freelancer calls `submitMilestoneWithDeliverable(escrowId, idx, hash)`. If hashes match, a **challenge window** opens (default 48h).
- During the window, the client can call `challengeDeliverable()` to dispute.
- After the window, anyone calls `checkAndTriggerChallengeExpiry()` → emits `DeliveryChallengePeriodExpired` → Reactivity auto-approves and releases.

Select **Delivery Proof** mode in the Create Escrow form.

---

### Feature 3 — Streaming Partial Payments (Checkpoints)

Milestones can be split into weighted checkpoints, enabling streaming payment as work progresses:

- Client calls `addMilestoneCheckpoints(escrowId, milestoneIdx, descriptions[], weights[])` — weights must sum to 100.
- Freelancer submits each checkpoint; client approves each one.
- On `approveCheckpoint`, the contract emits `CheckpointApproved(escrowId, milestoneIndex, checkpointIndex, amount)`.
- **Reactivity** auto-calls `releaseCheckpointFunds()` — transferring `milestone.amount * weight / 100` to the freelancer immediately.
- When the last checkpoint is released, the milestone advances automatically.

---

### Feature 4 — Cross-Contract Composability (Hook Registry + NFT Receipt)

A pluggable hook system fires after every milestone release:

- `HookRegistry` holds a list of `IEscrowHook` contracts.
- `ReactiveHandlers` calls `registry.executePostReleaseHooks(...)` after each successful `releaseMilestoneFunds`.
- Each hook is called in a `try/catch` — a failing hook never reverts the release.
- **EscrowReceiptNFT** is the first registered hook: mints an ERC-721 receipt to the freelancer with on-chain metadata (escrowId, milestoneIndex, amount, timestamp encoded as base64 JSON tokenURI).
- New hooks can be registered by the registry owner without redeploying ReactEscrow.

---

### Feature 5 — Reputation SBT (Soulbound Token + Merkle History)

Freelancers earn a non-transferable reputation token that grows with every completed escrow:

- `ReputationSBT` is an ERC-721 with transfers blocked (`_update` override in OZ v5).
- `ReputationHook` (registered in HookRegistry) calls `sbt.mintOrUpdate(freelancer, escrowId, amount, ...)` on each milestone release.
- On-chain stats tracked per address: `totalEscrows`, `totalAmountEarned`, `disputeCount`, `lastUpdated`.
- A **Merkle root** of the full earnings history is stored on-chain, updatable by the off-chain `reactive-service/src/merkle.ts` worker.
- The `verifyReputationClaim(user, leaf, proof)` view function lets anyone verify historical claims.
- View the `/reputation` page in the frontend to look up any address.

---

## How Somnia Reactivity Works Here

```
Client approves milestone
        │
        ▼
ReactEscrow.sol emits  MilestoneApproved(escrowId, milestoneIndex, amount)
        │
        ▼ (Somnia validators detect subscribed event — atomic, no intermediary)
ReactiveHandlers._onEvent() is called in the same block
        │
        ▼
ReactiveHandlers calls ReactEscrow.releaseMilestoneFunds()
        │
        ▼
Funds transferred to freelancer — no user action needed
```

Four subscriptions registered via `setup-subscriptions.ts`:

| Event | Handler Action |
|---|---|
| `MilestoneApproved` | calls `releaseMilestoneFunds()` → pay freelancer |
| `DeadlineReached` | calls `executeTimeoutRelease()` → timeout auto-release |
| `DisputeResolved` | calls `executeResolutionDistribution()` → split per arbiter ruling |
| `CheckpointApproved` | calls `releaseCheckpointFunds()` → partial streaming payment |

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

## Project Structure

```
react-escrow/
├── contracts/
│   ├── interfaces/
│   │   ├── IReactEscrow.sol          # Full contract interface
│   │   └── IEscrowHook.sol           # Hook interface (Feature 4)
│   ├── test/
│   │   └── MockRevertHook.sol        # Test helper — always-reverting hook
│   ├── hooks/
│   │   ├── EscrowReceiptNFT.sol      # ERC-721 receipt on release (Feature 4)
│   │   └── ReputationHook.sol        # SBT updater hook (Feature 5)
│   ├── ReactEscrow.sol               # Core escrow + 3 advanced features
│   ├── ReactiveHandlers.sol          # Somnia Reactivity on-chain handler
│   ├── HookRegistry.sol              # Pluggable post-release hooks (Feature 4)
│   └── ReputationSBT.sol             # Soulbound reputation token (Feature 5)
│
├── scripts/
│   ├── deploy.ts                     # Deploy all 6 contracts + wire them
│   ├── setup-subscriptions.ts        # Register 4 Somnia Reactivity subscriptions
│   └── seed.ts                       # Create sample escrows for testing
│
├── test/
│   ├── ReactEscrow.test.ts           # 68 core tests
│   ├── PrivateMilestones.test.ts     # ~20 tests — Feature 1
│   ├── ProofOfDelivery.test.ts       # ~22 tests — Feature 2
│   ├── StreamingPayments.test.ts     # ~22 tests — Feature 3
│   ├── HookRegistry.test.ts          # ~20 tests — Feature 4
│   └── ReputationSBT.test.ts         # ~20 tests — Feature 5
│
├── reactive-service/                 # Off-chain Node.js event listener
│   └── src/
│       ├── config.ts                 # RPC/WS URLs, all contract addresses
│       ├── handlers.ts               # Decode all ReactEscrow events
│       ├── merkle.ts                 # Off-chain Merkle tree for reputation (Feature 5)
│       └── index.ts                  # WS server + Somnia SDK subscription + retry
│
├── frontend/                         # React + Vite + Tailwind UI
│   └── src/
│       ├── components/
│       │   ├── WalletConnect.tsx     # Landing / MetaMask connect page
│       │   ├── EscrowDashboard.tsx   # List all escrows as client/freelancer
│       │   ├── CreateEscrow.tsx      # 3-mode creator: Standard / Private / Delivery
│       │   ├── EscrowDetail.tsx      # Milestone timeline + checkpoint/delivery/reveal panels
│       │   ├── ReputationProfile.tsx # Reputation lookup by address (Feature 5)
│       │   └── LiveEventFeed.tsx     # Real-time Reactivity event feed
│       ├── hooks/
│       │   ├── useWallet.tsx         # MetaMask connection + network guard
│       │   ├── useEscrow.ts          # All contract reads + writes (Features 1-5)
│       │   └── useReactivity.tsx     # WebSocket hook → live event push
│       └── lib/
│           ├── somnia.ts             # Chain config
│           ├── commitment.ts         # keccak256 commit-reveal helpers (Feature 1)
│           ├── contracts.ts          # ABIs + all deployed addresses
│           ├── ReactEscrowABI.json   # Full compiled ABI
│           └── ReputationSBTABI.json # ReputationSBT ABI
│
├── hardhat.config.ts
├── .env.example                      # All required environment variables
├── deployment.json                   # Written by deploy script
└── subscriptions.json                # Written by setup-subscriptions script
```

---

## Prerequisites

- Node.js ≥ 18
- MetaMask browser extension
- STT tokens on Somnia Testnet — get from the [faucet](https://testnet.somnia.network)
- For testnet subscriptions: **34+ STT** in the deployer wallet (precompile deducts from `msg.sender`)

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

# Filled automatically by deploy.ts:
REACT_ESCROW_ADDRESS=
REACTIVE_HANDLERS_ADDRESS=
HOOK_REGISTRY_ADDRESS=
ESCROW_RECEIPT_NFT_ADDRESS=
REPUTATION_SBT_ADDRESS=
REPUTATION_HOOK_ADDRESS=

# Optional — enables off-chain Merkle root updates for ReputationSBT
MERKLE_UPDATER_PRIVATE_KEY=
```

`frontend/.env` (filled automatically by `deploy.ts`):

```env
VITE_REACT_ESCROW_ADDRESS=
VITE_REACTIVE_HANDLERS_ADDRESS=
VITE_HOOK_REGISTRY_ADDRESS=
VITE_ESCROW_RECEIPT_NFT_ADDRESS=
VITE_REPUTATION_SBT_ADDRESS=
VITE_REPUTATION_HOOK_ADDRESS=
VITE_CHAIN_ID=50312
VITE_NETWORK_NAME=somniaTestnet
```

---

## NPM Scripts

Run all from the project root:

| Command | Description |
|---|---|
| `npm run compile` | Compile Solidity contracts |
| `npm test` | Run 168 Hardhat unit tests |
| `npm run deploy:local` | Deploy to local Hardhat node |
| `npm run deploy:testnet` | Deploy to Somnia Testnet |
| `npm run setup-subscriptions` | Register 4 Somnia Reactivity subscriptions |
| `npm run seed` | Create sample escrows on testnet |
| `npm run frontend` | Start React dev server (http://localhost:5173) |
| `npm run reactive-service` | Start off-chain WebSocket event service (ws://localhost:3001) |

---

## Deploy to Testnet (Step-by-Step)

```bash
# 1. Add Somnia Testnet to MetaMask
# Chain ID: 50312 | RPC: https://dream-rpc.somnia.network/ | Symbol: STT

# 2. Get STT from the faucet (need 34+ STT in deployer wallet)
# https://testnet.somnia.network

# 3. Set PRIVATE_KEY in .env

# 4. Deploy all 6 contracts (ReactEscrow, ReactiveHandlers, HookRegistry,
#    EscrowReceiptNFT, ReputationSBT, ReputationHook) + wire them
npm run deploy:testnet
# → writes deployment.json, updates .env, updates frontend/.env

# 5. Register 4 on-chain Somnia Reactivity subscriptions
#    (Deployer wallet must hold ≥ 32 STT — precompile checks msg.sender balance)
npm run setup-subscriptions

# 6. Start the off-chain reactive service
npm run reactive-service

# 7. Start the frontend
npm run frontend
# → open http://localhost:5173
```

> **Note on STT balance:** The Somnia Reactivity precompile (`0x0100`) deducts gas from the **subscription owner's wallet** (the deployer) on each callback. Keep 34+ STT in the deployer address to keep subscriptions active. Use `ReactiveHandlers.withdraw(amount)` if you need to recover any STT sent to the handler contract.

---

## Running Tests

```bash
npm test
```

168 tests across all contract paths:

| File | Tests | Coverage |
|---|---|---|
| `ReactEscrow.test.ts` | 68 | Core escrow lifecycle, access control, reentrancy, Reactivity simulation |
| `PrivateMilestones.test.ts` | ~20 | Commit-reveal create/approve, bad salt rejection, double-reveal prevention |
| `ProofOfDelivery.test.ts` | ~22 | Hash verification, challenge window, auto-approve on expiry |
| `StreamingPayments.test.ts` | ~22 | Checkpoint add/submit/approve, weight validation, partial releases |
| `HookRegistry.test.ts` | ~20 | Hook register/remove, execution order, failing hook isolation |
| `ReputationSBT.test.ts` | ~20 | Mint/update, soulbound transfer block, Merkle verification |

---

## Key Technical Notes

### Somnia Reactivity — On-Chain Path

- `ReactiveHandlers` inherits `SomniaEventHandler` from `@somnia-chain/reactivity-contracts@^0.1.6`
- The base `onEvent()` validates `msg.sender == 0x0100` before calling `_onEvent()`
- Event topics decoded from `eventTopics[0]` (keccak256 of event signature string)
- `escrowId` is always `eventTopics[1]` (first indexed param)
- Non-indexed params decoded from `data` via `abi.decode`
- All handler calls wrapped in `_safeCall()` — handler errors never revert the validator invocation
- After each milestone release, `HookRegistry.executePostReleaseHooks()` fires all registered hooks (each try-caught independently)

### Somnia Reactivity — Off-Chain Path

- `reactive-service` uses `@somnia-chain/reactivity@^0.1.10` SDK
- Connects via WebSocket transport (`wss://dream-rpc.somnia.network/`)
- `sdk.subscribe()` receives raw `{ topics, data }` push from Somnia validators
- `handlers.ts` decodes all event types and converts to `ParsedEvent` JSON
- Broadcasts to all connected frontend clients over a local WebSocket server on port 3001
- On `FundsReleased`: optionally updates the off-chain Merkle tree for reputation history

### Frontend

- Reads via `createPublicClient` + HTTP (viem v2)
- Writes via `createWalletClient` + `custom(window.ethereum)` (MetaMask)
- `useReactivity` hook maintains a WebSocket connection to the reactive-service with auto-reconnect
- `CreateEscrow` supports 3 modes: **Standard**, **Private** (commit-reveal), **Delivery Proof** (hash + challenge window)
- `EscrowDetail` renders panels per mode: `CheckpointPanel`, `DeliveryPanel`, `PrivateRevealPanel`
- Commit-reveal salts stored in `localStorage` keyed `commitment:{escrowId}:{milestoneIndex}`
- Solidity version: **0.8.30** (required by `SomniaEventHandler.sol`)

### Contract Design Constraints

- All 5 features added via **new mappings** — no existing struct fields were changed
- `createEscrow` / `approveMilestone` / all original functions remain 100% backward-compatible
- `IEscrowHook` interface enables permissionless extensibility without redeploying the core contract

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.30, OpenZeppelin ReentrancyGuard, ERC-721 (OZ v5) |
| Reactivity (on-chain) | `@somnia-chain/reactivity-contracts` SomniaEventHandler |
| Reactivity (off-chain) | `@somnia-chain/reactivity` SDK, Node.js WebSocket |
| Contract Tests | Hardhat, Ethers v6, Chai — 168 tests |
| Frontend | React 18, Vite, Tailwind CSS v3 |
| Blockchain Client | viem v2 |
| Wallet | MetaMask (EIP-1193) |
| Merkle Trees | `@openzeppelin/merkle-tree` (off-chain reputation history) |
| Network | Somnia Testnet (Shannon), Chain ID 50312 |
