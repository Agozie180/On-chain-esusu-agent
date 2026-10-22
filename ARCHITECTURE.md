# Architecture: implementation blueprint (v2)

## Thesis (enforced in code)
**The agent can pay your dues. It can never pay itself, choose the amount, or send money anywhere you have not allowlisted. A paid-out member can never leave the circle in debt.**

## Contracts
| Contract | Job |
|---|---|
| `EsusuRegistry` | Factory for circles, fee config (cap 2%), reputation ledger writable only by circles it deployed, `scoreOf`, paged circle listing |
| `EsusuCircle` | One circle: slot-priced collateral, rounds, slashing, forfeited-slot rollover, pull payouts, fee, optional `minScore`, native or ERC-20 |
| `AgentAllowance` | Per-asset owner vault with an agent key bounded by allowlist, per-tx cap, period cap, expiry, kill switch |
| `test/MockToken`, `test/Reenterer` | Test-only helpers |

## Economic design
- Slot `s` (0-indexed) of `n`: collateral `dues x max(1, n-1-s)`. After receiving, the member still owes `(n-1-s)` rounds; collateral covers that exactly (I10).
- Missed round: `dues` slashed from collateral into that round's pot, member flagged `defaulted`, slot forfeited (pot rolls to the next slot; last slot: split among honest members).
- If collateral is exhausted, the pot is short and the recipient absorbs it explicitly; funds are never owed that do not exist (I6).
- Fee `feeBps` taken from payouts to the registry treasury.

## Invariants (each pinned by tests)
| ID | Invariant | Where tested |
|---|---|---|
| I1 | Agent never supplies the amount (read from `circle.dues()`) | AgentAllowance tests |
| I2 | Beneficiary of an agent payment is always the owner | AgentAllowance tests |
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

## Priorities (cut from the bottom)
- **P0 done (local):** contracts, tests, fuzz, agent, dapp, browser e2e.
- **P0 open:** Portaldot testnet deploy with tx hashes in README; 90s demo video; check-in submission (Oct 24 12:00 UTC).
- **P1:** run the agent as a service during the demo window; pitch deck; real users in a live circle on testnet.
- **P2:** WASM/ink! integration (see below).
- **P3:** keeper incentives for `settleRound`, slot auctions, naira-pegged stable support.

## Open question: honest use of Portaldot's WASM + EVM
The judging rubric rewards "effective use of WASM/EVM compatibility, modular architecture, multi-chain". This build uses the EVM side only, and the README says so. The public docs found so far describe V1 and do not specify how V3 contracts of the two kinds call each other. Do not claim interop until it is shown working. Plan: bring this to Office Hours (apply by Oct 27 12:00 UTC) and the Discord, then decide between (a) an ink! reputation mirror readable from EVM, if cross-VM calls exist, or (b) a clearly separate ink! component with a real, tested purpose.

## Non-goals
No lending/yield. No agent custody. No fiat ramp. No audit or production claim.

## Demo script (~90s)
1. Registry + circle on testnet; two members join slots (show different collateral per slot and the risk grade).
2. Guardrails first: stranger, non-allowlisted target, agent withdraw, all rejected on-chain.
3. Agent pays the owner's dues from the vault; a member forgets; deadline passes; agent settles; the defaulter is slashed and flagged; reputation moves.
4. Owner hits the kill switch; agent alerts instead of paying.

## Submission checklist
- [ ] Public repo, at least 3 commits during Oct 14 to Nov 6 (done locally, push needed)
- [ ] Testnet addresses, tx hashes, explorer links in README
- [ ] Architecture diagram (Mermaid in README)
- [ ] Demo video <= 3 min with a real testnet interaction
- [ ] DoraHacks check-in by Oct 24 12:00 UTC; final submission by Nov 6 04:00 UTC; pitch deck
