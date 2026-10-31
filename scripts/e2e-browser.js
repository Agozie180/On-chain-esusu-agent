// Real-browser end-to-end test: drives web/ in headless Chromium against a local Hardhat node.
// A tiny EIP-1193 shim forwards wallet calls to the node (its accounts are unlocked), so every click is a real transaction.
//   SOLC_JS=1 node scripts/e2e-browser.js
const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC_PORT = Number(process.env.ESUSU_E2E_RPC_PORT || 8545);
const RPC = `http://127.0.0.1:${RPC_PORT}`;
const PORT = Number(process.env.ESUSU_E2E_WEB_PORT || 5173);
const WEB = path.join(__dirname, "..", "web");
const ETHERS = path.join(__dirname, "..", "node_modules", "ethers", "dist", "ethers.umd.min.js");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`); if (!ok) failures++; };

async function waitRpc() {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) }); if (r.ok) return; } catch {} await sleep(500); }
  throw new Error("hardhat node did not start");
}

(async () => {
  const node = spawn(process.execPath, [require.resolve("hardhat/internal/cli/cli"), "node", "--hostname", "127.0.0.1", "--port", String(RPC_PORT)], { env: { ...process.env, SOLC_JS: "1" }, stdio: "ignore", windowsHide: true });
  node.on("error", (error) => { console.error("Local chain failed to start:", error.message); process.exit(1); });
  const LOCAL_CFG = `window.ESUSU_CONFIG = { registry: "", rpc: "${RPC}", chainId: 31337, network: "Hardhat local", symbol: "tPOTv3", explorer: "" };`;
  const srv = http.createServer((req, res) => {
    if (req.url.split("?")[0] === "/config.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(LOCAL_CFG); }
    const f = path.join(WEB, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
    if (!f.startsWith(WEB) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": types[path.extname(f)] || "text/plain" }); res.end(fs.readFileSync(f));
  }).listen(PORT);
  let browser;
  try {
    await waitRpc();
    const provider = new ethers.JsonRpcProvider(RPC);
    const accts = await provider.send("eth_accounts", []);
    const bob = await provider.getSigner(accts[2]);
    const me = accts[1];

    const sandboxChrome = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
    const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync(sandboxChrome) ? sandboxChrome : undefined); // else Playwright's own install (CI)
    browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.route("**/ethers.umd.min.js", (r) => r.fulfill({ contentType: "text/javascript", body: fs.readFileSync(ETHERS) }));
    await page.exposeFunction("__rpc", async (method, params) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [me];
      const r = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }) })).json();
      if (r.error) { const e = new Error(r.error.message); e.code = r.error.code; e.data = r.error.data; throw e; }
      return r.result;
    });
    await page.addInitScript(() => { window.ethereum = { request: ({ method, params }) => window.__rpc(method, params || []), on() {} }; });
    await page.goto(`http://127.0.0.1:${PORT}/`);

    const logText = () => page.locator("#log").innerText();
    let actionLogBefore = "";
    const waitLog = async (needle, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { const current = await logText(); if (current.slice(0, Math.max(0, current.length - actionLogBefore.length)).includes(needle)) return true; await sleep(300); } return false; };
    const click = async (sel) => { actionLogBefore = await logText(); await page.locator(sel).click(); };

    await click("#btnConnect"); check("wallet connects", await waitLog("Connected"));

    await page.locator("#registrySettings summary").click();
    await click("#btnDeployReg"); check("registry deploys from the UI", await waitLog("Deploy registry ✔") && /^0x/.test(await page.inputValue("#regAddr")));
    await page.waitForSelector("#discover", { state: "visible" });
    check("registry panel shows reputation 0 / 1000", (await page.locator("#regKv").innerText()).includes("0 / 1000"));

    await page.locator("#discover summary").click();
    await page.fill("#cDues", "1"); await page.fill("#cSize", "2"); await page.fill("#cMinutes", "15");
    await click("#btnCreate"); check("circle is created from the UI", await waitLog("Create circle ✔"));
    await page.waitForSelector("#circleList button[data-open]");
    check("circle shows up in discovery", (await page.locator("#circleList").innerText()).includes("0/2 joined"));
    await click("#circleList button[data-open]");
    await page.waitForSelector("#circleCard", { state: "visible" });

    check("join is disabled until a slot is selected", await page.locator("#btnJoin").isDisabled());
    await page.locator(".slot.free").first().focus();
    await page.keyboard.press("Enter");
    await page.locator('.slot.free[aria-pressed="true"]').waitFor({ state: "visible" });
    check("payout slots are keyboard accessible", await page.locator(".slot.free").first().getAttribute("aria-pressed") === "true");
    await page.waitForFunction(() => document.querySelector("#risk").innerText.includes("Risk grade"), null, { timeout: 15000 }).catch(() => {});
    check("risk grade appears for the selected slot", (await page.locator("#risk").innerText()).includes("Risk grade"), await page.locator("#risk").innerText());
    await click("#btnJoin"); check("join succeeds", await waitLog("Join slot 1 ✔"));
    check("my slot is shown as mine", (await page.locator("#slots").innerText()).toLowerCase().includes("you"));

    const circleAddr = await page.evaluate(() => localStorage.getItem("esusu.circle"));
    const circle = new ethers.Contract(circleAddr, ["function join(uint256) payable", "function contribute() payable", "function collateralFor(uint256) view returns (uint256)", "function state() view returns (uint8)", "function dues() view returns (uint256)", "function paid(uint256,address) view returns (bool)"], bob);
    await (await circle.join(1, { value: await circle.collateralFor(1) })).wait();
    await page.evaluate(() => document.querySelector("#btnLoadReg").click()); await sleep(1500);
    await click("#circleList button[data-open]"); await sleep(1500);
    check("circle is Active once full", (await page.locator("#circleKv").innerText()).includes("Active"));

    await click("#btnPay"); check("pay dues succeeds", await waitLog("Pay dues ✔"));
    await (await circle.contribute({ value: await circle.dues() })).wait();
    await click("#btnSettle"); check("settle succeeds", await waitLog("Settle round ✔"));
    await sleep(1200);
    // the dapp deploys the registry with the connected wallet as treasury, so payout (1.99) + fee (0.01) both land with it
    check("withdrawable shows the 2 tPOTv3 pot (1.99 payout + 0.01 fee, same wallet is treasury)", /My withdrawable\s*2 tPOTv3/.test((await page.locator("#circleKv").innerText()).replace(/\n/g, " ")), await page.locator("#circleKv").innerText());
    await click("#btnWithdraw"); check("withdraw succeeds", await waitLog("Withdraw ✔"));

    // vault: deploy, fund, policy, allowlist, kill switch
    await click("#btnDeployVault"); check("vault deploys from the UI", await waitLog("Deploy vault ✔"));
    await page.waitForSelector("#vaultView", { state: "visible" });
    await page.fill("#fundAmt", "5"); await click("#btnFund"); check("vault funds", await waitLog("Fund vault ✔"));
    await page.fill("#pAgent", accts[5]); await page.fill("#pPerTx", "1"); await page.fill("#pPeriodCap", "3");
    await click("#btnPolicy"); check("policy saves", await waitLog("Save policy ✔"));
    await click("#btnAllow"); check("circle allowlisted", await waitLog("Allowlist circle ✔"));
    await sleep(1000);
    const vk = await page.locator("#vaultKv").innerText();
    check("vault panel reflects balance, agent and allowlist", vk.includes("5 tPOTv3") && vk.includes("yes"), vk);
    await click("#btnPause"); check("kill switch pauses the agent", await waitLog("Pause agent ✔"));
    await sleep(1000);
    check("vault panel shows PAUSED", (await page.locator("#vaultKv").innerText()).includes("PAUSED"));

    // ---- ERC-20 (stable-value token) path: approve-then-join, approve-then-pay, mint helper, vault asset matching
    const art = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "artifacts/contracts/test/MockToken.sol/MockToken.json"), "utf8"));
    const tok = await new ethers.ContractFactory(art.abi, art.bytecode, bob).deploy(); await tok.waitForDeployment();
    const tokAddr = await tok.getAddress();
    await page.selectOption("#cAsset", "token"); await page.fill("#cToken", tokAddr);
    await page.fill("#cDues", "10"); await page.fill("#cSize", "2");
    if (!(await page.locator("#cDues").isVisible())) await page.locator("#discover summary").click();
    await click("#btnCreate"); check("ERC-20 circle is created from the UI", await waitLog("Create circle ✔"));
    await sleep(1500);
    await page.locator("#circleList button[data-open]").first().click();
    await page.waitForFunction(() => document.querySelector("#circleKv").innerText.includes("mUSD"), null, { timeout: 15000 }).catch(() => {});
    check("circle view uses the token symbol and decimals", (await page.locator("#circleKv").innerText()).includes("10 mUSD"), await page.locator("#circleKv").innerText());
    check("mint helper is offered for tokens", await page.locator("#btnMint").isVisible());
    await click("#btnMint"); check("mint test tokens", await waitLog("Mint test tokens ✔"));
    await page.locator(".slot.free").first().click();
    await sleep(1000);
    await click("#btnJoin"); check("ERC-20 join (approve then join) succeeds", await waitLog("Join slot 1 ✔"));
    const circle2 = new ethers.Contract((await page.evaluate(() => localStorage.getItem("esusu.circle"))), ["function join(uint256)", "function contribute()", "function collateralFor(uint256) view returns (uint256)", "function dues() view returns (uint256)", "function state() view returns (uint8)"], bob);
    await (await tok.mint(accts[2], 1_000_000_000n)).wait();
    await (await tok.approve(await circle2.getAddress(), await circle2.collateralFor(1))).wait();
    await (await circle2.join(1)).wait();
    check("ERC-20 circle becomes Active", Number(await circle2.state()) === 1);
    await click("#btnPay"); check("ERC-20 pay dues (approve then contribute) succeeds", await waitLog("Pay dues ✔"));
    await click("#btnDeployVault"); check("ERC-20 vault deploys for the circle's asset", await waitLog("Deploy vault ✔"));
    await sleep(1200);
    check("agent activity panel loads without an RPC error", !(await page.locator("#activity").innerText()).includes("unavailable"), await page.locator("#activity").innerText());

    // ---- read-only mode: no wallet at all, the live circles must still render for a judge who just opens the link
    const regAddr = await page.inputValue("#regAddr");
    const ro = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const roErrors = [];
    ro.on("pageerror", (e) => roErrors.push(e.message));
    await ro.route("**/ethers.umd.min.js", (r) => r.fulfill({ contentType: "text/javascript", body: fs.readFileSync(ETHERS) }));
    await ro.route(RPC + "/**", async (route) => {   // give the local node the CORS headers a public RPC would have
      const h = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: h });
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: route.request().postData() });
      return route.fulfill({ status: 200, headers: { ...h, "content-type": "application/json" }, body: await r.text() });
    });
    await ro.goto(`http://127.0.0.1:${PORT}/?registry=${regAddr}`);
    await ro.waitForSelector("#circleList button[data-open]", { timeout: 20000 }).catch(() => {});
    check("read-only: circles are listed with no wallet", (await ro.locator("#circleList").innerText()).includes("joined"), await ro.locator("#circleList").innerText());
    check("read-only: hero explains the product", (await ro.locator(".hero").innerText()).includes("choose your payout slot"));
    check("read-only: reputation prompts to connect instead of showing a fake zero", (await ro.locator("#regKv").innerText()).includes("connect wallet"));
    await ro.locator("#circleList button[data-open]").first().click();
    await ro.waitForSelector("#circleCard", { state: "visible", timeout: 15000 }).catch(() => {});
    check("read-only: a circle opens and shows its slots", (await ro.locator("#slots").innerText()).includes("Slot 1"));
    check("read-only: acting asks for a wallet instead of crashing", await (async () => { await ro.locator("#btnSettle").click({ force: true }).catch(() => {}); await sleep(800); return !roErrors.length; })(), roErrors.join(" | "));
    // Loading a configured demo circle should keep the landing page at the top.
    await ro.route("**/config.js", async (route) => route.fulfill({ contentType: "text/javascript", body:
      `window.ESUSU_CONFIG = ${JSON.stringify({ registry: regAddr, demoCircle: await circle2.getAddress(), rpc: RPC, chainId: 31337, network: "Hardhat local", symbol: "tPOTv3", explorer: "" })};`
    }));
    await ro.goto(`http://127.0.0.1:${PORT}/`);
    await ro.locator("#slots .slot").first().waitFor({ state: "visible" });
    check("read-only: demo loading does not scroll away from the landing page", await ro.evaluate(() => scrollY === 0));
    // Inspect the actual read-only layout, with data from the local chain.
    await ro.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await ro.evaluate(() => document.fonts.ready);
    await ro.screenshot({ path: path.join(__dirname, "..", "docs", "dapp-desktop.png"), fullPage: false });
    await ro.screenshot({ path: path.join(__dirname, "..", "docs", "dapp-e2e.png"), fullPage: true });
    await ro.setViewportSize({ width: 390, height: 844 });
    await ro.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    check("mobile: page has no horizontal overflow", await ro.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check("mobile: wallet and navigation remain accessible", await ro.locator("#btnConnect").isVisible() && await ro.locator('.main-nav a[href="#discover"]').isVisible());
    await ro.screenshot({ path: path.join(__dirname, "..", "docs", "dapp-mobile.png"), fullPage: true });
    await ro.locator('.main-nav a[href="#discover"]').click();
    check("mobile: circle navigation selects its section", await ro.locator('.main-nav a[href="#discover"]').getAttribute("aria-current") === "location");
    await ro.route(RPC + "/**", (route) => route.abort("failed"));
    await ro.reload();
    await ro.locator('#syncStatus[data-state="error"]').waitFor({ state: "visible", timeout: 20000 });
    check("read-only: RPC failure has a clear recovery state", (await ro.locator("#circleList").innerText()).includes("couldn’t reach the network") && await ro.locator("#btnConnect").isVisible());
    await ro.close();

    // ---- service-provider lane controls in the vault panel
    await page.fill("#payeeAddr", accts[7]); await page.fill("#payeeCap", "1"); await click("#btnPayee");
    check("owner can allow a service provider from the UI", await waitLog("Allow provider ✔"));
    await click("#btnPayeeOff"); check("owner can remove a service provider from the UI", await waitLog("Remove provider ✔"));

    // A valid ERC-20 may return HTML as its symbol. Opening its circle must render text only.
    const metadataArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "artifacts/contracts/test/MetadataToken.sol/MetadataToken.json"), "utf8"));
    const hostileSymbol = `<img src=x onerror="document.body.dataset.esusuXss='executed'">`;
    const metadataToken = await new ethers.ContractFactory(metadataArtifact.abi, metadataArtifact.bytecode, bob).deploy(hostileSymbol);
    await metadataToken.waitForDeployment();
    await page.fill("#cToken", await metadataToken.getAddress());
    await click("#btnCreate"); check("circle with untrusted token metadata is created", await waitLog("Create circle ✔"));
    await page.locator("#circleList button[data-open]").first().click();
    await page.waitForFunction(() => document.querySelector("#circleKv").innerText.includes("Dues per round"));
    await sleep(1200);
    check("token metadata never creates HTML elements", await page.locator("#circleKv img, #slots img, #vaultKv img").count() === 0);
    check("token metadata never executes script", await page.locator("body").getAttribute("data-esusu-xss") === null);
    check("token symbol is shown as literal text", (await page.locator("#circleKv").innerText()).includes(hostileSymbol));

    // A wallet on another chain must never be allowed to submit a deployment.
    const wrongChain = await browser.newPage();
    let wrongChainWrites = 0;
    await wrongChain.route("**/ethers.umd.min.js", (r) => r.fulfill({ contentType: "text/javascript", body: fs.readFileSync(ETHERS) }));
    await wrongChain.exposeFunction("__rpc", async (method, params) => {
      if (method === "eth_chainId") return "0x1";
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [me];
      if (method === "eth_sendTransaction" || method === "eth_sendRawTransaction") { wrongChainWrites++; throw new Error("Test intercepted an unsafe write"); }
      const result = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
      if (result.error) throw new Error(result.error.message);
      return result.result;
    });
    await wrongChain.addInitScript(() => { window.ethereum = { request: ({ method, params }) => window.__rpc(method, params || []), on() {} }; });
    await wrongChain.goto(`http://127.0.0.1:${PORT}/`);
    await wrongChain.locator("#registrySettings summary").click();
    await wrongChain.locator("#btnDeployReg").click();
    await sleep(1500);
    check("wrong network cannot submit a deployment", wrongChainWrites === 0);
    check("wrong network does not enable wallet actions", (await wrongChain.locator("#btnConnect").innerText()) === "Connect wallet");
    await wrongChain.close();

    const errs = (await logText()).split("\n").filter((l) => l.includes("✖"));
    check("no failed actions in the log", errs.length === 0, errs.join(" | "));
    check("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
    await page.locator(`#circleList button[data-open="${await circle2.getAddress()}"]`).click();
    await sleep(1000);
  } catch (e) { console.error("E2E crashed:", e.message); failures++; }
  finally { if (browser) await browser.close(); srv.close(); node.kill(); }
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll browser checks passed");
  process.exit(failures ? 1 : 0);
})();
