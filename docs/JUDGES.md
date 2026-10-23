# Judge guide: verify everything in 5 minutes

## The 10-second version
Esusu (ajo) circles run on trust and break when someone takes the pot and vanishes. This project puts the circle on-chain with **collateral priced by payout slot** (a paid-out member can never leave in debt), a **portable reputation score**, and an **AI agent that pays your dues from a vault you cap** and cannot withdraw, pay itself, or pay anyone you did not allowlist.

## Path A: 60 seconds, nothing to install but Node 22, no tokens, no wallet
```bash
git clone https://github.com/Agozie180/On-chain-Esusu-agent && cd On-chain-Esusu-agent
npm install
npm run demo:local         # starts a local chain, seeds it, serves the dapp
```
Open http://127.0.0.1:5173. You will see (without connecting any wallet):
- a **live circle** where one member already defaulted (see the red "defaulted" tag and their slashed collateral),
- an **open circle** (pick a slot and read its **risk grade**),
- a **gated circle** that needs reputation 150 (the judge account is refused with `ScoreTooLow`),
- reputations earned by a finished circle.

To act, the demo prints a public dev key and the MetaMask network values. Then:
1. `npm run agent` (command printed by the demo): the agent discovers your circle and **pays your dues from the vault**.
2. `npm run demo:buy`: the agent **pays 1 mUSD from the vault to an API over HTTP 402** and gets a risk report.
3. In the dapp press **Kill switch**, rerun step 1: the agent alerts instead of paying.

## Path B: prove correctness
```bash
npm test          # 101 tests: circles, vault, registry, agent on a real chain, 402 service, 40 random circles
npm run e2e       # real headless Chromium drives the dapp end to end (needs a Chromium; CI does this)
```
Try to break it: the self-audit lists what we found ([AUDIT](AUDIT.md)); the fuzz test asserts solvency and debtor-safety after every transaction and was mutation-checked (it fails when we sabotage the contract).

## Path C: Portaldot testnet
Status: **deployment pending** (the build environment cannot reach Portaldot). The README will list contract addresses and transaction hashes here the moment they exist; we do not claim them before. Everything needed is in [DEPLOY.md](DEPLOY.md).

## Mapping to the judging criteria

| Criterion | Evidence | How to verify |
|---|---|---|
| **Technical feasibility (30%)** | 3 contracts, agent, dapp, paid API; 101 contract/agent tests + 39 browser checks; randomized solvency/debtor-safety invariants; mutation-checked; self-audit with fixes pinned by tests; commit history | Path A and B; `git log` |
| **Innovation (30%)** | Slot-priced collateral that makes early payout safe; portable on-chain reputation with a Sybil guard; an AI agent bounded by owner-set on-chain limits that also **pays for APIs over HTTP 402** | `AgentAllowance.sol`, `agent/service.js`, `npm run demo:buy` |
| **Ecosystem contribution (20%)** | Verified `0x` → `5…` address helper; deploy kit and guide for other builders; reusable reputation registry; open source, MIT | [`lib/portaldot.js`](../lib/portaldot.js), [DEPLOY.md](DEPLOY.md) |
| **Business potential (20%)** | Clear user (Nigerian savings circles), 0.5% fee capped at 2%, paid risk API, B2B for cooperatives; costed roadmap; sourced market facts | [BUSINESS.md](BUSINESS.md), [GRANTS.md](GRANTS.md), [ROADMAP.md](../ROADMAP.md) |

## Where we are honest about gaps
- Not yet on Portaldot testnet; WASM/ink! not used; not audited; no real users yet (pre-launch). See the README status table.
- Collateral is a deterrent for **late** slots: an early miss by a late-slot member can shorten later pots (explicit, never insolvent). Reputation gating is the mitigation. Details: [AUDIT.md](AUDIT.md).
