// Deploy the testnet stack, checkpoint every submitted transaction, and resume safely.
//   npm run deploy:testnet
// Local rehearsal: npx hardhat run scripts/deploy.js --network localhost
const hre = require("hardhat");
const fs = require("fs");
const { NETWORK } = require("../lib/portaldot");

async function main() {
  const { ethers } = hre;
  const [owner] = await ethers.getSigners();
  if (!owner) throw new Error("PRIVATE_KEY is missing; run npm run wallet first");
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const local = ["hardhat", "localhost"].includes(hre.network.name);
  if (!local && chainId !== NETWORK.chainId) throw new Error(`Refusing deployment to chain ${chainId}; expected Portaldot ${NETWORK.chainId}`);
  const agentAddr = process.env.AGENT_ADDRESS;
  if (!ethers.isAddress(agentAddr || "") || agentAddr === ethers.ZeroAddress || agentAddr.toLowerCase() === owner.address.toLowerCase()) {
    throw new Error("AGENT_ADDRESS must be a separate agent wallet; run npm run wallet -- --rotate-agent");
  }
  if (process.env.AGENT_PRIVATE_KEY && new ethers.Wallet(process.env.AGENT_PRIVATE_KEY).address.toLowerCase() !== agentAddr.toLowerCase()) {
    throw new Error("AGENT_ADDRESS does not match AGENT_PRIVATE_KEY; run npm run wallet to sync addresses");
  }
  const useToken = process.env.DEPLOY_MOCK_TOKEN !== "0";
  const dues = ethers.parseUnits(process.env.DUES || (useToken ? "10" : "0.1"), useToken ? 6 : 18);
  const size = Number(process.env.CIRCLE_SIZE || 3);
  const duration = Number(process.env.ROUND_SECONDS || 900);
  const feeBps = Number(process.env.FEE_BPS ?? 50);
  const treasury = process.env.TREASURY || owner.address;
  const servicePayee = process.env.SERVICE_PAYEE || owner.address;
  const agentGas = ethers.parseEther(process.env.AGENT_GAS_TPOT || "0.1");
  if (dues <= 0n || !Number.isInteger(size) || size < 2 || size > 30 || !Number.isSafeInteger(duration) || duration < 60 || agentGas < 0n) throw new Error("Invalid circle or agent gas configuration");
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 200 || !ethers.isAddress(treasury) || (feeBps && treasury === ethers.ZeroAddress)) throw new Error("Invalid fee or treasury");
  if (!ethers.isAddress(servicePayee) || servicePayee === ethers.ZeroAddress || servicePayee.toLowerCase() === agentAddr.toLowerCase()) throw new Error("Invalid service payee");

  const balance = await ethers.provider.getBalance(owner.address);
  console.log(`deployer ${owner.address}, balance ${ethers.formatEther(balance)}, chain ${chainId}`);
  if (balance === 0n) throw new Error("Deployer has no test gas; run npm run preflight");
  fs.mkdirSync("deployments", { recursive: true });
  const file = `deployments/${hre.network.name}.json`;
  const config = { useToken, dues: dues.toString(), size, duration, feeBps, treasury, servicePayee, agentGas: agentGas.toString() };
  let out = { network: hre.network.name, chainId, owner: owner.address, agent: agentAddr, config, tx: {}, receipts: {}, status: "deploying" };
  if (hre.network.name !== "hardhat" && fs.existsSync(file)) {
    out = JSON.parse(fs.readFileSync(file, "utf8"));
    if (out.chainId !== chainId || out.owner.toLowerCase() !== owner.address.toLowerCase() || out.agent.toLowerCase() !== agentAddr.toLowerCase() || JSON.stringify(out.config) !== JSON.stringify(config)) {
      throw new Error(`Existing ${file} belongs to a different configuration; refusing to overwrite its deployment evidence`);
    }
    console.log(`Resuming ${file}`);
  }
  const save = () => {
    fs.writeFileSync(file + ".tmp", JSON.stringify(out, null, 2) + "\n");
    fs.renameSync(file + ".tmp", file);
  };
  save();
  const send = async (name, submit) => {
    try {
      if (!out.tx[name]) {
        const tx = await submit();
        out.tx[name] = tx.hash;
        save();
        console.log(`  submitted ${name} ${tx.hash}`);
      }
      let receipt;
      const until = Date.now() + 120000;
      do {
        receipt = await ethers.provider.getTransactionReceipt(out.tx[name]);
        if (receipt) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } while (Date.now() < until);
      if (!receipt || receipt.status !== 1) throw new Error(`Transaction ${out.tx[name]} is pending or failed; inspect it before retrying`);
      out.receipts[name] = { blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(), gasPrice: receipt.gasPrice?.toString() ?? null };
      save();
      console.log(`  confirmed ${name} ${receipt.hash}`);
      return receipt;
    } catch (error) { error.step = name; throw error; }
  };
  const deploy = async (contractName, field, step, args = []) => {
    const factory = await ethers.getContractFactory(contractName);
    await send(step, async () => {
      const contract = await factory.deploy(...args);
      out[field] = await contract.getAddress();
      return contract.deploymentTransaction();
    });
    const transaction = await ethers.provider.getTransaction(out.tx[step]);
    const expectedData = (await factory.getDeployTransaction(...args)).data;
    if (!transaction || transaction.data.toLowerCase() !== expectedData.toLowerCase()) {
      throw new Error(`${contractName} was deployed from a different build or constructor; refusing stale deployment reuse`);
    }
    if (!out[field] || await ethers.provider.getCode(out[field]) === "0x") throw new Error(`${contractName} has no deployed code at the recorded address`);
    return factory.attach(out[field]);
  };

  const reg = await deploy("EsusuRegistry", "registry", "registryDeploy", [owner.address, treasury, feeBps]);
  let token = null, tokenAddr = ethers.ZeroAddress;
  if (useToken) {
    token = await deploy("MockToken", "token", "mockTokenDeploy");
    tokenAddr = out.token;
    out.tokenNote = "testnet mUSD (6 decimals), unrestricted mint: not a real stablecoin";
    await send("mintToOwner", () => token.mint(owner.address, dues * 1000n));
  } else out.token = ethers.ZeroAddress;
  if (out.circleIndex === undefined) { out.circleIndex = Number(await reg.circlesCount()); save(); }
  const created = await send("createCircle", () => reg.createCircle(tokenAddr, dues, size, duration, 0));
  const event = created.logs.map((log) => { try { return reg.interface.parseLog(log); } catch { return null; } }).find((e) => e?.name === "CircleCreated");
  out.circle = event?.args.circle || await reg.circles(out.circleIndex);
  const circle = await ethers.getContractAt("EsusuCircle", out.circle);
  if ((await circle.creator()).toLowerCase() !== owner.address.toLowerCase() || (await circle.token()).toLowerCase() !== tokenAddr.toLowerCase() || await circle.dues() !== dues) {
    throw new Error("Created circle does not match the requested terms");
  }
  save();
  const vault = await deploy("AgentAllowance", "vault", "vaultDeploy", [owner.address, tokenAddr]);
  if (!out.expiry) { out.expiry = (await ethers.provider.getBlock("latest")).timestamp + 14 * 86400; save(); }
  await send("setPolicy", () => vault.setPolicy(agentAddr, dues, dues * 3n, 86400, out.expiry));
  await send("allowCircle", () => vault.setCircuit(out.circle, true));
  await send("allowServicePayee", () => vault.setPayee(servicePayee, true, dues * 3n));
  out.servicePayee = servicePayee;
  const collateral = await circle.collateralFor(0);
  if (token) {
    await send("fundVault", () => token.transfer(out.vault, dues * 5n));
    await send("approveCollateral", () => token.approve(out.circle, collateral));
    await send("ownerJoin", () => circle.join(0));
  } else {
    await send("fundVault", () => owner.sendTransaction({ to: out.vault, value: dues * 5n }));
    await send("ownerJoin", () => circle.join(0, { value: collateral }));
  }
  if (!out.tx.fundAgent && await ethers.provider.getBalance(agentAddr) < agentGas) {
    await send("fundAgent", () => owner.sendTransaction({ to: agentAddr, value: agentGas }));
  } else if (out.tx.fundAgent) await send("fundAgent", () => { throw new Error("Existing agent funding must be reused"); });

  if ((await reg.owner()).toLowerCase() !== owner.address.toLowerCase() || !(await reg.isCircle(out.circle)) ||
      (await vault.owner()).toLowerCase() !== owner.address.toLowerCase() || (await vault.agent()).toLowerCase() !== agentAddr.toLowerCase() ||
      !(await vault.allowedCircuit(out.circle)) || !(await circle.isMember(owner.address))) throw new Error("Deployment verification failed");
  out.codeHashes = {};
  for (const field of ["registry", "circle", "vault", ...(token ? ["token"] : [])]) {
    const code = await ethers.provider.getCode(out[field]);
    if (code === "0x") throw new Error(`Missing contract code: ${field}`);
    out.codeHashes[field] = ethers.keccak256(code);
  }
  out.status = "verified";
  out.verifiedAt = new Date().toISOString();
  save();
  if (!local) {
    let env = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
    for (const [key, value] of Object.entries({ OWNER: owner.address, REGISTRY: out.registry, CIRCUITS: out.circle, VAULT: out.vault, SERVICE_TOKEN: tokenAddr, SERVICE_PAYEE: servicePayee })) {
      const pattern = new RegExp(`^${key}=.*$`, "m");
      env = pattern.test(env) ? env.replace(pattern, `${key}=${value}`) : env + (env.endsWith("\n") ? "" : "\n") + `${key}=${value}\n`;
    }
    fs.writeFileSync(".env", env, { mode: 0o600 });
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch((error) => {
  console.error(`Deploy failed${error.step ? " at " + error.step : ""}: ${error.shortMessage || error.message}`);
  const detail = error.info?.error?.message || error.error?.message;
  if (detail) console.error(detail);
  const rpcData = error.data || error.info?.error?.data || error.error?.data;
  if (rpcData) console.error("RPC rejection details:", typeof rpcData === "string" ? rpcData : JSON.stringify(rpcData));
  console.error("Submitted transaction hashes are preserved in deployments/. Rerun with the same configuration to resume.");
  process.exitCode = 1;
});
