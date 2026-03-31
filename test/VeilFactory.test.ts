import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers } from "ethers";
import * as hre from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("VeilFactory", function () {
  let factory: any;
  let mockUsdt: any;
  let mockUsdc: any;
  let factoryAddr: string;
  let employer: HardhatEthersSigner;
  let employer2: HardhatEthersSigner;
  let emp1: HardhatEthersSigner;

  before(async function () {
    [employer, employer2, emp1] = await hre.ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await hre.ethers.getContractFactory("MockUSDT");
    mockUsdt = await MockERC20.deploy();
    await mockUsdt.waitForDeployment();
    mockUsdc = await MockERC20.deploy();
    await mockUsdc.waitForDeployment();

    // Deploy factory
    const Factory = await hre.ethers.getContractFactory("VeilFactory");
    factory = await Factory.deploy();
    await factory.waitForDeployment();
    factoryAddr = await factory.getAddress();
  });

  describe("createPayroll", function () {
    it("employer can create a payroll with USDT", async function () {
      const salt = ethers.id("company-a-usdt");
      const tx = await factory.connect(employer).createPayroll(salt, await mockUsdt.getAddress());
      const receipt = await tx.wait();

      const payrolls = await factory.getEmployerPayrolls(employer.address);
      expect(payrolls.length).to.equal(1);
      expect(await factory.isPayroll(payrolls[0])).to.be.true;
      expect(await factory.getPayrollCount()).to.equal(1);
    });

    it("same employer can create another payroll with USDC", async function () {
      const salt = ethers.id("company-a-usdc");
      await (await factory.connect(employer).createPayroll(salt, await mockUsdc.getAddress())).wait();

      const payrolls = await factory.getEmployerPayrolls(employer.address);
      expect(payrolls.length).to.equal(2);
    });

    it("different employer can create payroll", async function () {
      const salt = ethers.id("company-b-usdt");
      await (await factory.connect(employer2).createPayroll(salt, await mockUsdt.getAddress())).wait();

      const payrolls = await factory.getEmployerPayrolls(employer2.address);
      expect(payrolls.length).to.equal(1);
      expect(await factory.getPayrollCount()).to.equal(3);
    });

    it("cannot create with zero token address", async function () {
      await expect(
        factory.createPayroll(ethers.id("bad"), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "ZeroAddress");
    });
  });

  describe("payroll instance ownership", function () {
    it("deployed payroll has correct employer and payToken", async function () {
      const payrolls = await factory.getEmployerPayrolls(employer.address);
      const payroll = await hre.ethers.getContractAt("VeilPayroll", payrolls[0]);

      expect(await payroll.employer()).to.equal(employer.address);
      expect(await payroll.payToken()).to.equal(await mockUsdt.getAddress());
    });
  });
});
