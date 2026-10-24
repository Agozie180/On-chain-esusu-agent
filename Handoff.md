# Handoff

Project: On-chain Esusu-agent, Portaldot Hacker House 2026. Repo: github.com/Agozie180/On-chain-Esusu-agent

## State
Built and tested locally: 110 Hardhat tests, 45 browser checks. Docs complete (README, JUDGES, ROADMAP, GRANTS, BUSINESS, SECURITY, AUDIT rounds 1-2, DEPLOY, DEMO_SCRIPT).
**Not done:** testnet deploy (insufficient test tokens), demo video, making repo public, Pages setup.

## Deployment diagnosis, October 24

The RPC is reachable and chain ID 420420777 is confirmed. All 110 current Hardhat tests pass. No deployment was accepted: the owner has confirmed and pending nonce 0, and the checkpoint has no transaction hashes.

Owner balance: 499.9 tPOTv3. Registry alone estimates 1045.38 tPOTv3 upfront; the registry, mock token, vault and a standalone circle estimate about 2395.60 combined, before setup. The actual registry-created circle and final fees may differ. Native `system_dryRun` of the signed registry deployment returns `0x010001` = `Err(Invalid(Payment))`. Storage deposits are real: runtime `DepositPerByte` is 0.06 tPOTv3. An 8,000,000 gas override fails with `Invalid call: Payment`.

Request about 2500 additional tPOTv3 for native owner address `5FZ8pjBgxovYQ59uUecrY9Nuv3tAramyvP8LNPHE54Xk9FXs`, then rerun preflight and deployment. Public diagnostics are in `deployments/portaldot-preflight.json`; private keys remain in `.env`. Do not lower gas to bypass storage costs. Node network access was intermittent; PowerShell HTTP and curl reached the RPC.

Compiler experiments (not applied) reduced registry runtime code from 12,912 to 11,324 bytes using via-IR, optimizer runs 1 and no CBOR metadata. The smaller registry still estimates 919.40 tPOTv3, above the available balance. Production compiler settings remain unchanged.

## Next steps (your machine)
1. `npm install && npm run wallet && npm run wallet:show`; get tPOTv3 for the 5... addresses (Discord ticket or admins, see docs/DEPLOY.md)
2. `npm run preflight && npm run deploy:testnet` (or the Remix route)
3. `npm run publish:config`, commit, push; set Pages source to GitHub Actions
4. Make repo public; put addresses and tx hashes in README
5. Record the demo ([script](docs/DEMO_SCRIPT.md)); submit by Oct 24 12:00 UTC check-in
6. Apply for Office Hours by Oct 27 12:00 UTC (gas/logs, WASM question)

## Deadlines
Check-in Oct 24 12:00 UTC; Office Hours Oct 27 12:00 UTC; code freeze Nov 6 04:00 UTC. Need at least 3 commits in the window.

## Commit rule
Author Agozie180 only, no Co-Authored-By or Claude trailers.
