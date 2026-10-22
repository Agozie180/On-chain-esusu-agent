const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { ZERO, deployRegistry, deployToken, mkCircle } = require("./helpers");

const D = ethers.parseEther("1");
const DUR = 3600;

async function setup(useToken = false) {
  const [, , , owner, agent, m2, m3, thief] = await ethers.getSigners();
  const { reg } = await deployRegistry(0);
  const tok = useToken ? await deployToken() : null;
  const dues = useToken ? 50_000_000n : D;
  const tokAddr = tok ? await tok.getAddress() : ZERO;
  const circle = await mkCircle(reg, m2, { token: tokAddr, dues, size: 3, dur: DUR });
  const vault = await (await ethers.getContractFactory("AgentAllowance")).deploy(owner.address, tokAddr);
  const ca = await circle.getAddress();

  for (const [i, m] of [owner, m2, m3].entries()) {
    const col = await circle.collateralFor(i);
    if (tok) { await tok.mint(m.address, dues * 100n); await tok.connect(m).approve(ca, col); await circle.connect(m).join(i); }
    else await circle.connect(m).join(i, { value: col });
  }
  const expiry = (await time.latest()) + 30 * 24 * 3600;
  await vault.connect(owner).setPolicy(agent.address, dues, dues * 2n, 24 * 3600, expiry);
  await vault.connect(owner).setCircuit(ca, true);
  if (tok) await tok.connect(owner).transfer(await vault.getAddress(), dues * 5n);
  else await owner.sendTransaction({ to: await vault.getAddress(), value: dues * 5n });
  const payOthers = async () => {
    for (const m of [m2, m3]) {
      if (tok) { await tok.connect(m).approve(ca, dues); await circle.connect(m).contribute(); }
      else await circle.connect(m).contribute({ value: dues });
    }
  };
  return { circle, vault, owner, agent, m2, m3, thief, dues, tok, reg, payOthers, ca };
}

describe("AgentAllowance: the agent can pay dues and nothing else", () => {
  it("agent pays the owner's dues; amount and beneficiary are not agent-controlled", async () => {
    const { circle, vault, agent, owner, dues } = await setup();
    await vault.connect(agent).payDues(await circle.getAddress());
    expect(await circle.paid(0, owner.address)).to.equal(true);
    expect(await circle.pot(0)).to.equal(dues);
  });

  it("only the configured agent can call; unknown targets are refused", async () => {
    const { circle, vault, thief, agent } = await setup();
    await expect(vault.connect(thief).payDues(await circle.getAddress())).to.be.revertedWithCustomError(vault, "NotAgent");
    await expect(vault.connect(agent).payDues(thief.address)).to.be.revertedWithCustomError(vault, "CircuitNotAllowed");
  });

  it("enforces per-tx cap from the circle's own dues()", async () => {
    const { circle, vault, owner, agent, dues } = await setup();
    await vault.connect(owner).setPolicy(agent.address, dues / 2n, dues * 10n, 86400, (await time.latest()) + 1000);
    await expect(vault.connect(agent).payDues(await circle.getAddress())).to.be.revertedWithCustomError(vault, "OverPerTxCap");
  });

  it("enforces the rolling period cap and resets after the period", async () => {
    const { circle, vault, agent, owner, ca, payOthers, dues } = await setup();
    await vault.connect(agent).payDues(ca);
    await payOthers(); await circle.settleRound();
    await vault.connect(agent).payDues(ca); // 2 dues = period cap
    await payOthers(); await circle.settleRound();
    await expect(vault.connect(agent).payDues(ca)).to.be.revertedWithCustomError(vault, "OverPeriodCap");
    expect(await vault.spentInPeriod()).to.equal(dues * 2n);
    await time.increase(24 * 3600 + 1);
    // new period: cap counter resets (the circle's round is closed by now, so the pay itself reverts downstream, not on the cap)
    await expect(vault.connect(agent).payDues(ca)).to.be.revertedWithCustomError(circle, "RoundClosed");
  });

  it("kill switch and expiry stop the agent", async () => {
    const { circle, vault, owner, agent } = await setup();
    const ca = await circle.getAddress();
    await vault.connect(owner).setPaused(true);
    await expect(vault.connect(agent).payDues(ca)).to.be.revertedWithCustomError(vault, "IsPaused");
    await vault.connect(owner).setPaused(false);
    await time.increase(31 * 24 * 3600);
    await expect(vault.connect(agent).payDues(ca)).to.be.revertedWithCustomError(vault, "Expired");
  });

  it("fails closed: with no policy set, nothing works", async () => {
    const [, , , owner, agent] = await ethers.getSigners();
    const vault = await (await ethers.getContractFactory("AgentAllowance")).deploy(owner.address, ZERO);
    await expect(vault.connect(agent).payDues(agent.address)).to.be.revertedWithCustomError(vault, "NotAgent");
  });

  it("agent has no path to withdraw or reconfigure; owner can, to owner only", async () => {
    const { vault, owner, agent, dues } = await setup();
    await expect(vault.connect(agent).withdraw(1n)).to.be.revertedWithCustomError(vault, "NotOwner");
    await expect(vault.connect(agent).setPolicy(agent.address, 1n, 1n, 1n, 1n)).to.be.revertedWithCustomError(vault, "NotOwner");
    await expect(vault.connect(agent).setCircuit(agent.address, true)).to.be.revertedWithCustomError(vault, "NotOwner");
    await expect(vault.connect(agent).setPaused(false)).to.be.revertedWithCustomError(vault, "NotOwner");
    const before = await ethers.provider.getBalance(owner.address);
    const rc = await (await vault.connect(owner).withdraw(dues)).wait();
    expect((await ethers.provider.getBalance(owner.address)) - before + rc.gasUsed * rc.gasPrice).to.equal(dues);
  });

  it("payout from a circle the agent funded lands with the owner, not the vault or agent", async () => {
    const { circle, vault, owner, agent, payOthers, ca, dues } = await setup();
    await vault.connect(agent).payDues(ca);
    await payOthers(); await circle.settleRound();
    expect(await circle.credit(owner.address)).to.equal(dues * 3n);
    expect(await circle.credit(await vault.getAddress())).to.equal(0n);
    expect(await circle.credit(agent.address)).to.equal(0n);
  });
});

describe("AgentAllowance: ERC-20 vault", () => {
  it("pays dues in the token, leaves no dangling approval, refuses a native circle (asset mismatch)", async () => {
    const { circle, vault, agent, owner, tok, dues, reg, m2 } = await setup(true);
    const ca = await circle.getAddress();
    await vault.connect(agent).payDues(ca);
    expect(await circle.paid(0, owner.address)).to.equal(true);
    expect(await tok.allowance(await vault.getAddress(), ca)).to.equal(0n);
    expect(await tok.balanceOf(await vault.getAddress())).to.equal(dues * 4n);

    const nativeCircle = await mkCircle(reg, m2, { dues: D, size: 2, dur: DUR });
    await vault.connect(owner).setCircuit(await nativeCircle.getAddress(), true);
    await expect(vault.connect(agent).payDues(await nativeCircle.getAddress())).to.be.revertedWithCustomError(vault, "AssetMismatch");
  });
});
