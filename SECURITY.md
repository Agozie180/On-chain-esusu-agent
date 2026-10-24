# Security policy

## Status
Hackathon-grade code. **Not audited by a third party.** Do not use with real funds. The repository's own review is in [docs/AUDIT.md](docs/AUDIT.md), including known residual risks.

The contracts are deployed on Portaldot V3 **testnet**, chain 420420777. [Addresses and transaction proof](README.md#testnet-deployment-proof) and [finalized receipts](deployments/portaldot.json) identify this deployment. Verification here means confirmed code, transactions and configuration, not an external audit or explorer source-code verification. The deployed mUSD has unrestricted minting and no monetary backing.

## Reporting a vulnerability
Please do not open a public issue for a vulnerability. Use GitHub's private vulnerability reporting for this repository (Security tab, "Report a vulnerability"), or contact the maintainer through the GitHub profile linked on the repo. Include steps to reproduce and the affected contract or script. We aim to acknowledge within 3 days.

There is no bug bounty yet. A bounty is on the [roadmap](ROADMAP.md) and is planned to launch alongside the external audit.

## Scope
In scope: `contracts/` (`EsusuCircle`, `EsusuRegistry`, `AgentAllowance`), `agent/`, `web/`, `scripts/`. Out of scope: test-only contracts under `contracts/test/`, third-party dependencies, and Portaldot chain behavior.

## Design properties we stand behind (and test)
- The agent key cannot withdraw, change limits, un-pause, allowlist, pay itself or pay non-allowlisted addresses.
- A circle's balance always equals credits plus collateral plus live pots (checked after every transaction in randomized simulations).
- A member who has been paid out holds collateral at least equal to the dues they still owe.
- The registry owner can only change the fee (capped at 2%) and treasury for **future** circles; existing circles copy their terms as immutables.
- Keys: `.env` is git-ignored; scripts never print private keys; agent and owner keys are separate.
- Vault policies reject a zero owner, zero/same-as-owner agent and zero-length spending periods; ERC-20 vaults reject normal native-token deposits.
- Paid-API clients reject asset/chain mismatches before spending; concurrent requests cannot redeem one receipt twice within a running service instance.
- The browser blocks writes on an unexpected network and renders external token metadata as text. Local validation covers 110 contract/agent/service tests and 45 browser checks.

The testnet snapshot records 0.1 tPOTv3 on the agent and a policy expiry of November 7, 2026 at 21:30:06 UTC. A nonzero gas balance does not prove the next transaction is affordable: Portaldot fees include storage deposits. Estimate each intended action before funding or running the agent.
