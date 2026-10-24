// Read-only check before deploying:  node scripts/preflight.js
// Confirms the RPC answers, the chain id is right, and the owner wallet has gas.
require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const { h160ToSs58, NETWORK } = require("../lib/portaldot");

(async () => {
  const rpc = process.env.PORTALDOT_EVM_RPC || NETWORK.evmRpc;
  const out = (ok, msg) => console.log(`${ok ? "OK  " : "FAIL"} ${msg}`);
  let bad = 0;
  const provider = new ethers.JsonRpcProvider(rpc, undefined, { staticNetwork: true });
  try {
    const id = Number((await provider.send("eth_chainId", [])));
    out(id === NETWORK.chainId, `RPC ${rpc} answers with chain id ${id} (expected ${NETWORK.chainId})`); if (id !== NETWORK.chainId) bad++;
    out(true, `latest block ${await provider.getBlockNumber()}`);
  } catch (e) { out(false, `cannot reach ${rpc}: ${e.shortMessage || e.message}. Try another network, VPN, or the Remix route in docs/DEPLOY.md`); process.exit(1); }

  if (!process.env.PRIVATE_KEY) { out(false, "PRIVATE_KEY missing in .env (run: npm run wallet)"); process.exit(1); }
  const w = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const bal = await provider.getBalance(w.address);
  console.log(`\nowner EVM address  : ${w.address}\nowner native (5...) : ${h160ToSs58(w.address)}`);
  out(bal > 0n, `owner balance ${ethers.formatEther(bal)} tPOTv3 (EVM side shows 18 decimals; native side uses 14)`); if (bal === 0n) bad++;
  if (bal === 0n) console.log("     -> no gas yet: send the native 5... address above to the faucet (see docs/DEPLOY.md step 3)");
  if (process.env.AGENT_ADDRESS) {
    const ab = await provider.getBalance(process.env.AGENT_ADDRESS);
    out(ab > 0n, `agent balance ${ethers.formatEther(ab)} (the agent needs a little gas to call payDues and settleRound)`);
  }
  try {
    const gasPrice = BigInt(await provider.send("eth_gasPrice", []));
    console.log(`gasPrice ${gasPrice}`);
    const checkpoint = fs.existsSync("deployments/portaldot.json")
      ? JSON.parse(fs.readFileSync("deployments/portaldot.json", "utf8")) : null;
    if (!checkpoint?.tx?.registryDeploy) {
      const artifactPath = "artifacts/contracts/EsusuRegistry.sol/EsusuRegistry.json";
      if (!fs.existsSync(artifactPath)) throw new Error("Run npm run compile before checking deployment funding");
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode);
      const tx = await factory.getDeployTransaction(w.address, process.env.TREASURY || w.address, Number(process.env.FEE_BPS ?? 50));
      // Pallet-revive includes storage deposits in gas. A small manual gas limit cannot remove them.
      const gas = BigInt(await provider.send("eth_estimateGas", [{ from: w.address, data: tx.data, gasPrice: ethers.toQuantity(gasPrice) }]));
      const required = gas * gasPrice;
      out(bal >= required, `registry alone needs approximately ${ethers.formatEther(required)} tPOTv3 upfront (fees and storage deposits)`);
      if (bal < required) {
        bad++;
        console.log(`     -> registry funding shortfall: ${ethers.formatEther(required - bal)} tPOTv3; the token, circle, vault and setup need additional funding`);
      }
    } else console.log("Registry transaction already recorded; use deploy:testnet to resume and verify it.");
  } catch (e) { out(false, `cannot verify deployment funding: ${e.shortMessage || e.message}`); bad++; }
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(`Preflight failed: ${e.shortMessage || e.message}`); process.exit(1); });
