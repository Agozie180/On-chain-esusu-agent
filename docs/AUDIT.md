# Self-audit log

Playbook law L12: findings, fixes, and the test that pins each fix. Not a third-party audit.

## v1 findings (commit fcb9a40) and v2 fixes

| # | Finding | Severity | v2 fix | Pinned by |
|---|---------|----------|--------|-----------|
| F1 | A member who received the pot early could stop paying and leave with more than their collateral | High (economic) | Position-weighted collateral: collateral(p) = dues x max(1, size-1-p), so remaining obligations after receipt are fully covered; each missed round slashes exactly one `dues` | `debtor-safety` tests, fuzz invariant I10 |
| F2 | A circle that never fills had no exit; collateral locked forever | High (funds stuck) | `leave()` while Open refunds and shifts positions | `leave` tests |
| F3 | Native token only | Medium (product) | ERC-20 mode via immutable `token` (zero = native), SafeERC20 | ERC-20 suite |
| F4 | No portable reputation | Medium (product) | `EsusuRegistry` records outcomes reported only by circles it deployed; `scoreOf(addr)`; circles can set `minScore` | registry tests |
| F5 | Settlement used native `call` with no reentrancy guard on paths that move value | Low | OpenZeppelin `ReentrancyGuard` + pull payments only | reentrancy attacker test |
| F6 | Slashed pot could be short with no defined behavior | Medium | Recipient is paid exactly what was collected; shortfall is explicit in an event; bounded by collateral rules | fuzz conservation invariant |
| F7 | No revenue model | Product | `feeBps` on payouts to registry treasury (capped at 2%) | fee tests |
| F8 | Dapp never exercised in a browser | Process | Dapp v2 plus checklist in Handoff | manual (open) |

## Known residual risks (v2)
- Pre-receipt defaulters are only covered by one `dues` of collateral at minimum; further misses shorten the pot (the recipient absorbs the shortfall). Mitigations: `minScore` gating, reputation penalties, ejection of defaulters from future rounds' expectations is NOT implemented.
- Join order decides payout position; positions are not auctioned or randomized. Early positions pay for earliness through higher collateral.
- No oracle or off-chain identity: Sybil members can build score by running circles among themselves. Score is a signal, not proof of personhood.
- Not audited by a third party. Do not use real funds.
- Behavior of Portaldot V3 EVM under load, gas pricing and finality is unverified until deployed.

## Round 2 (pre-submission, full re-audit)

| # | Finding | Fix | Pinned by |
|---|---------|-----|-----------|
| R1 | Agent vault only covered dues, not paid APIs (idea 2 incomplete) | Lane 2 `payService` with payee allowlist, per-payee cap, cannot pay itself | `service.test.js`, `AgentAllowance.test.js` |
| R2 | Sybil: tiny circles could farm reputation | `MIN_REP_SIZE = 3`; defaults always count | `Audit.test.js` |
| R3 | `settleRound` gas grows with members | `MAX_SIZE = 30` (measured ~30k gas per member) | gas tests |
| R4 | Fee-on-transfer tokens could break accounting | balance-delta check, `UnsupportedToken` | `FeeToken` test |
| R5 | Dapp "Agent activity" failed on young chains | clamp log range at 0 | e2e |
| R6 | Judges could not try the app without wallet and tokens | read-only mode, `demo:local`, `config.js` | e2e |
| R7 | Registry ownership single-step | `Ownable2Step` | registry tests |
| R8 | Docs overstated or lacked status | README status table, no testnet claims until real | review |

Result: 101 contract/agent tests and 39 browser checks pass locally. Still unaudited externally.
