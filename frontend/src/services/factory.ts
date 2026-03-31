import type { Address, PublicClient } from 'viem';
import { FACTORY_ABI, PAYROLL_ABI, ERC20_ABI } from '@/utils/contracts';
import { FACTORY_ADDRESS } from '@/utils/contracts';

export interface PayrollInfo {
  address: `0x${string}`;
  employer: `0x${string}`;
  payToken: `0x${string}`;
  tokenSymbol: string;
}

export async function getEmployerPayrolls(
  publicClient: PublicClient,
  employer: Address,
): Promise<PayrollInfo[]> {
  if (!FACTORY_ADDRESS) return [];

  const addrs = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getEmployerPayrolls',
    args: [employer],
  }) as `0x${string}`[];

  return Promise.all(
    addrs.map(async (addr) => {
      const [employerAddr, tokenAddr] = await Promise.all([
        publicClient.readContract({ address: addr, abi: PAYROLL_ABI, functionName: 'employer' }),
        publicClient.readContract({ address: addr, abi: PAYROLL_ABI, functionName: 'payToken' }),
      ]);

      let tokenSymbol = 'ERC20';
      try {
        tokenSymbol = await publicClient.readContract({
          address: tokenAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol',
        }) as string;
      } catch { /* fallback */ }

      return {
        address: addr,
        employer: employerAddr as `0x${string}`,
        payToken: tokenAddr as `0x${string}`,
        tokenSymbol,
      };
    })
  );
}

export async function getEmployeePayrolls(
  publicClient: PublicClient,
  employee: Address,
): Promise<(PayrollInfo & { salaryHandle: string; balanceHandle: string })[]> {
  if (!FACTORY_ADDRESS) return [];

  const addrs = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getMyPayrolls',
    account: employee,
  }) as `0x${string}`[];

  return Promise.all(
    addrs.map(async (addr) => {
      const [employerAddr, tokenAddr, salary, balance] = await Promise.all([
        publicClient.readContract({ address: addr, abi: PAYROLL_ABI, functionName: 'employer' }),
        publicClient.readContract({ address: addr, abi: PAYROLL_ABI, functionName: 'payToken' }),
        publicClient.readContract({ address: addr, abi: PAYROLL_ABI, functionName: 'getMySalary', account: employee }),
        publicClient.readContract({ address: addr, abi: PAYROLL_ABI, functionName: 'getMyBalance', account: employee }),
      ]);

      let tokenSymbol = 'ERC20';
      try {
        tokenSymbol = await publicClient.readContract({
          address: tokenAddr as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol',
        }) as string;
      } catch { /* fallback */ }

      return {
        address: addr,
        employer: employerAddr as `0x${string}`,
        payToken: tokenAddr as `0x${string}`,
        tokenSymbol,
        salaryHandle: salary as string,
        balanceHandle: balance as string,
      };
    })
  );
}
