// Randomized whole-circle simulations (seeded, reproducible). After EVERY transaction we assert:
//   S  solvency:      contract balance == sum of everything it owes (credits + collateral + live pots)
//   I10 debtor-safety: a member who has actually been paid out always holds collateral >= their remaining dues
// and at the end: nothing is stuck (balance is exactly 0 after everyone withdraws).
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { ZERO, deployRegistry, deployToken, mkCircle, balanceOf } = require("./helpers");

function rng(seed) { // mulberry32
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const RUNS = Number(process.env.FUZZ_RUNS || 40);

describe(`Fuzz: ${RUNS} random circles, invariants checked after every transaction`, function () {
  this.timeout(600000);

  for (let run = 0; run < RUNS; run++) {
    it(`circle #${run}`, async () => {
      const rand = rng(1000 + run);
      const pick = (n) => Math.floor(rand() * n);
      const signers = await ethers.getSigners();
      const size = 2 + pick(7);                 // 2..8
      const feeBps = pick(4) === 0 ? 0 : pick(201);
      const useToken = rand() < 0.5;
      const dur = 600 + pick(5000);
      const { reg, treasury } = await deployRegistry(feeBps);
      const tok = useToken ? await deployToken() : null;
      const dues = useToken ? BigInt(1 + pick(500)) * 1_000_000n : ethers.parseEther(String(1 + pick(5)));
      const creator = signers[2];
      const members = signers.slice(3, 3 + size);
      if (tok) for (const m of members) await tok.mint(m.address, dues * 1000n);
      const c = await mkCircle(reg, creator, { token: tok ? await tok.getAddress() : ZERO, dues, size, dur });
      const ca = await c.getAddress();

      // behaviour: probability each member pays each round; some vanish after being paid
      const pPay = members.map(() => [1, 1, 0.9, 0.5, 0.1][pick(5)]);
      const vanishAfterPaid = members.map(() => rand() < 0.3);
      const received = new Set();

      const checkS = async () => expect(await balanceOf(c, tok)).to.equal(await c.liabilities([treasury.address, creator.address]));
      const checkI10 = async () => {
        const st = Number(await c.state());
        const cur = Number(await c.currentRound());
        for (const m of members) {
          if (!received.has(m.address)) continue;
          const rem = st === 2 ? 0n : BigInt(size - cur) - ((await c.paid(cur, m.address)) ? 1n : 0n);
          expect(await c.collateralLeft(m.address), "I10 debtor-safety").to.be.gte(dues * (rem < 0n ? 0n : rem));
        }
      };

      // join in a random slot order
      const slots = [...Array(size).keys()].sort(() => rand() - 0.5);
      for (let i = 0; i < size; i++) {
        const slot = slots[i], m = members[i], col = await c.collateralFor(slot);
        if (tok) { await tok.connect(m).approve(ca, col); await c.connect(m).join(slot); }
        else await c.connect(m).join(slot, { value: col });
        await checkS();
      }
      expect(await c.state()).to.equal(1n);

      for (let r = 0; r < size; r++) {
        for (let i = 0; i < size; i++) {
          const m = members[i];
          const slot = Number(await c.slotOf(m.address));
          const gone = vanishAfterPaid[i] && received.has(m.address);
          if (gone || rand() > pPay[i]) continue;
          try {
            if (tok) { await tok.connect(m).approve(ca, dues); await c.connect(m).contribute(); }
            else await c.connect(m).contribute({ value: dues });
          } catch (_) {}
          await checkS(); await checkI10();
        }
        if ((await c.paidCount(r)) !== BigInt(size)) await time.increase(dur + 1);
        const rc = await (await c.settleRound()).wait();
        for (const l of rc.logs) {
          let ev; try { ev = c.interface.parseLog(l); } catch { continue; }
          if (ev && ev.name === "RoundSettled" && !ev.args.rolledOver) received.add(await c.slotOwner(ev.args.round));
        }
        await checkS(); await checkI10();
      }

      expect(await c.state()).to.equal(2n);
      for (const who of [...members, treasury, creator]) {
        if ((await c.credit(who.address)) > 0n) await c.connect(who).withdraw();
      }
      expect(await balanceOf(c, tok), "no stuck funds").to.equal(0n);
    });
  }
});
