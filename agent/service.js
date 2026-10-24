// A tiny pay-per-request API in the x402 style (HTTP 402 Payment Required), selling circle risk reports for an ERC-20.
//   GET /risk/<circle>?slot=N
//     1st call, no payment  -> 402 { payee, amount, asset, ref, chainId }
//     pay on-chain          -> vault.payService(payee, amount, ref)   (the AI agent does this, inside owner-set caps)
//     2nd call with headers  x-payment-tx: <hash>   x-payment-ref: <ref>   -> 200 report
// Verification is strict: the tx must contain (a) a Transfer of >= price of THE configured token to the payee, emitted by
// that token contract (so funds really moved, a fake contract cannot forge it), and (b) a ServicePaid event carrying the
// issued one-time ref. Each ref and each tx is single use.
const http = require("http");
const crypto = require("crypto");
const { ethers } = require("ethers");
const { buildReport } = require("./report");

const IFACE = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event ServicePaid(address indexed payee, uint256 amount, bytes32 indexed ref)",
]);
const TRANSFER = IFACE.getEvent("Transfer").topicHash, SERVICE_PAID = IFACE.getEvent("ServicePaid").topicHash;

function createService({ provider, token, payee, price, chainId, symbol = "mUSD", decimals = 6, ttlSeconds = 300 }) {
  const issued = new Map();   // ref -> { path, exp }
  const usedTx = new Set();
  const priceBn = BigInt(price);

  async function verify(txHash, ref) {
    const rc = await provider.getTransactionReceipt(txHash);
    if (!rc || rc.status !== 1) return "payment transaction not found or failed";
    let moved = false, receipt = false;
    for (const l of rc.logs) {
      if (l.address.toLowerCase() === token.toLowerCase() && l.topics[0] === TRANSFER) {
        const p = IFACE.parseLog(l);
        if (p.args.to.toLowerCase() === payee.toLowerCase() && p.args.value >= priceBn) moved = true;
      }
      if (l.topics[0] === SERVICE_PAID && l.topics[2] === ref) {
        const p = IFACE.parseLog(l);
        if (p.args.payee.toLowerCase() === payee.toLowerCase() && p.args.amount >= priceBn) receipt = true;
      }
    }
    return moved && receipt ? null : "payment does not match price, payee or ref";
  }

  const server = http.createServer(async (req, res) => {
    const send = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    try {
      const u = new URL(req.url, "http://x");
      const m = u.pathname.match(/^\/risk\/(0x[0-9a-fA-F]{40})$/);
      if (!m) return send(404, { error: "GET /risk/<circleAddress>?slot=N" });
      const path = u.pathname + u.search;
      const tx = req.headers["x-payment-tx"], ref = req.headers["x-payment-ref"];

      if (!tx || !ref) {
        const nonce = "0x" + crypto.randomBytes(32).toString("hex");
        issued.set(nonce, { path, exp: Date.now() + ttlSeconds * 1000 });
        return send(402, { error: "payment required", chainId, asset: { token, symbol, decimals }, payee, amount: priceBn.toString(), ref: nonce, resource: path,
          how: "call vault.payService(payee, amount, ref) then repeat this request with x-payment-tx and x-payment-ref headers" });
      }
      const rec = issued.get(ref);
      if (!rec || rec.exp < Date.now() || rec.path !== path) return send(402, { error: "unknown, expired or mismatched ref; request a new quote" });
      if (usedTx.has(tx)) return send(402, { error: "payment already redeemed" });
      const bad = await verify(tx, ref);
      if (bad) return send(402, { error: bad });
      // Receipt verification yields to other requests. Recheck and claim synchronously.
      if (usedTx.has(tx) || !issued.has(ref)) return send(402, { error: "payment already redeemed" });
      usedTx.add(tx); issued.delete(ref);
      return send(200, await buildReport(provider, m[1], u.searchParams.get("slot") ?? undefined));
    } catch (e) { return send(500, { error: e.message }); }
  });
  return { server, listen: (port = 0) => new Promise((r) => server.listen(port, "127.0.0.1", () => r(server.address().port))), close: () => new Promise((r) => server.close(r)) };
}

module.exports = { createService };

if (require.main === module) {
  require("dotenv").config();
  const need = ["SERVICE_TOKEN", "SERVICE_PAYEE"].filter((k) => !process.env[k]);
  if (need.length) { console.error(`Missing env: ${need.join(", ")}`); process.exit(1); }
  const provider = new ethers.JsonRpcProvider(process.env.PORTALDOT_EVM_RPC || "https://test-evm-rpc-v3.portaldot.dev");
  const svc = createService({ provider, token: process.env.SERVICE_TOKEN, payee: process.env.SERVICE_PAYEE, price: process.env.SERVICE_PRICE || "1000000", chainId: 420420777 });
  svc.listen(Number(process.env.SERVICE_PORT || 8402)).then((p) => console.log(`risk-report API on http://127.0.0.1:${p}  (GET /risk/<circle>?slot=N)`));
}
