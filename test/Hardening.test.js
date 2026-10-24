const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployToken, ZERO } = require("./helpers");

describe("Audit regressions: fail closed on unsafe vault configuration", () => {
  for (const useToken of [false, true]) {
    it(`rejects a zero-length spending period (${useToken ? "ERC-20" : "native"})`, async () => {
      const [owner, agent] = await ethers.getSigners();
      const token = useToken ? await deployToken() : null;
      const vault = await (await ethers.getContractFactory("AgentAllowance")).deploy(owner.address, token ? await token.getAddress() : ZERO);
      // Otherwise each payment opens a new period and bypasses both cumulative caps.
      await expect(vault.setPolicy(agent.address, 10n, 10n, 0, (await time.latest()) + 86400)).to.be.reverted;
    });
  }

  it("rejects using the owner key as the supposedly restricted agent", async () => {
    const [owner] = await ethers.getSigners();
    const vault = await (await ethers.getContractFactory("AgentAllowance")).deploy(owner.address, ZERO);
    await expect(vault.setPolicy(owner.address, 10n, 10n, 3600, (await time.latest()) + 86400)).to.be.reverted;
  });

  it("rejects a zero agent address", async () => {
    const [owner] = await ethers.getSigners();
    const vault = await (await ethers.getContractFactory("AgentAllowance")).deploy(owner.address, ZERO);
    await expect(vault.setPolicy(ZERO, 10n, 10n, 3600, (await time.latest()) + 86400)).to.be.reverted;
  });

  it("rejects an owner address that would lock every deposit permanently", async () => {
    await expect((await ethers.getContractFactory("AgentAllowance")).deploy(ZERO, ZERO)).to.be.reverted;
  });

  it("refuses native deposits into an ERC-20 vault that cannot withdraw them", async () => {
    const [owner] = await ethers.getSigners();
    const token = await deployToken();
    const vault = await (await ethers.getContractFactory("AgentAllowance")).deploy(owner.address, await token.getAddress());
    await expect(owner.sendTransaction({ to: await vault.getAddress(), value: 1n })).to.be.reverted;
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0n);
  });
});
