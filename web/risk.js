// AUTO-GENERATED from agent/policy.js. Same code the agent runs.
window.POLICY = (function(){ const module = { exports: {} };
// Deterministic decision core. No network, no LLM, no randomness: the same chain snapshot always
// yields the same action. An LLM (optional) may EXPLAIN a decision after the fact, never make one.

/**
 * @param {object} s
 * @param {number} s.state 0 Open, 1 Active, 2 Completed
 * @param {boolean} s.isMember is the owner a member of this circle
 * @param {number} s.now unix seconds
 * @param {number} s.deadline current round deadline
 * @param {boolean} s.ownerPaid owner paid this round
 * @param {number} s.paidCount members paid this round
 * @param {number} s.size members
 * @param {bigint} s.vaultBalance vault balance in the circle's asset
 * @param {bigint} s.dues dues per round
 * @param {boolean} s.allowlisted is this circle on the vault allowlist
 * @param {boolean} [s.assetMatch] circle's asset equals the vault's asset (default true)
 * @param {boolean} s.paused vault paused
 * @param {number} s.expiry agent authority expiry (unix seconds)
 * @param {number} s.leadSeconds pay when this close to the deadline
 * @returns {{action: 'pay'|'settle'|'wait'|'alert'|'idle', reason: string, severity?: 'info'|'warn'|'critical'}}
 */
function decide(s) {
  if (s.state === 0) return { action: "idle", reason: "circle still open (waiting for members)" };
  if (s.state === 2) return { action: "idle", reason: "circle completed" };

  if (s.paidCount === s.size || s.now >= s.deadline) {
    return { action: "settle", reason: s.paidCount === s.size ? "all members paid" : "deadline passed" };
  }
  if (!s.isMember) return { action: "idle", reason: "owner is not a member of this circle" };
  if (s.ownerPaid) return { action: "wait", reason: "owner already paid; waiting for others or deadline" };

  const left = s.deadline - s.now;
  if (s.assetMatch === false) return { action: "alert", severity: "warn", reason: "circle uses a different asset than this vault; the agent cannot pay it" };
  // Conditions where the agent cannot or may not pay: tell the human early, before the deadline bites.
  if (s.paused) return { action: "alert", severity: left < s.leadSeconds ? "critical" : "warn", reason: "agent is paused by the owner; dues are unpaid" };
  if (!s.allowlisted) return { action: "alert", severity: "warn", reason: "circle is not on the vault allowlist; agent cannot pay" };
  if (s.now >= s.expiry) return { action: "alert", severity: "critical", reason: "agent authority has expired; owner must renew the policy" };
  if (s.vaultBalance < s.dues) return { action: "alert", severity: left < s.leadSeconds ? "critical" : "warn", reason: "vault balance is below one dues payment; owner must top up" };

  if (left <= s.leadSeconds) return { action: "pay", reason: "owner has not paid and the deadline is near" };
  return { action: "wait", reason: "owner has not paid; not yet within the lead window" };
}

/**
 * Heuristic pre-join risk grade for a circle and a slot. Deterministic and explainable, not a
 * guarantee: it only reads on-chain facts (member reputation, defaults, config).
 * @param {object} c { size, dues, minScore, feeBps, roundDuration, members:[{score:number, defaulted:boolean}] , slot:number }
 */
function assessCircle(c) {
  let score = 100;
  const flags = [];
  const filled = c.members.filter(Boolean);

  const defaulters = filled.filter((m) => m.defaulted).length;
  if (defaulters) { score -= 15 * defaulters; flags.push(`${defaulters} member(s) already flagged as defaulted`); }

  if (filled.length >= 2) {
    const avg = filled.reduce((a, m) => a + m.score, 0) / filled.length;
    const fresh = filled.filter((m) => m.score === 0).length / filled.length;
    if (!c.minScore && avg < 100) { score -= 10; flags.push("no reputation gate and low average member score"); }
    if (fresh > 0.5) { score -= 10; flags.push("most members have no on-chain history yet"); }
  }
  if (c.roundDuration < 6 * 3600) { score -= 5; flags.push("rounds shorter than 6 hours make missed deadlines more likely"); }
  if (c.size > 3 && c.slot >= c.size - 2) { score -= 10; flags.push("late payout slot: you are paid near the end and rely on others staying honest"); }
  if (c.feeBps > 100) { score -= 5; flags.push("protocol fee above 1%"); }

  score = Math.max(0, score);
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";
  return { score, grade, flags };
}

module.exports = { decide, assessCircle };

return module.exports; })();
