require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

// Sandbox / offline builds: SOLC_JS=1 uses the bundled solc-js instead of downloading a compiler.
if (process.env.SOLC_JS === "1") {
  subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
    if (args.solcVersion === "0.8.24") {
      const compilerPath = require.resolve("solc/soljson.js");
      return { compilerPath, isSolcJs: true, version: "0.8.24", longVersion: "0.8.24+commit.e11b9ed9" };
    }
    return runSuper();
  });
}

const PK = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" } },
  networks: {
    portaldot: {
      url: process.env.PORTALDOT_EVM_RPC || "https://test-evm-rpc-v3.portaldot.dev",
      chainId: 420420777,
      accounts: PK,
      // Portaldot's eth_estimateGas has been reported to over-estimate wildly. If a deploy fails with
      // "insufficient funds" or an absurd gas figure, set GAS_LIMIT / GAS_PRICE_WEI in .env (see docs/DEPLOY.md).
      ...(process.env.GAS_LIMIT ? { gas: Number(process.env.GAS_LIMIT) } : {}),
      ...(process.env.GAS_PRICE_WEI ? { gasPrice: Number(process.env.GAS_PRICE_WEI) } : {}),
      timeout: 120000,
    },
  },
};
