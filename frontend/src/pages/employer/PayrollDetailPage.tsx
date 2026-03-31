import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import type { Address } from "viem";
import { ArrowLeft, Users, Coins, AlertTriangle, CheckCircle2, Loader2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/contexts/AppContext";
import { getRunDetail, executePayrollRun, formatTokenAmount, type PayrollRunDetail } from "@/services/payroll";
import toast from "react-hot-toast";

export function PayrollDetailPage() {
  const { address: payrollAddr, runId: runIdParam } = useParams<{ address: string; runId: string }>();
  const { walletClient, publicClient, address } = useApp();
  const runId = BigInt(runIdParam ?? "0");

  const [run, setRun] = useState<PayrollRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");

  async function loadData() {
    if (!publicClient || !payrollAddr) return;
    setRun(await getRunDetail(publicClient, payrollAddr as Address, runId, address));
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [publicClient, payrollAddr, runIdParam]);

  async function handleExecute() {
    if (!walletClient || !publicClient || !payrollAddr || !run) return;
    setExecuting(true);
    try {
      await executePayrollRun(
        walletClient, publicClient, payrollAddr as Address, runId,
        run.batchProcessed, run.employeeCount,
        (batch, total, from, to) => {
          setBatchProgress(`Batch ${batch}/${total} (employees ${from + 1}-${to})`);
          toast(`Paying batch ${batch}/${total}...`);
        },
      );
      toast.success(`Done! ${run.employeeCount} employees paid.`);
      await loadData();
    } catch (err: unknown) {
      toast.error((err as { shortMessage?: string }).shortMessage || (err as Error).message || "Execution failed");
      await loadData();
    } finally {
      setExecuting(false);
      setBatchProgress("");
    }
  }

  if (loading || !run) return <p className="text-sm text-gray-500 p-6">Loading...</p>;

  const isDone = run.status === 1;
  const isPartial = run.status === 0 && run.batchProcessed > 0;
  const poolDisplay = formatTokenAmount(run.poolBalance, run.token.decimals);
  const isEmpty = run.poolBalance === 0n;
  const createdDate = new Date(run.createdAt * 1000).toLocaleString();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/employer/${payrollAddr}/payroll`}><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold">Pay Run #{String(runId)}</h1>
        {isDone ? <Badge className="bg-green-900/50 text-green-300 border border-green-800">Paid</Badge>
          : isPartial ? <Badge className="bg-orange-900/50 text-orange-300 border border-orange-800">Partial</Badge>
          : <Badge className="bg-yellow-900/50 text-yellow-300 border border-yellow-800">Pending</Badge>}
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-gray-400">
        <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {run.employeeCount} employees</span>
        <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {createdDate}</span>
        <span className="flex items-center gap-1"><Coins className="h-4 w-4" /> <span className={isEmpty ? "text-red-400" : "text-green-400"}>{poolDisplay} {run.token.symbol}</span></span>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm text-gray-400">Employees in this run</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {run.employees.map((emp) => (
              <div key={emp} className="rounded-md px-3 py-1.5 bg-gray-800/30">
                <span className="font-mono text-xs text-gray-300">{emp}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {!isDone && !executing && (
        <>
          {isEmpty && (
            <Card className="border-red-900/50 bg-red-950/20 max-w-md">
              <CardContent className="flex items-center justify-between p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <p className="text-xs text-red-300">Pool is empty. Deposit {run.token.symbol} first.</p>
                </div>
                <Link to={`/employer/${payrollAddr}`}><Button size="sm" variant="destructive">Go to Overview</Button></Link>
              </CardContent>
            </Card>
          )}
          {isPartial && (
            <Card className="border-orange-900/30 max-w-md">
              <CardContent className="flex items-start gap-2 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
                <p className="text-xs text-orange-300">Previously interrupted at {run.batchProcessed}/{run.employeeCount}. Will resume from where it stopped.</p>
              </CardContent>
            </Card>
          )}
          <Button variant="success" onClick={handleExecute} disabled={isEmpty} className="w-full max-w-md">
            {isEmpty ? "Deposit Funds First" : isPartial ? `Resume: Pay remaining ${run.employeeCount - run.batchProcessed} Employees` : `Pay ${run.employeeCount} Employees`}
          </Button>
        </>
      )}

      {executing && (
        <Card className="max-w-md">
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin text-indigo-400" /><span className="text-sm font-medium">Paying employees...</span></div>
            {batchProgress && <p className="text-xs text-gray-400">{batchProgress}</p>}
          </CardContent>
        </Card>
      )}

      {isDone && (
        <Card className="max-w-md">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2 text-green-400"><CheckCircle2 className="h-5 w-5" /><span className="text-sm font-medium">All {run.employeeCount} employees paid!</span></div>
            {run.executedAt > 0 && <p className="text-xs text-gray-500">Completed: {new Date(run.executedAt * 1000).toLocaleString()}</p>}
            <Link to={`/employer/${payrollAddr}/payroll`}><Button variant="outline" className="w-full">Back to Pay Runs</Button></Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
