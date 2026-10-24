# Grant and sponsor brief

**Project:** On-chain Esusu-agent. Trust-minimized savings circles plus a spend-capped AI agent, for Portaldot V3 (EVM).
**Maintainer:** Agozie180 (solo builder, Nigeria). **License:** MIT. **Repo:** github.com/Agozie180/On-chain-Esusu-agent

## Status, honestly
Built and tested locally (110 contract/agent/service tests, 45 browser checks) and deployed on Portaldot V3 testnet on October 24, 2026. All 12 deployment/setup transactions are finalized; [addresses and proof](../README.md#testnet-deployment-proof) are recorded. The demo circle has one of three members at the verification snapshot. There is no external audit, recruited pilot-user evidence or revenue; a grant would fund the step from deployed prototype to an audited pilot. The MIT-licensed repository is currently private and Pages hosting is not yet configured.

## Why it fits an ecosystem fund
- Reusable work already in the repo: a verified `0x` to `5...` address helper, a deployment guide with measured storage costs, an on-chain reputation registry, and a bounded-agent vault pattern with locally tested HTTP 402 payments.
- A concrete, local use case with a sourced market (see [BUSINESS](BUSINESS.md)).

## Proposed milestones (editable proposal, not a commitment)
| Milestone | Deliverable | Indicative budget (USD) |
|---|---|---|
| M1 | Complete the deployed testnet demo cycle, pilot with 5 circles, hosting, UX fixes and local-language copy | 3,000 |
| M2 | External audit of 3 contracts, fixes, bug bounty pool | 12,000 |
| M3 | Mainnet launch with deposit cap, reputation SDK, docs | 6,000 |
| M4 | 3 cooperative partnerships, on/off-ramp integration | 6,000 |

Budgets are estimates to be adjusted with the funder; audit pricing in particular varies.

The existing deployment used about 2438.72 tPOTv3 in receipt fees including storage deposits, plus 0.1 tPOTv3 for agent funding. These are test tokens, not a USD expense or a mainnet cost forecast. See [DEPLOY.md](DEPLOY.md) for the recorded measurements.

## Sponsorship tiers (proposal)
- **Supporter:** logo in README and dapp footer.
- **Infrastructure partner:** co-branded pilot, shared reporting.
- **Audit sponsor:** named in the audit report and security page.

## Contact
Open an issue on the repo or message the maintainer through GitHub.
