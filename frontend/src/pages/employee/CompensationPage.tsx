import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import type { Address } from "viem";
import { ArrowLeft, DollarSign, Wallet, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EncryptedValue } from "@/components/common/EncryptedValue";
import { PAYROLL_ABI, ERC20_ABI } from "@/utils/contracts";
import { useApp } from "@/contexts/AppContext";

export function CompensationPage() {
  const { address: payrollAddr } = useParams<{ address: string }>();
  const { publicClient, address, onDecrypt } = useApp();

  const [employerAddr, setEmployerAddr] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("ERC20");
  const [salaryHandle, setSalaryHandle] = useState("");
  const [balanceHandle, setBalanceHandle] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicClient || !address || !payrollAddr) return;

    async function load() {
      setLoading(true);
      try {
        const [employer, tokenAddr, salary, balance] = await Promise.all([
          publicClient!.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "employer" }),
          publicClient!.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "payToken" }),
          publicClient!.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getMySalary", account: address as Address }),
          publicClient!.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getMyBalance", account: address as Address }),
        ]);

        setEmployerAddr(employer as string);
        setSalaryHandle(salary as string);
        setBalanceHandle(balance as string);

        try {
          const sym = await publicClient!.readContract({ address: tokenAddr as Address, abi: ERC20_ABI, functionName: "symbol" });
          setTokenSymbol(sym as string);
        } catch { /* fallback */ }
      } catch { /* not an employee of this payroll */ }
      finally { setLoading(false); }
    }
    load();
  }, [publicClient, address, payrollAddr]);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold">Salary Details</h1>
      </div>

      <div className="flex items-center gap-3 text-sm text-gray-400">
        <Building2 className="h-4 w-4" />
        <span className="font-mono">{employerAddr.slice(0, 8)}...{employerAddr.slice(-6)}</span>
        <Badge>{tokenSymbol}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Monthly Salary</CardTitle>
            <DollarSign className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent className="text-xl">
            <EncryptedValue handle={salaryHandle} contractAddress={payrollAddr as string} onDecrypt={onDecrypt} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Withdrawable Balance</CardTitle>
            <Wallet className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent className="text-xl">
            <EncryptedValue handle={balanceHandle} contractAddress={payrollAddr as string} onDecrypt={onDecrypt} />
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-gray-600">
        All values are FHE-encrypted on chain. Only you can decrypt your own data.
      </p>
    </div>
  );
}
