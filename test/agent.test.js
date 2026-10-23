// The agent loop against a real (in-process) chain: discovery, paying inside the lead window, alerting instead of
// paying when it cannot, settling, and being refused by the chain when the owner pulls the kill switch mid-flight.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployRegistry, deployToken, mkCircle } = require("./helpers");
const { tick, discover } = require("../agent/agent");

async function world() {
  const [, , , owner, agent, m2, m3, stranger] = await ethers.getSigners();
  const { reg } = await deployRegistry(0);
  const tok = await deployToken(); const ta = await tok.getAddress();
  const dues = 10_000_000n;
  const mine = await mkCircle(reg, m2, { token: ta, dues, size: 3, dur: 86400 });
  const notMine = await mkCircle(reg, m2, { token: ta, dues, size: 3, dur: 86400 });
  const nativeOne = await mkCircle(reg, m2, { dues: ethers.parseEther("1"), size: 3, dur: 86400 });
  for (const [i, m] of [owner, m2, m3].entries()) {
    await tok.mint(m.address, 1_000_000_000n);
    await tok.connect(m).approve(await mine.getAddress(), await mine.collateralFor(i)); await mine.connect(m).join(i);
  }
  await tok.mint(stranger.address, 1_000_000_000n);
  await tok.connect(stranger).approve(await notMine.getAddress(), await notMine.collateralFor(0)); await notMine.connect(stranger).join(0);
  for (const [i, m] of [owner, m2, m3].entries()) await nativeOne.connect(m).join(i, { value: await nativeOne.collateralFor(i) }); // native circle becomes Active
  const vault = await (await ethers.getContractFactory("AgentAllowance")).deploy(owner.address, ta);
  const va = await vault.getAddress();
  await tok.connect(owner).transfer(va, 100_000_000n);
  await vault.connect(owner).setPolicy(agent.address, dues, dues * 3n, 86400, (await time.latest()) + 30 * 86400);
  await vault.connect(owner).setCircuit(await mine.getAddress(), true);
  const cfg = { provider: ethers.provider, wallet: agent, vaultAddr: va, ownerAddr: owner.address, registryAddr: await reg.getAddress(), lead: 3600, state: {} };
  const run = async () => { const out = []; await tick({ ...cfg, onEvent: (r) => out.push(r) }); return out; };
  return { reg, tok, mine, notMine, nativeOne, vault, owner, m2, m3, cfg, run, dues };
}

describe("agent loop on a real chain", () => {
  it("discovers only open/active circles the owner is a member of", async () => {
    const { cfg, mine, nativeOne } = await world();
    const found = await discover(cfg);
    expect(found).to.have.members([await mine.getAddress(), await nativeOne.getAddress()]);
  });

  it("waits while far from the deadline, flags circles it cannot pay, pays in the lead window", async () => {
    const { run, mine, nativeOne, owner } = await world();
    const ma = await mine.getAddress(), na = await nativeOne.getAddress();
    let out = await run();
    expect(out.find((x) => x.circuit === ma).action).to.equal("wait");
    const nat = out.find((x) => x.circuit === na);
    expect(nat.action).to.equal("alert"); // active native circle, token vault
    expect(nat.reason).to.match(/different asset/);

    await time.increase(86400 - 1800); // 30 min left, lead is 60 min
    out = await run();
    const r = out.find((x) => x.circuit === ma);
    expect(r.action).to.equal("pay");
    expect(r.tx).to.match(/^0x/);
    expect(await mine.paid(0, owner.address)).to.equal(true);
    out = await run();
    expect(out.find((x) => x.circuit === ma).action).to.equal("wait"); // never pays twice
  });

  it("settles after the deadline, and a paused vault produces an alert, not a doomed transaction", async () => {
    const { run, mine, vault, owner, tok, m2, m3 } = await world();
    const ma = await mine.getAddress();
    await time.increase(86400 - 1800);
    await vault.connect(owner).setPaused(true);
    let out = await run();
    let r = out.find((x) => x.circuit === ma);
    expect(r.action).to.equal("alert"); expect(r.severity).to.equal("critical"); expect(r.tx).to.equal(undefined);
    await vault.connect(owner).setPaused(false);
    out = await run();
    expect(out.find((x) => x.circuit === ma).action).to.equal("pay");
    for (const m of [m2, m3]) { await tok.connect(m).approve(ma, 10_000_000n); await mine.connect(m).contribute(); }
    out = await run();
    r = out.find((x) => x.circuit === ma);
    expect(r.action).to.equal("settle");
    expect(await mine.currentRound()).to.equal(1n);
  });

  it("when the vault is short it alerts early (warn) instead of failing at the deadline", async () => {
    const { run, mine, vault, owner } = await world();
    await vault.connect(owner).withdraw(100_000_000n);
    const ma = await mine.getAddress();
    const out = await run();
    const r = out.find((x) => x.circuit === ma);
    expect(r.action).to.equal("alert"); expect(r.severity).to.equal("warn");
  });
});
