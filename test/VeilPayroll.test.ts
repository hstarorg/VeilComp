import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers } from "ethers";
import * as hre from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("VeilPayroll", function () {
  let factory: any;
  let payroll: any;
  let mockUsdt: any;
  let payrollAddr: string;
  let employer: HardhatEthersSigner;
  let emp1: HardhatEthersSigner;
  let emp2: HardhatEthersSigner;
  let auditor: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;

  before(async function () {
    [employer, emp1, emp2, auditor, outsider] = await hre.ethers.getSigners();

    // Deploy mock USDT
    const MockERC20 = await hre.ethers.getContractFactory("MockUSDT");
    mockUsdt = await MockERC20.deploy();
    await mockUsdt.waitForDeployment();

    // Deploy factory
    const Factory = await hre.ethers.getContractFactory("VeilFactory");
    factory = await Factory.deploy();
    await factory.waitForDeployment();

    // Create payroll via factory
    const salt = ethers.id("test-payroll");
    const tx = await factory.connect(employer).createPayroll(salt, await mockUsdt.getAddress());
    await tx.wait();

    const payrolls = await factory.getEmployerPayrolls(employer.address);
    payrollAddr = payrolls[0];
    payroll = await hre.ethers.getContractAt("VeilPayroll", payrollAddr);

    await hre.fhevm.assertCoprocessorInitialized(payroll, "VeilPayroll");

    // Fund employer: mint USDT and deposit into payroll
    await mockUsdt.mint(employer.address, 500_000_000000n);
    await (await mockUsdt.connect(employer).approve(payrollAddr, 500_000_000000n)).wait();
    await (await payroll.connect(employer).deposit(500_000_000000n)).wait();

    // Add employees
    const input1 = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
    input1.add64(5000_000000); // 5000 USDT
    const enc1 = await input1.encrypt();
    await (await payroll.addEmployee(emp1.address, enc1.handles[0], enc1.inputProof)).wait();

    const input2 = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
    input2.add64(8000_000000); // 8000 USDT
    const enc2 = await input2.encrypt();
    await (await payroll.addEmployee(emp2.address, enc2.handles[0], enc2.inputProof)).wait();
  });

  // ── Fund management ──

  describe("Fund management", function () {
    it("pool balance reflects deposit", async function () {
      expect(await payroll.getPoolBalance()).to.equal(500_000_000000n);
    });

    it("non-employer cannot deposit", async function () {
      await expect(payroll.connect(outsider).deposit(100)).to.be.revertedWithCustomError(payroll, "OnlyEmployer");
    });
  });

  // ── Employee management ──

  describe("Employee management", function () {
    it("employees are registered", async function () {
      expect(await payroll.isEmployee(emp1.address)).to.be.true;
      expect(await payroll.isEmployee(emp2.address)).to.be.true;
      expect(await payroll.getEmployeeCount()).to.equal(2);
    });

    it("employee registered in factory reverse index", async function () {
      // getMyPayrolls reads msg.sender — need to impersonate via staticCall
      const factoryAsEmp1 = factory.connect(emp1) as any;
      const payrolls = await factoryAsEmp1.getMyPayrolls.staticCall({ from: emp1.address });
      expect(payrolls.length).to.equal(1);
      expect(payrolls[0]).to.equal(payrollAddr);
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

    it("employer can update salary", async function () {
      const input = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input.add64(6000_000000);
      const enc = await input.encrypt();
      await (await payroll.updateSalary(emp1.address, enc.handles[0], enc.inputProof)).wait();

      const encSalary = await payroll.connect(emp1).getMySalary();
      const salary = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64, encSalary, payrollAddr, emp1 as unknown as ethers.Signer
      );
      expect(salary).to.equal(6000_000000n);

      // Reset to 5000
      const inputR = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      inputR.add64(5000_000000);
      const encR = await inputR.encrypt();
      await (await payroll.updateSalary(emp1.address, encR.handles[0], encR.inputProof)).wait();
    });

    it("employer can remove and re-add employee", async function () {
      await (await payroll.removeEmployee(emp2.address)).wait();
      expect(await payroll.isEmployee(emp2.address)).to.be.false;
      expect(await payroll.getEmployeeCount()).to.equal(1);

      // Reverse index updated
      const payrolls = await factory.connect(emp2).getMyPayrolls();
      expect(payrolls.length).to.equal(0);

      // Re-add
      const input = hre.fhevm.createEncryptedInput(payrollAddr, employer.address);
      input.add64(8000_000000);
      const enc = await input.encrypt();
      await (await payroll.addEmployee(emp2.address, enc.handles[0], enc.inputProof)).wait();
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
      // emp1: 5000*0.8=4000, emp2: 8000*0.8=6400, total=10400
      expect(total).to.equal(10_400_000000n);
    });

    it("employee balances credited after payroll", async function () {
      const encBal1 = await payroll.connect(emp1).getMyBalance();
      const bal1 = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64, encBal1, payrollAddr, emp1 as unknown as ethers.Signer
      );
      expect(bal1).to.equal(4000_000000n);

      const encBal2 = await payroll.connect(emp2).getMyBalance();
      const bal2 = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64, encBal2, payrollAddr, emp2 as unknown as ethers.Signer
      );
      expect(bal2).to.equal(6400_000000n);
    });

    it("cannot run payroll twice within cooldown", async function () {
      await expect(payroll.runPayroll()).to.be.revertedWithCustomError(payroll, "PayrollTooSoon");
    });

    it("can run payroll again after cooldown", async function () {
      await hre.ethers.provider.send("evm_increaseTime", [86400]);
      await hre.ethers.provider.send("evm_mine", []);
      const tx = await payroll.runPayroll();
      await tx.wait();
      expect(await payroll.payrollNonce()).to.equal(2);
    });

    it("non-employer cannot run payroll", async function () {
      await expect(payroll.connect(outsider).runPayroll()).to.be.revertedWithCustomError(payroll, "OnlyEmployer");
    });
  });

  // ── Tax rate ──

  describe("Tax rate", function () {
    it("employer can change tax rate", async function () {
      await (await payroll.setTaxRate(10)).wait();
      expect(await payroll.taxDivisor()).to.equal(10);
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
      await (await payroll.grantAuditorAccess(auditor.address)).wait();
      expect(await payroll.isAuditor(auditor.address)).to.be.true;
    });

    it("auditor can view aggregate total", async function () {
      const encTotal = await payroll.connect(auditor).getAggregatePayroll();
      const total = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64, encTotal, payrollAddr, auditor as unknown as ethers.Signer
      );
      // Second payroll run: same salaries, same total
      expect(total).to.equal(10_400_000000n);
    });

    it("non-auditor cannot view aggregate", async function () {
      await expect(payroll.connect(outsider).getAggregatePayroll()).to.be.revertedWithCustomError(payroll, "NotAuditor");
    });

    it("employer can revoke auditor", async function () {
      await (await payroll.revokeAuditorAccess(auditor.address)).wait();
      expect(await payroll.isAuditor(auditor.address)).to.be.false;
    });
  });
});
