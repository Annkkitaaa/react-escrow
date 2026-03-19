# Demo Recording Checklist

## Before Recording

### Infrastructure
- [ ] All 6 contracts deployed to Somnia Testnet (check `deployment.json`)
- [ ] All 4+ subscriptions registered (`npm run setup-subscriptions`)
- [ ] Deployer wallet has 34+ STT (precompile deducts per callback)
- [ ] `ReactiveHandlers` contract funded with STT (send via `receive()` if low)
- [ ] Demo escrows seeded (`npx hardhat run scripts/seed-demo.ts --network somniaTestnet`)
  - Check `seed-demo.json` for escrow IDs and deliverable hash values

### Services
- [ ] Reactive-service running: `npm run reactive-service`
- [ ] Frontend running: `npm run frontend` → http://localhost:5173
- [ ] No errors in reactive-service console output

### Browser Setup
- [ ] MetaMask configured with Somnia Testnet (Chain ID 50312)
- [ ] Three wallets loaded: **Client**, **Freelancer**, **Arbiter**
- [ ] All wallets have STT balance (gas for tx submissions)
- [ ] Browser console open — confirm no uncaught errors on page load
- [ ] Screen recording software ready and tested
- [ ] Browser zoom set to comfortable level (100–125%)

---

## Demo Flow (~2–3 minutes)

### Scene 1: Connect & Overview (20s)
1. Open http://localhost:5173 — show the landing page
2. Point out the **"With vs Without Reactivity"** comparison section (visible before connecting)
3. Connect the **Client** wallet
4. Show the Dashboard — Reactivity Stats panel at the top ("0 keeper bots")
5. Narrate: *"This is ReactEscrow — milestone payments that settle themselves."*

### Scene 2: Standard Reactive Flow (30s)
1. Open **Escrow 1** (Standard — 3 milestones, milestone 0 already submitted)
2. Show the Reactive Chain Visualizer (all steps dormant)
3. Click **Approve Milestone 0** — sign the transaction
4. Watch the Reactive Chain Visualizer light up step by step
5. Watch the Live Event Feed group same-block events under a "reactive chain" header
6. Narrate: *"I clicked Approve once. Somnia validators detected the event and executed the release in the same block — no keeper bots, no second transaction."*

### Scene 3: Proof-of-Delivery Flow (40s)
1. Open **Escrow 2** (Proof-of-Delivery)
2. Switch to **Freelancer** wallet in MetaMask
3. Submit milestone 0 with matching deliverable hash: `design-v1-final.pdf`
4. Watch: "Hash Verified" and challenge countdown appear
5. Wait 60 seconds (challenge period for demo)
6. Watch: Auto-approval fires → funds release → NFT minted (all same-block)
7. Narrate: *"After the hash matched, I did nothing. The challenge period expired and Somnia Reactivity auto-approved the milestone. No button clicks. No keeper. The chain handled it."*

### Scene 4: Streaming Checkpoints (30s)
1. Open **Escrow 3** (Streaming — 4 checkpoints at 25% each)
2. Switch to **Client** wallet
3. Approve Checkpoint 1 → watch 25% (0.25 STT) stream to freelancer
4. Approve Checkpoint 2 → another 0.25 STT streams
5. Show the progress bar advancing
6. Narrate: *"Each checkpoint triggers a proportional payment. Four reactive events, four automatic transfers — no extra infrastructure."*

### Scene 5: Show Results (20s)
1. Open the **Reputation** page (`/reputation`) → look up the freelancer address
2. Show the SBT stats: escrows completed, total earned
3. Return to Dashboard → show the Reactivity Stats card: X callbacks, 0 infrastructure
4. Show the **"With vs Without Reactivity"** comparison (collapsible on Dashboard)
5. Narrate: *"Every release also triggered NFT minting and reputation updates in the same block."*

### Closing (10s)
- *"ReactEscrow: 5 reactive event types, 8+ automatic actions, 168 passing tests, deployed to Somnia Testnet. Zero off-chain infrastructure required — built on Somnia."*

---

## Deliverable Hashes for Demo

From `seed-demo.json` (written by seed-demo.ts):

| Milestone | Input text to submit | Pre-computed hash |
|---|---|---|
| Escrow 2 · Milestone 0 | `design-v1-final.pdf` | (see seed-demo.json) |
| Escrow 2 · Milestone 1 | `backend-api-v2.zip` | (see seed-demo.json) |

---

## Emergency / Troubleshooting

| Issue | Fix |
|---|---|
| Reactive-service shows `Disconnected` | Check `SOMNIA_WS_URL` in `.env`; restart reactive-service |
| Events not appearing in feed | Confirm subscriptions are registered (`subscriptions.json` should exist) |
| Subscription callbacks pausing | Check deployer wallet STT balance (needs 32+ STT) |
| MetaMask transaction fails | Increase gas limit; check STT balance in active wallet |
| Frontend shows wrong contract address | Re-run `npm run deploy:testnet` or manually update `frontend/.env` |

---

## Contract Addresses (Somnia Testnet)

| Contract | Address |
|---|---|
| ReactEscrow | `0xe76069Bba704f4D3Da60d5031CC983FdB272A889` |
| ReactiveHandlers | `0xc9a15219E15263fc04249D6a23EAF454c274FfB0` |
| HookRegistry | `0xD7f17a9A31C7203e3D2700b76CdE6b2FFC4f40c5` |
| EscrowReceiptNFT | `0x4901393B7D65cD52DA37E969C09f1036e1F66bF5` |
| ReputationSBT | `0xD804E2045fC4A57b45FcE4C72397383b35660bb6` |
| ReputationHook | `0x21F4DaEaE24E6ca825315813680317F1A218f6d5` |

Explorer: https://shannon-explorer.somnia.network
