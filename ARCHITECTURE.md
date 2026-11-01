# Architecture: deployed implementation

The registry, circle, test mUSD and agent vault were deployed on Portaldot V3 testnet (chain 420420777) on October 24, 2026. All 12 deployment/setup transactions are finalized. [Addresses and registry transaction](README.md#testnet-deployment-proof) and the [deployment record](deployments/portaldot.json) identify the deployed instances. Validation: 110 contract/agent/service tests and 45 browser checks locally; testnet code, ownership, policy, allowlists and initial balances verified.

## Thesis (enforced in code)
**The agent pays the owner's dues using the amount read from the circle. It can also pay allowlisted service providers within owner-set limits. It cannot withdraw, change those limits or pay itself. A paid-out member's collateral covers their remaining dues.**

## Contracts
| Contract | Job |
|---|---|
| `EsusuRegistry` | Factory for circles, fee config (cap 2%), reputation ledger writable only by circles it deployed, `scoreOf`, paged circle listing |
| `EsusuCircle` | One circle: slot-priced collateral, rounds, slashing, forfeited-slot rollover, pull payouts, fee, optional `minScore`, native or ERC-20 |
| `AgentAllowance` | Per-asset owner vault; dues and service-payment lanes share per-payment/period caps, with per-provider caps, allowlists, expiry and a kill switch |
| `test/MockToken`, `test/Reenterer` | Test-only helpers |

## Economic design
- Slot `s` (0-indexed) of `n`: collateral `dues x max(1, n-1-s)`. After receiving, the member still owes `(n-1-s)` rounds; collateral covers that exactly (I10).
- Missed round: `dues` slashed from collateral into that round's pot, member flagged `defaulted`, slot forfeited (pot rolls to the next slot; last slot: split among honest members).
- If collateral is exhausted, the pot is short and the recipient absorbs it explicitly; funds are never owed that do not exist (I6).
- Fee `feeBps` taken from payouts to the registry treasury.

## Invariants (each pinned by tests)
| ID | Invariant | Where tested |
|---|---|---|
| I1 | For dues, the amount is read from `circle.dues()`; service amounts must satisfy shared and per-provider caps | AgentAllowance tests |
| I2 | Dues are credited to the owner; service payments go only to allowlisted providers | AgentAllowance tests |
| I3 | Only allowlisted circles of the same asset can be paid | AgentAllowance tests |
| I4 | Per-tx and rolling-period caps; kill switch; expiry; fails closed with no policy | AgentAllowance tests |
| I5 | Agent has no withdraw / policy / pause path | AgentAllowance tests |
| I6 | Solvency: balance == credits + collateral + live pots, after every transaction | fuzz + circle tests |
| I7 | No double pay, no pay after deadline, no early settle | circle tests |
| I8 | Only registry-deployed circles can write reputation | registry tests |
| I9 | No stuck funds: balance is 0 after everyone withdraws | fuzz |
| I10 | Debtor-safety: a paid-out member's collateral >= their remaining dues | fuzz + circle tests |

## Agent
- `agent/policy.js`: pure `decide()` and `assessCircle()` (the dapp bundles the same code via `scripts/build-web.js`).
- `agent/agent.js`: polls, acts (`payDues`, `settleRound`), de-duplicated Telegram alerts, optional LLM explanation after the decision.
- `agent/risk.js`: CLI risk grade for a circle and slot.
- `agent/pay-client.js` and `agent/service.js`: HTTP 402 quotes bind the asset and chain; the service checks the token transfer and receipt reference and prevents concurrent double redemption.

The deployed demo circle was Open with one of three members at the recorded snapshot. The vault held 50 test mUSD with a 10 mUSD per-payment cap and 30 mUSD per-day shared cap. The owner renewed the policy on November 1 for 30 days, until December 1, 2026 at 15:37:18 UTC, keeping those limits unchanged; see `policyRenewal` in the [deployment record](deployments/portaldot.json). The full multi-member cycle and paid API flow are proven locally; they have not yet been exercised end to end on testnet.

## Priorities (cut from the bottom)
- **P0 done (local):** contracts, tests, fuzz, agent, dapp, browser e2e.
- **P0 done (testnet):** deploy and configure the full stack; finalize 12 transactions; record addresses and hashes in README.
- **P0 open:** demo video and submission; confirm submission status separately from the completed deployment. The October 24 12:00 UTC check-in deadline preceded deployment.
- **P1:** run the agent as a service during the demo window; pitch deck; real users in a live circle on testnet.
- **P2:** WASM/ink! integration (see below).
- **P3:** keeper incentives for `settleRound`, slot auctions, naira-pegged stable support.

## Open question: honest use of Portaldot's WASM + EVM
The judging rubric rewards "effective use of WASM/EVM compatibility, modular architecture, multi-chain". This build uses the EVM side only, and the README says so. The public docs found so far describe V1 and do not specify how V3 contracts of the two kinds call each other. Do not claim interop until it is shown working. Plan: bring this to Office Hours (apply by Oct 27 12:00 UTC) and the Discord, then decide between (a) an ink! reputation mirror readable from EVM, if cross-VM calls exist, or (b) a clearly separate ink! component with a real, tested purpose.

## Non-goals
No lending/yield. No agent custody. No fiat ramp. No audit or production claim.

## Demo script (~90s)
1. Open the deployed registry and circle; two additional members join the remaining slots (show collateral per slot and the risk grade). Estimate wallet and agent gas before rehearsing; see [DEPLOY](docs/DEPLOY.md).
2. Guardrails first: stranger, non-allowlisted target, agent withdraw, all rejected on-chain.
3. Agent pays the owner's dues from the vault; a member forgets; deadline passes; agent settles; the defaulter is slashed and flagged; reputation moves.
4. Owner hits the kill switch; agent alerts instead of paying.

## Submission checklist
- [x] Code and commit history pushed to GitHub during the hackathon window
- [ ] Public repository access (repository remains private)
- [x] Testnet addresses, transaction hashes and explorer entry point in README
- [x] Architecture diagram (Mermaid in README)
- [ ] Demo video <= 3 min with a real testnet interaction
- [ ] Confirm DoraHacks check-in status (October 24 12:00 UTC deadline passed); final submission by November 6 04:00 UTC; pitch deck

## Update: agent vault lanes and new invariants
- `AgentAllowance` lane 1 `payDues(circle)` and lane 2 `payService(payee, amount, ref)`; shared per-tx and period caps, per-payee caps, expiry, kill switch; the agent cannot pay itself.
- `payService` emits `ServicePaid(payee, amount, ref)`; the HTTP 402 service verifies the ref, a token Transfer and single use.
- `MIN_REP_SIZE = 3` for reputation credit; `MAX_SIZE = 30` per circle.
- Strike rule: a defaulted member forfeits their payout slot; the pot rolls forward.
