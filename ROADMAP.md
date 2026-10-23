# Roadmap

Honest status first: the protocol, agent and dapp are built and tested locally. Nothing is on Portaldot testnet yet and nothing is audited. Dates after the hackathon are plans, not promises.

## Phase 0: Hackathon (Oct 14 to Nov 6, 2026)
- [x] Circle, registry and agent-vault contracts; 101 tests including randomized solvency checks
- [x] Agent with auto-discovery, alerts, risk grader; paid risk API over HTTP 402
- [x] Dapp with read-only mode; one-command judge demo; CI and Pages workflows
- [x] Self-audit rounds 1 and 2 with fixes pinned by tests
- [ ] Deploy to Portaldot V3 testnet, publish addresses and tx hashes (Oct 24 check-in)
- [ ] 3-minute demo video ([script](docs/DEMO_SCRIPT.md))
- [ ] Office Hours: Portaldot gas/log behavior and the WASM/ink! question

## Phase 1: Private beta (Nov to Dec 2026)
- Testnet pilot with 3 to 5 real friend/family circles (no real money), collecting where the UX confuses people
- Fix whatever Portaldot-specific behavior the pilot reveals
- Yoruba, Igbo, Hausa and Pidgin copy in the dapp
- Mobile-first redesign and WalletConnect support

## Phase 2: Audit and mainnet readiness (Q1 2027)
- External smart-contract audit of the three contracts (budget in [GRANTS](docs/GRANTS.md))
- Public bug bounty alongside the audit
- Resolve the design risks listed in [AUDIT](docs/AUDIT.md): late-slot early defaults, Sybil reputation, slot allocation (auction or randomization option)
- Mainnet deploy only after the audit is clean, with a deposit cap

## Phase 3: Product (Q2 2027)
- Stablecoin-first circles, with naira on/off-ramp partners
- Reputation SDK so other Portaldot dapps can gate on `scoreOf`
- Agent: more providers, spend analytics, notifications beyond Telegram
- Portaldot WASM/ink! evaluation, only if Office Hours shows a real benefit

## Phase 4: Scale (H2 2027)
- White-label for cooperatives and market associations ([BUSINESS](docs/BUSINESS.md))
- Group-credit features built on reputation
