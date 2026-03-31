import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Address } from "viem";
import { ListChecks, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
import { getEmployeeList, createPayrollRun } from "@/services/payroll";
import toast from "react-hot-toast";

export function PayrollCreatePage() {
  const { address: payrollAddr } = useParams<{ address: string }>();
  const { walletClient, publicClient, address } = useApp();
  const navigate = useNavigate();

  const [employees, setEmployees] = useState<Address[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!publicClient || !payrollAddr || !address) return;
    getEmployeeList(publicClient, payrollAddr as Address, address).then((list) => {
      setEmployees(list);
      setSelected(new Set(list));
    });
  }, [publicClient, payrollAddr, address]);

  function toggleEmployee(addr: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(addr) ? next.delete(addr) : next.add(addr); return next; });
  }

  function toggleAll() {
    setSelected(selected.size === employees.length ? new Set() : new Set(employees));
  }

  const selectedList = employees.filter((e) => selected.has(e));

  async function handleCreate() {
    if (!walletClient || !publicClient || !payrollAddr || selectedList.length === 0) return;
    setCreating(true);
    try {
      toast("Confirming employee selection...");
      const runId = await createPayrollRun(walletClient, publicClient, payrollAddr as Address, selectedList);
      toast.success(`Pay run #${runId} created. Now deposit funds to continue.`);
      navigate(`/employer/${payrollAddr}/payroll/${runId}`);
    } catch (err: unknown) {
      toast.error((err as { shortMessage?: string }).shortMessage || (err as Error).message || "Failed to create pay run");
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New Pay Run</h1>

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
                  <input type="checkbox" checked={selected.has(emp)} onChange={() => toggleEmployee(emp)} className="rounded border-gray-600" disabled={creating} />
                  <span className="font-mono text-sm text-gray-300">{emp}</span>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleCreate} disabled={creating || selectedList.length === 0} className="w-full max-w-md">
        {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirming...</> : `Confirm ${selectedList.length} Employees`}
      </Button>
    </div>
  );
}
