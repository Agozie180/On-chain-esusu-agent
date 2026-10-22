// Pre-join risk report for a circle:  node agent/risk.js <circleAddress> [slot]
// Reads only on-chain facts (config, members, reputation, defaults) and prints a deterministic grade.
require("dotenv").config();
const { ethers } = require("ethers");
const { assessCircle } = require("./policy");

const CIRCLE = ["function size() view returns (uint256)", "function dues() view returns (uint256)", "function minScore() view returns (uint256)",
  "function feeBps() view returns (uint16)", "function roundDuration() view returns (uint256)", "function registry() view returns (address)",
  "function slotOwner(uint256) view returns (address)", "function defaulted(address) view returns (bool)", "function collateralFor(uint256) view returns (uint256)"];
const REG = ["function scoreOf(address) view returns (uint256)"];

async function main() {
  const [addr, slotArg] = process.argv.slice(2);
  if (!ethers.isAddress(addr || "")) throw new Error("usage: node agent/risk.js <circleAddress> [slot]");
  const provider = new ethers.JsonRpcProvider(process.env.PORTALDOT_EVM_RPC || "https://test-evm-rpc-v3.portaldot.dev");
  const c = new ethers.Contract(addr, CIRCLE, provider);
  const [size, dues, minScore, feeBps, dur, registry] = await Promise.all([c.size(), c.dues(), c.minScore(), c.feeBps(), c.roundDuration(), c.registry()]);
  const reg = registry !== ethers.ZeroAddress ? new ethers.Contract(registry, REG, provider) : null;
  const members = [];
  for (let i = 0; i < Number(size); i++) {
    const m = await c.slotOwner(i);
    members.push(m === ethers.ZeroAddress ? null : { score: reg ? Number(await reg.scoreOf(m)) : 0, defaulted: await c.defaulted(m) });
  }
  const slot = slotArg === undefined ? Number(size) - 1 : Number(slotArg);
  const out = assessCircle({ size: Number(size), dues, minScore: Number(minScore), feeBps: Number(feeBps), roundDuration: Number(dur), members, slot });
  console.log(JSON.stringify({ circle: addr, slot, collateralForSlot: (await c.collateralFor(slot)).toString(), ...out }, null, 2));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
