// Builds a deterministic risk report for a circle from on-chain facts only. Used by the CLI and by the paid API.
const { ethers } = require("ethers");
const { assessCircle } = require("./policy");

const CIRCLE = [
  "function state() view returns (uint8)", "function size() view returns (uint256)", "function dues() view returns (uint256)",
  "function token() view returns (address)", "function filled() view returns (uint256)", "function minScore() view returns (uint256)",
  "function feeBps() view returns (uint16)", "function roundDuration() view returns (uint256)", "function registry() view returns (address)",
  "function slotOwner(uint256) view returns (address)", "function defaulted(address) view returns (bool)", "function collateralFor(uint256) view returns (uint256)",
];
const REG = ["function scoreOf(address) view returns (uint256)"];

async function buildReport(provider, circleAddr, slot) {
  if (!ethers.isAddress(circleAddr)) throw new Error("bad circle address");
  const c = new ethers.Contract(circleAddr, CIRCLE, provider);
  const [state, size, dues, token, minScore, feeBps, dur, registry] = await Promise.all([
    c.state(), c.size(), c.dues(), c.token(), c.minScore(), c.feeBps(), c.roundDuration(), c.registry()]);
  const reg = registry !== ethers.ZeroAddress ? new ethers.Contract(registry, REG, provider) : null;
  const members = [];
  for (let i = 0; i < Number(size); i++) {
    const m = await c.slotOwner(i);
    members.push(m === ethers.ZeroAddress ? null : { score: reg ? Number(await reg.scoreOf(m)) : 0, defaulted: await c.defaulted(m) });
  }
  const s = slot === undefined || slot === null || Number.isNaN(Number(slot)) ? Number(size) - 1 : Number(slot);
  if (s < 0 || s >= Number(size)) throw new Error("slot out of range");
  const risk = assessCircle({ size: Number(size), dues, minScore: Number(minScore), feeBps: Number(feeBps), roundDuration: Number(dur), members, slot: s });
  return {
    circle: circleAddr, state: ["Open", "Active", "Completed"][Number(state)], size: Number(size), filled: members.filter(Boolean).length,
    token, dues: dues.toString(), slot: s, collateralForSlot: (await c.collateralFor(s)).toString(), ...risk,
  };
}
module.exports = { buildReport };
