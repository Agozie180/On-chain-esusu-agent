// Extend the agent vault policy, keeping every limit the same:  npm run policy:extend   (DAYS=30 by default)
// Owner-only. Reads the vault and current limits from the chain, then calls setPolicy with a new expiry.
// Note: setPolicy also restarts the spending period (spent-this-period goes back to zero).
require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const { NETWORK } = require("../lib/portaldot");

const ABI = [
  "function owner() view returns (address)",
  "function agent() view returns (address)",
  "function perTxCap() view returns (uint256)",
  "function periodCap() view returns (uint256)",
  "function periodLength() view returns (uint256)",
  "function expiry() view returns (uint256)",
  "function setPolicy(address,uint256,uint256,uint256,uint256)",
];

(async () => {
  const file = "deployments/portaldot.json";
  const dep = JSON.parse(fs.readFileSync(file, "utf8"));
  const days = Number(process.env.DAYS || 30);
  const provider = new ethers.JsonRpcProvider(process.env.PORTALDOT_EVM_RPC || NETWORK.evmRpc, undefined, { staticNetwork: true });
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const vault = new ethers.Contract(dep.vault, ABI, wallet);

  if ((await vault.owner()).toLowerCase() !== wallet.address.toLowerCase()) throw new Error("PRIVATE_KEY is not the vault owner");
  const [agent, perTx, period, len, old] = await Promise.all([vault.agent(), vault.perTxCap(), vault.periodCap(), vault.periodLength(), vault.expiry()]);
  const now = (await provider.getBlock("latest")).timestamp;
  const expiry = now + days * 86400;
  console.log(`vault ${dep.vault}\nagent ${agent}\nold expiry ${new Date(Number(old) * 1000).toISOString()}\nnew expiry ${new Date(expiry * 1000).toISOString()} (+${days} days)\nlimits kept: perTx ${perTx}, period ${period}, length ${len}s`);

  const tx = await vault.setPolicy(agent, perTx, period, len, expiry, process.env.GAS_LIMIT ? { gasLimit: BigInt(process.env.GAS_LIMIT) } : {});
  console.log("tx", tx.hash);
  const rc = await tx.wait();
  console.log("status", rc.status === 1 ? "OK" : "FAILED", "block", rc.blockNumber);
  console.log("on-chain expiry now", new Date(Number(await vault.expiry()) * 1000).toISOString());

  dep.expiry = expiry; dep.tx = { ...dep.tx, extendPolicy: tx.hash };
  fs.writeFileSync(file, JSON.stringify(dep, null, 2) + "\n");
})().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
