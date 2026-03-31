import { useState, useEffect } from "react";
import type { PublicClient, Address } from "viem";
import { Eye, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EncryptedValue } from "@/components/common/EncryptedValue";
import { ADDRESSES, PAYROLL_ABI } from "@/utils/contracts";

interface Props {
  publicClient: PublicClient | null;
  address: Address | "";
  onDecrypt: (handle: string, contractAddress?: string) => Promise<bigint>;
}

export function AuditViewPage({ publicClient, address, onDecrypt }: Props) {
  const [totalHandle, setTotalHandle] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicClient || !address) return;
    async function load() {
      setLoading(true);
      try {
        const total = await publicClient!.readContract({
          address: ADDRESSES.payroll, abi: PAYROLL_ABI, functionName: "getAggregatePayroll", account: address as Address,
        });
        setTotalHandle(total as string);
      } catch { /* not authorized */ }
      finally { setLoading(false); }
    }
    load();
  }, [publicClient, address]);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Audit View</h1>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Eye className="h-5 w-5" /> Aggregate Payroll Total</CardTitle>
        </CardHeader>
        <CardContent className="text-xl">
          <EncryptedValue handle={totalHandle} contractAddress={ADDRESSES.payroll} onDecrypt={onDecrypt} />
        </CardContent>
      </Card>
      <Card className="max-w-md border-yellow-900/50 bg-yellow-950/20">
        <CardContent className="flex items-start gap-3 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
          <p className="text-sm text-yellow-200/70">
            You have access to aggregate totals only. Individual salary data is not accessible.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
