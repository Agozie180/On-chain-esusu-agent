/* On-chain Esusu-agent dapp v2. No build step. Needs an EVM wallet (e.g. MetaMask). */
(() => {
  const CFG = Object.assign({ registry: "", rpc: "https://test-evm-rpc-v3.portaldot.dev", chainId: 420420777, network: "PortaldotV3 Testnet", symbol: "tPOTv3",
    explorer: "https://node-console.portaldot.dev/" }, window.ESUSU_CONFIG || {});
  const CHAIN = { chainId: "0x" + Number(CFG.chainId).toString(16), chainName: CFG.network,
    nativeCurrency: { name: CFG.symbol, symbol: CFG.symbol, decimals: 18 }, rpcUrls: [CFG.rpc], blockExplorerUrls: CFG.explorer ? [CFG.explorer] : [] };
  const STATES = ["Open (filling)", "Active", "Completed"];
  const ZERO = ethers.ZeroAddress;
  const $ = (id) => document.getElementById(id);
  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let provider, signer = null, me = ethers.ZeroAddress, reg, circle, vault, token;
  const readProvider = new ethers.JsonRpcProvider(CFG.rpc, Number(CFG.chainId), { staticNetwork: true });
  provider = readProvider;
  let asset = { native: true, symbol: CFG.symbol, decimals: 18 };
  const bind = (c) => (c ? c.connect(signer || provider) : c);
  let selectedSlot = null;

  const fmt = (w) => { const s = ethers.formatUnits(w, asset.decimals); return (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s) + " " + asset.symbol; };
  const units = (id) => ethers.parseUnits($(id).value.trim() || "0", asset.decimals);
  const errName = (e) => (String(e?.message || "").match(/custom error '([^']+)'/) || [])[1] || e?.revert?.name || e?.shortMessage || e?.reason || e?.message || String(e);
  function log(msg) { const el = $("log"); el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + el.textContent; }

  async function run(label, fn) { try { log(label + "…"); const r = await fn(); log(label + " ✔"); return r; } catch (e) { log(`${label} ✖ ${errName(e)}`); } }
  async function send(label, getTx) { if (!(await ensure())) return; return run(label, async () => { const tx = await getTx(); log("tx " + tx.hash); await tx.wait(); await refresh(); }); }

  // ------------------------------------------------------------ wallet
  async function connect() {
    if (!window.ethereum) { log("No wallet found. Install MetaMask or another EVM wallet."); return false; }
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner(); me = await signer.getAddress();
    reg = bind(reg); circle = bind(circle); vault = bind(vault); token = bind(token);
    $("btnConnect").textContent = short(me);
    $("modeBanner").textContent = "Wallet connected: you can act.";
    const net = await provider.getNetwork();
    log(Number(net.chainId) === Number(CFG.chainId) ? `Connected to ${CFG.network} as ${me}` : `Connected to chain ${net.chainId}, expected ${CFG.chainId}. Use "Add Portaldot testnet".`);
    return true;
  }
  const ensure = async () => (signer ? true : connect());
  async function switchNet() {
    if (!window.ethereum) return log("No wallet found.");
    try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN.chainId }] }); }
    catch (e) { if (e.code === 4902 || /Unrecognized|not added/i.test(e.message || "")) await window.ethereum.request({ method: "wallet_addEthereumChain", params: [CHAIN] }); else log("Network switch failed: " + errName(e)); }
    await connect();
  }

  // ---------------------------------------------------------- registry
  async function loadRegistry(addr) {
    if (!ethers.isAddress(addr)) return log("Enter a valid registry address.");
    reg = new ethers.Contract(addr, ESUSU.registry.abi, signer || provider);
    store.set("esusu.registry", addr); $("regAddr").value = addr;
    await refresh();
  }
  async function renderRegistry() {
    if (!reg) return;
    const [count, fee, score, rep] = await Promise.all([reg.circlesCount(), reg.feeBps(), reg.scoreOf(me), reg.reputation(me)]);
    const mine = signer ? `${score} / 1000` : "connect wallet";
    $("regKv").style.display = "grid";
    $("regKv").innerHTML = [["Circles", count], ["Protocol fee", Number(fee) / 100 + "%"], ["My reputation", mine],
      ["My history", signer ? `${rep.completed} done · ${rep.paidRounds} paid · ${rep.defaults} missed` : "-"]].map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join("");
    $("discover").style.display = "block";
    const addrs = await reg.circlesPage(count > 20n ? count - 20n : 0n, 20n);
    const rows = [];
    for (const a of [...addrs].reverse()) {
      const c = new ethers.Contract(a, ESUSU.circle.abi, provider);
      const [st, size, filled, dues, tk, minScore] = await Promise.all([c.state(), c.size(), c.filled(), c.dues(), c.token(), c.minScore()]);
      const sym = tk === ZERO ? "tPOTv3" : await tokenSymbol(tk);
      const dec = tk === ZERO ? 18 : await tokenDecimals(tk);
      rows.push(`<li><span>${short(a)} · ${ethers.formatUnits(dues, dec).replace(/\.0$/, "")} ${esc(sym)} × ${size} · ${filled}/${size} joined${minScore > 0n ? " · min score " + minScore : ""}</span>
        <span><span class="tag ${Number(st) === 0 ? "wait" : Number(st) === 1 ? "ok" : ""}">${STATES[Number(st)]}</span> <button data-open="${a}">Open</button></span></li>`);
    }
    $("circleList").innerHTML = rows.join("") || `<li class="small">No circles yet. Create the first one below.</li>`;
    $("circleList").querySelectorAll("button[data-open]").forEach((b) => (b.onclick = () => loadCircle(b.dataset.open)));
  }
  const symCache = {}, decCache = {};
  async function tokenSymbol(a) { if (!symCache[a]) { try { symCache[a] = await new ethers.Contract(a, ESUSU.erc20, provider).symbol(); } catch { symCache[a] = "TOKEN"; } } return symCache[a]; }
  async function tokenDecimals(a) { if (decCache[a] === undefined) { try { decCache[a] = Number(await new ethers.Contract(a, ESUSU.erc20, provider).decimals()); } catch { decCache[a] = 18; } } return decCache[a]; }

  // ------------------------------------------------------------ circle
  async function loadCircle(addr) {
    circle = new ethers.Contract(addr, ESUSU.circle.abi, signer || provider);
    store.set("esusu.circle", addr); selectedSlot = null;
    const tk = await circle.token();
    if (tk === ZERO) { asset = { native: true, symbol: "tPOTv3", decimals: 18 }; token = null; }
    else { token = new ethers.Contract(tk, ESUSU.erc20, signer || provider); asset = { native: false, symbol: await tokenSymbol(tk), decimals: await tokenDecimals(tk) }; }
    vault = null; $("vaultView").style.display = "none";
    const saved = store.get("esusu.vault." + tk);
    if (saved) $("vaultAddr").value = saved; else $("vaultAddr").value = "";
    await refresh();
    $("circleCard").scrollIntoView({ behavior: "smooth" });
  }

  async function renderCircle() {
    if (!circle) return;
    const ca = await circle.getAddress();
    const [st, dues, size, filled, dur, round, deadline, myCredit, isMember, minScore, feeBps] = await Promise.all([
      circle.state(), circle.dues(), circle.size(), circle.filled(), circle.roundDuration(), circle.currentRound(), circle.roundDeadline(),
      circle.credit(me), circle.isMember(me), circle.minScore(), circle.feeBps()]);
    const s = Number(st), n = Number(size);
    const slotAddrs = await circle.members();
    const slotInfo = [];
    for (let i = 0; i < n; i++) {
      const a = slotAddrs[i];
      const taken = a !== ZERO;
      slotInfo.push({ i, a, taken, col: await circle.collateralFor(i), def: taken ? await circle.defaulted(a) : false,
        paid: taken && s === 1 ? await circle.paid(round, a) : false, score: taken && reg ? Number(await reg.scoreOf(a)) : 0 });
    }
    const left = Number(deadline) - Math.floor(Date.now() / 1000);
    const myScore = reg ? Number(await reg.scoreOf(me)) : 0;
    $("circleTitle").textContent = short(ca);
    $("circleKv").innerHTML = [
      ["State", STATES[s]], ["Joined", `${filled}/${n}`], ["Dues per round", fmt(dues)], ["Round", s === 2 ? "done" : `${Number(round) + 1} of ${n}`],
      ["Deadline", s !== 1 ? "—" : left > 0 ? `${Math.floor(left / 60)}m ${left % 60}s left` : "passed: settle now"],
      ["Reputation needed", Number(minScore) ? `${minScore} (yours: ${myScore})` : "open"], ["Protocol fee", Number(feeBps) / 100 + "%"], ["My withdrawable", fmt(myCredit)],
    ].map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join("");

    const mySlot = isMember ? Number(await circle.slotOf(me)) : -1;
    $("slots").innerHTML = slotInfo.map((x) => {
      const cls = x.taken ? "slot" : "slot free" + (selectedSlot === x.i ? " sel" : "");
      const who = x.taken ? (x.a === me ? "<b>you</b>" : short(x.a)) : "open";
      const extra = x.taken ? ` · score ${x.score}` : ` · locks ${fmt(x.col)}`;
      const flag = x.def ? ` <span class="tag bad">defaulted</span>` : "";
      return `<div class="${cls}" data-slot="${x.i}">Slot ${x.i + 1}${s === 1 && x.i === Number(round) ? " ← paid now" : ""}<br>${who}${extra}${flag}</div>`;
    }).join("");
    $("slots").querySelectorAll(".slot.free").forEach((el) => (el.onclick = () => { selectedSlot = Number(el.dataset.slot); renderCircle(); }));

    // risk grade for the selected slot (same function the agent runs)
    if (s === 0 && selectedSlot !== null && POLICY) {
      const r = POLICY.assessCircle({ size: n, dues, minScore: Number(minScore), feeBps: Number(feeBps), roundDuration: Number(dur), slot: selectedSlot,
        members: slotInfo.map((x) => (x.taken ? { score: x.score, defaulted: x.def } : null)) });
      $("risk").innerHTML = `<b>Risk grade ${r.grade}</b> (${r.score}/100)${r.flags.length ? "<br>• " + r.flags.map(esc).join("<br>• ") : " · no flags"}`;
    } else $("risk").textContent = s === 0 ? "Select an open slot to see its collateral and a risk grade." : "";

    $("members").innerHTML = slotInfo.filter((x) => x.taken).map((x) => {
      const tag = x.def ? `<span class="tag bad">defaulted</span>` : s === 1 ? (x.paid ? `<span class="tag ok">paid</span>` : `<span class="tag wait">due</span>`) : `<span class="tag ok">member</span>`;
      return `<li><span>Slot ${x.i + 1} · ${x.a === me ? "<b>you</b>" : short(x.a)} · score ${x.score}</span>${tag}</li>`;
    }).join("");

    $("circleCard").style.display = "block"; $("vaultCard").style.display = "block";
    $("btnJoin").disabled = s !== 0 || isMember || selectedSlot === null;
    $("btnLeave").disabled = s !== 0 || !isMember;
    $("btnPay").disabled = s !== 1 || !isMember;
    $("btnSettle").disabled = s !== 1;
    $("btnWithdraw").disabled = myCredit === 0n;
    $("btnMint").style.display = token ? "inline-block" : "none";
    circle._ui = { dues, mySlot, collateral: selectedSlot !== null ? slotInfo[selectedSlot]?.col : 0n };
  }

  async function ensureAllowance(spender, amount) {
    if (!token) return;
    const have = await token.allowance(me, spender);
    if (have < amount) { log(`approving ${fmt(amount)}…`); await (await token.approve(spender, amount)).wait(); }
  }

  // -------------------------------------------------------------- vault
  async function loadVault(addr) {
    if (!ethers.isAddress(addr)) return log("Enter a valid vault address.");
    vault = new ethers.Contract(addr, ESUSU.vault.abi, signer || provider);
    store.set("esusu.vault." + (token ? await token.getAddress() : ZERO), addr); $("vaultAddr").value = addr;
    await refresh();
  }
  async function renderVault() {
    if (!vault) return;
    const va = await vault.getAddress();
    const vt = await vault.token();
    const want = token ? await token.getAddress() : ZERO;
    if (vt.toLowerCase() !== want.toLowerCase()) { $("vaultView").style.display = "none"; return log("That vault holds a different asset than this circle."); }
    const [owner, agent, perTx, periodCap, periodLen, spent, expiry, paused, bal, allowed] = await Promise.all([
      vault.owner(), vault.agent(), vault.perTxCap(), vault.periodCap(), vault.periodLength(), vault.spentInPeriod(), vault.expiry(), vault.paused(),
      vault.balance(), vault.allowedCircuit(await circle.getAddress())]);
    $("vaultKv").innerHTML = [["Vault balance", fmt(bal)], ["Owner", owner === me ? "you" : short(owner)], ["Agent key", agent === ZERO ? "not set" : short(agent)],
      ["Max per payment", fmt(perTx)], ["Max per period", fmt(periodCap)], ["Spent this period", fmt(spent)], ["Period", Number(periodLen) / 3600 + " h"],
      ["Agent expires", Number(expiry) ? new Date(Number(expiry) * 1000).toLocaleString() : "not set"], ["Agent status", paused ? "PAUSED" : "active"],
      ["This circle allowlisted", allowed ? "yes" : "no"]].map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join("");
    $("vaultView").style.display = "block";
    $("btnPause").disabled = paused; $("btnUnpause").disabled = !paused;
    try {
      const head = await provider.getBlockNumber();
      const evs = await vault.queryFilter(vault.filters.AgentPaid(), Math.max(0, head - 5000));
      $("activity").innerHTML = evs.length ? evs.slice(-8).reverse().map((e) => `${short(e.args.circuit)} paid ${fmt(e.args.amount)} · tx ${short(e.transactionHash)}`).join("<br>") : "No agent payments yet.";
    } catch { $("activity").textContent = "Activity unavailable (RPC log range limit)."; }
  }

  async function refresh() { try { await renderRegistry(); await renderCircle(); await renderVault(); } catch (e) { log("Refresh failed: " + errName(e)); } }

  // ------------------------------------------------------------ actions
  function wire() {
    $("btnConnect").onclick = connect; $("btnNet").onclick = switchNet; $("btnNet").textContent = "Add " + CFG.network;
    $("btnLoadReg").onclick = () => loadRegistry($("regAddr").value.trim());
    $("btnDeployReg").onclick = async () => { if (!(await ensure())) return;
      await run("Deploy registry", async () => {
        const f = new ethers.ContractFactory(ESUSU.registry.abi, ESUSU.registry.bytecode, signer);
        const r = await f.deploy(me, me, 50); log("tx " + r.deploymentTransaction().hash); await r.waitForDeployment(); await loadRegistry(await r.getAddress());
      }); };

    $("btnCreate").onclick = async () => { if (!reg) return log("Load a registry first.");
      const useTok = $("cAsset").value === "token"; const ta = $("cToken").value.trim();
      if (useTok && !ethers.isAddress(ta)) return log("Enter the ERC-20 token address.");
      const dec = useTok ? await tokenDecimals(ta) : 18;
      await send("Create circle", () => reg.createCircle(useTok ? ta : ZERO, ethers.parseUnits($("cDues").value || "0", dec), BigInt($("cSize").value),
        BigInt(Math.round(Number($("cMinutes").value) * 60)), BigInt($("cMin").value || "0")));
    };

    $("btnJoin").onclick = () => send("Join slot " + (selectedSlot + 1), async () => {
      if (token) { await ensureAllowance(await circle.getAddress(), circle._ui.collateral); return circle.join(selectedSlot); }
      return circle.join(selectedSlot, { value: circle._ui.collateral });
    });
    $("btnLeave").onclick = () => send("Leave circle", () => circle.leave());
    $("btnPay").onclick = () => send("Pay dues", async () => {
      if (token) { await ensureAllowance(await circle.getAddress(), circle._ui.dues); return circle.contribute(); }
      return circle.contribute({ value: circle._ui.dues });
    });
    $("btnSettle").onclick = () => send("Settle round", () => circle.settleRound());
    $("btnWithdraw").onclick = () => send("Withdraw", () => circle.withdraw());
    $("btnMint").onclick = () => send("Mint test tokens", () => token.mint(me, ethers.parseUnits("1000", asset.decimals)));

    $("btnLoadVault").onclick = () => loadVault($("vaultAddr").value.trim());
    $("btnDeployVault").onclick = async () => { if (!circle) return log("Open a circle first.");
      await run("Deploy vault", async () => {
        const f = new ethers.ContractFactory(ESUSU.vault.abi, ESUSU.vault.bytecode, signer);
        const v = await f.deploy(me, token ? await token.getAddress() : ZERO); log("tx " + v.deploymentTransaction().hash); await v.waitForDeployment(); await loadVault(await v.getAddress());
      }); };
    $("btnFund").onclick = () => send("Fund vault", async () => token ? token.transfer(await vault.getAddress(), units("fundAmt")) : signer.sendTransaction({ to: await vault.getAddress(), value: units("fundAmt") }));
    $("btnVaultWd").onclick = () => send("Withdraw from vault", () => vault.withdraw(units("wdAmt")));
    $("btnPolicy").onclick = () => { const a = $("pAgent").value.trim(); if (!ethers.isAddress(a)) return log("Enter the agent's EVM address.");
      const expiry = Math.floor(Date.now() / 1000) + Math.round(Number($("pDays").value) * 86400);
      return send("Save policy", () => vault.setPolicy(a, units("pPerTx"), units("pPeriodCap"), BigInt(Math.round(Number($("pHours").value) * 3600)), BigInt(expiry))); };
    $("btnAllow").onclick = async () => send("Allowlist circle", async () => vault.setCircuit(await circle.getAddress(), true));
    $("btnDisallow").onclick = async () => send("Remove circle", async () => vault.setCircuit(await circle.getAddress(), false));
    $("btnPayee").onclick = () => { const p = $("payeeAddr").value.trim(); if (!ethers.isAddress(p)) return log("Enter the provider's address."); return send("Allow provider", () => vault.setPayee(p, true, units("payeeCap"))); };
    $("btnPayeeOff").onclick = () => { const p = $("payeeAddr").value.trim(); if (!ethers.isAddress(p)) return log("Enter the provider's address."); return send("Remove provider", () => vault.setPayee(p, false, 0n)); };
    $("btnPause").onclick = () => send("Pause agent", () => vault.setPaused(true));
    $("btnUnpause").onclick = () => send("Resume agent", () => vault.setPaused(false));

    const q = new URLSearchParams(location.search);
    $("regAddr").value = q.get("registry") || CFG.registry || store.get("esusu.registry") || "";
    if ($("regAddr").value && ethers.isAddress($("regAddr").value)) {
      loadRegistry($("regAddr").value).catch((e) => log("Could not read the chain without a wallet (" + errName(e) + "). Connect a wallet to continue."));
      if (CFG.demoCircle && !q.get("registry")) loadCircle(CFG.demoCircle).catch(() => {});
    }
    if (window.ethereum?.on) { window.ethereum.on("accountsChanged", () => location.reload()); window.ethereum.on("chainChanged", () => location.reload()); }
    setInterval(() => { if (circle || reg) refresh(); }, 20000);
  }
  wire();
})();
