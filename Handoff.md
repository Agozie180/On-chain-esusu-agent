# Handoff: On-chain Esusu-agent (Portaldot Hacker House 2026)

Updated: 2026-10-22 evening (v2). Keep this current so work can resume in a new chat.

## What exists (all local, nothing on testnet yet)
- v2 contracts: `EsusuRegistry`, `EsusuCircle` (slot-priced collateral, ERC-20, leave(), fee, reputation gate), `AgentAllowance` (per-asset vault).
- Agent: `agent/` (pure decision core, risk grader, Telegram alerts, state file).
- Dapp: `web/` (registry discovery, slot picker, risk grade, ERC-20 approve flows, vault controls).
- Tests: 35 unit/integration + 40 fuzz circles + 32-check headless-browser e2e. Demo: `scripts/demo.js`.
- Docs: README (judge-facing), ARCHITECTURE.md, docs/AUDIT.md (findings and residual risks).

## Deadlines (UTC)
- **Check-in: Oct 24 12:00** (public repo, README, architecture diagram, contract address + tx hash, demo video <= 3 min or live link)
- Office hour application: Oct 27 12:00 · Final submission / code freeze: Nov 6 04:00

## Next steps, in order
1. Create public repo `Agozie180/On-chain-Esusu-agent`, push (author Agozie180 only, no co-author trailers).
2. Get test POT (native address starting with 5; Discord ticket or DM admin).
3. `npx hardhat run scripts/deploy.js --network portaldot` (omit SOLC_JS offline workaround); paste addresses and tx hashes into README. Fix whatever Portaldot's EVM does differently (gas, log range in the dapp's activity panel, finality).
4. Open the dapp against testnet (`npm run web`), run a real 3-person circle, record the 90s demo (script in ARCHITECTURE.md).
5. Submit the check-in on DoraHacks. Then: run the agent as a service, pitch deck, decide the WASM/ink! question via Office Hours.

## Notes
- Compile offline with `SOLC_JS=1`; on a normal machine omit it. Do not commit `.env`; never share keys.
- The WASM/ink! side is NOT built and must not be claimed (see ARCHITECTURE.md open question).
- Parallel deadlines: Qloo (Oct 31 4:45am Lagos), BLI (Nov 1).
