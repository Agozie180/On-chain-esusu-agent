const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { ZERO, deployRegistry, mkCircle, fill, pay } = require("./helpers");

const D = ethers.parseEther("1");
const DUR = 3600;

async function runClean(reg, creator, members, minScore = 0) {
  const c = await mkCircle(reg, creator, { dues: D, size: members.length, dur: DUR, minScore });
  await fill(c, members);
  for (let r = 0; r < members.length; r++) { for (const m of members) await pay(c, m); await c.settleRound(); }
  return c;
}

describe("EsusuRegistry: factory, reputation, gating, fee", () => {
  it("only circles it deployed can write reputation", async () => {
    const { reg } = await deployRegistry();
    const [, , , a] = await ethers.getSigners();
    await expect(reg.connect(a).onPaid(a.address)).to.be.revertedWithCustomError(reg, "NotCircle");
    await expect(reg.connect(a).onCompleted(a.address)).to.be.revertedWithCustomError(reg, "NotCircle");
    await expect(reg.connect(a).onDefault(a.address)).to.be.revertedWithCustomError(reg, "NotCircle");
  });

  it("clean completion earns score; a default costs more than a round earns", async () => {
    const { reg } = await deployRegistry();
    const s = await ethers.getSigners();
    const members = s.slice(3, 6);
    await runClean(reg, s[2], members);
    // 3 paid rounds * 15 + 1 completion * 150
    expect(await reg.scoreOf(members[0].address)).to.equal(195n);
    expect(await reg.scoreOf(s[10].address)).to.equal(0n);

    // member 0 defaults once in a new circle
    const c = await mkCircle(reg, s[2], { dues: D, size: 3, dur: DUR });
    await fill(c, members);
    for (const m of members.slice(1)) await pay(c, m);
    await time.increase(DUR + 1);
    await c.settleRound();
    const rep = await reg.reputation(members[0].address);
    expect(rep.defaults).to.equal(1);
    expect(await reg.scoreOf(members[0].address)).to.equal(0n); // 195 - 250 floors at 0
    expect(await reg.scoreOf(members[1].address)).to.equal(195n + 15n);
  });

  it("minScore gates joining; veterans get in, newcomers do not", async () => {
    const { reg } = await deployRegistry();
    const s = await ethers.getSigners();
    const vets = s.slice(3, 6);
    await runClean(reg, s[2], vets);
    const gated = await mkCircle(reg, s[2], { dues: D, size: 3, dur: DUR, minScore: 150 });
    await gated.connect(vets[0]).join(0, { value: await gated.collateralFor(0) });
    await expect(gated.connect(s[12]).join(1, { value: await gated.collateralFor(1) })).to.be.revertedWithCustomError(gated, "ScoreTooLow");
  });

  it("lists circles for discovery", async () => {
    const { reg } = await deployRegistry();
    const [, , , a] = await ethers.getSigners();
    for (let i = 0; i < 3; i++) await mkCircle(reg, a, { dues: D, size: 2, dur: DUR });
    expect(await reg.circlesCount()).to.equal(3n);
    expect((await reg.circlesPage(1, 5)).length).to.equal(2);
    expect((await reg.circlesPage(9, 5)).length).to.equal(0);
  });

  it("fee is capped at 2%, owner-only, and needs a treasury", async () => {
    const { reg, owner } = await deployRegistry(50);
    const [, , , a] = await ethers.getSigners();
    await expect(reg.connect(owner).setFee(201, a.address)).to.be.revertedWithCustomError(reg, "FeeTooHigh");
    await expect(reg.connect(owner).setFee(10, ZERO)).to.be.revertedWithCustomError(reg, "FeeTooHigh");
    await expect(reg.connect(a).setFee(10, a.address)).to.be.revertedWithCustomError(reg, "OwnableUnauthorizedAccount");
    await reg.connect(owner).setFee(200, a.address);
    expect(await reg.feeBps()).to.equal(200n);
  });

  it("rejects bad circle configs", async () => {
    const { reg } = await deployRegistry();
    const [, , , a] = await ethers.getSigners();
    const F = await ethers.getContractFactory("EsusuCircle");
    await expect(reg.connect(a).createCircle(ZERO, 0, 3, DUR, 0)).to.be.revertedWithCustomError(F, "BadConfig");
    await expect(reg.connect(a).createCircle(ZERO, D, 1, DUR, 0)).to.be.revertedWithCustomError(F, "BadConfig");
    await expect(reg.connect(a).createCircle(ZERO, D, 51, DUR, 0)).to.be.revertedWithCustomError(F, "BadConfig");
    await expect(reg.connect(a).createCircle(ZERO, D, 3, 10, 0)).to.be.revertedWithCustomError(F, "BadConfig");
  });
});
