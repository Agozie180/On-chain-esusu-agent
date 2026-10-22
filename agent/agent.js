// Esusu agent: watches circles, pays the owner's dues through AgentAllowance (within on-chain policy),
// settles finished rounds, and alerts the owner (Telegram, optional) BEFORE a problem becomes a default.
// Usage: node agent/agent.js   (env: see .env.example)
require("dotenv").config();
const fs = require("fs");
const { ethers } = require("ethers");
const { decide } = require("./policy");
const { notify } = require("./notify");

const CIRCLE_ABI = [
  "function state() view returns (uint8)", "function roundDeadline() view returns (uint256)",
  "function currentRound() view returns (uint256)", "function paidCount(uint256) view returns (uint256)",
  "function paid(uint256,address) view returns (bool)", "function size() view returns (uint256)",
  "function dues() view returns (uint256)", "function token() view returns (address)",
  "function isMember(address) view returns (bool)", "function settleRound()",
];
const VAULT_ABI = [
  "function payDues(address circuit)", "function token() view returns (address)", "function balance() view returns (uint256)",
  "function allowedCircuit(address) view returns (bool)", "function paused() view returns (bool)", "function expiry() view returns (uint256)",
];
const STATE_FILE = process.env.AGENT_STATE_FILE || ".agent-state.json";

function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; } }
function saveState(s) { try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch {} }

async function explain(record) {
  // Cosmetic only. The decision is final before this runs and never depends on it.
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 120,
        messages: [{ role: "user", content: `In one friendly sentence, explain this esusu agent event to the circle member. Do not add numbers that are not in the JSON.\n${JSON.stringify(record)}` }] }),
    });
    return (await res.json())?.content?.[0]?.text ?? null;
  } catch { return null; }
}

async function tick({ provider, wallet, vaultAddr, ownerAddr, circuits, lead, state = {}, onEvent = () => {} }) {
  const vault = new ethers.Contract(vaultAddr, VAULT_ABI, wallet);
  const [vaultToken, paused, expiry] = await Promise.all([vault.token(), vault.paused(), vault.expiry()]);
  const vaultBalance = await vault.balance();
  const now = (await provider.getBlock("latest")).timestamp;

  for (const addr of circuits) {
    const circle = new ethers.Contract(addr, CIRCLE_ABI, wallet);
    const [st, deadline, round, size, dues, token, isMember, allowlisted] = await Promise.all([
      circle.state(), circle.roundDeadline(), circle.currentRound(), circle.size(), circle.dues(), circle.token(),
      circle.isMember(ownerAddr), vault.allowedCircuit(addr),
    ]);
    const [paidCount, ownerPaid] = await Promise.all([circle.paidCount(round), circle.paid(round, ownerAddr)]);

    const d = decide({
      state: Number(st), isMember, now, deadline: Number(deadline), ownerPaid, paidCount: Number(paidCount), size: Number(size),
      vaultBalance: token === vaultToken ? vaultBalance : 0n, dues, allowlisted: allowlisted && token === vaultToken,
      paused, expiry: Number(expiry), leadSeconds: lead,
    });
    const record = { ts: new Date().toISOString(), circuit: addr, round: Number(round), ...d };

    try {
      if (d.action === "pay") record.tx = (await (await vault.payDues(addr)).wait()).hash;
      if (d.action === "settle") record.tx = (await (await circle.settleRound()).wait()).hash;
    } catch (e) {
      record.error = e.revert?.name || e.shortMessage || e.message; // the chain refusing is the system working
    }

    // alert once per (circuit, round, reason) so the owner is not spammed
    const key = `${addr}:${Number(round)}:${d.action}:${d.reason}`;
    const shouldTell = record.error || d.action === "alert" || d.action === "pay" || d.action === "settle";
    if (shouldTell && !state[key]) {
      state[key] = Date.now();
      const note = await explain({ ...record, tx: undefined });
      if (note) record.note = note;
      const icon = record.error ? "🚫" : d.severity === "critical" ? "🚨" : d.action === "alert" ? "⚠️" : "✅";
      await notify(`${icon} Esusu agent · circle ${addr.slice(0, 8)}… round ${Number(round) + 1}\n${d.action.toUpperCase()}: ${d.reason}${record.error ? `\nBlocked on-chain: ${record.error}` : ""}${record.tx ? `\ntx ${record.tx}` : ""}${note ? `\n${note}` : ""}`);
    }
    onEvent(record);
    console.log(JSON.stringify(record));
  }
  return state;
}

async function main() {
  const miss = ["AGENT_PRIVATE_KEY", "VAULT", "OWNER", "CIRCUITS"].filter((k) => !process.env[k]);
  if (miss.length) throw new Error(`Missing env: ${miss.join(", ")} (see .env.example)`);
  const provider = new ethers.JsonRpcProvider(process.env.PORTALDOT_EVM_RPC || "https://test-evm-rpc-v3.portaldot.dev");
  const wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);
  const cfg = { provider, wallet, vaultAddr: process.env.VAULT, ownerAddr: process.env.OWNER,
    circuits: process.env.CIRCUITS.split(",").map((s) => s.trim()).filter(Boolean), lead: Number(process.env.LEAD_SECONDS ?? 3600) };
  const every = Number(process.env.POLL_SECONDS ?? 60) * 1000;
  console.log(JSON.stringify({ msg: "esusu agent started", agent: wallet.address, circuits: cfg.circuits }));
  let state = loadState();
  for (;;) {
    try { state = await tick({ ...cfg, state }); saveState(state); } catch (e) { console.error(JSON.stringify({ error: e.message })); }
    await new Promise((r) => setTimeout(r, every));
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { tick };
