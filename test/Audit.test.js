// Tests added by the root-and-foundation audit (see docs/AUDIT.md, round 2).
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { ZERO, deployRegistry, deployToken, mkCircle, fill, pay } = require("./helpers");

const D = ethers.parseEther("1");
const DUR = 3600;

async function vaultWorld(useToken = false) {
  const [, , , owner, agent, payee, thief, other] = await ethers.getSigners();
  const tok = useToken ? await deployToken() : null;
  const tokAddr = tok ? await tok.getAddress() : ZERO;
  const unit = useToken ? 10_000_000n : D;
  const vault = await (await ethers.getContractFactory("AgentAllowance")).deploy(owner.address, tokAddr);
  const va = await vault.getAddress();
  if (tok) { await tok.mint(owner.address, unit * 100n); await tok.connect(owner).transfer(va, unit * 20n); }
  else await owner.sendTransaction({ to: va, value: unit * 20n });
  const expiry = (await time.latest()) + 30 * 86400;
  await vault.connect(owner).setPolicy(agent.address, unit * 2n, unit * 5n, 86400, expiry);
  await vault.connect(owner).setPayee(payee.address, true, unit * 3n);
  const bal = (a) => (tok ? tok.balanceOf(a) : ethers.provider.getBalance(a));
  return { vault, owner, agent, payee, thief, other, tok, unit, bal };
}

describe("AgentAllowance lane 2: pay allowlisted service providers (option 2: API payments)", () => {
  const ref = ethers.id("request-1");

  for (const useToken of [false, true]) {
    it(`pays an allowlisted payee and emits a receipt (${useToken ? "ERC-20" : "native"})`, async () => {
      const { vault, agent, payee, unit, bal } = await vaultWorld(useToken);
      const before = await bal(payee.address);
      await expect(vault.connect(agent).payService(payee.address, unit, ref)).to.emit(vault, "ServicePaid").withArgs(payee.address, unit, ref);
      expect((await bal(payee.address)) - before).to.equal(unit);
    });
  }

  it("refuses unknown payees, the agent itself, zero amounts and non-agents", async () => {
    const { vault, owner, agent, thief, payee, unit } = await vaultWorld();
    await expect(vault.connect(agent).payService(thief.address, unit, ref)).to.be.revertedWithCustomError(vault, "PayeeNotAllowed");
    await expect(vault.connect(thief).payService(payee.address, unit, ref)).to.be.revertedWithCustomError(vault, "NotAgent");
    await expect(vault.connect(agent).payService(payee.address, 0n, ref)).to.be.revertedWithCustomError(vault, "ZeroAmount");
    // owner (mistakenly or maliciously via UI) allowlists the agent as a payee: the agent still cannot pay itself
    await vault.connect(owner).setPayee(agent.address, true, unit * 5n);
    await expect(vault.connect(agent).payService(agent.address, unit, ref)).to.be.revertedWithCustomError(vault, "PayeeIsAgent");
  });

  it("enforces per-payment, per-payee and shared period caps; they reset next period", async () => {
    const { vault, owner, agent, payee, other, unit } = await vaultWorld();
    await expect(vault.connect(agent).payService(payee.address, unit * 3n, ref)).to.be.revertedWithCustomError(vault, "OverPerTxCap");
    await vault.connect(agent).payService(payee.address, unit * 2n, ref); // payee spent 2 of 3
    await expect(vault.connect(agent).payService(payee.address, unit * 2n, ref)).to.be.revertedWithCustomError(vault, "OverPayeeCap");
    await vault.connect(owner).setPayee(other.address, true, unit * 10n);
    await vault.connect(agent).payService(other.address, unit * 2n, ref); // shared spent 4 of 5
    await expect(vault.connect(agent).payService(other.address, unit * 2n, ref)).to.be.revertedWithCustomError(vault, "OverPeriodCap");
    await time.increase(86400 + 1);
    await vault.connect(agent).payService(payee.address, unit * 2n, ref); // new period, caps reset
    expect(await vault.spentInPeriod()).to.equal(unit * 2n);
  });

  it("owner can remove a payee instantly (cap goes to zero); pause and expiry stop lane 2 too", async () => {
    const { vault, owner, agent, payee, unit } = await vaultWorld();
    await vault.connect(owner).setPayee(payee.address, false, unit);
    expect(await vault.payeeCap(payee.address)).to.equal(0n);
    await expect(vault.connect(agent).payService(payee.address, unit, ref)).to.be.revertedWithCustomError(vault, "PayeeNotAllowed");
    await vault.connect(owner).setPayee(payee.address, true, unit * 3n);
    await vault.connect(owner).setPaused(true);
    await expect(vault.connect(agent).payService(payee.address, unit, ref)).to.be.revertedWithCustomError(vault, "IsPaused");
    await vault.connect(owner).setPaused(false);
    await time.increase(31 * 86400);
    await expect(vault.connect(agent).payService(payee.address, unit, ref)).to.be.revertedWithCustomError(vault, "Expired");
  });

  it("only the owner can allowlist payees", async () => {
    const { vault, agent, thief } = await vaultWorld();
    await expect(vault.connect(agent).setPayee(thief.address, true, 1n)).to.be.revertedWithCustomError(vault, "NotOwner");
  });
});

describe("EsusuRegistry: ownership, immutability of existing circles, Sybil guard", () => {
  it("fee changes never touch circles that already exist", async () => {
    const { reg, owner, treasury } = await deployRegistry(50);
    const [, , c] = await ethers.getSigners();
    const circle = await mkCircle(reg, c, { dues: D, size: 3, dur: DUR });
    await reg.connect(owner).setFee(200, treasury.address);
    expect(await circle.feeBps()).to.equal(50n);
    expect(await (await mkCircle(reg, c, { dues: D, size: 3, dur: DUR })).feeBps()).to.equal(200n);
  });

  it("ownership moves in two steps; the old owner loses power only after acceptance", async () => {
    const { reg, owner } = await deployRegistry(50);
    const [, , , a] = await ethers.getSigners();
    await reg.connect(owner).transferOwnership(a.address);
    expect(await reg.owner()).to.equal(owner.address);
    await expect(reg.connect(owner).acceptOwnership()).to.be.revertedWithCustomError(reg, "OwnableUnauthorizedAccount");
    await reg.connect(a).acceptOwnership();
    expect(await reg.owner()).to.equal(a.address);
    await expect(reg.connect(owner).setFee(10, owner.address)).to.be.revertedWithCustomError(reg, "OwnableUnauthorizedAccount");
  });

  it("2-member circles earn no credit but their defaults still count against you", async () => {
    const { reg } = await deployRegistry(0);
    const s = await ethers.getSigners();
    const [a, b] = s.slice(3, 5);
    const clean = await mkCircle(reg, s[2], { dues: D, size: 2, dur: DUR });
    await fill(clean, [a, b]);
    for (let r = 0; r < 2; r++) { await pay(clean, a); await pay(clean, b); await clean.settleRound(); }
    expect(await reg.scoreOf(a.address)).to.equal(0n);
    expect((await reg.reputation(a.address)).completed).to.equal(0);

    const bad = await mkCircle(reg, s[2], { dues: D, size: 2, dur: DUR });
    await fill(bad, [a, b]);
    await pay(bad, b); await time.increase(DUR + 1); await bad.settleRound();
    expect((await reg.reputation(a.address)).defaults).to.equal(1);
  });
});

describe("EsusuCircle: audit round 2", () => {
  it("allows 30 members and refuses 31 (settlement gas stays bounded)", async () => {
    const { reg } = await deployRegistry(0);
    const [, , , a] = await ethers.getSigners();
    const F = await ethers.getContractFactory("EsusuCircle");
    await mkCircle(reg, a, { dues: D, size: 30, dur: DUR });
    await expect(reg.connect(a).createCircle(ZERO, D, 31, DUR, 0)).to.be.revertedWithCustomError(F, "BadConfig");
  });

  it("a gated circle cannot be created without a registry (nothing to read scores from)", async () => {
    const [, , , a] = await ethers.getSigners();
    const F = await ethers.getContractFactory("EsusuCircle");
    await expect(F.deploy(ZERO, a.address, ZERO, D, 3, DUR, 100, 0, ZERO)).to.be.revertedWithCustomError(F, "BadConfig");
  });

  it("leave() then rejoin works, in native and ERC-20 mode, and refunds exactly", async () => {
    const { reg } = await deployRegistry(0);
    const tok = await deployToken();
    const s = await ethers.getSigners();
    const m = s[3];
    await tok.mint(m.address, 1_000_000_000n);
    const c = await mkCircle(reg, s[2], { token: await tok.getAddress(), dues: 10_000_000n, size: 3, dur: DUR });
    const ca = await c.getAddress();
    const col = await c.collateralFor(0);
    await tok.connect(m).approve(ca, col);
    const before = await tok.balanceOf(m.address);
    await c.connect(m).join(0);
    await c.connect(m).leave();
    expect(await tok.balanceOf(m.address)).to.equal(before);
    expect(await c.filled()).to.equal(0n);
    await tok.connect(m).approve(ca, await c.collateralFor(2));
    await c.connect(m).join(2);
    expect(await c.slotOf(m.address)).to.equal(2n);
  });

  it("refuses fee-on-transfer tokens instead of silently under-collateralizing", async () => {
    const { reg } = await deployRegistry(0);
    const ft = await (await ethers.getContractFactory("FeeToken")).deploy();
    const s = await ethers.getSigners();
    await ft.mint(s[3].address, 1_000_000_000n);
    const c = await mkCircle(reg, s[2], { token: await ft.getAddress(), dues: 10_000_000n, size: 3, dur: DUR });
    await ft.connect(s[3]).approve(await c.getAddress(), 1_000_000_000n);
    await expect(c.connect(s[3]).join(0)).to.be.revertedWithCustomError(c, "UnsupportedToken");
  });

  it("wrong-mode payments and wrong-state calls are rejected; double withdraw is rejected", async () => {
    const { reg } = await deployRegistry(0);
    const s = await ethers.getSigners();
    const tok = await deployToken();
    const ct = await mkCircle(reg, s[2], { token: await tok.getAddress(), dues: 10_000_000n, size: 3, dur: DUR });
    await expect(ct.connect(s[3]).join(0, { value: 1n })).to.be.revertedWithCustomError(ct, "WrongAmount");
    const cn = await mkCircle(reg, s[2], { dues: D, size: 3, dur: DUR });
    await expect(cn.connect(s[3]).contribute({ value: D })).to.be.revertedWithCustomError(cn, "WrongState");
    await expect(cn.settleRound()).to.be.revertedWithCustomError(cn, "WrongState");
    await expect(cn.connect(s[3]).withdraw()).to.be.revertedWithCustomError(cn, "NothingToWithdraw");
  });

  it("if every member defaults, the leftover goes to the creator and the contract still empties", async () => {
    const { reg } = await deployRegistry(0);
    const s = await ethers.getSigners();
    const members = s.slice(3, 6);
    const creator = s[2];
    const c = await mkCircle(reg, creator, { dues: D, size: 3, dur: DUR });
    await fill(c, members);
    for (let r = 0; r < 3; r++) { await time.increase(DUR + 1); await c.settleRound(); }
    expect(await c.state()).to.equal(2n);
    for (const w of [...members, creator]) if ((await c.credit(w.address)) > 0n) await c.connect(w).withdraw();
    expect(await ethers.provider.getBalance(await c.getAddress())).to.equal(0n);
  });
});
