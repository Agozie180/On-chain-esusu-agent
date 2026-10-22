// Portaldot V3 address helpers.
// Native accounts are SS58 (prefix 42, starts with "5"); EVM accounts are H160 ("0x...").
// For an account created from an Ethereum key, the native account is the H160 followed by twelve 0xEE bytes
// (pallet-revive "fallback" mapping). Verified against the official PortaldotV3 Testnet guide example:
//   0xf7eC65d11e35375A250e474059a917B537804142  ->  5Hfmuhj1AHrTBJiC9zUPnJo1cfG2G52LLMwofSigBnjtto8Y
// The chain is the source of truth: confirm in the Node Explorer (Developer > Runtime calls > reviveApi > accountId).
const crypto = require("crypto");

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(buf) {
  let n = BigInt("0x" + buf.toString("hex")), s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b === 0) s = "1" + s; else break; }
  return s;
}

function ss58Encode(pub32, prefix = 42) {
  const body = Buffer.concat([Buffer.from([prefix]), pub32]);
  const sum = crypto.createHash("blake2b512").update(Buffer.concat([Buffer.from("SS58PRE"), body])).digest().subarray(0, 2);
  return base58(Buffer.concat([body, sum]));
}

/** H160 (0x...) -> the native SS58 address that holds its funds. */
function h160ToSs58(h160) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(h160)) throw new Error("not a 20-byte 0x address: " + h160);
  return ss58Encode(Buffer.concat([Buffer.from(h160.slice(2), "hex"), Buffer.alloc(12, 0xee)]));
}

const NETWORK = {
  name: "PortaldotV3 Testnet",
  chainId: 420420777,
  evmRpc: "https://test-evm-rpc-v3.portaldot.dev",
  substrateWs: "wss://test-node-v3.portaldot.dev",
  explorer: "https://node-console.portaldot.dev/",
  symbol: "tPOTv3",
};

module.exports = { h160ToSs58, ss58Encode, NETWORK };
