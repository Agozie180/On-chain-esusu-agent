// Local end-to-end demo (in-process chain): reputation-aware circle in a stable token, an agent that pays
// dues inside on-chain limits, the guardrails refusing abuse, a defaulter being slashed, and the kill switch.
//   SOLC_JS=1 npx hardhat run scripts/demo.js
const hre = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { tick } = require("../agent/agent");
const { assessCircle } = require("../agent/policy");

const h = (s) => console.log(`\n== ${s}`);
const usd = (n) => (Number(n) / 1e6).toFixed(2) + " mUSD";

async function main() {
  const { ethers } = hre;
  const [deployer, treasury, , owner, agent, bola, chidi, thief] = await ethers.getSigners();
  const dues = 10_000_000n; // 10 mUSD

  const reg = await (await ethers.getContractFactory("EsusuRegistry")).deploy(deployer.address, treasury.address, 50);
  const tok = await (await ethers.getContractFactory("MockToken")).deploy();
  for (const m of [owner, bola, chidi]) await tok.mint(m.address, 1000_000_000n);

  h("Create a 3-member weekly circle in mUSD (0.5% protocol fee)");
  const tx = await reg.connect(owner).createCircle(await tok.getAddress(), dues, 3, 3600, 0);
  const rc = await tx.wait();
  const addr = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "CircleCreated").args.circle;
  const circle = await ethers.getContractAt("EsusuCircle", addr);

  h("Members pick payout slots. Earlier slot = more collateral locked (so a paid member can never leave in debt)");
  for (const [slot, m, name] of [[0, owner, "owner"], [1, bola, "Bola"], [2, chidi, "Chidi"]]) {
    const col = await circle.collateralFor(slot);
    await tok.connect(m).approve(addr, col); await circle.connect(m).join(slot);
    console.log(`${name}: slot ${slot + 1}, collateral ${usd(col)}`);
  }
  console.log("risk report for a newcomer eyeing the last slot:", JSON.stringify(assessCircle({ size: 3, dues, minScore: 0, feeBps: 50, roundDuration: 3600, slot: 2,
    members: [{ score: 0, defaulted: false }, { score: 0, defaulted: false }, { score: 0, defaulted: false }] })));

  h("Owner funds an agent vault (mUSD) and sets limits: 10/payment, 20/day, this circle only");
  const vault = await (await ethers.getContractFactory("AgentAllowance")).deploy(owner.address, await tok.getAddress());
  const vaddr = await vault.getAddress();
  await vault.connect(owner).setPolicy(agent.address, dues, dues * 2n, 86400, (await time.latest()) + 14 * 86400);
  await vault.connect(owner).setCircuit(addr, true);
  await tok.connect(owner).transfer(vaddr, dues * 5n);

  h("GUARDRAILS: stranger calls the agent entrypoint / agent pays a non-allowlisted address / agent withdraws");
  for (const [label, p] of [["stranger", vault.connect(thief).payDues(addr)], ["bad target", vault.connect(agent).payDues(thief.address)], ["agent withdraw", vault.connect(agent).withdraw(1n)]])
    await p.then(() => console.log(label, "WENT THROUGH (bug!)"), (e) => console.log(`${label}: blocked (${(e.message.match(/custom error '([^']+)'/) || [])[1] || e.shortMessage})`));

  const cfg = { provider: ethers.provider, wallet: agent, vaultAddr: vaddr, ownerAddr: owner.address, circuits: [addr], lead: 3600, state: {} };

  h("Agent tick: inside the lead window, so it pays the owner's dues from the vault");
  await tick(cfg);
  await tok.connect(bola).approve(addr, dues); await circle.connect(bola).contribute();
  h("Chidi forgets to pay. Deadline passes. Agent settles: Chidi's collateral covers the gap, Chidi is flagged");
  await time.increase(3601);
  await tick(cfg);
  console.log("owner withdrawable:", usd(await circle.credit(owner.address)), "| Chidi defaulted:", await circle.defaulted(chidi.address), "| treasury fee:", usd(await circle.credit(treasury.address)));

  h("Owner hits the kill switch; the agent sees it, stands down and alerts the owner (the chain would refuse it anyway)");
  await vault.connect(owner).setPaused(true);
  await tick(cfg);
  console.log("reputation (owner, Chidi):", (await reg.scoreOf(owner.address)).toString(), (await reg.scoreOf(chidi.address)).toString());
}
main().catch((e) => { console.error(e); process.exit(1); });
