# Judge guide: verify everything in 5 minutes

## The 10-second version
Esusu (ajo) circles run on trust and break when someone takes the pot and vanishes. This project puts the circle on-chain with **collateral priced by payout slot** (a paid-out member can never leave in debt), a **portable reputation score**, and an **AI agent that pays your dues from a vault you cap** and cannot withdraw, pay itself, or pay anyone you did not allowlist.

## Path A: 60 seconds, nothing to install but Node 22, no tokens, no wallet

The repository is currently private, so clone access requires permission. Public hosting is not yet configured. Once you have repository access:
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
3. In the dapp press **Kill switch**, rerun step 1: the agent alerts instead of paying.

## Path B: prove correctness
```bash
npm test          # 110 tests: circles, vault, registry, agent on a local chain, 402 service, 40 random circles
npm run e2e       # 45 headless browser checks (needs Chromium; CI installs it)
```
Try to break it: the self-audit lists what we found ([AUDIT](AUDIT.md)); the fuzz test asserts solvency and debtor-safety after every transaction and was mutation-checked (it fails when we sabotage the contract).

## Path C: Portaldot testnet
Status: **deployed and verified October 24, 2026** on chain **420420777**. Registry: `0x317a5d7D429221CcD383fFAb87e81b0D5C12d602`. Registry transaction: `0xb227a40604be4783d1d0de7d2b47503f952c00158bcc3370b43bb1d03b73734e` at block **179978**.

All 12 deployment/setup transactions are finalized. The [README proof table](../README.md#testnet-deployment-proof) lists all four addresses; [deployments/portaldot.json](../deployments/portaldot.json) contains receipts, code hashes and the recorded state. The explorer entry point is https://node-console.portaldot.dev/.

Run `npm run web` and open http://localhost:5173 to inspect the testnet registry without a wallet. The committed app configuration already selects it. At verification, the circle was Open with **1/3 members**, 10 mUSD dues, 15-minute rounds and **50 test mUSD** in the agent vault. A full cycle and paid API interaction on testnet remain to be demonstrated; use Path A for the complete local rehearsal. Deployment and funding details are in [DEPLOY.md](DEPLOY.md).

## Mapping to the judging criteria

| Criterion | Evidence | How to verify |
|---|---|---|
| **Technical feasibility (30%)** | 3 protocol contracts, agent, dapp, paid API; 110 contract/agent/service tests + 45 browser checks; randomized solvency/debtor-safety invariants; 12 finalized testnet deployment/setup transactions | Paths A, B and C; `git log` |
| **Innovation (30%)** | Slot-priced collateral that makes early payout safe; portable on-chain reputation with a Sybil guard; an AI agent bounded by owner-set on-chain limits that also **pays for APIs over HTTP 402** | `AgentAllowance.sol`, `agent/service.js`, `npm run demo:buy` |
| **Ecosystem contribution (20%)** | Verified `0x` → `5…` address helper; tested deployment guide including storage costs; reusable reputation registry; MIT-licensed source (repository currently private) | [`lib/portaldot.js`](../lib/portaldot.js), [DEPLOY.md](DEPLOY.md) |
| **Business potential (20%)** | Clear user (Nigerian savings circles), 0.5% fee capped at 2%, paid risk API, B2B for cooperatives; costed roadmap; sourced market facts | [BUSINESS.md](BUSINESS.md), [GRANTS.md](GRANTS.md), [ROADMAP.md](../ROADMAP.md) |

## Where we are honest about gaps
- The stack is deployed, but the full multi-member testnet cycle, live paid API and Pages hosting are not complete. WASM/ink! is not used; there is no external audit or recruited pilot-user evidence. See the README status table.
- Collateral is a deterrent for **late** slots: an early miss by a late-slot member can shorten later pots (explicit, never insolvent). Reputation gating is the mitigation. Details: [AUDIT.md](AUDIT.md).
