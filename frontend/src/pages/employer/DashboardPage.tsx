import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import type { Address } from "viem";
import { Users, Hash, Coins, Plus, AlertTriangle, CalendarCheck, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/AppContext";
import { getPayrollOverview, deposit as depositService, formatTokenAmount, type PayrollOverview } from "@/services/payroll";
import toast from "react-hot-toast";

export function DashboardPage() {
  const { address: payrollAddr } = useParams<{ address: string }>();
  const { publicClient, walletClient, address } = useApp();

  const [overview, setOverview] = useState<PayrollOverview | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);

  async function loadData() {
    if (!publicClient || !payrollAddr) return;
    setOverview(await getPayrollOverview(publicClient, payrollAddr as Address));
  }

  useEffect(() => { loadData(); }, [publicClient, payrollAddr]);

  async function handleDeposit() {
    if (!walletClient || !publicClient || !address || !payrollAddr || !depositAmount || !overview) return;
    setDepositing(true);
    try {
      const amount = BigInt(Math.round(parseFloat(depositAmount) * 10 ** overview.token.decimals));
      toast("Approving token transfer...");
      await depositService(walletClient, publicClient, payrollAddr as Address, overview.token.address, amount);
      toast.success(`Deposited ${depositAmount} ${overview.token.symbol}`);
      setDepositAmount("");
      await loadData();
    } catch (err: unknown) {
      toast.error((err as { shortMessage?: string }).shortMessage || (err as Error).message || "Deposit failed");
    } finally {
      setDepositing(false);
    }
  }

  if (!overview) return <p className="text-sm text-gray-500">Loading...</p>;

  const { employeeCount, runCount, poolBalance, token } = overview;
  const poolDisplay = formatTokenAmount(poolBalance, token.decimals);
  const isLowBalance = poolBalance === 0n && employeeCount > 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Overview</h1>

      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={<Users />} label="Employees" value={String(employeeCount)} />
        <StatCard icon={<Hash />} label="Pay Runs" value={String(runCount)} />
        <Card className={isLowBalance ? "border-red-900/50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-gray-400">Pool ({token.symbol})</CardTitle>
            <Coins className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <p className={`text-lg font-semibold ${isLowBalance ? "text-red-400" : ""}`}>{poolDisplay}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-5 w-5 text-green-400" /> Deposit {token.symbol}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input type="number" step="0.01" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder={`Amount (${token.symbol})`} />
            <Button onClick={handleDeposit} disabled={depositing || !depositAmount} variant="success">
              {depositing ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Depositing</> : "Deposit"}
            </Button>
          </div>
          <p className="text-xs text-gray-600">Approve + deposit in two transactions.</p>
        </CardContent>
      </Card>

      {isLowBalance && (
        <Card className="border-red-900/50 bg-red-950/20">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <p className="text-sm text-red-300">Pool is empty. Deposit {token.symbol} before paying employees.</p>
          </CardContent>
        </Card>
      )}

      {employeeCount === 0 && (
        <Card className="border-yellow-900/30 bg-yellow-950/10">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-start gap-3">
              <Users className="mt-0.5 h-5 w-5 shrink-0 text-yellow-400" />
              <p className="text-sm text-yellow-300">No employees yet. Add employees to get started.</p>
            </div>
            <Link to={`/employer/${payrollAddr}/employees`}><Button size="sm">Add Employees</Button></Link>
          </CardContent>
        </Card>
      )}

      {employeeCount > 0 && !isLowBalance && (
        <Card className="border-gray-800">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-start gap-3">
              <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" />
              <p className="text-sm text-gray-300">Ready to pay {employeeCount} employees.</p>
            </div>
            <Link to={`/employer/${payrollAddr}/payroll/new`}><Button size="sm" variant="success">New Pay Run</Button></Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-gray-400">{label}</CardTitle>
        <span className="h-4 w-4 text-gray-500">{icon}</span>
      </CardHeader>
      <CardContent><p className="text-lg font-semibold">{value}</p></CardContent>
    </Card>
  );
}
