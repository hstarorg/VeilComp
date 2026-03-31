import type { Address, PublicClient, WalletClient } from 'viem';
import { formatUnits } from 'viem';
import { PAYROLL_ABI, ERC20_ABI } from '@/utils/contracts';

// ─── Types ─────────────────────────────────────────────────

export interface TokenInfo {
  address: Address;
  symbol: string;
  decimals: number;
}

export interface PayrollOverview {
  employeeCount: number;
  runCount: number;
  poolBalance: bigint;
  token: TokenInfo;
}

export interface PayrollRunInfo {
  id: number;
  employeeCount: number;
  status: number; // 0=Created, 1=Executed
  createdAt: number;
  executedAt: number;
  batchProcessed: number;
}

export interface PayrollRunDetail extends PayrollRunInfo {
  employees: Address[];
  poolBalance: bigint;
  token: TokenInfo;
}

// ─── Read helpers ──────────────────────────────────────────

const LATEST = { blockTag: 'latest' as const };

export async function getTokenInfo(publicClient: PublicClient, tokenAddr: Address): Promise<TokenInfo> {
  let symbol = 'ERC20';
  let decimals = 6;
  try {
    const [sym, dec] = await Promise.all([
      publicClient.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: 'symbol' }),
      publicClient.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: 'decimals' }),
    ]);
    symbol = sym as string;
    decimals = Number(dec);
  } catch { /* fallback */ }
  return { address: tokenAddr, symbol, decimals };
}

export async function getPayrollOverview(
  publicClient: PublicClient,
  payrollAddr: Address,
): Promise<PayrollOverview> {
  const [count, runs, pool, tokenAddr] = await Promise.all([
    publicClient.readContract({ ...LATEST, address: payrollAddr, abi: PAYROLL_ABI, functionName: 'getEmployeeCount' }),
    publicClient.readContract({ ...LATEST, address: payrollAddr, abi: PAYROLL_ABI, functionName: 'getRunCount' }),
    publicClient.readContract({ ...LATEST, address: payrollAddr, abi: PAYROLL_ABI, functionName: 'getPoolBalance' }),
    publicClient.readContract({ address: payrollAddr, abi: PAYROLL_ABI, functionName: 'payToken' }),
  ]);
  const token = await getTokenInfo(publicClient, tokenAddr as Address);
  return {
    employeeCount: Number(count),
    runCount: Number(runs),
    poolBalance: pool as bigint,
    token,
  };
}

export async function getEmployeeList(
  publicClient: PublicClient,
  payrollAddr: Address,
  account: Address,
): Promise<Address[]> {
  return publicClient.readContract({
    ...LATEST, address: payrollAddr, abi: PAYROLL_ABI, functionName: 'getEmployeeList', account,
  }) as Promise<Address[]>;
}

export async function getAllRuns(
  publicClient: PublicClient,
  payrollAddr: Address,
): Promise<PayrollRunInfo[]> {
  const count = await publicClient.readContract({
    address: payrollAddr, abi: PAYROLL_ABI, functionName: 'getRunCount',
  }) as bigint;

  const n = Number(count);
  if (n === 0) return [];

  const results = await Promise.all(
    Array.from({ length: n }, (_, i) =>
      publicClient.readContract({
        address: payrollAddr, abi: PAYROLL_ABI, functionName: 'getPayrollRun', args: [BigInt(i)],
      })
    )
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return results.map((r: any, i) => ({
    id: i,
    employeeCount: Number(r.employeeCount),
    status: Number(r.status),
    createdAt: Number(r.createdAt),
    executedAt: Number(r.executedAt),
    batchProcessed: Number(r.batchProcessed),
  }));
}

export async function getRunDetail(
  publicClient: PublicClient,
  payrollAddr: Address,
  runId: bigint,
  account?: Address,
): Promise<PayrollRunDetail> {
  const [rawRun, empList, pool, tokenAddr] = await Promise.all([
    publicClient.readContract({ address: payrollAddr, abi: PAYROLL_ABI, functionName: 'getPayrollRun', args: [runId] }),
    publicClient.readContract({ address: payrollAddr, abi: PAYROLL_ABI, functionName: 'getRunEmployees', args: [runId], account }),
    publicClient.readContract({ ...LATEST, address: payrollAddr, abi: PAYROLL_ABI, functionName: 'getPoolBalance' }),
    publicClient.readContract({ address: payrollAddr, abi: PAYROLL_ABI, functionName: 'payToken' }),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = rawRun as any;
  const token = await getTokenInfo(publicClient, tokenAddr as Address);
  return {
    id: Number(runId),
    employeeCount: Number(r.employeeCount),
    status: Number(r.status),
    createdAt: Number(r.createdAt),
    executedAt: Number(r.executedAt),
    batchProcessed: Number(r.batchProcessed),
    employees: empList as Address[],
    poolBalance: pool as bigint,
    token,
  };
}

// ─── Write helpers ─────────────────────────────────────────

export async function deposit(
  walletClient: WalletClient,
  publicClient: PublicClient,
  payrollAddr: Address,
  tokenAddr: Address,
  amount: bigint,
) {
  const account = walletClient.account!.address;
  const chain = walletClient.chain;

  // Approve
  let hash = await walletClient.writeContract({
    address: tokenAddr, abi: ERC20_ABI, functionName: 'approve',
    args: [payrollAddr, amount], account, chain,
  });
  await publicClient.waitForTransactionReceipt({ hash });

  // Deposit
  hash = await walletClient.writeContract({
    address: payrollAddr, abi: PAYROLL_ABI, functionName: 'deposit',
    args: [amount], account, chain,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function createPayrollRun(
  walletClient: WalletClient,
  publicClient: PublicClient,
  payrollAddr: Address,
  employees: Address[],
): Promise<bigint> {
  const account = walletClient.account!.address;

  // Read current count to determine new runId
  const count = await publicClient.readContract({
    address: payrollAddr, abi: PAYROLL_ABI, functionName: 'getRunCount',
  }) as bigint;

  const hash = await walletClient.writeContract({
    address: payrollAddr, abi: PAYROLL_ABI, functionName: 'createPayrollRun',
    args: [employees], account: account as Address, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash });

  return count; // the new runId
}

const BATCH_SIZE = 10;

export async function executePayrollRun(
  walletClient: WalletClient,
  publicClient: PublicClient,
  payrollAddr: Address,
  runId: bigint,
  startFrom: number,
  employeeCount: number,
  onProgress?: (batch: number, total: number, from: number, to: number) => void,
) {
  const account = walletClient.account!.address;
  const remaining = employeeCount - startFrom;
  const batches = Math.ceil(remaining / BATCH_SIZE);

  for (let b = 0; b < batches; b++) {
    const from = startFrom + b * BATCH_SIZE;
    const to = Math.min(from + BATCH_SIZE, employeeCount);
    onProgress?.(b + 1, batches, from, to);

    const hash = await walletClient.writeContract({
      address: payrollAddr, abi: PAYROLL_ABI, functionName: 'executePayrollRunBatch',
      args: [runId, BigInt(from), BigInt(to)], account: account as Address, chain: walletClient.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }
}

export async function addEmployee(
  walletClient: WalletClient,
  publicClient: PublicClient,
  payrollAddr: Address,
  employee: Address,
  encHandle: `0x${string}`,
  inputProof: `0x${string}`,
) {
  const hash = await walletClient.writeContract({
    address: payrollAddr, abi: PAYROLL_ABI, functionName: 'addEmployee',
    args: [employee, encHandle, inputProof],
    account: walletClient.account!.address, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function updateSalary(
  walletClient: WalletClient,
  publicClient: PublicClient,
  payrollAddr: Address,
  employee: Address,
  encHandle: `0x${string}`,
  inputProof: `0x${string}`,
) {
  const hash = await walletClient.writeContract({
    address: payrollAddr, abi: PAYROLL_ABI, functionName: 'updateSalary',
    args: [employee, encHandle, inputProof],
    account: walletClient.account!.address, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function removeEmployee(
  walletClient: WalletClient,
  publicClient: PublicClient,
  payrollAddr: Address,
  employee: Address,
) {
  const hash = await walletClient.writeContract({
    address: payrollAddr, abi: PAYROLL_ABI, functionName: 'removeEmployee',
    args: [employee], account: walletClient.account!.address, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

// ─── Withdraw (3-step) ─────────────────────────────────────

import { publicDecryptWithProof } from '@/utils/fhevm';

export async function requestAndFulfillWithdraw(
  walletClient: WalletClient,
  publicClient: PublicClient,
  payrollAddr: Address,
  amount: bigint,
  chainId: number | undefined,
  onStep?: (step: 'requesting' | 'decrypting' | 'fulfilling') => void,
) {
  const account = walletClient.account!.address;

  // Step 1: requestWithdraw
  onStep?.('requesting');
  const reqHash = await walletClient.writeContract({
    address: payrollAddr, abi: PAYROLL_ABI, functionName: 'requestWithdraw',
    args: [amount], account: account as Address, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: reqHash });

  // Get withdraw ID
  const nextId = await publicClient.readContract({
    address: payrollAddr, abi: PAYROLL_ABI, functionName: 'nextWithdrawId',
  }) as bigint;
  const withdrawId = nextId - 1n;

  // Get encrypted handle
  const handle = await publicClient.readContract({
    address: payrollAddr, abi: PAYROLL_ABI, functionName: 'getWithdrawDeducted', args: [withdrawId],
  }) as `0x${string}`;

  // Step 2: publicDecrypt via relayer
  onStep?.('decrypting');
  const proof = await publicDecryptWithProof([handle], walletClient, chainId);

  // Step 3: fulfillWithdraw
  onStep?.('fulfilling');
  const fulfillHash = await walletClient.writeContract({
    address: payrollAddr, abi: PAYROLL_ABI, functionName: 'fulfillWithdraw',
    args: [withdrawId, [handle], proof.abiEncodedCleartexts, proof.decryptionProof],
    account: account as Address, chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: fulfillHash });
}

// ─── Formatting ────────────────────────────────────────────

export function formatTokenAmount(amount: bigint, decimals: number): string {
  return formatUnits(amount, decimals);
}
