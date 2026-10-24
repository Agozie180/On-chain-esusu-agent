# Deploy to Portaldot V3 testnet: wallet, test POT, deploy

Do these on **your own computer**. Everything here is testnet only. Never put a key that holds real money anywhere near this project, and never paste a private key or seed phrase into a chat, a Discord ticket, or a screenshot. Portaldot's team says it will never ask for them.

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

You need two keys: an **owner** (deploys the contracts, owns the vault) and an **agent** (a hot key that only pays gas and can only call `payDues`). Use two separate keys.

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

For Option A, also run `cp .env.example .env`, paste the owner key as `PRIVATE_KEY=0x...`, then `npm run wallet` to generate only the agent key (it never overwrites a key that exists).

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
npm run preflight
```
It confirms the RPC answers, the chain id is `420420777`, and the owner has a non-zero balance, and it warns if the agent has none. Do not continue until both are OK.

## Step 5: Deploy

### Confirmed funding requirement (October 24, 2026)

The owner wallet has 499.9 tPOTv3, but the registry deployment estimates 1045.38 tPOTv3 upfront. Native `system_dryRun` confirms `Invalid(Payment)`. Portaldot charges storage deposits; `DepositPerByte` is 0.06 tPOTv3. Reducing the gas limit to 8,000,000 fails with `Invalid call: Payment` and does not bypass these costs. The four contract estimates total about 2395.60 before setup, with the circle estimated as a standalone deployment. Request approximately 2500 additional test tokens, then rerun `npm run preflight` and deploy. See `deployments/portaldot-preflight.json` for the observed values.

### Route 1: Hardhat (one command)
```bash
# .env must contain PRIVATE_KEY (owner) and AGENT_ADDRESS (the agent's 0x address)
npm run deploy:testnet
```
This deploys the registry, a test stable token (mUSD), a demo circle, and your agent vault, sets the agent's limits, funds the vault, and joins you to slot 1. Every step prints its transaction hash, and everything is saved in `deployments/portaldot.json`. Commit that file; the README needs those addresses.

If it fails, the script prints a hint:

| Symptom | What to do |
|---|---|
| `Invalid Transaction` | Check funding first. Our native dry-run decoded this as `Invalid(Payment)` with the current balance. Switching wallets or tools will not remove storage deposits. |
| `insufficient funds` or a huge gas figure | Run preflight and compare `eth_estimateGas × eth_gasPrice` with the wallet balance. The estimate includes storage deposits; do not force a small gas limit to bypass them. |
| cannot reach the RPC | Run `npm run preflight`; try another network or VPN. |
| anything else | Copy the whole error text and send it to me so I can fix the script. |

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
Connect MetaMask (the owner account), press **Add / switch to Portaldot testnet** if needed, and the circle appears under Circles. Join slots from your owner and demo accounts, pay dues, settle, and set up the vault and agent policy.

To run the agent, fill `VAULT`, `OWNER`, `CIRCUITS` (the circle address) and `AGENT_PRIVATE_KEY` in `.env`, make sure the agent address has some gas, then `npm run agent`.

## Publish the live app
After deploying, run `npm run publish:config` to write the addresses into `web/config.js`, commit it, and in GitHub go to Settings, Pages, Source: GitHub Actions. The Pages workflow then serves the dapp read-only for judges.

## Step 7: Put the proof in the repo

Paste into the README: contract addresses, the deploy transaction hashes, and explorer links. Then commit and push (separate, meaningful commits are better than one big one). For the DoraHacks check-in (Oct 24, 12:00 UTC) you need: repo link, architecture diagram, contract address, a transaction hash, and a demo video (3 minutes max) or a live link.

## Known quirks to watch for (reported by other builders, not verified by me)

- Native 14 decimals vs EVM 18 decimals. Do not mix them when reporting balances.
- `eth_getLogs` may return nothing for calls that went through the native path, so the dapp's "Agent activity" panel can look empty even when the agent has paid. The contract state (spent this period, circle paid flags) is still correct.
- Gas estimates include storage deposits. Our October 24 native dry-run confirmed a payment failure at the current balance; a smaller gas override also failed.
- Pallet-revive can differ from the standard EVM in places. If something behaves unexpectedly on testnet but passes locally, capture the exact error and ask in Office Hours (apply by Oct 27, 12:00 UTC).

## What has and has not been tested

Local chains: the current 110 Hardhat tests pass; previous browser and local deployment checks are recorded elsewhere. Portaldot RPC reads, contract simulations and a native signed-transaction dry-run were checked on October 24. **No testnet deployment has been accepted**, because the owner needs additional test tokens for fees and storage deposits.
