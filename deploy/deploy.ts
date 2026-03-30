import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // 1. Deploy VeilToken (vcUSDT) — pass USDT address on target chain
  const usdtAddress = process.env.USDT_ADDRESS ?? "";
  if (!usdtAddress) throw new Error("Set USDT_ADDRESS env var");

  const VeilToken = await ethers.getContractFactory("VeilToken");
  const token = await VeilToken.deploy(usdtAddress);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("VeilToken deployed to:", tokenAddr);

  // 2. Deploy VeilPayroll
  const VeilPayroll = await ethers.getContractFactory("VeilPayroll");
  const payroll = await VeilPayroll.deploy(tokenAddr);
  await payroll.waitForDeployment();
  const payrollAddr = await payroll.getAddress();
  console.log("VeilPayroll deployed to:", payrollAddr);

  // 3. Employer approves Payroll to transfer vcUSDT on their behalf
  const tx = await token.fheApprove(payrollAddr, true);
  await tx.wait();
  console.log("Token: employer approved payroll for transfers");

  // Summary
  console.log("\n══════════════════════════════════════");
  console.log("Deployment complete!");
  console.log("══════════════════════════════════════");
  console.log("USDT:         ", usdtAddress);
  console.log("VeilToken:    ", tokenAddr);
  console.log("VeilPayroll:  ", payrollAddr);
  console.log("══════════════════════════════════════");
  console.log("\nNext steps:");
  console.log("1. Employer: approve USDT to VeilToken, then call deposit()");
  console.log("2. Add employees via VeilPayroll.addEmployee()");
  console.log("3. Run payroll via VeilPayroll.runPayroll()");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
