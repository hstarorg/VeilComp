import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import type { Address } from "viem";
import { ArrowLeft, DollarSign, Wallet, Building2, ArrowDownToLine, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EncryptedValue } from "@/components/common/EncryptedValue";
import { PAYROLL_ABI } from "@/utils/contracts";
import { requestAndFulfillWithdraw, getTokenInfo } from "@/services/payroll";
import { useApp } from "@/contexts/AppContext";
import toast from "react-hot-toast";

export function CompensationPage() {
  const { address: payrollAddr } = useParams<{ address: string }>();
  const { publicClient, walletClient, address, chainId, onDecrypt } = useApp();

  const [employerAddr, setEmployerAddr] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("ERC20");
  const [tokenDecimals, setTokenDecimals] = useState(6);
  const [salaryHandle, setSalaryHandle] = useState("");
  const [balanceHandle, setBalanceHandle] = useState("");
  const [loading, setLoading] = useState(true);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawStep, setWithdrawStep] = useState<"idle" | "requesting" | "decrypting" | "fulfilling">("idle");

  async function loadData() {
    if (!publicClient || !address || !payrollAddr) return;
    setLoading(true);
    try {
      const [employer, tokenAddr, salary, balance] = await Promise.all([
        publicClient.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "employer" }),
        publicClient.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "payToken" }),
        publicClient.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getMySalary", account: address }),
        publicClient.readContract({ blockTag: "latest", address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "getMyBalance", account: address }),
      ]);
      setEmployerAddr(employer as string);
      setSalaryHandle(salary as string);
      setBalanceHandle(balance as string);
      const token = await getTokenInfo(publicClient, tokenAddr as Address);
      setTokenSymbol(token.symbol);
      setTokenDecimals(token.decimals);
    } catch { /* not an employee */ }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [publicClient, address, payrollAddr]);

  async function handleWithdraw() {
    if (!walletClient || !publicClient || !address || !payrollAddr || !withdrawAmount) return;
    try {
      const amount = BigInt(Math.round(parseFloat(withdrawAmount) * 10 ** tokenDecimals));
      await requestAndFulfillWithdraw(
        walletClient, publicClient, payrollAddr as Address, amount, chainId,
        (step) => {
          setWithdrawStep(step);
          if (step === "requesting") toast("Submitting withdraw request...");
          if (step === "decrypting") toast("Waiting for decryption...");
          if (step === "fulfilling") toast("Completing withdrawal...");
        },
      );
      toast.success(`${withdrawAmount} ${tokenSymbol} withdrawn to your wallet!`);
      setWithdrawAmount("");
      await loadData();
    } catch (err: unknown) {
      console.error("[withdraw]", err);
      toast.error((err as { shortMessage?: string }).shortMessage || (err as Error).message || "Withdraw failed");
    } finally {
      setWithdrawStep("idle");
    }
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  const stepLabels = {
    requesting: { text: "Requesting", hint: "Submitting request to contract..." },
    decrypting: { text: "Decrypting", hint: "Waiting for relayer to verify balance..." },
    fulfilling: { text: "Transferring", hint: "Verifying proof and transferring tokens..." },
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link to="/"><Button variant="ghost" size="sm" className="transition-colors duration-200"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold tracking-tight">Salary Details</h1>
      </div>

      <div className="flex items-center gap-3 text-sm text-gray-400">
        <Building2 className="h-4 w-4 text-gray-600" />
        <span className="font-mono text-gray-500">{employerAddr.slice(0, 8)}...{employerAddr.slice(-6)}</span>
        <Badge className="bg-gray-800/60 text-gray-400 border-gray-700/50">{tokenSymbol}</Badge>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 items-stretch">
        {/* Left: Info cards */}
        <div className="flex flex-col gap-4">
          <Card className="flex-1 flex flex-col transition-colors duration-200 hover:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">Monthly Salary</CardTitle>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10">
                <DollarSign className="h-3.5 w-3.5 text-indigo-400" />
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex items-center text-xl">
              <EncryptedValue handle={salaryHandle} contractAddress={payrollAddr as string} onDecrypt={onDecrypt} />
            </CardContent>
          </Card>

          <Card className="flex-1 flex flex-col transition-colors duration-200 hover:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">Withdrawable Balance</CardTitle>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-500/10">
                <Wallet className="h-3.5 w-3.5 text-green-400" />
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between text-xl">
              <EncryptedValue handle={balanceHandle} contractAddress={payrollAddr as string} onDecrypt={onDecrypt} />
              <p className="text-xs text-gray-600 mt-4">All values are FHE-encrypted. Only you can decrypt your data.</p>
            </CardContent>
          </Card>
        </div>

        {/* Right: Withdraw */}
        <Card className="border-gray-800/60 transition-colors duration-200 hover:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-500/10">
                <ArrowDownToLine className="h-4 w-4 text-green-400" />
              </div>
              Withdraw {tokenSymbol}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-400 leading-relaxed">
              Enter the amount to withdraw. The Gateway verifies your encrypted balance and transfers tokens to your wallet.
            </p>
            <div>
              <label className="mb-1.5 block text-xs text-gray-500 font-medium">Amount ({tokenSymbol})</label>
              <Input type="number" step="0.01" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="0.00" className="bg-gray-900/50 border-gray-800 focus:border-indigo-600 transition-colors" />
            </div>
            <Button onClick={handleWithdraw} disabled={withdrawStep !== "idle" || !withdrawAmount} variant="success" className="w-full transition-all duration-200">
              {withdrawStep !== "idle"
                ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> {stepLabels[withdrawStep].text}</>
                : `Withdraw ${tokenSymbol}`}
            </Button>
            {withdrawStep !== "idle" && (
              <div className="flex items-center gap-2 rounded-lg bg-indigo-500/5 border border-indigo-500/10 px-3 py-2">
                <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                <p className="text-xs text-indigo-400">{stepLabels[withdrawStep].hint}</p>
              </div>
            )}
            <p className="text-[11px] text-gray-600">Three steps: request, decrypt verification, transfer.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
