// Local demo helper: the agent buys a circle risk report from the 402 API, paying from the judge's vault.
//   npm run demo:buy      (needs `npm run demo:local` running)
const fs = require("fs");
const { ethers } = require("ethers");
const { fetchPaid } = require("../agent/pay-client");
const d = JSON.parse(fs.readFileSync(".local-demo.json", "utf8"));
const pk = ethers.HDNodeWallet.fromPhrase("test test test test test test test test test test test junk", undefined, "m/44'/60'/0'/0/8").privateKey;
(async () => {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545", 31337, { staticNetwork: true });
  const agent = new ethers.Wallet(pk, provider);
  const vault = new ethers.Contract(d.vault, ["function payService(address,uint256,bytes32)"], agent);
  const report = await fetchPaid(`${d.serviceUrl}/risk/${d.openCircle}?slot=2`, { vault, maxPrice: 2_000_000n });
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => { console.error("failed:", e.shortMessage || e.message); process.exit(1); });
