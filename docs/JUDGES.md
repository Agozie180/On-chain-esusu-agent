# Judge guide: verify everything in 5 minutes

## The 10-second version
**For Nigerian ajo groups and cooperatives: save together, take turns receiving the pot, and let an agent pay your dues within limits you control.**

Members choose a payout slot and lock collateral; earlier payouts require more collateral to cover remaining dues. The agent automates contributions from a funded vault with owner-set limits. This addresses missed payments and members who stop contributing after their payout. It is a testnet prototype, with no recruited pilot users yet.

**Start here:** [open the live app](https://onchainesusuagent.vercel.app). No wallet is needed to inspect the circle, payout slots or risk grade. Use Path A below for a complete hands-on agent demo with local test accounts.

## Path A: local hands-on demo (Node 22)

The live app is hosted on Vercel. For the local demo, clone the repository (private repository access is required if you cannot open it):
```bash
git clone https://github.com/Agozie180/On-chain-Esusu-agent && cd On-chain-Esusu-agent
npm install
npm run demo:local         # starts a local chain, seeds it, serves the dapp
```
Open http://127.0.0.1:5173. You will see (without connecting any wallet):
- a **seeded local circle** where one member already defaulted (see the red "defaulted" tag and their slashed collateral),
- an **open circle** (pick a slot and read its **risk grade**),
- a **gated circle** that needs reputation 150 (the judge account is refused with `ScoreTooLow`),
- reputations earned by a finished circle.

To act, the demo prints a public dev key and the MetaMask network values. Then:
1. Use the complete agent command printed by the demo, with `CIRCUITS` set to the local `liveCircle` in `.local-demo.json` to override any testnet `.env` value: the agent **pays your dues from the vault**. On PowerShell, set the listed values with `$env:NAME='value'` before `npm run agent`. Stop the loop with Ctrl+C.
2. `npm run demo:buy`: the agent **pays 1 mUSD from the vault to an API over HTTP 402** and gets a risk report.
3. In the dapp press **Pause agent**, rerun step 1: the agent alerts instead of paying.

## Path B: prove correctness
```bash
npm test          # 110 tests: circles, vault, registry, agent on a local chain, 402 service, 40 random circles
npm run e2e       # 51 headless browser checks (needs Chromium; CI installs it)
```
Try to break it: the self-audit lists what we found ([AUDIT](AUDIT.md)); the fuzz test asserts solvency and debtor-safety after every transaction and was mutation-checked (it fails when we sabotage the contract).

## Path C: Portaldot testnet
**Agent policy renewed November 1:** valid until **December 1, 2026 at 15:37:18 UTC (16:37:18 Lagos)**, with 10 mUSD per-payment and 30 mUSD daily limits. The [deployment record](../deployments/portaldot.json) includes the renewal receipt at block **279265**. To inspect it in the app, open the demo circle, paste vault `0x98017f2275B6758791687e0916cFc4933351482E` into **Vault address**, and press **Load vault**. You do not need a wallet to read its policy. Only its owner can change it; use your own vault or the local demo accounts for hands-on policy tests. Renewal authorizes the agent but does not start its process.

Status: **deployed and verified October 24, 2026** on chain **420420777**. Registry: `0x317a5d7D429221CcD383fFAb87e81b0D5C12d602`. Registry transaction: `0xb227a40604be4783d1d0de7d2b47503f952c00158bcc3370b43bb1d03b73734e` at block **179978**.

All 12 deployment/setup transactions are finalized. The [README proof table](../README.md#testnet-deployment-proof) lists all four addresses; [deployments/portaldot.json](../deployments/portaldot.json) contains receipts, code hashes and the recorded state. The explorer entry point is https://node-console.portaldot.dev/.

Open [the live app](https://onchainesusuagent.vercel.app), or run `npm run web` and open http://localhost:5173 to inspect the testnet registry without a wallet. The committed app configuration already selects it. At verification, the circle was Open with **1/3 members**, 10 mUSD dues, 15-minute rounds and **50 test mUSD** in the agent vault. A full cycle and paid API interaction on testnet remain to be demonstrated; use Path A for the complete local rehearsal. Deployment and funding details are in [DEPLOY.md](DEPLOY.md).

## Mapping to the judging criteria

| Criterion | Evidence | How to verify |
|---|---|---|
| **Technical feasibility (30%)** | 3 protocol contracts, agent, dapp, paid API; 110 contract/agent/service tests + 51 browser checks; randomized solvency/debtor-safety invariants; 12 finalized testnet deployment/setup transactions | Paths A, B and C; `git log` |
| **Innovation (30%)** | Slot-priced collateral that makes early payout safe; portable on-chain reputation with a Sybil guard; an AI agent bounded by owner-set on-chain limits that also **pays for APIs over HTTP 402** | `AgentAllowance.sol`, `agent/service.js`, `npm run demo:buy` |
| **Ecosystem contribution (20%)** | Verified `0x` → `5…` address helper; tested deployment guide including storage costs; reusable reputation registry; MIT-licensed source (repository currently private) | [`lib/portaldot.js`](../lib/portaldot.js), [DEPLOY.md](DEPLOY.md) |
| **Business potential (20%)** | Clear user (Nigerian savings circles), 0.5% fee capped at 2%, paid risk API, B2B for cooperatives; costed roadmap; sourced market facts | [BUSINESS.md](BUSINESS.md), [GRANTS.md](GRANTS.md), [ROADMAP.md](../ROADMAP.md) |

## Where we are honest about gaps
- The app is hosted on Vercel and the contracts are deployed. The full multi-member testnet cycle and live paid API remain unverified. WASM/ink! is not used; there is no external audit or recruited pilot-user evidence. See the README status table.
- Collateral is a deterrent for **late** slots: an early miss by a late-slot member can shorten later pots (explicit, never insolvent). Reputation gating is the mitigation. Details: [AUDIT.md](AUDIT.md).
