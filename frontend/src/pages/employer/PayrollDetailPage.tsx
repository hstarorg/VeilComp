import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import type { Address } from "viem";
import { formatUnits } from "viem";
import { ArrowLeft, Users, Coins, AlertTriangle, CheckCircle2, Loader2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PAYROLL_ABI, ERC20_ABI } from "@/utils/contracts";
import { useApp } from "@/contexts/AppContext";
import toast from "react-hot-toast";

const BATCH_SIZE = 10;

interface RunData {
  employeeCount: number;
  status: number;
  createdAt: number;
  executedAt: number;
  batchProcessed: number;
  employees: Address[];
}

export function PayrollDetailPage() {
  const { address: payrollAddr, runId: runIdParam } = useParams<{ address: string; runId: string }>();
  const { walletClient, publicClient, address } = useApp();
  const runId = BigInt(runIdParam ?? "0");

  const [run, setRun] = useState<RunData | null>(null);
  const [poolBalance, setPoolBalance] = useState(0n);
  const [tokenSymbol, setTokenSymbol] = useState("ERC20");
  const [tokenDecimals, setTokenDecimals] = useState(6);
  const [loading, setLoading] = useState(true);

  const [executing, setExecuting] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");

  async function loadData() {
    if (!publicClient || !payrollAddr) return;
    const [rawRun, empList, pool, token] = await Promise.all([
      publicClient.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getPayrollRun", args: [runId] }),
      publicClient.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getRunEmployees", args: [runId], account: address }),
      publicClient.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getPoolBalance" }),
      publicClient.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "payToken" }),
    ]);
    const r = rawRun as { employeeCount: bigint; status: number; createdAt: bigint; executedAt: bigint; batchProcessed: bigint };
    setRun({
      employeeCount: Number(r.employeeCount),
      status: Number(r.status),
      createdAt: Number(r.createdAt),
      executedAt: Number(r.executedAt),
      batchProcessed: Number(r.batchProcessed),
      employees: empList as Address[],
    });
    setPoolBalance(pool as bigint);
    try {
      const [sym, dec] = await Promise.all([
        publicClient.readContract({ address: token as Address, abi: ERC20_ABI, functionName: "symbol" }),
        publicClient.readContract({ address: token as Address, abi: ERC20_ABI, functionName: "decimals" }),
      ]);
      setTokenSymbol(sym as string);
      setTokenDecimals(Number(dec));
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [publicClient, payrollAddr, runIdParam]);

  // ── Execute (resumable) ──

  async function handleExecute() {
    if (!walletClient || !publicClient || !address || !payrollAddr || !run) return;
    setExecuting(true);
    try {
      const startFrom = run.batchProcessed;
      const total = run.employeeCount;
      const remaining = total - startFrom;
      const batches = Math.ceil(remaining / BATCH_SIZE);

      for (let b = 0; b < batches; b++) {
        const from = startFrom + b * BATCH_SIZE;
        const to = Math.min(from + BATCH_SIZE, total);
        setBatchProgress(`Batch ${b + 1}/${batches} (employees ${from + 1}-${to})`);
        toast(`Paying batch ${b + 1}/${batches}...`);

        const hash = await walletClient.writeContract({
          address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "executePayrollRunBatch",
          args: [runId, BigInt(from), BigInt(to)], account: address as Address, chain: walletClient.chain,
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }

      toast.success(`Done! ${total} employees paid.`);
      await loadData();
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || "Execution failed");
      await loadData();
    } finally {
      setExecuting(false);
      setBatchProgress("");
    }
  }

  // ── Render ──

  if (loading || !run) return <p className="text-sm text-gray-500 p-6">Loading...</p>;

  const isDone = run.status === 1;
  const isPartial = run.status === 0 && run.batchProcessed > 0;
  const poolDisplay = formatUnits(poolBalance, tokenDecimals);
  const isEmpty = poolBalance === 0n;
  const createdDate = new Date(run.createdAt * 1000).toLocaleString();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/employer/${payrollAddr}/payroll`}><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold">Pay Run #{String(runId)}</h1>
        {isDone
          ? <Badge className="bg-green-900/50 text-green-300 border border-green-800">Paid</Badge>
          : isPartial
            ? <Badge className="bg-orange-900/50 text-orange-300 border border-orange-800">Partial</Badge>
            : <Badge className="bg-yellow-900/50 text-yellow-300 border border-yellow-800">Pending</Badge>}
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-4 text-sm text-gray-400">
        <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {run.employeeCount} employees</span>
        <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {createdDate}</span>
        <span className="flex items-center gap-1"><Coins className="h-4 w-4" />
          <span className={isEmpty ? "text-red-400" : "text-green-400"}>{poolDisplay} {tokenSymbol}</span>
        </span>
      </div>

      {/* Employee list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-gray-400">Employees in this run</CardTitle>
        </CardHeader>
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

      {/* ── Pending: Pay action ── */}
      {!isDone && !executing && (
        <>
          {isEmpty && (
            <Card className="border-red-900/50 bg-red-950/20 max-w-md">
              <CardContent className="flex items-center justify-between p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <p className="text-xs text-red-300">Pool is empty. Deposit {tokenSymbol} first.</p>
                </div>
                <Link to={`/employer/${payrollAddr}`}>
                  <Button size="sm" variant="destructive">Go to Overview</Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {isPartial && (
            <Card className="border-orange-900/30 max-w-md">
              <CardContent className="flex items-start gap-2 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
                <p className="text-xs text-orange-300">
                  Previously interrupted at {run.batchProcessed}/{run.employeeCount}. Will resume from where it stopped.
                </p>
              </CardContent>
            </Card>
          )}

          <Button
            variant="success" onClick={handleExecute}
            disabled={isEmpty || executing}
            className="w-full max-w-md"
          >
            {isEmpty
              ? "Deposit Funds First"
              : isPartial
                ? `Resume: Pay remaining ${run.employeeCount - run.batchProcessed} Employees`
                : `Pay ${run.employeeCount} Employees`}
          </Button>
        </>
      )}

      {/* ── Executing ── */}
      {executing && (
        <Card className="max-w-md">
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
              <span className="text-sm font-medium">Paying employees...</span>
            </div>
            {batchProgress && <p className="text-xs text-gray-400">{batchProgress}</p>}
          </CardContent>
        </Card>
      )}

      {/* ── Done ── */}
      {isDone && (
        <Card className="max-w-md">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">All {run.employeeCount} employees paid!</span>
            </div>
            {run.executedAt > 0 && (
              <p className="text-xs text-gray-500">Completed: {new Date(run.executedAt * 1000).toLocaleString()}</p>
            )}
            <Link to={`/employer/${payrollAddr}/payroll`}>
              <Button variant="outline" className="w-full">Back to Pay Runs</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
