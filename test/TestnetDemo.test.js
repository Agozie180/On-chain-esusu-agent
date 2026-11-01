const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployToken, mkCircle } = require("./helpers");
const { runDemo } = require("../scripts/testnet-demo");

async function setup() {
  const [owner, m1, m2, agent] = await ethers.getSigners();
  const reg = await (await ethers.getContractFactory("EsusuRegistry")).deploy(owner.address, owner.address, 50);
  const token = await deployToken();
  const dues = 10_000_000n;
  const circle = await mkCircle(reg, owner, { token: await token.getAddress(), dues, size: 3, dur: 900 });
  const vault = await (await ethers.getContractFactory("AgentAllowance")).deploy(owner.address, await token.getAddress());
  await token.mint(owner.address, 100_000_000n);
  await token.approve(await circle.getAddress(), 20_000_000n);
  await circle.join(0);
  await token.transfer(await vault.getAddress(), 50_000_000n);
  await vault.setPolicy(agent.address, dues, dues * 3n, 86400, await time.latest() + 30 * 86400);
  await vault.setCircuit(await circle.getAddress(), true);
  const cfg = { provider: ethers.provider, owner, agent, members: [m1, m2],
    deployment: { chainId: 31337, circle: await circle.getAddress(), vault: await vault.getAddress(), token: await token.getAddress() },
    report: {}, save() {}, pauseMs: 0, fundGas: false };
  return { cfg, circle, token, vault, m1, m2 };
}

describe("Resumable automatic payment and payout demo", function () {
  this.timeout(60000);
  it("runs the real agent for three rounds, transfers payouts/refunds, and does not repeat a completed run", async () => {
    const { cfg, circle, token, vault, m1, m2 } = await setup();
    await runDemo(cfg);
    expect(cfg.report.status).to.equal("completed");
    expect(cfg.report.transactions.filter((r) => r.kind === "agent-payment")).to.have.length(3);
    expect(cfg.report.transactions.filter((r) => r.kind === "round-settled")).to.have.length(3);
    for (const row of cfg.report.transactions.filter((r) => r.kind === "round-settled")) expect(row.payout).to.equal("29850000");
    expect(await circle.state()).to.equal(2);
    expect(await token.balanceOf(await circle.getAddress())).to.equal(0);
    expect(await token.balanceOf(m1.address)).to.equal(39_850_000n);
    expect(await token.balanceOf(m2.address)).to.equal(39_850_000n);
    expect(await vault.balance()).to.equal(20_000_000n);
    const count = cfg.report.transactions.length;
    await runDemo(cfg);
    expect(cfg.report.transactions).to.have.length(count);
  });
  it("recovers a submitted contribution after an interrupted checkpoint without paying twice", async () => {
    const { cfg, circle } = await setup();
    let interrupted = false;
    cfg.save = () => { if (!interrupted && cfg.report.transactions?.some((r) => r.id === "round-1-member-1" && r.status === "pending")) {
      interrupted = true; throw new Error("Simulated interruption");
    } };
    let error;
    try { await runDemo(cfg); } catch (e) { error = e; }
    expect(error.message).to.equal("Simulated interruption");
    cfg.save = () => {};
    await runDemo(cfg);
    expect(cfg.report.status).to.equal("completed");
    expect(cfg.report.transactions.filter((r) => r.id === "round-1-member-1")).to.have.length(1);
    for (let r = 0; r < 3; r++) expect(await circle.paidCount(r)).to.equal(3);
  });
  it("refuses to start the circle when the fee budget is exhausted", async () => {
    const { cfg, circle } = await setup();
    let error;
    try { await runDemo({ ...cfg, maxFees: 0n }); } catch (e) { error = e; }
    expect(error.message).to.include("gas budget exceeded");
    expect(await circle.state()).to.equal(0);
    expect(await circle.filled()).to.equal(1);
    expect(cfg.report.transactions).to.have.length(0);
  });
});
