import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers } from "ethers";
import * as hre from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("VeilPayroll", function () {
  let token: any;
  let payroll: any;
  let mockUsdt: any;
  let tokenAddr: string;
  let payrollAddr: string;
  let employer: HardhatEthersSigner;
  let emp1: HardhatEthersSigner;
  let emp2: HardhatEthersSigner;
  let auditor: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;

  before(async function () {
    [employer, emp1, emp2, auditor, outsider] = await hre.ethers.getSigners();

    // Deploy MockUSDT
    const MockERC20 = await hre.ethers.getContractFactory("MockUSDT");
    mockUsdt = await MockERC20.deploy();
    await mockUsdt.waitForDeployment();

    // Deploy VeilToken
    const tokenFactory = await hre.ethers.getContractFactory("VeilToken");
    token = await tokenFactory.connect(employer).deploy(await mockUsdt.getAddress());
    await token.waitForDeployment();
    tokenAddr = await token.getAddress();

    // Deploy VeilPayroll
    const payrollFactory = await hre.ethers.getContractFactory("VeilPayroll");
    payroll = await payrollFactory.connect(employer).deploy(tokenAddr);
    await payroll.waitForDeployment();
    payrollAddr = await payroll.getAddress();

    await hre.fhevm.assertCoprocessorInitialized(payroll, "VeilPayroll");

    // Setup: employer approves payroll contract for token transfers
    let tx = await token.connect(employer).fheApprove(payrollAddr, true);
    await tx.wait();

    // Fund employer: mint USDT → deposit to get vcUSDT
    await mockUsdt.mint(employer.address, 500_000_000000n); // 500K USDT
    await mockUsdt.connect(employer).approve(tokenAddr, 500_000_000000n);
    tx = await token.connect(employer).deposit(500_000_000000n);
    await tx.wait();

    // Add employees
    const input1 = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
    input1.add64(5000_000000); // 5000 USDT
    const enc1 = await input1.encrypt();
    tx = await payroll.addEmployee(emp1.address, enc1.handles[0], enc1.inputProof);
    await tx.wait();

    const input2 = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
    input2.add64(8000_000000); // 8000 USDT
    const enc2 = await input2.encrypt();
    tx = await payroll.addEmployee(emp2.address, enc2.handles[0], enc2.inputProof);
    await tx.wait();
  });

  // ── Employee management ──

  describe("Employee management", function () {
    it("deployer is employer", async function () {
      expect(await payroll.employer()).to.equal(employer.address);
    });

    it("employees are registered", async function () {
      expect(await payroll.isEmployee(emp1.address)).to.be.true;
      expect(await payroll.isEmployee(emp2.address)).to.be.true;
      expect(await payroll.getEmployeeCount()).to.equal(2);
    });

    it("employee can view own encrypted salary", async function () {
      const encSalary = await payroll.connect(emp1).getMySalary();
      const salary = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64, encSalary, payrollAddr, emp1 as unknown as ethers.Signer
      );
      expect(salary).to.equal(5000_000000n);
    });

    it("non-employee cannot view salary", async function () {
      await expect(payroll.connect(outsider).getMySalary()).to.be.revertedWithCustomError(payroll, "NotEmployee");
    });

    it("non-employer cannot add employee", async function () {
      const input = hre.fhevm.createEncryptedInput(payrollAddr, outsider.address);
      input.add64(1000_000000);
      const enc = await input.encrypt();
      await expect(
        payroll.connect(outsider).addEmployee(outsider.address, enc.handles[0], enc.inputProof)
      ).to.be.revertedWithCustomError(payroll, "OnlyEmployer");
    });

    it("cannot add duplicate employee", async function () {
      const input = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input.add64(1000_000000);
      const enc = await input.encrypt();
      await expect(
        payroll.addEmployee(emp1.address, enc.handles[0], enc.inputProof)
      ).to.be.revertedWithCustomError(payroll, "AlreadyEmployee");
    });

    it("employer can update salary", async function () {
      const input = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input.add64(6000_000000);
      const enc = await input.encrypt();
      const tx = await payroll.updateSalary(emp1.address, enc.handles[0], enc.inputProof);
      await tx.wait();

      const encSalary = await payroll.connect(emp1).getMySalary();
      const salary = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64, encSalary, payrollAddr, emp1 as unknown as ethers.Signer
      );
      expect(salary).to.equal(6000_000000n);

      // Reset back to 5000 for payroll tests
      const inputReset = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      inputReset.add64(5000_000000);
      const encReset = await inputReset.encrypt();
      await (await payroll.updateSalary(emp1.address, encReset.handles[0], encReset.inputProof)).wait();
    });

    it("employer can remove employee and re-add", async function () {
      // Remove emp2
      let tx = await payroll.removeEmployee(emp2.address);
      await tx.wait();
      expect(await payroll.isEmployee(emp2.address)).to.be.false;
      expect(await payroll.getEmployeeCount()).to.equal(1);

      // Re-add emp2
      const input = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input.add64(8000_000000);
      const enc = await input.encrypt();
      tx = await payroll.addEmployee(emp2.address, enc.handles[0], enc.inputProof);
      await tx.wait();
      expect(await payroll.getEmployeeCount()).to.equal(2);
    });
  });

  // ── Payroll execution ──

  describe("Payroll execution", function () {
    it("employer can run payroll", async function () {
      const tx = await payroll.runPayroll();
      await tx.wait();
      expect(await payroll.lastPayrollTimestamp()).to.be.greaterThan(0);
    });

    it("payroll total is correct", async function () {
      const encTotal = await payroll.connect(employer).getLastPayrollTotal();
      const total = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64, encTotal, payrollAddr, employer as unknown as ethers.Signer
      );
      // emp1: 5000 * 0.8 = 4000, emp2: 8000 * 0.8 = 6400, total = 10400
      expect(total).to.equal(10_400_000000n);
    });

    it("employees received correct net pay", async function () {
      const encBal1 = await token.connect(emp1).encryptedBalanceOf();
      const bal1 = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64, encBal1, tokenAddr, emp1 as unknown as ethers.Signer
      );
      expect(bal1).to.equal(4000_000000n);

      const encBal2 = await token.connect(emp2).encryptedBalanceOf();
      const bal2 = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64, encBal2, tokenAddr, emp2 as unknown as ethers.Signer
      );
      expect(bal2).to.equal(6400_000000n);
    });

    it("non-employer cannot run payroll", async function () {
      await expect(payroll.connect(outsider).runPayroll()).to.be.revertedWithCustomError(payroll, "OnlyEmployer");
    });

    it("cannot run payroll twice within cooldown period", async function () {
      await expect(payroll.runPayroll()).to.be.revertedWithCustomError(payroll, "PayrollTooSoon");
    });

    it("can run payroll again after cooldown", async function () {
      // Advance time by 1 day
      await hre.ethers.provider.send("evm_increaseTime", [86400]);
      await hre.ethers.provider.send("evm_mine", []);

      const tx = await payroll.runPayroll();
      await tx.wait();
      expect(await payroll.payrollNonce()).to.equal(2);
    });
  });

  // ── Tax rate ──

  describe("Tax rate", function () {
    it("employer can change tax rate", async function () {
      await (await payroll.setTaxRate(10)).wait(); // 10%
      expect(await payroll.taxDivisor()).to.equal(10);
      // Reset
      await (await payroll.setTaxRate(5)).wait();
    });

    it("invalid divisor reverts", async function () {
      await expect(payroll.setTaxRate(0)).to.be.revertedWithCustomError(payroll, "InvalidTaxDivisor");
      await expect(payroll.setTaxRate(1)).to.be.revertedWithCustomError(payroll, "InvalidTaxDivisor");
      await expect(payroll.setTaxRate(101)).to.be.revertedWithCustomError(payroll, "InvalidTaxDivisor");
    });
  });

  // ── Audit ACL ──

  describe("Audit ACL", function () {
    it("employer can grant auditor access", async function () {
      const tx = await payroll.grantAuditorAccess(auditor.address);
      await tx.wait();
      expect(await payroll.isAuditor(auditor.address)).to.be.true;
      expect(await payroll.getAuditorCount()).to.equal(1);
    });

    it("auditor can view aggregate total", async function () {
      const encTotal = await payroll.connect(auditor).getAggregatePayroll();
      const total = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64, encTotal, payrollAddr, auditor as unknown as ethers.Signer
      );
      expect(total).to.equal(10_400_000000n);
    });

    it("non-auditor cannot view aggregate", async function () {
      await expect(payroll.connect(outsider).getAggregatePayroll()).to.be.revertedWithCustomError(payroll, "NotAuditor");
    });

    it("employer can revoke auditor", async function () {
      await (await payroll.revokeAuditorAccess(auditor.address)).wait();
      expect(await payroll.isAuditor(auditor.address)).to.be.false;
      expect(await payroll.getAuditorCount()).to.equal(0);
    });

    it("cannot grant zero address", async function () {
      await expect(payroll.grantAuditorAccess(ethers.ZeroAddress)).to.be.revertedWithCustomError(payroll, "ZeroAddress");
    });

    it("cannot grant same auditor twice", async function () {
      await (await payroll.grantAuditorAccess(auditor.address)).wait();
      await expect(payroll.grantAuditorAccess(auditor.address)).to.be.revertedWithCustomError(payroll, "AlreadyAuditor");
      // Cleanup
      await (await payroll.revokeAuditorAccess(auditor.address)).wait();
    });
  });
});
