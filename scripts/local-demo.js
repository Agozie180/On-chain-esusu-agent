// One-command judge demo: a local chain with realistic seeded state, the dapp, and the paid risk API.
//   npm run demo:local          (add SOLC_JS=1 in an offline sandbox)
// No faucet, no testnet, no deploy risk. Press Ctrl+C to stop.
const { spawn, execFileSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { createService } = require("../agent/service");

const RPC = "http://127.0.0.1:8545", PORT = Number(process.env.PORT || 5173), SVC_PORT = 8402;
const WEB = path.join(__dirname, "..", "web");
const MNEMONIC = "test test test test test test test test test test test junk"; // Hardhat's public dev mnemonic: LOCAL USE ONLY
const key = (i) => ethers.HDNodeWallet.fromPhrase(MNEMONIC, undefined, `m/44'/60'/0'/0/${i}`).privateKey;
const art = (n, sub = "") => JSON.parse(fs.readFileSync(path.join(__dirname, "..", `artifacts/contracts/${sub}${n}.sol/${n}.json`), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };

async function main() {
  const cli = require.resolve("hardhat/internal/cli/cli");
  execFileSync(process.execPath, [cli, "compile"], { stdio: "inherit", env: process.env, windowsHide: true });
  execFileSync(process.execPath, [path.join(__dirname, "build-web.js")], { stdio: "inherit", windowsHide: true });
  const node = spawn(process.execPath, [cli, "node", "--hostname", "127.0.0.1", "--port", "8545"], { stdio: "ignore", env: process.env, windowsHide: true });
  node.on("error", (error) => { console.error("Local chain failed to start:", error.message); process.exit(1); });
  const cleanup = () => { try { node.kill(); } catch {} process.exit(0); };
  process.on("SIGINT", cleanup); process.on("SIGTERM", cleanup);
  const provider = new ethers.JsonRpcProvider(RPC, 31337, { staticNetwork: true });
  for (let i = 0; i < 80; i++) { try { await provider.getBlockNumber(); break; } catch { await sleep(500); } }
  const S = await Promise.all([...Array(10).keys()].map((i) => provider.getSigner(i)));
  const A = S.map((s) => s.address);
  const [deployer, judge, a2, a3, a4, a5, a6, , agent, svc] = S;

  const deploy = async (name, signer, args = [], sub = "") => { const a = art(name, sub); const c = await new ethers.ContractFactory(a.abi, a.bytecode, signer).deploy(...args); await c.waitForDeployment(); return c; };
  const at = (name, addr, signer, sub = "") => new ethers.Contract(addr, art(name, sub).abi, signer);
  const wait = async (p) => (await p).wait();
  const advance = async (s) => { await provider.send("evm_increaseTime", [s]); await provider.send("evm_mine", []); };

  console.log("Seeding local chain...");
  const reg = await deploy("EsusuRegistry", deployer, [A[0], A[0], 50]);
  const tok = await deploy("MockToken", deployer, [], "test/");
  const U = 1_000_000n, D = 10n * U;
  for (const a of A) await wait(tok.mint(a, 10_000n * U));
  const mk = async (creator, dues, size, dur, minScore = 0) => {
    const r = await wait(reg.connect(creator).createCircle(await tok.getAddress(), dues, size, dur, minScore));
    const ev = r.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "CircleCreated");
    return at("EsusuCircle", ev.args.circle, creator);
  };
  const join = async (c, who, slot) => { await wait(tok.connect(who).approve(await c.getAddress(), await c.collateralFor(slot))); await wait(c.connect(who).join(slot)); };
  const payIn = async (c, who) => { await wait(tok.connect(who).approve(await c.getAddress(), await c.dues())); await wait(c.connect(who).contribute()); };

  // History: a clean 3-person circle among a2,a3,a4 gives them reputation
  const hist = await mk(a2, D, 3, 3600);
  for (const [i, m] of [a2, a3, a4].entries()) await join(hist, m, i);
  for (let r = 0; r < 3; r++) { for (const m of [a2, a3, a4]) await payIn(hist, m); await wait(hist.settleRound()); }

  // Gated circle: needs score >= 150 (a2/a3/a4 qualify; the judge, with no history, does not)
  const gated = await mk(a2, D, 4, 7 * 86400, 150);
  for (const [i, m] of [a2, a3, a4].entries()) await join(gated, m, i);

  // Open circle for the judge to join
  const open = await mk(a3, D, 3, 86400);
  await join(open, a3, 0);

  // LIVE circle D: judge is slot 2; a5 defaulted in round 1 (flagged, collateral slashed); round 2 is in progress
  const live = await mk(a2, D, 4, 3600);
  for (const [i, m] of [a2, judge, a5, a6].entries()) await join(live, m, i);
  for (const m of [a2, judge, a6]) await payIn(live, m);
  await advance(3601); await wait(live.settleRound());
  for (const m of [a2, a6]) await payIn(live, m);           // judge has NOT paid round 2: the agent will

  // Judge's agent vault: pays dues for `live`, plus lane 2 for the risk-report service
  const vault = await deploy("AgentAllowance", judge, [A[1], await tok.getAddress()]);
  await wait(tok.connect(judge).transfer(await vault.getAddress(), 100n * U));
  const latest = (await provider.getBlock("latest")).timestamp;
  await wait(vault.connect(judge).setPolicy(A[8], D, 3n * D, 86400, latest + 30 * 86400));
  await wait(vault.connect(judge).setCircuit(await live.getAddress(), true));
  await wait(vault.connect(judge).setPayee(A[9], true, 3n * U));

  // Paid risk-report API (x402 style), 1 mUSD per report
  const service = createService({ provider, token: await tok.getAddress(), payee: A[9], price: U, chainId: 31337 });
  await service.listen(SVC_PORT);

  const out = { registry: await reg.getAddress(), token: await tok.getAddress(), vault: await vault.getAddress(), liveCircle: await live.getAddress(),
    openCircle: await open.getAddress(), gatedCircle: await gated.getAddress(), judge: A[1], agent: A[8], serviceUrl: `http://127.0.0.1:${SVC_PORT}` };
  fs.writeFileSync(path.join(__dirname, "..", ".local-demo.json"), JSON.stringify(out, null, 2));

  const cfg = `window.ESUSU_CONFIG = ${JSON.stringify({ registry: out.registry, rpc: RPC, chainId: 31337, network: "Hardhat local (demo)", symbol: "tPOTv3", explorer: "", demoCircle: out.liveCircle })};`;
  http.createServer((req, res) => {
    const u = req.url.split("?")[0];
    if (u === "/config.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(cfg); }
    const f = path.join(WEB, u === "/" ? "index.html" : u);
    if (!f.startsWith(WEB) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": types[path.extname(f)] || "text/plain" }); res.end(fs.readFileSync(f));
  }).listen(PORT, "127.0.0.1");

  console.log(`
READY. Everything below is local and uses a public dev key. Never use it with real funds.

 1. Open the dapp:        http://127.0.0.1:${PORT}      (you can browse with no wallet at all)
 2. To act, add this network in MetaMask:  RPC ${RPC}   chain ID 31337   symbol tPOTv3
    then import the judge account:  ${key(1)}
    (it is the account that is already in the live circle and owns the agent vault)
 3. What is seeded:
      live circle   ${out.liveCircle}   you are slot 2, a member already defaulted, YOUR dues for this round are unpaid
      open circle   ${out.openCircle}   join a slot and read the risk grade
      gated circle  ${out.gatedCircle}   requires reputation 150; the judge account will be refused
      the judge's agent vault ${out.vault}   limits: 10 mUSD/payment, 30 per day, this circle only
 4. Watch the agent pay your dues from the vault (one pass, ~5 s):
      REGISTRY=${out.registry} VAULT=${out.vault} OWNER=${A[1]} AGENT_PRIVATE_KEY=${key(8)} PORTALDOT_EVM_RPC=${RPC} npm run agent
 5. See the agent pay for an API (HTTP 402):
      curl -i ${out.serviceUrl}/risk/${out.openCircle}?slot=2        (402 + a quote)
      npm run demo:buy                                                (agent pays 1 mUSD from the vault, gets the report)
 6. Try to break it: in the dapp pause the agent, remove the circle from the allowlist, or lower the caps, and rerun step 4.

Ctrl+C to stop.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
