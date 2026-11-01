// Reproducible, free recording of actual contract transactions on a local Hardhat chain.
// No testnet RPC, private testnet key, faucet, or background service is used.
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { runDemo } = require("./testnet-demo");

async function main() {
  if (Number((await ethers.provider.getNetwork()).chainId) !== 31337) throw new Error("Recording is restricted to a local Hardhat chain");
  const [owner, member2, member3, agent] = await ethers.getSigners();
  const registry = await (await ethers.getContractFactory("EsusuRegistry")).deploy(owner.address, owner.address, 50);
  const token = await (await ethers.getContractFactory("MockToken")).deploy();
  const receipt = await (await registry.createCircle(await token.getAddress(), 10_000_000n, 3, 900, 0)).wait();
  const created = receipt.logs.map((log) => { try { return registry.interface.parseLog(log); } catch { return null; } }).find((e) => e?.name === "CircleCreated");
  const circle = await ethers.getContractAt("EsusuCircle", created.args.circle);
  const vault = await (await ethers.getContractFactory("AgentAllowance")).deploy(owner.address, await token.getAddress());
  await token.mint(owner.address, 100_000_000n);
  await token.approve(await circle.getAddress(), 20_000_000n);
  await circle.join(0);
  await token.transfer(await vault.getAddress(), 50_000_000n);
  await vault.setPolicy(agent.address, 10_000_000n, 30_000_000n, 86400, await time.latest() + 30 * 86400);
  await vault.setCircuit(await circle.getAddress(), true);
  const report = { environment: "local", label: "Recorded local contract demo", registry: await registry.getAddress() };
  await runDemo({ provider: ethers.provider, owner, agent, members: [member2, member3],
    deployment: { chainId: 31337, circle: await circle.getAddress(), vault: await vault.getAddress(), token: await token.getAddress() },
    report, save() {}, pauseMs: 0, fundGas: false });
  // Include real receipts, so the downloadable record is more than a list of claimed hashes.
  for (const row of report.transactions) {
    const rc = await ethers.provider.getTransactionReceipt(row.hash);
    if (rc.status !== 1) throw new Error("Recording contains a failed transaction");
    row.receipt = { transactionHash: rc.hash, blockHash: rc.blockHash, blockNumber: rc.blockNumber, status: rc.status,
      from: rc.from, to: rc.to, logs: rc.logs.map((log) => ({ address: log.address, topics: log.topics, data: log.data })) };
  }
  const target = path.join(__dirname, "..", "web", "demo-recording.json");
  fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
  console.log("Saved a complete LOCAL recording to", target);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
