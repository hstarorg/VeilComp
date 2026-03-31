import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // Deploy VeilFactory (the only global contract)
  const VeilFactory = await ethers.getContractFactory("VeilFactory");
  const factory = await VeilFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();

  console.log("\n══════════════════════════════════════");
  console.log("Deployment complete!");
  console.log("══════════════════════════════════════");
  console.log("VeilFactory:", factoryAddr);
  console.log("══════════════════════════════════════");
  console.log("\nNext steps (per company):");
  console.log("1. factory.createPayroll(salt, tokenAddress) — deploy payroll");
  console.log("2. token.approve(payrollAddress, amount) — approve spending");
  console.log("3. payroll.deposit(amount) — fund the payroll pool");
  console.log("4. payroll.addEmployee(...) — add employees");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
