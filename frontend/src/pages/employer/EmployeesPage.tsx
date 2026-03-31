import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import type { Address, Hex } from 'viem';
import { toHex } from 'viem';
import { UserPlus, Users, Trash2, Loader2, Pencil, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PAYROLL_ABI } from '@/utils/contracts';
import { useApp } from '@/contexts/AppContext';
import toast from 'react-hot-toast';
import { encryptUint64 } from '@/utils/fhevm';

export function EmployeesPage() {
  const { address: payrollAddr } = useParams<{ address: string }>();
  const { walletClient, publicClient, address, chainId } = useApp();

  const [employees, setEmployees] = useState<Address[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  // Add form
  const [empAddress, setEmpAddress] = useState('');
  const [salary, setSalary] = useState('');
  const [step, setStep] = useState<'idle' | 'encrypting' | 'sending'>('idle');

  // Edit salary
  const [editingEmp, setEditingEmp] = useState<string | null>(null);
  const [editSalary, setEditSalary] = useState('');
  const [editStep, setEditStep] = useState<'idle' | 'encrypting' | 'sending'>('idle');

  const loadEmployees = useCallback(async () => {
    if (!publicClient || !payrollAddr || !address) return;
    setLoadingList(true);
    try {
      const list = await publicClient.readContract({
        blockTag: 'latest',
        address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: 'getEmployeeList', account: address,
      }) as Address[];
      setEmployees(list);
    } catch {
      setEmployees([]);
    } finally {
      setLoadingList(false);
    }
  }, [publicClient, payrollAddr, address]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  // ── Add employee ──

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!walletClient || !publicClient || !address || !payrollAddr) return;
    try {
      setStep('encrypting');
      toast('Encrypting salary...');
      const salaryValue = BigInt(Math.round(parseFloat(salary) * 1e6));
      const { handles, inputProof } = await encryptUint64(payrollAddr!, address, salaryValue, walletClient, chainId);

      setStep('sending');
      toast('Sending transaction...');
      const hash = await walletClient.writeContract({
        address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: 'addEmployee',
        args: [empAddress as Address, toHex(handles[0]) as Hex, toHex(inputProof) as Hex],
        account: address as Address, chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success('Employee added!');
      setEmpAddress('');
      setSalary('');
      await loadEmployees();
    } catch (err: any) {
      console.error('[addEmployee]', err);
      toast.error(err.shortMessage || err.message || 'Transaction failed');
    } finally {
      setStep('idle');
    }
  }

  // ── Remove employee ──

  async function handleRemove(emp: Address) {
    if (!walletClient || !publicClient || !address || !payrollAddr) return;
    setRemoving(emp);
    try {
      const hash = await walletClient.writeContract({
        address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: 'removeEmployee',
        args: [emp], account: address as Address, chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success('Employee removed');
      await loadEmployees();
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || 'Remove failed');
    } finally {
      setRemoving(null);
    }
  }

  // ── Update salary ──

  async function handleUpdateSalary(emp: Address) {
    if (!walletClient || !publicClient || !address || !payrollAddr || !editSalary) return;
    try {
      setEditStep('encrypting');
      toast('Encrypting new salary...');
      const salaryValue = BigInt(Math.round(parseFloat(editSalary) * 1e6));
      const { handles, inputProof } = await encryptUint64(payrollAddr!, address, salaryValue, walletClient, chainId);

      setEditStep('sending');
      toast('Updating salary...');
      const hash = await walletClient.writeContract({
        address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: 'updateSalary',
        args: [emp, toHex(handles[0]) as Hex, toHex(inputProof) as Hex],
        account: address as Address, chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success('Salary updated!');
      setEditingEmp(null);
      setEditSalary('');
    } catch (err: any) {
      console.error('[updateSalary]', err);
      toast.error(err.shortMessage || err.message || 'Update failed');
    } finally {
      setEditStep('idle');
    }
  }

  const adding = step !== 'idle';
  const editing = editStep !== 'idle';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Employees</h1>
        <Badge variant="default">{employees.length} total</Badge>
      </div>

      {/* Employee list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm text-gray-400">
            <Users className="h-4 w-4" /> Employee List
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : employees.length === 0 ? (
            <p className="text-sm text-gray-500">No employees yet. Add one below.</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {employees.map((emp, i) => (
                <div key={emp}>
                  <div className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-gray-800/50 group">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 w-5">{i + 1}</span>
                      <span className="font-mono text-sm text-gray-300">{emp}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      <Button
                        variant="ghost" size="sm"
                        className="text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                        disabled={editing || removing === emp}
                        onClick={() => { setEditingEmp(editingEmp === emp ? null : emp); setEditSalary(''); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                        disabled={removing === emp || editing}
                        onClick={() => handleRemove(emp)}
                      >
                        {removing === emp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {/* Inline edit salary */}
                  {editingEmp === emp && (
                    <div className="flex items-center gap-2 px-3 py-2 ml-8">
                      <Input
                        type="number" step="0.01"
                        value={editSalary}
                        onChange={(e) => setEditSalary(e.target.value)}
                        placeholder="New salary"
                        className="w-40 h-8 text-sm"
                        disabled={editing}
                        autoFocus
                      />
                      <Button
                        size="sm" variant="ghost"
                        className="h-8 w-8 p-0 text-green-400 hover:text-green-300"
                        disabled={editing || !editSalary}
                        onClick={() => handleUpdateSalary(emp)}
                      >
                        {editing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="h-8 w-8 p-0 text-gray-500 hover:text-gray-300"
                        disabled={editing}
                        onClick={() => { setEditingEmp(null); setEditSalary(''); }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      {editStep === 'encrypting' && <span className="text-xs text-gray-500">Encrypting...</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add employee — inline row */}
      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <Input value={empAddress} onChange={(e) => setEmpAddress(e.target.value)} placeholder="Employee address (0x...)" className="flex-1" />
        <Input type="number" step="0.01" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="Salary" className="w-32" />
        <Button type="submit" disabled={adding || !empAddress || !salary} size="sm">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="mr-1.5 h-4 w-4" /> Add</>}
        </Button>
      </form>
      {step === 'encrypting' && (
        <p className="text-xs text-gray-500">Encrypting salary with FHE. This may take a moment on first use...</p>
      )}
    </div>
  );
}
