import { useState, useEffect } from "react";
import type { WalletClient, PublicClient, Address } from "viem";
import { Play, Users, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ADDRESSES, PAYROLL_ABI } from "@/utils/contracts";
import toast from "react-hot-toast";

interface Props {
  walletClient: WalletClient | null;
  publicClient: PublicClient | null;
  address: Address | "";
}

export function PayrollPage({ walletClient, publicClient, address }: Props) {
  const [employeeCount, setEmployeeCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!publicClient) return;
    publicClient
      .readContract({ address: ADDRESSES.payroll, abi: PAYROLL_ABI, functionName: "getEmployeeCount" })
      .then((c) => setEmployeeCount(Number(c)));
  }, [publicClient]);

  const maxBatch = 10;
  const batchCount = Math.ceil(employeeCount / maxBatch);

  async function handleRunPayroll() {
    if (!walletClient || !address) return;
    setLoading(true);
    try {
      if (employeeCount <= maxBatch) {
        const hash = await walletClient.writeContract({
          address: ADDRESSES.payroll, abi: PAYROLL_ABI, functionName: "runPayroll",
          account: address as Address, chain: walletClient.chain,
        });
        toast.success(`Payroll complete! TX: ${hash.slice(0, 10)}...`);
      } else {
        let hash = await walletClient.writeContract({
          address: ADDRESSES.payroll, abi: PAYROLL_ABI, functionName: "startPayrollBatch",
          account: address as Address, chain: walletClient.chain,
        });
        await publicClient!.waitForTransactionReceipt({ hash });

        for (let i = 0; i < batchCount; i++) {
          const from = i * maxBatch;
          const to = Math.min((i + 1) * maxBatch, employeeCount);
          toast(`Processing batch ${i + 1}/${batchCount}...`);
          hash = await walletClient.writeContract({
            address: ADDRESSES.payroll, abi: PAYROLL_ABI, functionName: "runPayrollBatch",
            args: [BigInt(from), BigInt(to)],
            account: address as Address, chain: walletClient.chain,
          });
          await publicClient!.waitForTransactionReceipt({ hash });
        }
        toast.success(`All ${batchCount} batches complete!`);
      }
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || "Payroll failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Run Payroll</h1>
      <Card className="max-w-md">
        <CardHeader><CardTitle className="flex items-center gap-2"><Play className="h-5 w-5" /> Execute</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-gray-400"><Users className="h-4 w-4" /> Employees</span>
            <span className="font-medium">{employeeCount}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-gray-400"><Layers className="h-4 w-4" /> Batches</span>
            <span className="font-medium">{batchCount || 1}</span>
          </div>
          <Button variant="success" onClick={handleRunPayroll} disabled={loading || employeeCount === 0} className="w-full">
            {loading ? "Processing..." : employeeCount === 0 ? "No Employees" : `Run Payroll (${employeeCount} employees)`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
