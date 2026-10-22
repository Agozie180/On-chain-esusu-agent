const { ethers } = require("hardhat");
const ZERO = ethers.ZeroAddress;

async function deployRegistry(feeBps = 0) {
  const [owner, treasury] = await ethers.getSigners();
  const reg = await (await ethers.getContractFactory("EsusuRegistry")).deploy(owner.address, treasury.address, feeBps);
  return { reg, owner, treasury };
}

async function deployToken() {
  return (await ethers.getContractFactory("MockToken")).deploy();
}

async function mkCircle(reg, creator, { token = ZERO, dues, size, dur = 3600, minScore = 0 }) {
  const tx = await reg.connect(creator).createCircle(token, dues, size, dur, minScore);
  const rc = await tx.wait();
  const ev = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "CircleCreated");
  return ethers.getContractAt("EsusuCircle", ev.args.circle);
}

// member i takes slot i
async function fill(circle, members, token) {
  for (let i = 0; i < members.length; i++) {
    const col = await circle.collateralFor(i);
    if (token) {
      await token.connect(members[i]).approve(await circle.getAddress(), col);
      await circle.connect(members[i]).join(i);
    } else {
      await circle.connect(members[i]).join(i, { value: col });
    }
  }
}

async function pay(circle, member, token, payer = member) {
  const dues = await circle.dues();
  if (token) {
    await token.connect(payer).approve(await circle.getAddress(), dues);
    return member === payer ? circle.connect(payer).contribute() : circle.connect(payer).contributeFor(member.address);
  }
  return member === payer ? circle.connect(payer).contribute({ value: dues }) : circle.connect(payer).contributeFor(member.address, { value: dues });
}

async function balanceOf(circle, token) {
  const a = await circle.getAddress();
  return token ? token.balanceOf(a) : ethers.provider.getBalance(a);
}

module.exports = { ZERO, deployRegistry, deployToken, mkCircle, fill, pay, balanceOf };
