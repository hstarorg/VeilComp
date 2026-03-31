import type { ContractAddresses } from "../types";
import type { Abi } from "viem";

// Update these after deployment to Sepolia
export const ADDRESSES: ContractAddresses = {
  token: (import.meta.env.VITE_TOKEN_ADDRESS ?? "") as `0x${string}`,
  payroll: (import.meta.env.VITE_PAYROLL_ADDRESS ?? "") as `0x${string}`,
};

export const SEPOLIA_CHAIN_ID = 11155111;

export const TOKEN_ABI = [
  { type: "function", name: "name", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "deposit", inputs: [{ name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "requestWithdraw", inputs: [{ name: "amount", type: "uint256" }], outputs: [{ name: "id", type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "encryptedTransfer", inputs: [{ name: "to", type: "address" }, { name: "encAmount", type: "bytes32" }, { name: "inputProof", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "encryptedBalanceOf", inputs: [], outputs: [{ type: "bytes32" }], stateMutability: "view" },
  { type: "function", name: "fheApprove", inputs: [{ name: "spender", type: "address" }, { name: "approved", type: "bool" }], outputs: [], stateMutability: "nonpayable" },
] as const satisfies Abi;

export const PAYROLL_ABI = [
  // Employee management
  { type: "function", name: "employer", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "isEmployee", inputs: [{ name: "", type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "getEmployeeCount", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getEmployeeList", inputs: [], outputs: [{ type: "address[]" }], stateMutability: "view" },
  { type: "function", name: "addEmployee", inputs: [{ name: "employee", type: "address" }, { name: "encSalary", type: "bytes32" }, { name: "inputProof", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "updateSalary", inputs: [{ name: "employee", type: "address" }, { name: "encSalary", type: "bytes32" }, { name: "inputProof", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "removeEmployee", inputs: [{ name: "employee", type: "address" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "getMySalary", inputs: [], outputs: [{ type: "bytes32" }], stateMutability: "view" },
  // Payroll engine
  { type: "function", name: "taxDivisor", inputs: [], outputs: [{ type: "uint64" }], stateMutability: "view" },
  { type: "function", name: "lastPayrollTimestamp", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "runPayroll", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "startPayrollBatch", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "runPayrollBatch", inputs: [{ name: "fromIndex", type: "uint256" }, { name: "toIndex", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "getLastPayrollTotal", inputs: [], outputs: [{ type: "bytes32" }], stateMutability: "view" },
  { type: "function", name: "setTaxRate", inputs: [{ name: "divisor", type: "uint64" }], outputs: [], stateMutability: "nonpayable" },
  // Audit ACL
  { type: "function", name: "isAuditor", inputs: [{ name: "", type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "getAuditorCount", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "grantAuditorAccess", inputs: [{ name: "auditor", type: "address" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "revokeAuditorAccess", inputs: [{ name: "auditor", type: "address" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "getAggregatePayroll", inputs: [], outputs: [{ type: "bytes32" }], stateMutability: "view" },
  { type: "function", name: "makePayrollPublic", inputs: [], outputs: [], stateMutability: "nonpayable" },
] as const satisfies Abi;
