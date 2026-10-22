const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { ZERO, deployRegistry, deployToken, mkCircle, fill, pay, balanceOf } = require("./helpers");

const D = ethers.parseEther("1");
const DUR = 3600;

async function world(opts = {}) {
  const { size = 4, feeBps = 0, token = false, minScore = 0 } = opts;
  const signers = await ethers.getSigners();
  const { reg, treasury } = await deployRegistry(feeBps);
  const tok = token ? await deployToken() : null;
  const dues = token ? 100_000_000n : D;
  const members = signers.slice(3, 3 + size);
  if (tok) for (const m of members) await tok.mint(m.address, dues * 100n);
  const creator = signers[2];
  const circle = await mkCircle(reg, creator, { token: tok ? await tok.getAddress() : ZERO, dues, size, dur: DUR, minScore });
  return { reg, treasury, tok, dues, members, creator, circle, signers };
}

async function solvent(c, tok, treasury, creator) {
  const liab = await c.liabilities([treasury.address, creator.address]);
  expect(await balanceOf(c, tok)).to.equal(liab);
}

describe("EsusuCircle: joining", () => {
  it("prices collateral by slot: early slots lock more, floor of one dues", async () => {
    const { circle, dues } = await world({ size: 4 });
    expect(await circle.collateralFor(0)).to.equal(dues * 3n);
    expect(await circle.collateralFor(1)).to.equal(dues * 2n);
    expect(await circle.collateralFor(2)).to.equal(dues * 1n);
    expect(await circle.collateralFor(3)).to.equal(dues * 1n);
  });

  it("rejects wrong collateral, taken slots, repeat joins; starts when full", async () => {
    const { circle, members, dues } = await world({ size: 3 });
    await expect(circle.connect(members[0]).join(0, { value: dues })).to.be.revertedWithCustomError(circle, "WrongAmount");
    await circle.connect(members[0]).join(0, { value: dues * 2n });
    await expect(circle.connect(members[1]).join(0, { value: dues * 2n })).to.be.revertedWithCustomError(circle, "SlotTaken");
    await expect(circle.connect(members[0]).join(1, { value: dues * 1n })).to.be.revertedWithCustomError(circle, "AlreadyMember");
    await expect(circle.connect(members[1]).join(9, { value: dues })).to.be.revertedWithCustomError(circle, "SlotTaken");
    await circle.connect(members[1]).join(1, { value: dues });
    expect(await circle.state()).to.equal(0);
    await circle.connect(members[2]).join(2, { value: dues });
    expect(await circle.state()).to.equal(1);
  });

  it("leave() before start refunds collateral and frees the slot; impossible once active", async () => {
    const { circle, members, dues } = await world({ size: 3 });
    await circle.connect(members[0]).join(0, { value: dues * 2n });
    const before = await ethers.provider.getBalance(members[0].address);
    const rc = await (await circle.connect(members[0]).leave()).wait();
    const after = await ethers.provider.getBalance(members[0].address);
    expect(after - before + rc.gasUsed * rc.gasPrice).to.equal(dues * 2n);
    expect(await circle.slotOwner(0)).to.equal(ZERO);
    await expect(circle.connect(members[0]).leave()).to.be.revertedWithCustomError(circle, "NotMember");
    await fill(circle, members);
    await expect(circle.connect(members[1]).leave()).to.be.revertedWithCustomError(circle, "WrongState");
  });
});

describe("EsusuCircle: honest cycle, fees, solvency", () => {
  it("pays every member the pot once, takes the fee, returns collateral, ends at zero balance", async () => {
    const { circle, members, dues, treasury, creator, reg } = await world({ size: 4, feeBps: 100 });
    await fill(circle, members);
    await solvent(circle, null, treasury, creator);
    for (let r = 0; r < 4; r++) {
      for (const m of members) { await pay(circle, m); await solvent(circle, null, treasury, creator); }
      await circle.settleRound();
      await solvent(circle, null, treasury, creator);
      const pot = dues * 4n;
      expect(await circle.credit(members[r].address)).to.be.gte(pot - pot / 100n);
    }
    expect(await circle.state()).to.equal(2);
    const fee = (dues * 4n * 100n) / 10_000n;
    expect(await circle.credit(treasury.address)).to.equal(fee * 4n);
    for (const m of [...members, treasury]) await circle.connect(m).withdraw();
    expect(await ethers.provider.getBalance(await circle.getAddress())).to.equal(0n);
    for (const m of members) expect((await reg.reputation(m.address)).completed).to.equal(1);
  });

  it("round cannot settle early, double pay is rejected, late pay is rejected", async () => {
    const { circle, members } = await world({ size: 3 });
    await fill(circle, members);
    await pay(circle, members[0]);
    await expect(pay(circle, members[0])).to.be.revertedWithCustomError(circle, "AlreadyPaid");
    await expect(circle.settleRound()).to.be.revertedWithCustomError(circle, "RoundStillOpen");
    await time.increase(DUR + 1);
    await expect(pay(circle, members[1])).to.be.revertedWithCustomError(circle, "RoundClosed");
  });

  it("contributeFor credits the member, never the payer; outsiders cannot be paid for", async () => {
    const { circle, members, signers } = await world({ size: 3 });
    await fill(circle, members);
    await pay(circle, members[0], null, signers[15]);
    expect(await circle.hasPaid(members[0].address)).to.equal(true);
    await expect(circle.connect(signers[15]).contributeFor(signers[16].address, { value: await circle.dues() })).to.be.revertedWithCustomError(circle, "NotMember");
  });
});

describe("EsusuCircle: debtor safety (invariant I10)", () => {
  it("a member paid in round 0 who then stops paying cannot hurt anyone: every later pot is full", async () => {
    const { circle, members, dues, treasury, creator } = await world({ size: 4 });
    await fill(circle, members);
    // round 0: everyone pays, slot 0 receives
    for (const m of members) await pay(circle, m);
    await circle.settleRound();
    expect(await circle.credit(members[0].address)).to.equal(dues * 4n);
    // rounds 1..3: slot 0 vanishes
    for (let r = 1; r < 4; r++) {
      for (const m of members.slice(1)) await pay(circle, m);
      await time.increase(DUR + 1);
      await circle.settleRound();
      await solvent(circle, null, treasury, creator);
      expect(await circle.credit(members[r].address)).to.be.gte(dues * 4n); // full pot (plus any collateral at the end)
    }
    expect(await circle.defaulted(members[0].address)).to.equal(true);
    expect(await circle.collateralLeft(members[0].address)).to.equal(0n); // exactly consumed
  });
});

describe("EsusuCircle: pre-receipt defaults", () => {
  it("slashes collateral into the pot, flags the member, forfeits their slot and rolls the pot", async () => {
    const { circle, members, dues, treasury, creator } = await world({ size: 4 });
    await fill(circle, members);
    // round 0: slot 1 does not pay
    for (const m of [members[0], members[2], members[3]]) await pay(circle, m);
    await time.increase(DUR + 1);
    await circle.settleRound();
    expect(await circle.defaulted(members[1].address)).to.equal(true);
    expect(await circle.credit(members[0].address)).to.equal(dues * 4n); // 3 paid + 1 slashed
    // round 1: slot 1 is the recipient but forfeited, so pot rolls to round 2
    for (const m of [members[0], members[2], members[3]]) await pay(circle, m);
    await time.increase(DUR + 1);
    await circle.settleRound();
    expect(await circle.credit(members[1].address)).to.equal(0n); // forfeited slot: nothing credited
    expect(await circle.collateralLeft(members[1].address)).to.equal(0n); // 2 dues locked, 1 per missed round
    expect(await circle.pot(2)).to.equal(dues * 4n); // round 1's collected pot rolled forward
    await solvent(circle, null, treasury, creator);
  });

  it("when collateral runs out the recipient absorbs an explicit shortfall (never insolvent)", async () => {
    const { circle, members, dues, treasury, creator } = await world({ size: 4 });
    await fill(circle, members);
    // slot 3 has 1 dues collateral. It misses rounds 0 and 1 -> round 1 is short by 1 dues.
    for (let r = 0; r < 2; r++) {
      for (const m of members.slice(0, 3)) await pay(circle, m);
      await time.increase(DUR + 1);
      await circle.settleRound();
      await solvent(circle, null, treasury, creator);
    }
    expect(await circle.credit(members[0].address)).to.equal(dues * 4n);
    expect(await circle.credit(members[1].address)).to.equal(dues * 3n); // haircut
  });

  it("if the last recipient forfeits, the pot is split among honest members", async () => {
    const { circle, members, dues, treasury, creator } = await world({ size: 3 });
    await fill(circle, members);
    for (let r = 0; r < 3; r++) {
      for (const m of members.slice(0, 2)) await pay(circle, m);
      await time.increase(DUR + 1);
      await circle.settleRound();
      await solvent(circle, null, treasury, creator);
    }
    expect(await circle.state()).to.equal(2);
    expect(await circle.defaulted(members[2].address)).to.equal(true);
    const total = (await circle.credit(members[0].address)) + (await circle.credit(members[1].address));
    expect(total).to.be.gte(dues * 3n);
  });
});

describe("EsusuCircle: ERC-20 mode", () => {
  it("runs a full cycle in a 6-decimal stable token and rejects native value", async () => {
    const { circle, members, dues, tok, treasury, creator } = await world({ size: 3, token: true, feeBps: 50 });
    await fill(circle, members, tok);
    await solvent(circle, tok, treasury, creator);
    await expect(circle.connect(members[0]).contribute({ value: 1n })).to.be.revertedWithCustomError(circle, "WrongAmount");
    for (let r = 0; r < 3; r++) {
      for (const m of members) await pay(circle, m, tok);
      await circle.settleRound();
      await solvent(circle, tok, treasury, creator);
    }
    for (const m of [...members, treasury]) await circle.connect(m).withdraw();
    expect(await tok.balanceOf(await circle.getAddress())).to.equal(0n);
    expect(await tok.balanceOf(members[0].address)).to.be.gte(dues * 100n - dues * 3n); // paid 3 dues, got pot back at least once
  });
});

describe("EsusuCircle: reentrancy", () => {
  it("a contract member cannot double-withdraw from its receive hook", async () => {
    const { reg, members, creator } = await world({ size: 2 });
    const circle = await mkCircle(reg, creator, { dues: D, size: 2, dur: DUR });
    const R = await (await ethers.getContractFactory("Reenterer")).deploy(await circle.getAddress());
    await R.joinSlot(0, { value: D });
    await circle.connect(members[0]).join(1, { value: D });
    // R's dues are paid on its behalf by member 0
    await circle.connect(members[0]).contributeFor(await R.getAddress(), { value: D });
    await circle.connect(members[0]).contribute({ value: D });
    await circle.settleRound(); // R is slot 0 and receives 2D
    expect(await circle.credit(await R.getAddress())).to.equal(D * 2n);
    await R.pull();
    expect(await R.reentrySucceeded()).to.equal(false);
    expect(await circle.credit(await R.getAddress())).to.equal(0n);
  });
});
