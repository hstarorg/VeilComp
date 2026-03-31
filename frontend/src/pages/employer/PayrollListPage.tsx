import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import type { Address } from "viem";
import { Plus, CalendarCheck, Users, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PAYROLL_ABI } from "@/utils/contracts";
import { useApp } from "@/contexts/AppContext";

interface RunInfo {
  id: number;
  employeeCount: number;
  status: number; // 0=Created, 1=Executed
  createdAt: number;
  executedAt: number;
  batchProcessed: number;
}

function runLabel(r: RunInfo): { text: string; color: string } {
  if (r.status === 1) return { text: "Paid", color: "bg-green-900/50 text-green-300 border-green-800" };
  if (r.batchProcessed > 0) return { text: "Partial", color: "bg-orange-900/50 text-orange-300 border-orange-800" };
  return { text: "Pending", color: "bg-yellow-900/50 text-yellow-300 border-yellow-800" };
}

export function PayrollListPage() {
  const { address: payrollAddr } = useParams<{ address: string }>();
  const { publicClient } = useApp();
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicClient || !payrollAddr) return;
    async function load() {
      setLoading(true);
      const count = await publicClient!.readContract({
        address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getRunCount",
      }) as bigint;

      const n = Number(count);
      if (n === 0) { setRuns([]); setLoading(false); return; }

      const results = await Promise.all(
        Array.from({ length: n }, (_, i) =>
          publicClient!.readContract({
            address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getPayrollRun", args: [BigInt(i)],
          })
        )
      );

      const infos: RunInfo[] = results.map((r: any, i) => ({
        id: i,
        employeeCount: Number(r.employeeCount),
        status: Number(r.status),
        createdAt: Number(r.createdAt),
        executedAt: Number(r.executedAt),
        batchProcessed: Number(r.batchProcessed),
      }));

      // Newest first
      setRuns(infos.reverse());
      setLoading(false);
    }
    load();
  }, [publicClient, payrollAddr]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pay Runs</h1>
        <Link to={`/employer/${payrollAddr}/payroll/new`}>
          <Button><Plus className="mr-2 h-4 w-4" /> New Pay Run</Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : runs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CalendarCheck className="h-10 w-10 text-gray-700" />
            <p className="text-gray-400">No pay runs yet</p>
            <p className="max-w-xs text-xs text-gray-600">
              Create your first pay run to start paying employees.
            </p>
            <Link to={`/employer/${payrollAddr}/payroll/new`}>
              <Button><Plus className="mr-2 h-4 w-4" /> New Pay Run</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {runs.map((r) => {
            const label = runLabel(r);
            const date = new Date(r.createdAt * 1000).toLocaleDateString();
            const isPending = r.status === 0;

            return (
              <Link key={r.id} to={`/employer/${payrollAddr}/payroll/${r.id}`}>
                <Card className={`transition hover:border-gray-700 ${isPending ? "border-yellow-900/30" : ""}`}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      <span className="text-lg font-semibold text-gray-400">#{r.id}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 text-sm"><Users className="h-3.5 w-3.5" /> {r.employeeCount} employees</span>
                          <Badge className={`text-xs border ${label.color}`}>{label.text}</Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {date}
                          {r.status === 0 && r.batchProcessed > 0 && (
                            <span className="ml-2 text-orange-400">({r.batchProcessed}/{r.employeeCount} processed)</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isPending && <span className="text-xs text-indigo-400">Continue</span>}
                      <ArrowRight className="h-4 w-4 text-gray-600" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
