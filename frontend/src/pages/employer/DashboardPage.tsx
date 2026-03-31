import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import type { Address } from "viem";
import { formatUnits } from "viem";
import { Users, Percent, Hash, Coins, Plus, AlertTriangle, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PAYROLL_ABI, ERC20_ABI } from "@/utils/contracts";
import { useApp } from "@/contexts/AppContext";
import toast from "react-hot-toast";

export function DashboardPage() {
  const { address: payrollAddr } = useParams<{ address: string }>();
  const { publicClient, walletClient, address } = useApp();

  const [employeeCount, setEmployeeCount] = useState(0);
  const [taxDivisor, setTaxDivisor] = useState(0);
  const [runCount, setRunCount] = useState(0);
  const [poolBalance, setPoolBalance] = useState(0n);
  const [tokenSymbol, setTokenSymbol] = useState("ERC20");
  const [tokenAddr, setTokenAddr] = useState<Address>("0x");
  const [tokenDecimals, setTokenDecimals] = useState(6);

  // Deposit form
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);

  async function loadData() {
    if (!publicClient || !payrollAddr) return;
    const [count, divisor, runs, pool, token] = await Promise.all([
      publicClient.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getEmployeeCount" }),
      publicClient.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "taxDivisor" }),
      publicClient.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getRunCount" }),
      publicClient.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getPoolBalance" }),
      publicClient.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "payToken" }),
    ]);
    setEmployeeCount(Number(count));
    setTaxDivisor(Number(divisor));
    setRunCount(Number(runs));
    setPoolBalance(pool as bigint);
    setTokenAddr(token as Address);

    try {
      const [sym, dec] = await Promise.all([
        publicClient.readContract({ address: token as Address, abi: ERC20_ABI, functionName: "symbol" }),
        publicClient.readContract({ address: token as Address, abi: ERC20_ABI, functionName: "decimals" }),
      ]);
      setTokenSymbol(sym as string);
      setTokenDecimals(Number(dec));
    } catch { /* fallback */ }
  }

  useEffect(() => { loadData(); }, [publicClient, payrollAddr]);

  async function handleDeposit() {
    if (!walletClient || !address || !payrollAddr || !depositAmount) return;
    setDepositing(true);
    try {
      const amount = BigInt(Math.round(parseFloat(depositAmount) * 10 ** tokenDecimals));

      toast("Approving token transfer...");
      let hash = await walletClient.writeContract({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [payrollAddr as Address, amount],
        account: address,
        chain: walletClient.chain,
      });
      await publicClient!.waitForTransactionReceipt({ hash });

      toast("Depositing...");
      hash = await walletClient.writeContract({
        address: payrollAddr as Address,
        abi: PAYROLL_ABI,
        functionName: "deposit",
        args: [amount],
        account: address,
        chain: walletClient.chain,
      });
      await publicClient!.waitForTransactionReceipt({ hash });

      toast.success(`Deposited ${depositAmount} ${tokenSymbol}!`);
      setDepositAmount("");
      loadData();
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || "Deposit failed");
    } finally {
      setDepositing(false);
    }
  }

  const taxPercent = taxDivisor > 0 ? Math.round(100 / taxDivisor) : 0;
  const poolDisplay = formatUnits(poolBalance, tokenDecimals);
  const isLowBalance = poolBalance === 0n && employeeCount > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/employer"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold">Payroll Dashboard</h1>
        <Badge>{tokenSymbol}</Badge>
      </div>

      <p className="font-mono text-xs text-gray-500">{payrollAddr}</p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={<Users />} label="Employees" value={String(employeeCount)} />
        <StatCard icon={<Percent />} label="Tax Rate" value={`${taxPercent}%`} />
        <StatCard icon={<Hash />} label="Payroll Runs" value={String(runCount)} />
        <Card className={isLowBalance ? "border-red-900/50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-gray-400">Pool ({tokenSymbol})</CardTitle>
            <Coins className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <p className={`text-lg font-semibold ${isLowBalance ? "text-red-400" : ""}`}>{poolDisplay}</p>
          </CardContent>
        </Card>
      </div>

      {/* Low balance warning */}
      {isLowBalance && (
        <Card className="border-red-900/50 bg-red-950/20">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <p className="text-sm text-red-300">
              Pool balance is empty. Deposit {tokenSymbol} before running payroll.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Deposit */}
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-5 w-5 text-green-400" /> Deposit {tokenSymbol}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="number"
              step="0.01"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder={`Amount (${tokenSymbol})`}
            />
            <Button onClick={handleDeposit} disabled={depositing || !depositAmount} variant="success">
              {depositing ? "..." : "Deposit"}
            </Button>
          </div>
          <p className="text-xs text-gray-600">Approve + deposit in two transactions. Tokens are locked in the payroll contract.</p>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Link to={`/employer/${payrollAddr}/employees`}><Button>Manage Employees</Button></Link>
        <Link to={`/employer/${payrollAddr}/payroll`}><Button variant="success">Monthly Payroll</Button></Link>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-gray-400">{label}</CardTitle>
        <span className="h-4 w-4 text-gray-500">{icon}</span>
      </CardHeader>
      <CardContent><p className="text-lg font-semibold">{value}</p></CardContent>
    </Card>
  );
}
