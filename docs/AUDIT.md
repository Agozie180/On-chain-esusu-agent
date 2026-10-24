# Self-audit log

Findings, fixes, and the tests that pin each fix. This is an internal review, not a third-party audit.

Current validation (October 24, 2026): **110 contract/agent/service tests and 45 browser checks** pass. The four-contract testnet stack has **12 finalized deployment/setup transactions**, with code and configuration verified; see [deployment evidence](../deployments/portaldot.json). A full testnet savings cycle, live paid API flow and behavior under load remain untested.

## v1 findings (commit fcb9a40) and v2 fixes

| # | Finding | Severity | v2 fix | Pinned by |
|---|---------|----------|--------|-----------|
| F1 | A member who received the pot early could stop paying and leave with more than their collateral | High (economic) | Position-weighted collateral: collateral(p) = dues x max(1, size-1-p), so remaining obligations after receipt are fully covered; each missed round slashes exactly one `dues` | `debtor-safety` tests, fuzz invariant I10 |
| F2 | A circle that never fills had no exit; collateral locked forever | High (funds stuck) | `leave()` while Open refunds collateral and frees the selected slot | `leave` tests |
| F3 | Native token only | Medium (product) | ERC-20 mode via immutable `token` (zero = native), SafeERC20 | ERC-20 suite |
| F4 | No portable reputation | Medium (product) | `EsusuRegistry` records outcomes reported only by circles it deployed; `scoreOf(addr)`; circles can set `minScore` | registry tests |
| F5 | Settlement used native `call` with no reentrancy guard on paths that move value | Low | OpenZeppelin `ReentrancyGuard` + pull payments only | reentrancy attacker test |
| F6 | Slashed pot could be short with no defined behavior | Medium | Recipient is paid exactly what was collected; shortfall is explicit in an event; bounded by collateral rules | fuzz conservation invariant |
| F7 | No revenue model | Product | `feeBps` on payouts to registry treasury (capped at 2%) | fee tests |
| F8 | Dapp never exercised in a browser | Process | Automated browser suite now exercises the dapp on a local chain | `scripts/e2e-browser.js` (45 checks) |

## Known residual risks (v2)
- Pre-receipt defaulters are only covered by one `dues` of collateral at minimum; further misses shorten the pot (the recipient absorbs the shortfall). Mitigations: `minScore` gating, reputation penalties, ejection of defaulters from future rounds' expectations is NOT implemented.
- Join order decides payout position; positions are not auctioned or randomized. Early positions pay for earliness through higher collateral.
- No oracle or off-chain identity: Sybil members can build score by running circles among themselves. Score is a signal, not proof of personhood.
- Not audited by a third party. Do not use real funds.
- Basic Portaldot deployment gas/storage costs and finality were verified for the 12 recorded transactions. Performance under load and full-circle behavior on testnet remain unverified.
- The paid API's issued quotes and used-transaction set are in memory; persistence and restart/recovery behavior need work before a production service.

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

Historical round-2 baseline: 101 contract/agent tests and 39 browser checks. The current total after the hardening below is 110 tests and 45 browser checks. Still unaudited externally.

## October 24 hardening and deployment verification

| Finding | Fix or observation | Evidence |
|---|---|---|
| Zero-length periods could reset cumulative caps on every payment | Reject zero period length and zero/same-as-owner agent addresses | `test/Hardening.test.js` |
| Zero owner or native deposits into an ERC-20 vault could strand funds | Reject zero owner and normal native deposits to token vaults | `test/Hardening.test.js` |
| A paid-API quote could name the wrong asset or chain | Check both against the vault before spending | `test/service.test.js` |
| Concurrent HTTP requests could redeem one payment twice | Recheck and claim the receipt synchronously after verification | `test/service.test.js` race regression |
| Token metadata could be interpreted as HTML | Escape displayed token-derived values | Browser metadata regressions |
| A wallet on the wrong chain could attempt writes | Require the configured chain before enabling an action | Browser wrong-network regressions |
| Deployment could lose progress after a failed step | Save transaction checkpoints and verify resumed bytecode/constructors | `scripts/deploy.js`; finalized deployment record |
| Nonzero balance was insufficient for deployment | Preflight estimates the registry's fee and storage requirement | Earlier `Invalid(Payment)` dry-run and successful funded deployment |

The successful deployment used the existing Solidity 0.8.24 optimizer settings (200 runs, Paris EVM). An isolated via-IR size experiment reduced the estimated registry cost to 919.40 tPOTv3 but was not applied. Receipt fees for the deployed stack and setup total 2438.7170914772332804 tPOTv3. Details and the historical preflight measurements are in [DEPLOY.md](DEPLOY.md) and [portaldot-preflight.json](../deployments/portaldot-preflight.json).
