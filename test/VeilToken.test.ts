import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers } from "ethers";
import * as hre from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("VeilToken", function () {
  let token: any;
  let mockUsdt: any;
  let tokenAddr: string;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  before(async function () {
    [owner, alice, bob] = await hre.ethers.getSigners();

    // Deploy a mock ERC20 as USDT
    const MockERC20 = await hre.ethers.getContractFactory("MockUSDT");
    mockUsdt = await MockERC20.deploy();
    await mockUsdt.waitForDeployment();

    // Deploy VeilToken with mock USDT address
    const factory = await hre.ethers.getContractFactory("VeilToken");
    token = await factory.connect(owner).deploy(await mockUsdt.getAddress());
    await token.waitForDeployment();
    tokenAddr = await token.getAddress();

    await hre.fhevm.assertCoprocessorInitialized(token, "VeilToken");

    // Mint USDT to owner and alice for testing
    await mockUsdt.mint(owner.address, 1_000_000_000000n); // 1M USDT
    await mockUsdt.mint(alice.address, 100_000_000000n); // 100K USDT
  });

  describe("ERC20 metadata", function () {
    it("should have correct name, symbol, decimals", async function () {
      expect(await token.name()).to.equal("VeilComp Confidential USDT");
      expect(await token.symbol()).to.equal("vcUSDT");
      expect(await token.decimals()).to.equal(6);
    });

    it("balanceOf and totalSupply return 0 (privacy)", async function () {
      expect(await token.balanceOf(owner.address)).to.equal(0);
      expect(await token.totalSupply()).to.equal(0);
    });
  });

  describe("Plaintext ERC20 disabled", function () {
    it("transfer reverts", async function () {
      await expect(token.transfer(alice.address, 100)).to.be.revertedWithCustomError(token, "PlaintextTransferDisabled");
    });
    it("transferFrom reverts", async function () {
      await expect(token.transferFrom(owner.address, alice.address, 100)).to.be.revertedWithCustomError(token, "PlaintextTransferDisabled");
    });
    it("approve reverts", async function () {
      await expect(token.approve(alice.address, 100)).to.be.revertedWithCustomError(token, "PlaintextTransferDisabled");
    });
  });

  describe("deposit (USDT → vcUSDT)", function () {
    it("user can deposit USDT and receive encrypted vcUSDT", async function () {
      // Approve token contract to spend USDT
      await mockUsdt.connect(alice).approve(tokenAddr, 10_000_000000n);

      // Deposit 10,000 USDT
      const tx = await token.connect(alice).deposit(10_000_000000n);
      await tx.wait();

      // Verify USDT was transferred to token contract
      expect(await mockUsdt.balanceOf(tokenAddr)).to.equal(10_000_000000n);

      // Verify encrypted balance
      const encBalance = await token.connect(alice).encryptedBalanceOf();
      const balance = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64,
        encBalance,
        tokenAddr,
        alice as unknown as ethers.Signer
      );
      expect(balance).to.equal(10_000_000000n);
    });

    it("deposit zero reverts", async function () {
      await expect(token.connect(alice).deposit(0)).to.be.revertedWithCustomError(token, "ZeroAmount");
    });
  });

  describe("encryptedTransfer", function () {
    it("can transfer encrypted tokens", async function () {
      // Alice transfers 2000 vcUSDT to Bob
      const input = hre.fhevm.createEncryptedInput(tokenAddr, alice.address);
      input.add64(2000_000000);
      const encrypted = await input.encrypt();

      const tx = await token.connect(alice).encryptedTransfer(
        bob.address,
        encrypted.handles[0],
        encrypted.inputProof
      );
      await tx.wait();

      const encBal = await token.connect(bob).encryptedBalanceOf();
      const bal = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64, encBal, tokenAddr, bob as unknown as ethers.Signer
      );
      expect(bal).to.equal(2000_000000n);
    });
  });

  describe("encryptedTransferFrom", function () {
    it("unapproved spender cannot transferFrom", async function () {
      const zeroHandle = ethers.zeroPadBytes("0x", 32);
      await expect(
        token.connect(bob).encryptedTransferFrom(alice.address, bob.address, zeroHandle)
      ).to.be.revertedWithCustomError(token, "NotApproved");
    });
  });

  describe("fheApprove", function () {
    it("cannot approve zero address", async function () {
      await expect(token.fheApprove(ethers.ZeroAddress, true)).to.be.revertedWithCustomError(token, "ApprovalToZeroAddress");
    });
  });
});
