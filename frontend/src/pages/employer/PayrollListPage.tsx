import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import type { Address } from "viem";
import { Plus, CalendarCheck, Users, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/contexts/AppContext";
import { getAllRuns, type PayrollRunInfo } from "@/services/payroll";

function runLabel(r: PayrollRunInfo): { text: string; className: string } {
  if (r.status === 1) return { text: "Paid", className: "bg-green-500/10 text-green-400 border-green-500/20" };
  if (r.batchProcessed > 0) return { text: "Partial", className: "bg-orange-500/10 text-orange-400 border-orange-500/20" };
  return { text: "Pending", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" };
}

export function PayrollListPage() {
  const { address: payrollAddr } = useParams<{ address: string }>();
  const { publicClient } = useApp();
  const [runs, setRuns] = useState<PayrollRunInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicClient || !payrollAddr) return;
    setLoading(true);
    getAllRuns(publicClient, payrollAddr as Address)
      .then((r) => setRuns([...r].reverse()))
      .finally(() => setLoading(false));
  }, [publicClient, payrollAddr]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Pay Runs</h1>
        <Link to={`/employer/${payrollAddr}/payroll/new`}>
          <Button className="transition-all duration-200"><Plus className="mr-2 h-4 w-4" /> New Pay Run</Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : runs.length === 0 ? (
        <Card className="border-dashed border-gray-800">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-800/50">
              <CalendarCheck className="h-7 w-7 text-gray-600" />
            </div>
            <div>
              <p className="text-gray-400 font-medium">No pay runs yet</p>
              <p className="max-w-xs text-xs text-gray-600 mt-1">Create your first pay run to start paying employees.</p>
            </div>
            <Link to={`/employer/${payrollAddr}/payroll/new`}>
              <Button><Plus className="mr-2 h-4 w-4" /> New Pay Run</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {runs.map((r) => {
            const label = runLabel(r);
            const date = new Date(r.createdAt * 1000).toLocaleDateString();
            const isPending = r.status === 0;
            return (
              <Link key={r.id} to={`/employer/${payrollAddr}/payroll/${r.id}`}>
                <Card className={`group transition-all duration-200 hover:border-gray-700 hover:bg-gray-900/30 ${isPending ? "border-gray-800/80" : "border-gray-800/40"}`}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-800/60 text-sm font-bold text-gray-400 tabular-nums">
                        {r.id}
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="flex items-center gap-1 text-sm text-gray-300"><Users className="h-3.5 w-3.5 text-gray-500" /> {r.employeeCount} employees</span>
                          <Badge className={`text-[10px] border px-1.5 py-0 ${label.className}`}>{label.text}</Badge>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          {date}
                          {r.status === 0 && r.batchProcessed > 0 && <span className="ml-2 text-orange-400/80">({r.batchProcessed}/{r.employeeCount} processed)</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isPending && <span className="text-xs text-indigo-400/80 font-medium">Continue</span>}
                      <ChevronRight className="h-4 w-4 text-gray-700 group-hover:text-gray-500 transition-colors duration-200" />
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
