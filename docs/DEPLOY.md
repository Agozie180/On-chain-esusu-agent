# Deploy to Portaldot V3 testnet: wallet, test POT, deploy

Do these on **your own computer**. Everything here is testnet only. Never put a key that holds real money anywhere near this project, and never paste a private key or seed phrase into a chat, a Discord ticket, or a screenshot. Portaldot's team says it will never ask for them.

## Use the existing deployment

The stack is already deployed on chain **420420777**. Start with `npm install` and `npm run web`, then open http://localhost:5173. No wallet or redeployment is required for read-only inspection. The [README proof table](../README.md#testnet-deployment-proof) lists all four contract addresses; [deployments/portaldot.json](../deployments/portaldot.json) contains the 12 finalized receipts, code hashes and setup snapshot.

At the October 24 verification snapshot, the circle was Open with one of three members, dues of 10 mUSD and 15-minute rounds. The owner occupies UI slot 1 (contract slot 0), and the vault holds 50 test mUSD. The remaining two slots need separate members, mock-token collateral/dues and enough native gas. The owner renewed the vault policy on November 1 for 30 days, until December 1, 2026 at 15:37:18 UTC, with the same spending limits. Its agent has a recorded 0.1 tPOTv3; estimate the intended actions before assuming that is sufficient.

To renew again, run `npm run policy:extend` from the owner checkout with `PRIVATE_KEY` configured locally. It sets expiry to 30 days from the latest chain timestamp, retains the agent and caps, and records the receipt in `deployments/portaldot.json`. `setPolicy` also resets the spending period and its spent counter. This command submits a testnet transaction and does not start the agent process.

### November 1 demo preparation and no-faucet fallback

The testnet circle still has 1/3 members. Two dedicated demo wallets were generated locally, received test-gas funding and mock mUSD, and approved collateral/contributions; [the preparation checkpoint](../deployments/portaldot-demo.json) records those transactions. Keys are in the git-ignored `.testnet-demo-wallets.json`. Additional faucet tokens were unavailable, so the remaining joins and full testnet cycle have not been executed. Do not delete these keys if resuming later.

`npm run demo:testnet -- --check` is read-only. `--run` resumes submitted transactions and performs the cycle, preserving existing vault policy; only use it after funding the entire run and reviewing its fee budget. The current script caps cumulative fees at 55 tPOTv3 and stops if more are needed. Do not run a second agent on the same circle during a demo run. There is no need to redeploy contracts.

The hosted **Watch demo** section instead replays `web/demo-recording.json`, produced by `npm run demo:record` on a fresh local Hardhat chain. This uses the actual contracts and agent loop, requires no faucet and clearly labels every stage as local. It demonstrates nine contributions, three agent payments, three settlements, and all wallet claims without claiming testnet execution.

The wallet/deployment steps below are for operators. The committed checkpoint belongs to this deployment and its owner: rerunning the script with the same keys/configuration reuses its transactions. For a separate stack, use a separately named Hardhat network and deployment record, preserving this evidence; do not overwrite the checkpoint with an unrelated wallet or local deployment.

## Network values

| Item | Value |
|---|---|
| Network name | PortaldotV3 Testnet |
| EVM RPC | `https://test-evm-rpc-v3.portaldot.dev` |
| Chain ID | `420420777` |
| Currency symbol | `tPOTv3` |
| Substrate WebSocket | `wss://test-node-v3.portaldot.dev` |
| Node Explorer | https://node-console.portaldot.dev/ |

(These are the updated endpoints from the hackathon announcement. Older guides show `feso-apps.xyz` URLs; the announcement says the previous endpoints are no longer in use.)

## Why there are two addresses

Every Portaldot V3 account has two faces:

- **EVM address** `0x...` (what MetaMask, Hardhat and this project's contracts see).
- **Native address** `5...` (what the faucet and the Node Explorer use).

Test tokens are sent to the **`5...`** address and then show up as the balance of its matching `0x...` address. The project computes the `5...` address for you (`npm run wallet:show`). That derivation was checked against the example in the official PortaldotV3 Testnet guide, and you can double-check any address in the Node Explorer: Developer, Runtime calls, `reviveApi`, `accountId`, paste the `0x...` address.

Decimals also differ by side: native amounts use 14 decimals, EVM amounts use 18. Balances in MetaMask and in this project's dapp are the EVM (18-decimal) view.

## Step 1: Create the wallet

You need two keys: an **owner** (deploys the contracts and owns the vault) and an **agent** (holds gas and can call the vault's bounded dues and service-payment functions). Use two separate keys. The agent can also call permissionless circle settlement.

**Option A: MetaMask (recommended for the owner)**
1. Install MetaMask and create a **new** wallet or account just for testnet.
2. Add the network: Settings, Networks, Add a network manually, enter the values above. Leave the block explorer URL empty (the official guide does).
3. Export the owner's private key: account menu, Account details, Show private key. Keep it private.

**Option B: let this repo generate keys locally**
```bash
git clone https://github.com/Agozie180/On-chain-esusu-agent.git
cd On-chain-esusu-agent
npm install
npm run wallet      # creates PRIVATE_KEY and AGENT_PRIVATE_KEY in a git-ignored .env, prints addresses
```
You can import the owner key into MetaMask (Import account, Private key) to use the dapp.

For Option A, copy `.env.example` to `.env` only if `.env` does not already exist. Set the owner key locally as `PRIVATE_KEY=0x...`, then run `npm run wallet` to generate a missing agent key and synchronize public addresses. Existing keys are retained unless you explicitly use `--rotate-agent`; rotation also requires updating any deployed policy.

## Step 2: Get your `5...` addresses

```bash
npm run wallet:show
```
It prints, for the owner and the agent, the `0x...` EVM address and the **native `5...` address**. Copy the `5...` ones.

## Step 3: Claim test POT

There is no self-serve faucet page that I could find in the public docs, so test POT is handed out by the Portaldot team. Based on the hackathon announcement:

1. **If you gave your native `5...` address when you registered on DoraHacks**, the first batch was sent automatically. Skip to step 4 and check your balance. (That address will not be the one from step 2 unless you registered it. If it differs, either ask them to also fund the step-2 address, or use the wallet you registered with as the owner.)
2. **If you did not**, open a support ticket in the Portaldot Discord (https://discord.gg/portaldot) and include:
   - a screenshot of your DoraHacks registration or participation page,
   - your **native `5...` address** (not the `0x` one).
3. **If you still have nothing** after the first batch, DM an admin: on DoraHacks `@Stella707827`, or in the Portaldot Discord `@titus242471`, giving your `5...` address. The announcement says another distribution round will cover people who missed the first.

Tip: ask for **all the addresses you will use in one message**: owner, agent, and one or two extra demo-member accounts (a circle needs at least two members; for the demo video use two or three MetaMask accounts).

## Step 4: Check you are ready

```bash
npm run compile
npm run preflight
```
Preflight checks connectivity, chain ID and balances. Before a new registry transaction, it also compares the registry's estimated gas and storage cost with the owner balance. That is only the first deployment step: reserve enough for the token, circle, vault and setup too. The deploy script can fund an empty agent at the end (`AGENT_GAS_TPOT`, default 0.1), but neither a nonzero balance nor that default guarantees later actions are affordable. When a registry transaction is already recorded, preflight reports that fact; the deployment script performs the resume verification.

## Step 5: Deploy

### Deployed stack and funding history (October 24, 2026)

The deployment completed after the owner was funded to 2499.9 tPOTv3. All 12 transactions succeeded and were verified against finalized block 180016. Receipt fees, including storage deposits, total 2438.7170914772332804 tPOTv3; agent funding was 0.1 tPOTv3. The remaining owner balance was 61.0829085227667196 tPOTv3. See [deployments/portaldot.json](../deployments/portaldot.json) for the complete snapshot. The committed app configuration and the maintainer's local `.env` now use this deployment; clones do not receive private keys. The build used Solidity 0.8.24, optimizer 200 runs and Paris EVM. No compiler experiment or reduced gas limit was applied.

The following diagnosis records the earlier funding blocker, which is now resolved:

At 499.9 tPOTv3, the owner could not cover the registry's 1045.38 upfront estimate. Native `system_dryRun` returned `Invalid(Payment)`. Portaldot's `DepositPerByte` was 0.06 tPOTv3, and an 8,000,000 gas override failed with `Invalid call: Payment`. The four standalone contract estimates totaled about 2395.60 before setup. An additional 2000 tPOTv3 resolved the shortfall. [Historical preflight evidence](../deployments/portaldot-preflight.json) also records the unapplied via-IR experiment, which reduced the registry estimate to 919.40 but still exceeded the earlier balance. Those measurements are historical, not an outstanding funding request.

### Route 1: Hardhat (one command)
```bash
# .env must contain PRIVATE_KEY (owner) and AGENT_ADDRESS (the agent's 0x address)
npm run deploy:testnet
```
For a fresh deployment, this deploys the registry, mock mUSD, demo circle and agent vault, sets the agent's limits, funds the vault and joins the owner to UI slot 1. Every submitted transaction is checkpointed in `deployments/<network>.json`; reruns verify and reuse recorded transactions. Keep the recorded keys, configuration and build consistent. The existing `portaldot.json` is already complete.

The successful Windows run set `NODE_OPTIONS=--no-network-family-autoselection --dns-result-order=ipv4first` to avoid intermittent Node connection failures and used `GAS_PRICE_WEI=32040`, close to the then-current node quote. Receipts report an effective gas price of 31880. Obtain a fresh `eth_gasPrice` quote for future transactions; do not reuse a stale fixed price or set a small gas limit to hide storage costs.

If it fails, the script prints a hint:

| Symptom | What to do |
|---|---|
| `Invalid Transaction` | Check funding first. Our earlier native dry-run decoded this as `Invalid(Payment)` with the unfunded balance. Switching tools will not remove storage deposits; a different rejection may need separate diagnosis. |
| `insufficient funds` or a huge gas figure | Run preflight and compare `eth_estimateGas × eth_gasPrice` with the wallet balance. The estimate includes storage deposits; do not force a small gas limit to bypass them. |
| cannot reach the RPC | Run `npm run preflight`; try another network or VPN. |
| anything else | Record the failing step, public transaction hash and RPC error for diagnosis. Keep keys and `.env` contents private. |

### Route 2: Remix + MetaMask (the route the official guide uses)
1. `npm run flatten` writes single-file contracts to `docs/remix/` (they are also committed in the repo).
2. Open https://remix.ethereum.org and upload `EsusuRegistry.sol`, `AgentAllowance.sol`, `MockToken.sol` from `docs/remix/`.
3. Compiler: `0.8.24`, optimizer on with `200` runs, EVM version `paris`. Compile each.
4. Deploy tab, environment **Injected Provider - MetaMask**, MetaMask on PortaldotV3 Testnet with the owner account.
5. Deploy in this order and save every address and tx hash:
   - `MockToken` (no arguments). Call `mint(yourAddress, 1000000000)` (that is 1000 mUSD at 6 decimals).
   - `EsusuRegistry` with `owner_` = your 0x, `treasury_` = your 0x, `feeBps_` = `50`.
   - On the registry call `createCircle(token, dues, size, roundDuration, minScore)`, for example `(<MockToken address>, 10000000, 3, 900, 0)` for 10 mUSD dues, 3 members, 15-minute rounds. Read the new circle's address from the `CircleCreated` event or from `circles(0)`.
   - `AgentAllowance` with `owner_` = your 0x and `token_` = the MockToken address.
6. Then use the dapp (below) for joining, setting the agent policy, allowlisting the circle and funding the vault, or call those functions in Remix.

## Step 6: Use it

```bash
npm run web
# open http://localhost:5173/?registry=<registry address>
```
The committed configuration already selects the deployed registry, so the query parameter is optional. Use a fresh browser profile if cached local-demo addresses are selected, or load the registry from the README. Connect MetaMask on Portaldot testnet to act. The deployed owner's slot and vault policy are already set up; join the two remaining slots using other accounts, with mock-token collateral and native gas, before starting the circle.

To run the agent, configure `VAULT`, `OWNER`, `CIRCUITS` (or `REGISTRY`) and `AGENT_PRIVATE_KEY` locally. The deployer checkout already has these values. Estimate the next action's fee, fund the agent as needed and check the policy expiry before `npm run agent`. It polls until Ctrl+C. For local rehearsals, explicitly override the RPC, registry, circle, vault, owner and agent to the demo values so the testnet `.env` is not used.

## Publish the live app

### Vercel (primary host)

The production URL is https://onchainesusuagent.vercel.app. Import the repository with **Root Directory `.`** and **Framework Preset Other**. The root `vercel.json` defines the remaining settings:

| Setting | Value |
|---|---|
| Install Command | `npm ci --include=dev` |
| Build Command | `npm run build` |
| Output Directory | `web` |

The build compiles the contracts, generates the browser ABIs/bytecode and shared risk grader, and publishes the public testnet configuration from `deployments/portaldot.json`. It needs no wallet keys and sends no transactions. `artifacts/` is ignored by Git, so a fresh deployment must compile before generating `web/contracts.js`. Only `web/` is served; the agent, paid API and local blockchain are separate processes and are not Vercel functions.

Push to the connected production branch (`main`) to deploy, or run `vercel deploy --prod --project onchainesusuagent` from the repository root. For a local build check, run `npm ci --include=dev && npm run build`.

**October 31 hosting diagnosis:** the live root returned HTTP 404 with `X-Vercel-Error: NOT_FOUND`, even though Vercel reported the deployment as Ready. The project used the default output directory (`.`), while `index.html` lives in `web/`, and no default `build` script existed. The explicit output directory and build command fix this mismatch. A 504 would be a separate timeout; the homepage is static and does not wait for the Portaldot RPC to respond.

Run `npm run test:web` to check the configured output locally, or `npm run test:web -- https://onchainesusuagent.vercel.app` after deployment. This checks the root page, its scripts and generated configuration, and confirms repository source files are not served. The homepage should display even without a wallet; chain connectivity is checked separately in the browser.

### GitHub Pages (optional)

The Pages workflow failed with "Get Pages site failed ... Not Found" because no Pages site exists, and GitHub Pages is not available on private repositories on the free plan. To publish there as well, do these in order:

1. Make the repository public (Settings, General, Danger Zone, Change visibility).
2. Settings, Pages, Build and deployment, Source: **GitHub Actions**.
3. Settings, Secrets and variables, Actions, Variables, New repository variable: `PAGES_ENABLED` = `true`.
4. Actions tab, Pages workflow, Run workflow.

Until step 3 the workflow is skipped. These steps are only needed for GitHub Pages; Vercel hosting does not depend on them.

## Step 7: Put the proof in the repo

The README now includes all four addresses, the registry transaction and explorer entry point; `deployments/portaldot.json` records every receipt. Preserve this evidence and update the README and generated configuration whenever an intentionally new deployment replaces it. The announced check-in required a repo link, architecture diagram, contract address, transaction hash and a demo video (at most three minutes) or live link. Its October 24 12:00 UTC deadline preceded this deployment; submission status is not inferred from the completed technical work.

## Observed behavior and remaining network questions

- Native 14 decimals vs EVM 18 decimals. Do not mix them when reporting balances.
- Other builders reported missing `eth_getLogs` results for native-path calls; this remains unverified here. Read the contract's spending counters and circle paid flags alongside logs when investigating activity.
- Gas estimates include storage deposits. The earlier insufficient-balance rejection and subsequent funded deployment both confirmed the need to budget for them.
- Pallet-revive can differ from the standard EVM in places. If something behaves unexpectedly on testnet but passes locally, capture the exact error and ask in Office Hours (apply by Oct 27, 12:00 UTC).

## What has and has not been tested

Local chains: the current 110 Hardhat tests and 45 browser checks pass. On Portaldot, all 12 deployment and setup transactions succeeded and were finalized on October 24. Deployed code, owners, policy, allowlists, vault token funding, circle membership and wallet balances were checked. The demo circle is open with one of three slots filled; a complete multi-member cycle on testnet has not yet run.
