// Writes single-file versions for Remix (the route the official Portaldot guide uses): docs/remix/*.sol
//   npm run flatten
const { execSync } = require("child_process");
const fs = require("fs");
fs.mkdirSync("docs/remix", { recursive: true });
for (const [src, out] of [["contracts/EsusuRegistry.sol", "EsusuRegistry.sol"], ["contracts/AgentAllowance.sol", "AgentAllowance.sol"], ["contracts/test/MockToken.sol", "MockToken.sol"]]) {
  const raw = execSync(`npx hardhat flatten ${src}`, { env: { ...process.env, SOLC_JS: process.env.SOLC_JS || "" }, maxBuffer: 1 << 26 }).toString();
  let seen = false;
  const cleaned = raw.split("\n").filter((l) => { if (/SPDX-License-Identifier/.test(l)) { if (seen) return false; seen = true; } return !/^\[dotenv/.test(l) && !/^◇ injected env/.test(l); }).join("\n");
  fs.writeFileSync(`docs/remix/${out}`, cleaned);
  console.log("wrote docs/remix/" + out, cleaned.length, "bytes");
}
