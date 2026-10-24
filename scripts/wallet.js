// Create (or inspect) the two testnet keys this project needs, entirely on your own machine.
//   node scripts/wallet.js            create .env keys if missing, then print addresses
//   node scripts/wallet.js --show     only print addresses for keys already in .env
//   node scripts/wallet.js --rotate-agent   replace only the agent key; retain the owner
// OWNER = deploys contracts, owns the vault. AGENT = hot key that only holds gas and can only call payDues.
// These are TESTNET keys. Never reuse them anywhere that holds real value.
const fs = require("fs");
const { ethers } = require("ethers");
const { h160ToSs58, NETWORK } = require("../lib/portaldot");

const ENV = ".env";
function readEnv() { try { return fs.readFileSync(ENV, "utf8"); } catch { return ""; } }
function get(env, k) { const m = env.match(new RegExp(`^${k}=(.*)$`, "m")); return m ? m[1].trim() : ""; }
function set(env, k, v) { return new RegExp(`^${k}=`, "m").test(env) ? env.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`) : env + (env.endsWith("\n") || !env ? "" : "\n") + `${k}=${v}\n`; }

let env = readEnv();
const show = process.argv.includes("--show");
const rotateAgent = process.argv.includes("--rotate-agent");
if (show && rotateAgent) throw new Error("Use --show or --rotate-agent, not both");
let created = [];

for (const [key, label] of [["PRIVATE_KEY", "owner"], ["AGENT_PRIVATE_KEY", "agent"]]) {
  let pk = get(env, key);
  if (!show && (!pk || (rotateAgent && label === "agent"))) { pk = ethers.Wallet.createRandom().privateKey; env = set(env, key, pk); created.push(label); }
  if (!pk) { console.log(`${label}: no ${key} in .env (run without --show to create one)`); continue; }
  const w = new ethers.Wallet(pk);
  if (label === "agent") env = set(env, "AGENT_ADDRESS", w.address);
  if (label === "owner") env = set(env, "OWNER", w.address);
  console.log(`\n${label.toUpperCase()}`);
  console.log(`  EVM address (0x, add this key to MetaMask) : ${w.address}`);
  console.log(`  Native address (5..., GIVE THIS TO THE FAUCET): ${h160ToSs58(w.address)}`);
}
if (!show) fs.writeFileSync(ENV, env, { mode: 0o600 });
if (created.length) console.log(`\nCreated new key(s) for: ${created.join(", ")}. Saved to ${ENV} (git-ignored). Back it up privately; anyone with it controls the wallet.`);
console.log(`\nNext: request test POT for the OWNER native address (5...) and, if you want the agent to pay gas, the AGENT one too.`);
console.log(`Verify any mapping on-chain: ${NETWORK.explorer} > Developer > Runtime calls > reviveApi > accountId(0x...).`);
