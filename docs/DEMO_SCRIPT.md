# 3-minute demo script

Record at 1080p and keep under 3:00. The stack is deployed on Portaldot V3 testnet; show the [registry transaction and contract addresses](../README.md#testnet-deployment-proof). The verification snapshot has one of three circle members and 50 test mUSD in the vault. Do not describe the seeded local default/gated circles as testnet state.

## Rehearsal setup

- **Complete local flow:** run `npm run demo:local`, then open http://127.0.0.1:5173. Use the full local agent configuration printed by the demo, and set `CIRCUITS` to its `liveCircle` from `.local-demo.json`; this overrides any existing testnet value in `.env`. `npm run demo:buy` uses the local paid API. The agent loops until stopped with Ctrl+C.
- **Testnet capture:** stop the local web server, run `npm run web`, and use the committed Portaldot configuration. Fill the remaining two slots with separate wallets, supply their mock-token collateral/dues and estimate gas for every participant and the agent. The agent's recorded 0.1 tPOTv3 is not proof that an action is affordable. Check the policy expiry (November 7, 2026 at 21:30:06 UTC). Setup and 12 finalized transactions are verified; a full live cycle/API demonstration still requires rehearsal. See [DEPLOY.md](DEPLOY.md).

If combining testnet deployment proof with the local end-to-end rehearsal, announce the switch clearly. The 15-minute testnet round duration also requires advance preparation or edited footage for a three-minute video.

## Recording sequence

1. **0:00 Problem (15s):** "Ajo circles break when someone takes the pot and disappears."
2. **0:15 Dapp (30s):** show the testnet registry transaction and state. For the prepared local flow, identify it as local, then show the seeded default, slot risk grade and gated-circle rejection.
3. **0:45 Collateral idea (30s):** explain that earlier slots lock more, so a paid member can never leave in debt.
4. **1:15 Agent (45s):** start the agent with the selected environment's explicit configuration; show dues paid from the capped vault and a rejected withdrawal attempt.
5. **2:00 Paid API (30s):** in the local rehearsal, run `npm run demo:buy`; the agent pays over HTTP 402 and receives a risk report. A testnet API requires its own running service and verified funding first.
6. **2:30 Kill switch (15s):** press it, rerun the agent, it only alerts.
7. **2:45 Close (15s):** 110 tests, 45 browser checks, 12 finalized deployment/setup transactions, remaining pilot work and the repo link. Public repo access and Pages hosting still need configuration.
