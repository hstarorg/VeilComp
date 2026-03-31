import { useState, useEffect } from "react";
import type { PublicClient, Address } from "viem";
import { Wallet, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EncryptedValue } from "@/components/common/EncryptedValue";
import { ADDRESSES, PAYROLL_ABI, TOKEN_ABI } from "@/utils/contracts";

interface Props {
  publicClient: PublicClient | null;
  address: Address | "";
  onDecrypt: (handle: string, contractAddress?: string) => Promise<bigint>;
}

export function CompensationPage({ publicClient, address, onDecrypt }: Props) {
  const [salaryHandle, setSalaryHandle] = useState("");
  const [balanceHandle, setBalanceHandle] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicClient || !address) return;
    async function load() {
      setLoading(true);
      try {
        const [salary, balance] = await Promise.all([
          publicClient!.readContract({ address: ADDRESSES.payroll, abi: PAYROLL_ABI, functionName: "getMySalary", account: address as Address }),
          publicClient!.readContract({ address: ADDRESSES.token, abi: TOKEN_ABI, functionName: "encryptedBalanceOf", account: address as Address }),
        ]);
        setSalaryHandle(salary as string);
        setBalanceHandle(balance as string);
      } catch { /* not an employee */ }
      finally { setLoading(false); }
    }
    load();
  }, [publicClient, address]);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Compensation</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Monthly Salary</CardTitle>
            <DollarSign className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent className="text-xl">
            <EncryptedValue handle={salaryHandle} contractAddress={ADDRESSES.payroll} onDecrypt={onDecrypt} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">vcUSDT Balance</CardTitle>
            <Wallet className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent className="text-xl">
            <EncryptedValue handle={balanceHandle} contractAddress={ADDRESSES.token} onDecrypt={onDecrypt} />
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-gray-600">All values are FHE-encrypted on chain. Only you can decrypt your own data.</p>
    </div>
  );
}
