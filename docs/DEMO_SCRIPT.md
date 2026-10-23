# 3-minute demo script

Record at 1080p. Keep under 3:00. Use the local demo if testnet is unavailable and say so on camera.

1. **0:00 Problem (15s):** "Ajo circles break when someone takes the pot and disappears."
2. **0:15 Dapp (30s):** open the dapp, show the live circle with a defaulted member, the slot picker and its risk grade, and the gated circle refusing a low-reputation account.
3. **0:45 Collateral idea (30s):** explain that earlier slots lock more, so a paid member can never leave in debt.
4. **1:15 Agent (45s):** run `npm run agent`; it pays your dues from the vault. Show the caps and the agent's inability to withdraw.
5. **2:00 Paid API (30s):** run `npm run demo:buy`; the agent pays over HTTP 402 and receives a risk report.
6. **2:30 Kill switch (15s):** press it, rerun the agent, it only alerts.
7. **2:45 Close (15s):** tests, honest status, roadmap, repo link.
