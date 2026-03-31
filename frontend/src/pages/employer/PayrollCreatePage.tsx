import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import type { Address } from "viem";
import { ArrowLeft, ListChecks, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PAYROLL_ABI } from "@/utils/contracts";
import { useApp } from "@/contexts/AppContext";
import toast from "react-hot-toast";

export function PayrollCreatePage() {
  const { address: payrollAddr } = useParams<{ address: string }>();
  const { walletClient, publicClient, address } = useApp();
  const navigate = useNavigate();

  const [employees, setEmployees] = useState<Address[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!publicClient || !payrollAddr) return;
    async function load() {
      const list = await publicClient!.readContract({
        address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getEmployeeList", account: address,
      }) as Address[];
      setEmployees(list);
      setSelected(new Set(list)); // default: all selected
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
    if (selected.size === employees.length) setSelected(new Set());
    else setSelected(new Set(employees));
  }

  const selectedList = employees.filter((e) => selected.has(e));

  async function handleCreate() {
    if (!walletClient || !publicClient || !address || !payrollAddr || selectedList.length === 0) return;
    setCreating(true);
    try {
      // Read current run count to determine the new runId
      const count = await publicClient.readContract({
        address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getRunCount",
      }) as bigint;

      toast("Confirming employee selection...");
      const hash = await walletClient.writeContract({
        address: payrollAddr as Address,
        abi: PAYROLL_ABI,
        functionName: "createPayrollRun",
        args: [selectedList],
        account: address as Address,
        chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      toast.success(`Payroll #${count} created. Now deposit funds to continue.`);
      navigate(`/employer/${payrollAddr}/payroll/${count}`);
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || "Failed to create payroll");
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/employer/${payrollAddr}/payroll`}><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold">New Payroll</h1>
      </div>

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
                    disabled={creating}
                  />
                  <span className="font-mono text-sm text-gray-300">{emp}</span>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        onClick={handleCreate}
        disabled={creating || selectedList.length === 0}
        className="w-full max-w-md"
      >
        {creating
          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirming...</>
          : `Confirm ${selectedList.length} Employees`}
      </Button>
    </div>
  );
}
