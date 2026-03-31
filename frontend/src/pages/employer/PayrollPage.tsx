import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import type { Address } from "viem";
import { formatUnits } from "viem";
import { Play, Users, ArrowLeft, Coins, AlertTriangle, CheckCircle2, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PAYROLL_ABI, ERC20_ABI } from "@/utils/contracts";
import { useApp } from "@/contexts/AppContext";
import toast from "react-hot-toast";

const BATCH_SIZE = 10;

export function PayrollPage() {
  const { address: payrollAddr } = useParams<{ address: string }>();
  const { walletClient, publicClient, address } = useApp();

  const [employees, setEmployees] = useState<Address[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [poolBalance, setPoolBalance] = useState(0n);
  const [tokenSymbol, setTokenSymbol] = useState("ERC20");
  const [tokenDecimals, setTokenDecimals] = useState(6);
  const [runCount, setRunCount] = useState(0);

  const [step, setStep] = useState<"select" | "creating" | "executing" | "done">("select");
  const [batchProgress, setBatchProgress] = useState("");

  useEffect(() => {
    if (!publicClient || !payrollAddr) return;
    async function load() {
      const [empList, pool, tokenAddr, count] = await Promise.all([
        publicClient!.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getEmployeeList" }),
        publicClient!.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getPoolBalance" }),
        publicClient!.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "payToken" }),
        publicClient!.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getRunCount" }),
      ]);
      const list = empList as Address[];
      setEmployees(list);
      setSelected(new Set(list)); // default: all selected
      setPoolBalance(pool as bigint);
      setRunCount(Number(count));
      try {
        const [sym, dec] = await Promise.all([
          publicClient!.readContract({ address: tokenAddr as Address, abi: ERC20_ABI, functionName: "symbol" }),
          publicClient!.readContract({ address: tokenAddr as Address, abi: ERC20_ABI, functionName: "decimals" }),
        ]);
        setTokenSymbol(sym as string);
        setTokenDecimals(Number(dec));
      } catch {}
    }
    load();
  }, [publicClient, payrollAddr]);

  function toggleEmployee(addr: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr); else next.add(addr);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === employees.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(employees));
    }
  }

  const selectedList = employees.filter((e) => selected.has(e));
  const batchCount = Math.ceil(selectedList.length / BATCH_SIZE);
  const poolDisplay = formatUnits(poolBalance, tokenDecimals);
  const isEmpty = poolBalance === 0n;

  async function handleRunPayroll() {
    if (!walletClient || !address || !payrollAddr || selectedList.length === 0) return;
    setStep("creating");
    try {
      // Step 1: Create payroll run
      toast("Creating payroll run...");
      const createHash = await walletClient.writeContract({
        address: payrollAddr as Address,
        abi: PAYROLL_ABI,
        functionName: "createPayrollRun",
        args: [selectedList],
        account: address as Address,
        chain: walletClient.chain,
      });
      await publicClient!.waitForTransactionReceipt({ hash: createHash });

      // Get runId from the next expected id
      const runId = BigInt(runCount);

      // Step 2: Execute in batches
      setStep("executing");
      const total = selectedList.length;
      const batches = Math.ceil(total / BATCH_SIZE);

      for (let i = 0; i < batches; i++) {
        const from = i * BATCH_SIZE;
        const to = Math.min((i + 1) * BATCH_SIZE, total);
        setBatchProgress(`Batch ${i + 1}/${batches} (employees ${from + 1}-${to})`);
        toast(`Executing batch ${i + 1}/${batches}...`);

        const hash = await walletClient.writeContract({
          address: payrollAddr as Address,
          abi: PAYROLL_ABI,
          functionName: "executePayrollRunBatch",
          args: [runId, BigInt(from), BigInt(to)],
          account: address as Address,
          chain: walletClient.chain,
        });
        await publicClient!.waitForTransactionReceipt({ hash });
      }

      setStep("done");
      setRunCount((c) => c + 1);
      toast.success(`Payroll #${runId} complete! ${total} employees paid.`);
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || "Payroll failed");
      setStep("select");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/employer/${payrollAddr}`}><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold">Run Payroll</h1>
        <Badge>Run #{runCount}</Badge>
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 text-sm text-gray-400">
        <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {selectedList.length}/{employees.length} selected</span>
        <span className="flex items-center gap-1"><Coins className="h-4 w-4" />
          <span className={isEmpty ? "text-red-400" : "text-green-400"}>{poolDisplay} {tokenSymbol}</span>
        </span>
      </div>

      {isEmpty && employees.length > 0 && (
        <Card className="border-red-900/50 bg-red-950/20">
          <CardContent className="flex items-start gap-2 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <p className="text-xs text-red-300">
              Pool is empty. <Link to={`/employer/${payrollAddr}`} className="underline text-red-200">Deposit {tokenSymbol}</Link> first.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Employee selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-base"><ListChecks className="h-5 w-5" /> Select Employees</span>
            <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs">
              {selected.size === employees.length ? "Deselect All" : "Select All"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <p className="text-sm text-gray-500">No employees added yet.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {employees.map((emp) => (
                <label key={emp} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-gray-800/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(emp)}
                    onChange={() => toggleEmployee(emp)}
                    className="rounded border-gray-600"
                    disabled={step !== "select"}
                  />
                  <span className="font-mono text-sm text-gray-300">{emp}</span>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action */}
      <Card className="max-w-md">
        <CardHeader><CardTitle className="flex items-center gap-2"><Play className="h-5 w-5" /> Execute</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {step === "done" ? (
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">Payroll complete!</span>
            </div>
          ) : (
            <>
              {batchProgress && <p className="text-xs text-gray-400">{batchProgress}</p>}
              <Button
                variant="success"
                onClick={handleRunPayroll}
                disabled={step !== "select" || selectedList.length === 0 || isEmpty}
                className="w-full"
              >
                {step === "creating"
                  ? "Creating run..."
                  : step === "executing"
                    ? "Executing..."
                    : selectedList.length === 0
                      ? "Select Employees"
                      : isEmpty
                        ? "Deposit Funds First"
                        : `Create & Execute (${selectedList.length} employees, ${batchCount} batch${batchCount > 1 ? "es" : ""})`}
              </Button>
            </>
          )}

          {step === "done" && (
            <Button variant="outline" onClick={() => { setStep("select"); setBatchProgress(""); }} className="w-full">
              New Payroll Run
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
