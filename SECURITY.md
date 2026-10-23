# Security policy

## Status
Hackathon-grade code. **Not audited by a third party.** Do not use with real funds. The repository's own review is in [docs/AUDIT.md](docs/AUDIT.md), including known residual risks.

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
