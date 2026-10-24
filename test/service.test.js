const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployRegistry, deployToken, mkCircle, fill } = require("./helpers");
const { createService } = require("../agent/service");
const { fetchPaid } = require("../agent/pay-client");

describe("Option 2 end to end: the agent pays for an API (HTTP 402) from the capped vault", () => {
  let w;
  beforeEach(async () => {
    const [, , , owner, agent, svcWallet, m2, m3] = await ethers.getSigners();
    const { reg } = await deployRegistry(0);
    const tok = await deployToken();
    const ta = await tok.getAddress();
    const circle = await mkCircle(reg, m2, { token: ta, dues: 10_000_000n, size: 3, dur: 86400 });
    for (const [i, m] of [owner, m2, m3].entries()) { await tok.mint(m.address, 1_000_000_000n); await tok.connect(m).approve(await circle.getAddress(), await circle.collateralFor(i)); await circle.connect(m).join(i); }
    const vault = await (await ethers.getContractFactory("AgentAllowance")).deploy(owner.address, ta);
    await tok.connect(owner).transfer(await vault.getAddress(), 50_000_000n);
    await vault.connect(owner).setPolicy(agent.address, 2_000_000n, 5_000_000n, 86400, (await time.latest()) + 86400 * 7);
    await vault.connect(owner).setPayee(svcWallet.address, true, 3_000_000n);
    const svc = createService({ provider: ethers.provider, token: ta, payee: svcWallet.address, price: 1_000_000n, chainId: 31337 });
    const port = await svc.listen(0);
    w = { svc, url: `http://127.0.0.1:${port}/risk/${await circle.getAddress()}?slot=2`, vault: vault.connect(agent), vaultOwner: vault.connect(owner), tok, svcWallet, circle, agent };
  });
  afterEach(async () => { await w.svc.close(); });

  it("402 quote -> on-chain payment from the vault -> 200 risk report, and the provider is paid", async () => {
    const before = await w.tok.balanceOf(w.svcWallet.address);
    const report = await fetchPaid(w.url, { vault: w.vault, maxPrice: 2_000_000n });
    expect(report.grade).to.match(/[ABCD]/);
    expect(report.slot).to.equal(2);
    expect(report._payment.amount).to.equal("1000000");
    expect((await w.tok.balanceOf(w.svcWallet.address)) - before).to.equal(1_000_000n);
  });

  it("an unpaid request only ever gets a quote, never the data", async () => {
    const r = await fetch(w.url);
    expect(r.status).to.equal(402);
    const q = await r.json();
    expect(q.report).to.equal(undefined);
    expect(q.payee).to.equal(w.svcWallet.address);
  });

  it("a payment cannot be replayed, reused for another path, or claimed with a made-up ref", async () => {
    const q = await (await fetch(w.url)).json();
    const rc = await (await w.vault.payService(q.payee, BigInt(q.amount), q.ref)).wait();
    const ok = await fetch(w.url, { headers: { "x-payment-tx": rc.hash, "x-payment-ref": q.ref } });
    expect(ok.status).to.equal(200);
    const replay = await fetch(w.url, { headers: { "x-payment-tx": rc.hash, "x-payment-ref": q.ref } });
    expect(replay.status).to.equal(402);
    const other = w.url.replace("slot=2", "slot=0");
    const q2 = await (await fetch(other)).json();
    const wrongPath = await fetch(w.url, { headers: { "x-payment-tx": rc.hash, "x-payment-ref": q2.ref } });
    expect(wrongPath.status).to.equal(402);
    const fake = await fetch(w.url, { headers: { "x-payment-tx": rc.hash, "x-payment-ref": ethers.id("made-up") } });
    expect(fake.status).to.equal(402);
  });

  it("a payment that does not match the quote (a different ref) is refused", async () => {
    const q = await (await fetch(w.url)).json();
    const rc = await (await w.vault.payService(q.payee, BigInt(q.amount), ethers.id("other-ref"))).wait();
    const r = await fetch(w.url, { headers: { "x-payment-tx": rc.hash, "x-payment-ref": q.ref } });
    expect(r.status).to.equal(402);
  });

  it("the chain, not the client, stops an overspending agent: price cap, payee cap, pause", async () => {
    await w.vaultOwner.setPayee(w.svcWallet.address, true, 1_000_000n); // cap: one call per period
    await fetchPaid(w.url, { vault: w.vault });
    let err; try { await fetchPaid(w.url, { vault: w.vault }); } catch (e) { err = e; }
    expect(String(err.message)).to.match(/OverPayeeCap/);
    await w.vaultOwner.setPayee(w.svcWallet.address, true, 3_000_000n);
    await w.vaultOwner.setPaused(true);
    err = null; try { await fetchPaid(w.url, { vault: w.vault }); } catch (e) { err = e; }
    expect(String(err.message)).to.match(/IsPaused/);
  });

  it("the agent's own max price guard refuses an expensive quote before paying anything", async () => {
    const before = await w.tok.balanceOf(await w.vault.getAddress());
    let err; try { await fetchPaid(w.url, { vault: w.vault, maxPrice: 500_000n }); } catch (e) { err = e; }
    expect(String(err.message)).to.match(/exceeds the agent's own max price/);
    expect(await w.tok.balanceOf(await w.vault.getAddress())).to.equal(before);
  });

  for (const mismatch of ["asset", "chain"]) {
    it(`refuses a quote for a different ${mismatch} before spending from the vault`, async () => {
      const before = await w.tok.balanceOf(await w.vault.getAddress());
      const fetchImpl = async (url, options) => {
        const response = await fetch(url, options);
        if (options) return response;
        const quote = await response.json();
        if (mismatch === "asset") quote.asset.token = ethers.ZeroAddress;
        else quote.chainId = 1;
        return { status: 402, json: async () => quote };
      };
      await expect(fetchPaid(w.url, { vault: w.vault, fetchImpl })).to.be.rejectedWith(`quote ${mismatch}`);
      expect(await w.tok.balanceOf(await w.vault.getAddress())).to.equal(before);
    });
  }

  it("redeems one payment at most once when two HTTP requests race", async () => {
    await w.svc.close();
    let reads = 0, release;
    const bothReading = new Promise((resolve) => { release = resolve; });
    const provider = new Proxy(ethers.provider, {
      get(target, property) {
        if (property === "getTransactionReceipt") return async (hash) => {
          const receipt = await target.getTransactionReceipt(hash);
          if (++reads === 2) release();
          await bothReading;
          return receipt;
        };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    w.svc = createService({ provider, token: await w.tok.getAddress(), payee: w.svcWallet.address, price: 1_000_000n, chainId: 31337 });
    const port = await w.svc.listen(0);
    const url = new URL(w.url); url.port = String(port);
    const quote = await (await fetch(url)).json();
    const receipt = await (await w.vault.payService(quote.payee, BigInt(quote.amount), quote.ref)).wait();
    const options = { headers: { "x-payment-tx": receipt.hash, "x-payment-ref": quote.ref } };
    const responses = await Promise.all([fetch(url, options), fetch(url, options)]);
    expect(responses.map((r) => r.status).sort()).to.deep.equal([200, 402]);
  });
});
