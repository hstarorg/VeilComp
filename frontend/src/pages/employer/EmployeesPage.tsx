import { useState } from "react";
import type { WalletClient, Address, Hex } from "viem";
import { toHex } from "viem";
import { UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ADDRESSES, PAYROLL_ABI } from "@/utils/contracts";
import { encryptUint64 } from "@/utils/fhevm";
import toast from "react-hot-toast";

interface Props {
  walletClient: WalletClient | null;
  address: Address | "";
}

export function EmployeesPage({ walletClient, address }: Props) {
  const [empAddress, setEmpAddress] = useState("");
  const [salary, setSalary] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletClient || !address) return;

    setLoading(true);
    try {
      const salaryValue = BigInt(Math.round(parseFloat(salary) * 1e6));
      const { handles, inputProof } = await encryptUint64(ADDRESSES.payroll, address, salaryValue);
      const handleHex = toHex(handles[0]) as Hex;
      const proofHex = toHex(inputProof) as Hex;

      const hash = await walletClient.writeContract({
        address: ADDRESSES.payroll,
        abi: PAYROLL_ABI,
        functionName: "addEmployee",
        args: [empAddress as Address, handleHex, proofHex],
        account: address as Address,
        chain: walletClient.chain,
      });

      toast.success(`Employee added! TX: ${hash.slice(0, 10)}...`);
      setEmpAddress("");
      setSalary("");
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Manage Employees</h1>
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
              <label className="mb-1.5 block text-sm text-gray-400">Monthly Salary (USDT)</label>
              <Input type="number" step="0.01" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="5000.00" />
            </div>
            <Button type="submit" disabled={loading || !empAddress || !salary} className="w-full">
              {loading ? "Encrypting & Sending..." : "Add Employee"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
