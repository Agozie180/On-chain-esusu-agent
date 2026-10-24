# Contributing

Issues and pull requests are welcome, especially: Portaldot-specific findings (gas, logs, address mapping), new tests that try to break the invariants, and translations of the dapp copy (Yoruba, Igbo, Hausa, Pidgin).

```bash
npm install
npm test            # 110 contract, agent and service tests, including 40 randomized circles
npm run test:fuzz   # randomized circles (FUZZ_RUNS=500 for more)
npm run e2e         # 45 real-browser checks (needs Chromium)
```

Use Node 22 or later. Install the browser with `npx playwright-core install chromium`, or set `CHROMIUM_PATH` to an installed Chrome/Chromium executable. If another demo uses the default ports, set `ESUSU_E2E_RPC_PORT` and `ESUSU_E2E_WEB_PORT` to unused ports before running the browser suite.

`npm run demo:local` creates a local rehearsal; `npm run web` uses the committed Portaldot testnet configuration. The [deployed addresses and receipts](README.md#testnet-deployment-proof) are real testnet records. Keep those records when experimenting with a separate deployment, and never replace them with local-chain output.

After Solidity changes, regenerate the browser bundle with `npm run build:web` and Remix sources with `npm run flatten`. Update test counts, status and links when behavior changes. Consult [DEPLOY](docs/DEPLOY.md) for storage-deposit funding and checkpoint/resume behavior; `npm run preflight` performs read-only checks.

Rules: keep the agent's powers minimal (any new capability needs a test proving the agent cannot abuse it); every bug fix ships with a test that fails without the fix; never commit `.env` or keys. Be kind: this project is meant to be usable by people who are new to crypto.
