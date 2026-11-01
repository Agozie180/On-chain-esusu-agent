// Run the existing three-member testnet circle to completion with the real agent.
// Check first: npm run demo:testnet -- --check. Execute/resume: npm run demo:testnet -- --run.
// Demo participant keys stay local; public receipts contain addresses and transaction hashes only.
require("dotenv").config({ quiet: true });
process.env.TELEGRAM_BOT_TOKEN = ""; // Demo runs do not send messages or call an explanation service.
process.env.ANTHROPIC_API_KEY = "";
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const { tick } = require("../agent/agent");
const { NETWORK } = require("../lib/portaldot");

const root = path.resolve(__dirname, "..");
const file = path.join(root, "deployments/portaldot-demo.json");
const keyFile = path.join(root, ".testnet-demo-wallets.json");
const lockFile = path.join(root, ".testnet-demo.lock");
const art = (name, sub = "") => require(path.join(root, `artifacts/contracts/${sub}${name}.sol/${name}.json`));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

async function runDemo({ provider, owner, agent, members, deployment: dep, report, save, pauseMs = 2000,
  maxFees = ethers.parseEther("55"), fundGas = true }) {
  const c = new ethers.Contract(dep.circle, art("EsusuCircle").abi, owner);
  const v = new ethers.Contract(dep.vault, art("AgentAllowance").abi, owner);
  const t = new ethers.Contract(dep.token, art("MockToken", "test/").abi, owner);
  const all = [owner, ...members];
  const addresses = await Promise.all(all.map((w) => w.getAddress()));
  const ownerAddr = addresses[0], agentAddr = await agent.getAddress();
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== dep.chainId) throw new Error("Wrong chain: refusing demo transactions");
  if (!same(await v.owner(), ownerAddr) || !same(await v.agent(), agentAddr)) throw new Error("Owner/agent keys do not match the deployed vault");
  if (!same(await c.token(), dep.token) || !same(await v.token(), dep.token) || Number(await c.size()) !== 3) throw new Error("Demo requires the recorded three-member token circle");
  if (report.circle && (!same(report.circle, dep.circle) || report.chainId !== dep.chainId)) throw new Error("Checkpoint belongs to a different circle");
  const dues = await c.dues();
  const latest = await provider.getBlock("latest");
  const [paused, expiry, allowed, cap, periodCap, spent, periodStart, periodLength] = await Promise.all([
    v.paused(), v.expiry(), v.allowedCircuit(dep.circle), v.perTxCap(), v.periodCap(), v.spentInPeriod(), v.periodStart(), v.periodLength(),
  ]);
  if (Number(await c.state()) !== 2 && (paused || Number(expiry) <= latest.timestamp || !allowed || cap < dues)) throw new Error("Agent policy cannot run this demo");
  const roundsLeft = Number(await c.state()) === 2 ? 0 : 3 - Number(await c.currentRound());
  const currentPaid = roundsLeft ? await c.paid(await c.currentRound(), ownerAddr) : false;
  const agentOwes = dues * BigInt(roundsLeft - (currentPaid ? 1 : 0));
  const periodSpent = latest.timestamp >= Number(periodStart + periodLength) ? 0n : spent;
  if (agentOwes > periodCap - periodSpent || await v.balance() < agentOwes) throw new Error("Existing vault balance or remaining period cap cannot cover the full run");
  Object.assign(report, { schemaVersion: 1, chainId: dep.chainId, circle: dep.circle, vault: dep.vault, token: dep.token,
    owner: ownerAddr, agent: agentAddr, members: addresses, dues: dues.toString(), tokenSymbol: "mUSD", tokenDecimals: 6,
    testAccounts: true, status: report.status === "completed" ? "completed" : "running",
    startedAt: report.startedAt || new Date().toISOString(), transactions: report.transactions || [] });
  save();

  const spentFees = () => report.transactions.reduce((sum, row) => sum + BigInt(row.fee || 0), 0n);
  const receipt = async (hash) => await provider.getTransactionReceipt(hash) || await provider.waitForTransaction(hash, 1, 180000);
  async function send(id, contract, method, args, detail = {}) {
    let row = report.transactions.find((r) => r.id === id);
    if (!row) {
      const signer = contract.runner;
      const who = await signer.getAddress();
      const gasPrice = (await provider.getFeeData()).gasPrice;
      // Give new demo accounts enough gas to estimate their first transaction.
      if (fundGas && !same(who, ownerAddr) && await provider.getBalance(who) < ethers.parseEther("0.1")) {
        await topUp(who, ethers.parseEther("0.5"), id + "-initial-gas");
      }
      const gas = await contract[method].estimateGas(...args);
      const cost = gas * gasPrice;
      if (spentFees() + cost > maxFees) throw new Error(`Demo gas budget exceeded before ${id}; no transaction sent`);
      if (await provider.getBalance(who) < cost * 12n / 10n) {
        if (!fundGas || same(who, ownerAddr)) throw new Error(`Insufficient test gas for ${id}: needs about ${ethers.formatEther(cost)} tPOTv3`);
        await topUp(who, cost * 15n / 10n, id + "-gas");
      }
      const tx = await contract[method](...args);
      row = { id, kind: detail.kind || method, ...detail, hash: tx.hash, from: who, to: await contract.getAddress(), status: "pending" };
      report.transactions.push(row); save();
      console.log(`Submitted ${id}: ${tx.hash}`);
    }
    if (row.status !== "confirmed") {
      const rc = await receipt(row.hash);
      if (!rc || rc.status !== 1) throw new Error(`Inspect pending/failed transaction ${row.hash}; it will not be resubmitted`);
      const block = await provider.getBlock(rc.blockNumber);
      Object.assign(row, { status: "confirmed", blockNumber: rc.blockNumber, timestamp: block.timestamp,
        gasUsed: rc.gasUsed.toString(), gasPrice: rc.gasPrice.toString(), fee: rc.fee.toString() });
      if (row.kind === "round-settled") {
        const event = rc.logs.map((log) => { try { return c.interface.parseLog(log); } catch { return null; } }).find((event) => event?.name === "RoundSettled");
        if (!event || event.args.rolledOver) throw new Error("Settlement did not produce the expected payout");
        row.amount = event.args.collected.toString(); row.protocolFee = event.args.fee.toString();
        row.payout = (event.args.collected - event.args.fee).toString(); row.member = event.args.recipient;
      }
      save();
    }
    console.log(`Confirmed ${id}`);
    if (pauseMs) await delay(pauseMs);
    return row.hash;
  }
  async function topUp(to, amount, id) {
    let row = report.transactions.find((r) => r.id === id);
    if (!row) {
      const request = { to, value: amount };
      const gas = await owner.estimateGas(request);
      const gasPrice = (await provider.getFeeData()).gasPrice;
      if (await provider.getBalance(ownerAddr) < amount + gas * gasPrice + ethers.parseEther("0.1")) throw new Error("Owner needs more test gas to fund the demo; no transfer sent");
      if (spentFees() + gas * gasPrice > maxFees) throw new Error("Demo gas budget exceeded");
      const tx = await owner.sendTransaction(request);
      row = { id, kind: "gas-funding", hash: tx.hash, from: ownerAddr, to, amount: amount.toString(), status: "pending" };
      report.transactions.push(row); save();
    }
    const rc = await receipt(row.hash);
    if (!rc || rc.status !== 1) throw new Error(`Inspect gas funding transaction ${row.hash}`);
    Object.assign(row, { status: "confirmed", blockNumber: rc.blockNumber, timestamp: (await provider.getBlock(rc.blockNumber)).timestamp,
      gasUsed: rc.gasUsed.toString(), gasPrice: rc.gasPrice.toString(), fee: rc.fee.toString() }); save();
  }

  // Resolve submitted transactions before making any state-dependent decisions on resume.
  for (const row of report.transactions.filter((r) => r.status === "pending")) {
    const rc = await receipt(row.hash);
    if (!rc || rc.status !== 1) throw new Error(`Inspect pending/failed transaction ${row.hash}`);
    Object.assign(row, { status: "confirmed", blockNumber: rc.blockNumber, timestamp: (await provider.getBlock(rc.blockNumber)).timestamp,
      gasUsed: rc.gasUsed.toString(), gasPrice: rc.gasPrice.toString(), fee: rc.fee.toString() }); save();
  }
  for (let i = 0; i < all.length; i++) {
    const slot = await c.slotOwner(i);
    if (slot !== ethers.ZeroAddress && !same(slot, addresses[i])) throw new Error(`Slot ${i + 1} belongs to another wallet; refusing to automate its membership`);
  }
  if (Number(await c.state()) === 0) {
    // Seed balances and all approvals before the final join starts the round timer.
    for (let i = 1; i < all.length; i++) {
      const need = await c.collateralFor(i) + dues * 3n;
      const balance = await t.balanceOf(addresses[i]);
      if (balance < need) await send(`mint-${i}`, t, "mint", [addresses[i], need - balance], { kind: "test-token-mint" });
      if (await t.allowance(addresses[i], dep.circle) < need) await send(`approve-${i}`, t.connect(all[i]), "approve", [dep.circle, need], { kind: "token-approval" });
    }
    for (let i = 1; i < all.length; i++) {
      if (!(await c.isMember(addresses[i]))) await send(`join-${i}`, c.connect(all[i]), "join", [i], { kind: "member-joined", member: addresses[i], slot: i + 1 });
    }
  }
  const execute = async (contract, method, args, event) => send(`round-${event.round + 1}-${method}`, contract, method, args,
    { kind: method === "payDues" ? "agent-payment" : "round-settled", round: event.round + 1,
      ...(method === "payDues" ? { member: ownerAddr, amount: dues.toString() } : { member: addresses[event.round], amount: (dues * 3n).toString() }) });
  const agentTick = async () => {
    const events = [];
    await tick({ provider, wallet: agent, vaultAddr: dep.vault, ownerAddr, circuits: [dep.circle], lead: 3600,
      execute, onEvent: (event) => events.push(event) });
    const error = events.find((event) => event.error || event.action === "alert");
    if (error) throw new Error(error.error || error.reason);
    return events;
  };
  async function withdrawAll(phase) {
    for (let i = 0; i < all.length; i++) {
      const amount = await c.credit(addresses[i]);
      if (amount > 0n) await send(`${phase}-withdraw-${i}`, c.connect(all[i]), "withdraw", [],
        { kind: "wallet-received", member: addresses[i], amount: amount.toString() });
    }
  }
  while (Number(await c.state()) === 1) {
    const r = Number(await c.currentRound());
    const block = await provider.getBlock("latest");
    if (block.timestamp >= Number(await c.roundDeadline())) throw new Error("Round deadline passed; inspect the circle before continuing to avoid presenting a default as a clean demo");
    for (let i = 1; i < all.length; i++) {
      if (!(await c.paid(r, addresses[i]))) await send(`round-${r + 1}-member-${i}`, c.connect(all[i]), "contribute", [],
        { kind: "member-payment", round: r + 1, member: addresses[i], amount: dues.toString() });
    }
    await agentTick();
    if (Number(await c.state()) === 1 && Number(await c.currentRound()) === r) await agentTick();
    if (Number(await c.state()) === 1 && Number(await c.currentRound()) === r) throw new Error("Agent did not advance the round; inspect the policy and event log");
    await withdrawAll(`round-${r + 1}`);
  }
  await withdrawAll("final");
  for (let r = 0; r < 3; r++) for (const address of addresses) {
    if (!(await c.paid(r, address))) throw new Error("Demo is not a clean, fully paid cycle");
    if (await c.defaulted(address)) throw new Error("A member defaulted; refusing to mark the demo successful");
  }
  if (await t.balanceOf(dep.circle) !== 0n) throw new Error("Circle still holds funds after withdrawals");
  Object.assign(report, { status: "completed", completedAt: report.completedAt || new Date().toISOString(),
    finalState: { state: "Completed", rounds: 3, contributions: 9, agentPayments: 3, circleBalance: "0",
      vaultBalance: (await v.balance()).toString(), members: await Promise.all(addresses.map(async (address) => ({
        address, balance: (await t.balanceOf(address)).toString(), credit: (await c.credit(address)).toString(), defaulted: await c.defaulted(address),
      }))) }, feeTotal: spentFees().toString() });
  save();
  return report;
}

async function main() {
  const dep = require(path.join(root, "deployments/portaldot.json"));
  const request = new ethers.FetchRequest(process.env.PORTALDOT_EVM_RPC || NETWORK.evmRpc); request.timeout = 30000;
  const provider = new ethers.JsonRpcProvider(request, undefined, { pollingInterval: 1500, cacheTimeout: -1 });
  try {
    if (Number((await provider.getNetwork()).chainId) !== NETWORK.chainId) throw new Error("Only Portaldot testnet is allowed");
    const owner = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const agent = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);
    const c = new ethers.Contract(dep.circle, art("EsusuCircle").abi, provider);
    const v = new ethers.Contract(dep.vault, art("AgentAllowance").abi, provider);
    if (!process.argv.includes("--run")) {
      let joinEstimates = [];
      if (fs.existsSync(keyFile) && Number(await c.state()) === 0) {
        const keys = JSON.parse(fs.readFileSync(keyFile, "utf8"));
        const gasPrice = (await provider.getFeeData()).gasPrice;
        for (let i = 0; i < keys.keys.length; i++) {
          const member = new ethers.Wallet(keys.keys[i], provider);
          try { joinEstimates.push({ slot: i + 2, address: member.address,
            gasBalance: ethers.formatEther(await provider.getBalance(member.address)),
            estimatedJoinFee: ethers.formatEther(await c.connect(member).join.estimateGas(i + 1) * gasPrice) }); }
          catch (e) { joinEstimates.push({ slot: i + 2, address: member.address, error: e.shortMessage || e.message }); }
        }
      }
      console.log(JSON.stringify({ chainId: dep.chainId, circle: dep.circle, state: Number(await c.state()), filled: Number(await c.filled()),
        slots: await Promise.all([0, 1, 2].map((i) => c.slotOwner(i))), ownerGas: ethers.formatEther(await provider.getBalance(owner.address)),
        agentGas: ethers.formatEther(await provider.getBalance(agent.address)), vaultTokens: (await v.balance()).toString(),
        expiry: new Date(Number(await v.expiry()) * 1000).toISOString(), currentRound: Number(await c.currentRound()),
        deadline: Number(await c.roundDeadline()), gasPrice: (await provider.getFeeData()).gasPrice.toString(), joinEstimates }, null, 2)); return;
    }
    const lock = fs.openSync(lockFile, "wx"); fs.writeSync(lock, String(process.pid)); fs.closeSync(lock);
    try {
      let keys;
      if (fs.existsSync(keyFile)) keys = JSON.parse(fs.readFileSync(keyFile, "utf8"));
      else { keys = { chainId: dep.chainId, circle: dep.circle, keys: [ethers.Wallet.createRandom().privateKey, ethers.Wallet.createRandom().privateKey] };
        fs.writeFileSync(keyFile, JSON.stringify(keys), { mode: 0o600, flag: "wx" }); }
      if (keys.chainId !== dep.chainId || !same(keys.circle, dep.circle)) throw new Error("Demo wallet file belongs to a different deployment");
      const members = keys.keys.map((key) => new ethers.Wallet(key, provider));
      const report = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
      const save = () => { report.updatedAt = new Date().toISOString(); fs.writeFileSync(file + ".tmp", JSON.stringify(report, null, 2) + "\n"); fs.renameSync(file + ".tmp", file); };
      try { await runDemo({ provider, owner, agent, members, deployment: dep, report, save }); }
      catch (e) { report.status = "needs-attention"; report.error = e.shortMessage || e.message; save(); throw e; }
      console.log("Completed the testnet cycle. Public evidence:", file);
    } finally { fs.unlinkSync(lockFile); }
  } finally { provider.destroy(); }
}
if (require.main === module) main().catch((e) => { console.error(e.shortMessage || e.message || e.code); process.exitCode = 1; });
module.exports = { runDemo };
