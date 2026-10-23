// Pre-join risk report for a circle:  node agent/risk.js <circleAddress> [slot]
require("dotenv").config();
const { ethers } = require("ethers");
const { buildReport } = require("./report");

(async () => {
  const [addr, slot] = process.argv.slice(2);
  if (!ethers.isAddress(addr || "")) throw new Error("usage: node agent/risk.js <circleAddress> [slot]");
  const provider = new ethers.JsonRpcProvider(process.env.PORTALDOT_EVM_RPC || "https://test-evm-rpc-v3.portaldot.dev");
  console.log(JSON.stringify(await buildReport(provider, addr, slot), null, 2));
})().catch((e) => { console.error(e.message); process.exit(1); });
