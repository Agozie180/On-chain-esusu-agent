# Contributing

Issues and pull requests are welcome, especially: Portaldot-specific findings (gas, logs, address mapping), new tests that try to break the invariants, and translations of the dapp copy (Yoruba, Igbo, Hausa, Pidgin).

```bash
npm install
npm test            # all contract, agent and service tests
npm run test:fuzz   # randomized circles (FUZZ_RUNS=500 for more)
npm run e2e         # real-browser test (needs Chromium)
```
Rules: keep the agent's powers minimal (any new capability needs a test proving the agent cannot abuse it); every bug fix ships with a test that fails without the fix; never commit `.env` or keys. Be kind: this project is meant to be usable by people who are new to crypto.
