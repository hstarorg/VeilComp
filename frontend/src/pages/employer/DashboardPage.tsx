import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { PublicClient } from "viem";
import { Users, Percent, Clock, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EncryptedValue } from "@/components/common/EncryptedValue";
import { ADDRESSES, PAYROLL_ABI } from "@/utils/contracts";

interface Props {
  publicClient: PublicClient | null;
  onDecrypt: (handle: string, contractAddress?: string) => Promise<bigint>;
}

export function DashboardPage({ publicClient, onDecrypt }: Props) {
  const [employeeCount, setEmployeeCount] = useState(0);
  const [taxDivisor, setTaxDivisor] = useState(0);
  const [lastPayrollTs, setLastPayrollTs] = useState(0);
  const [payrollTotalHandle, setPayrollTotalHandle] = useState("");

  useEffect(() => {
    if (!publicClient) return;
    async function load() {
      const [count, divisor, ts, total] = await Promise.all([
        publicClient!.readContract({ address: ADDRESSES.payroll, abi: PAYROLL_ABI, functionName: "getEmployeeCount" }),
        publicClient!.readContract({ address: ADDRESSES.payroll, abi: PAYROLL_ABI, functionName: "taxDivisor" }),
        publicClient!.readContract({ address: ADDRESSES.payroll, abi: PAYROLL_ABI, functionName: "lastPayrollTimestamp" }),
        publicClient!.readContract({ address: ADDRESSES.payroll, abi: PAYROLL_ABI, functionName: "getLastPayrollTotal" }),
      ]);
      setEmployeeCount(Number(count));
      setTaxDivisor(Number(divisor));
      setLastPayrollTs(Number(ts));
      setPayrollTotalHandle(total as string);
    }
    load();
  }, [publicClient]);

  const taxPercent = taxDivisor > 0 ? Math.round(100 / taxDivisor) : 0;
  const lastPayrollDate = lastPayrollTs > 0 ? new Date(lastPayrollTs * 1000).toLocaleString() : "Never";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Employer Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-gray-400">Employees</CardTitle>
            <Users className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{employeeCount}</p></CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-gray-400">Tax Rate</CardTitle>
            <Percent className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{taxPercent}%</p></CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-gray-400">Last Payroll</CardTitle>
            <Clock className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent><p className="text-sm font-medium">{lastPayrollDate}</p></CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-gray-400">Payroll Total</CardTitle>
            <DollarSign className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <EncryptedValue handle={payrollTotalHandle} contractAddress={ADDRESSES.payroll} onDecrypt={onDecrypt} />
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button asChild><Link to="/employer/employees">Manage Employees</Link></Button>
        <Button variant="success" asChild><Link to="/employer/payroll">Run Payroll</Link></Button>
      </div>
    </div>
  );
}
