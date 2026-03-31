import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import type { Address } from "viem";
import { Users, Hash, Coins, Plus, AlertTriangle, CalendarCheck, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Overview</h1>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="group transition-colors duration-200 hover:border-indigo-800/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Employees</span>
              <Users className="h-4 w-4 text-indigo-400/60" />
            </div>
            <p className="text-3xl font-bold tabular-nums">{employeeCount}</p>
          </CardContent>
        </Card>

        <Card className="group transition-colors duration-200 hover:border-indigo-800/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pay Runs</span>
              <Hash className="h-4 w-4 text-indigo-400/60" />
            </div>
            <p className="text-3xl font-bold tabular-nums">{runCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pool + Deposit in one row */}
      <Card className={`transition-colors duration-200 ${isLowBalance ? "border-red-900/60" : "border-gray-800/60"}`}>
        <CardContent className="flex items-center gap-6 p-5">
          {/* Pool balance */}
          <div className="shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="h-4 w-4 text-indigo-400/60" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pool ({token.symbol})</span>
            </div>
            <p className={`text-3xl font-bold tabular-nums ${isLowBalance ? "text-red-400" : ""}`}>{poolDisplay}</p>
          </div>

          {/* Divider */}
          <div className="h-12 w-px bg-gray-800" />

          {/* Deposit form */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Plus className="h-3.5 w-3.5 text-green-400" />
              <span className="text-xs font-medium text-gray-500">Deposit {token.symbol}</span>
            </div>
            <div className="flex gap-2">
              <Input type="number" step="0.01" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder={`Amount`} className="bg-gray-900/50 border-gray-800 focus:border-indigo-600 transition-colors" />
              <Button onClick={handleDeposit} disabled={depositing || !depositAmount} variant="success" className="min-w-25 transition-all duration-200">
                {depositing ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Depositing</> : "Deposit"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contextual prompts */}
      {isLowBalance && (
        <Card className="border-red-900/40 bg-red-950/10">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10">
              <AlertTriangle className="h-4 w-4 text-red-400" />
            </div>
            <p className="text-sm text-red-300/90 leading-relaxed">Pool is empty. Deposit {token.symbol} before paying employees.</p>
          </CardContent>
        </Card>
      )}

      {employeeCount === 0 && (
        <Card className="border-yellow-900/30 bg-yellow-950/5">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-500/10">
                <Users className="h-4 w-4 text-yellow-400" />
              </div>
              <p className="text-sm text-yellow-300/90">No employees yet. Add employees to get started.</p>
            </div>
            <Link to={`/employer/${payrollAddr}/employees`}><Button size="sm" className="transition-all duration-200">Add Employees</Button></Link>
          </CardContent>
        </Card>
      )}

      {employeeCount > 0 && !isLowBalance && (
        <Card className="border-indigo-900/30 bg-indigo-950/5">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/10">
                <CalendarCheck className="h-4 w-4 text-indigo-400" />
              </div>
              <p className="text-sm text-gray-300">Ready to pay {employeeCount} employees.</p>
            </div>
            <Link to={`/employer/${payrollAddr}/payroll/new`}><Button size="sm" variant="success" className="transition-all duration-200">New Pay Run</Button></Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
