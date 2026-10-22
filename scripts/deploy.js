// Deploys the full stack to the current network and records addresses + tx hashes.
//   npx hardhat run scripts/deploy.js --network portaldot
// env: PRIVATE_KEY (owner/deployer), AGENT_ADDRESS (agent hot key EVM address),
//      optional: TREASURY, FEE_BPS (default 50), DUES (default 10), CIRCLE_SIZE (3), ROUND_SECONDS (900),
//                DEPLOY_MOCK_TOKEN=0 to use the native token instead of a testnet mUSD stable.
const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const { ethers } = hre;
  const [owner] = await ethers.getSigners();
  const agentAddr = process.env.AGENT_ADDRESS;
  if (!agentAddr) throw new Error("Set AGENT_ADDRESS to the agent hot key's EVM address");

  const out = { network: hre.network.name, chainId: Number((await ethers.provider.getNetwork()).chainId), owner: owner.address, agent: agentAddr, tx: {} };
  const send = async (name, p) => { const r = await (await p).wait(); out.tx[name] = r.hash; return r; };

  const Registry = await ethers.getContractFactory("EsusuRegistry");
  const reg = await Registry.deploy(owner.address, process.env.TREASURY || owner.address, Number(process.env.FEE_BPS ?? 50));
  out.tx.registryDeploy = reg.deploymentTransaction().hash; await reg.waitForDeployment(); out.registry = await reg.getAddress();

  let tokenAddr = ethers.ZeroAddress, dues = ethers.parseEther(process.env.DUES || "0.1"), token;
  if (process.env.DEPLOY_MOCK_TOKEN !== "0") {
    token = await (await ethers.getContractFactory("MockToken")).deploy();
    out.tx.mockTokenDeploy = token.deploymentTransaction().hash; await token.waitForDeployment();
    tokenAddr = await token.getAddress(); out.token = tokenAddr; out.tokenNote = "testnet mUSD (6 decimals), mint is public: testnet only";
    dues = BigInt(process.env.DUES || 10) * 1_000_000n;
    await send("mintToOwner", token.mint(owner.address, dues * 1000n));
  }

  const size = Number(process.env.CIRCLE_SIZE || 3);
  const r = await send("createCircle", reg.createCircle(tokenAddr, dues, size, Number(process.env.ROUND_SECONDS || 900), 0));
  const ev = r.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "CircleCreated");
  out.circle = ev.args.circle;
  const circle = await ethers.getContractAt("EsusuCircle", out.circle);

  const vault = await (await ethers.getContractFactory("AgentAllowance")).deploy(owner.address, tokenAddr);
  out.tx.vaultDeploy = vault.deploymentTransaction().hash; await vault.waitForDeployment(); out.vault = await vault.getAddress();

  const expiry = Math.floor(Date.now() / 1000) + 14 * 24 * 3600;
  await send("setPolicy", vault.setPolicy(agentAddr, dues, dues * 3n, 24 * 3600, expiry));
  await send("allowCircle", vault.setCircuit(out.circle, true));
  const slot = 0, col = await circle.collateralFor(slot);
  if (token) {
    await send("fundVault", token.transfer(out.vault, dues * 5n));
    await send("approveCollateral", token.approve(out.circle, col));
    await send("ownerJoin", circle.join(slot));
  } else {
    await send("fundVault", owner.sendTransaction({ to: out.vault, value: dues * 5n }));
    await send("ownerJoin", circle.join(slot, { value: col }));
  }

  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(`deployments/${hre.network.name}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
