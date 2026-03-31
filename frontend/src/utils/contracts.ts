import type { Abi } from "viem";

export const SEPOLIA_CHAIN_ID = 11155111;

// VeilFactory — deployed once globally, set via env var
export const FACTORY_ADDRESS = (import.meta.env.VITE_FACTORY_ADDRESS ?? "") as `0x${string}`;

// Well-known Sepolia token addresses (for the deploy dropdown)
export const KNOWN_TOKENS: Record<string, `0x${string}`> = {
  // Add real Sepolia USDT/USDC addresses after deployment
  // "USDT": "0x...",
  // "USDC": "0x...",
};

// ─── ABIs ──────────────────────────────────────────────────

export const FACTORY_ABI = [
  { type: "function", name: "createPayroll", inputs: [{ name: "salt", type: "bytes32" }, { name: "payToken", type: "address" }], outputs: [{ name: "payroll", type: "address" }], stateMutability: "nonpayable" },
  { type: "function", name: "getMyPayrolls", inputs: [], outputs: [{ type: "address[]" }], stateMutability: "view" },
  { type: "function", name: "getEmployerPayrolls", inputs: [{ name: "employer", type: "address" }], outputs: [{ type: "address[]" }], stateMutability: "view" },
  { type: "function", name: "isPayroll", inputs: [{ name: "", type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "getPayrollCount", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "event", name: "PayrollCreated", inputs: [{ name: "employer", type: "address", indexed: true }, { name: "payroll", type: "address", indexed: true }, { name: "payToken", type: "address", indexed: true }] },
] as const satisfies Abi;

export const PAYROLL_ABI = [
  // Info
  { type: "function", name: "employer", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "payToken", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  // Fund
  { type: "function", name: "deposit", inputs: [{ name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "getPoolBalance", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  // Employee management
  { type: "function", name: "isEmployee", inputs: [{ name: "", type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "getEmployeeCount", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getEmployeeList", inputs: [], outputs: [{ type: "address[]" }], stateMutability: "view" },
  { type: "function", name: "addEmployee", inputs: [{ name: "employee", type: "address" }, { name: "encSalary", type: "bytes32" }, { name: "inputProof", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "updateSalary", inputs: [{ name: "employee", type: "address" }, { name: "encSalary", type: "bytes32" }, { name: "inputProof", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "removeEmployee", inputs: [{ name: "employee", type: "address" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "getMySalary", inputs: [], outputs: [{ type: "bytes32" }], stateMutability: "view" },
  { type: "function", name: "getMyBalance", inputs: [], outputs: [{ type: "bytes32" }], stateMutability: "view" },
  // Payroll runs
  { type: "function", name: "nextRunId", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "createPayrollRun", inputs: [{ name: "employees", type: "address[]" }], outputs: [{ name: "runId", type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "executePayrollRunBatch", inputs: [{ name: "runId", type: "uint256" }, { name: "fromIndex", type: "uint256" }, { name: "toIndex", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "getPayrollRun", inputs: [{ name: "runId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "employeeCount", type: "uint256" }, { name: "status", type: "uint8" }, { name: "createdAt", type: "uint256" }, { name: "executedAt", type: "uint256" }, { name: "batchProcessed", type: "uint256" }] }], stateMutability: "view" },
  { type: "function", name: "getRunEmployees", inputs: [{ name: "runId", type: "uint256" }], outputs: [{ type: "address[]" }], stateMutability: "view" },
  { type: "function", name: "getRunTotalPaid", inputs: [{ name: "runId", type: "uint256" }], outputs: [{ type: "bytes32" }], stateMutability: "view" },
  { type: "function", name: "getRunCount", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  // Withdraw
  { type: "function", name: "requestWithdraw", inputs: [{ name: "amount", type: "uint256" }], outputs: [{ name: "id", type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "fulfillWithdraw", inputs: [{ name: "id", type: "uint256" }, { name: "handlesList", type: "bytes32[]" }, { name: "abiEncodedCleartexts", type: "bytes" }, { name: "decryptionProof", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "nextWithdrawId", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "withdrawRequests", inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "user", type: "address" }, { name: "amount", type: "uint256" }, { name: "pending", type: "bool" }], stateMutability: "view" },
  { type: "function", name: "getWithdrawDeducted", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "bytes32" }], stateMutability: "view" },
  // Events
  { type: "event", name: "PayrollRunCreated", inputs: [{ name: "runId", type: "uint256", indexed: true }, { name: "employeeCount", type: "uint256", indexed: false }] },
  { type: "event", name: "PayrollRunExecuted", inputs: [{ name: "runId", type: "uint256", indexed: true }, { name: "employeeCount", type: "uint256", indexed: false }, { name: "timestamp", type: "uint256", indexed: false }] },
] as const satisfies Abi;

export const ERC20_ABI = [
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
] as const satisfies Abi;
