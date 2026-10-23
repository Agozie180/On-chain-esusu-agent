const { expect } = require("chai");
const { decide, assessCircle } = require("../agent/policy");

const base = { state: 1, isMember: true, now: 1000, deadline: 5000, ownerPaid: false, paidCount: 1, size: 3, vaultBalance: 10n, dues: 1n,
  allowlisted: true, paused: false, expiry: 10_000_000, leadSeconds: 3600 };

describe("agent decision core (deterministic)", () => {
  it("idles while open/completed or when the owner is not a member", () => {
    expect(decide({ ...base, state: 0 }).action).to.equal("idle");
    expect(decide({ ...base, state: 2 }).action).to.equal("idle");
    expect(decide({ ...base, isMember: false }).action).to.equal("idle");
  });
  it("waits far from the deadline, pays inside the lead window, never pays twice", () => {
    expect(decide(base).action).to.equal("wait");
    expect(decide({ ...base, now: 2000 }).action).to.equal("pay");
    expect(decide({ ...base, now: 2000, ownerPaid: true }).action).to.equal("wait");
  });
  it("settles when everyone paid or the deadline passed", () => {
    expect(decide({ ...base, paidCount: 3 }).action).to.equal("settle");
    expect(decide({ ...base, now: 5000 }).action).to.equal("settle");
  });
  it("alerts early (warn) and late (critical) when it cannot pay", () => {
    expect(decide({ ...base, vaultBalance: 0n })).to.include({ action: "alert", severity: "warn" });
    expect(decide({ ...base, now: 2000, vaultBalance: 0n })).to.include({ action: "alert", severity: "critical" });
    expect(decide({ ...base, now: 2000, paused: true })).to.include({ action: "alert", severity: "critical" });
    expect(decide({ ...base, allowlisted: false }).action).to.equal("alert");
    expect(decide({ ...base, now: 2000, expiry: 1500 })).to.include({ action: "alert", severity: "critical" });
  });
  it("alerts when the circle uses a different asset than the vault", () => {
    expect(decide({ ...base, assetMatch: false })).to.include({ action: "alert", severity: "warn" });
  });
  it("is a pure function", () => {
    expect(decide(base)).to.deep.equal(decide({ ...base }));
  });
});

describe("circle risk grade (heuristic, deterministic)", () => {
  const good = { size: 5, dues: 1n, minScore: 150, feeBps: 50, roundDuration: 7 * 86400, slot: 0,
    members: [0, 1, 2, 3, 4].map(() => ({ score: 300, defaulted: false })) };
  it("grades a gated, reputable, weekly circle A", () => {
    expect(assessCircle(good)).to.deep.include({ grade: "A", score: 100 });
  });
  it("penalises defaulters, fresh members, late slots, short rounds and high fees", () => {
    const bad = { ...good, minScore: 0, feeBps: 150, roundDuration: 3600, slot: 4,
      members: [{ score: 0, defaulted: true }, { score: 0, defaulted: true }, { score: 0, defaulted: false }, { score: 0, defaulted: false }, null] };
    const r = assessCircle(bad);
    expect(r.grade).to.equal("D");
    expect(r.flags.length).to.be.gte(5);
  });
  it("same input, same output", () => {
    expect(assessCircle(good)).to.deep.equal(assessCircle({ ...good }));
  });
});
