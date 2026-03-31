import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Address, Hex } from 'viem';
import { toHex } from 'viem';
import { UserPlus, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PAYROLL_ABI } from '@/utils/contracts';
import { useApp } from '@/contexts/AppContext';
import toast from 'react-hot-toast';
import { encryptUint64 } from '@/utils/fhevm';

export function EmployeesPage() {
  const { address: payrollAddr } = useParams<{ address: string }>();
  const { walletClient, publicClient, address, chainId } = useApp();
  const [empAddress, setEmpAddress] = useState('');
  const [salary, setSalary] = useState('');
  const [step, setStep] = useState<'idle' | 'encrypting' | 'sending'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletClient || !publicClient || !address || !payrollAddr) return;

    try {
      // Step 1: Encrypt salary
      setStep('encrypting');
      toast('Initializing FHE encryption...');
      const salaryValue = BigInt(Math.round(parseFloat(salary) * 1e6));
      const { handles, inputProof } = await encryptUint64(payrollAddr!, address, salaryValue, walletClient, chainId);

      // Step 2: Send transaction
      setStep('sending');
      toast('Sending transaction...');
      const hash = await walletClient.writeContract({
        address: payrollAddr as Address,
        abi: PAYROLL_ABI,
        functionName: 'addEmployee',
        args: [empAddress as Address, toHex(handles[0]) as Hex, toHex(inputProof) as Hex],
        account: address as Address,
        chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success(`Employee added! TX: ${hash.slice(0, 10)}...`);
      setEmpAddress('');
      setSalary('');
    } catch (err: any) {
      console.error('[addEmployee]', err);
      toast.error(err.shortMessage || err.message || 'Transaction failed');
    } finally {
      setStep('idle');
    }
  }

  const loading = step !== 'idle';
  const buttonText =
    step === 'encrypting' ? 'Encrypting salary...' : step === 'sending' ? 'Sending TX...' : 'Add Employee';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/employer/${payrollAddr}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Manage Employees</h1>
      </div>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Add Employee
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm text-gray-400">Employee Address</label>
              <Input value={empAddress} onChange={(e) => setEmpAddress(e.target.value)} placeholder="0x..." />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-gray-400">Monthly Salary</label>
              <Input
                type="number"
                step="0.01"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="5000.00"
              />
            </div>
            <Button type="submit" disabled={loading || !empAddress || !salary} className="w-full">
              {buttonText}
            </Button>
            {step === 'encrypting' && (
              <p className="text-xs text-gray-500">
                Loading FHE WASM modules and encrypting salary. This may take a moment on first use...
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
