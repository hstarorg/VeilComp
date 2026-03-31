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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold">Salary Details</h1>
      </div>

      <div className="flex items-center gap-3 text-sm text-gray-400">
        <Building2 className="h-4 w-4" />
        <span className="font-mono">{employerAddr.slice(0, 8)}...{employerAddr.slice(-6)}</span>
        <Badge>{tokenSymbol}</Badge>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 items-stretch">
        <div className="flex flex-col gap-4">
          <Card className="flex-1 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">Monthly Salary</CardTitle>
              <DollarSign className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent className="flex-1 flex items-center text-xl">
              <EncryptedValue handle={salaryHandle} contractAddress={payrollAddr as string} onDecrypt={onDecrypt} />
            </CardContent>
          </Card>

          <Card className="flex-1 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">Withdrawable Balance</CardTitle>
              <Wallet className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between text-xl">
              <EncryptedValue handle={balanceHandle} contractAddress={payrollAddr as string} onDecrypt={onDecrypt} />
              <p className="text-xs text-gray-600 mt-4">All values are FHE-encrypted on chain. Only you can decrypt your own data.</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowDownToLine className="h-5 w-5 text-green-400" /> Withdraw {tokenSymbol}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-400">Enter the amount to withdraw to your wallet. The Gateway will verify your encrypted balance and transfer tokens automatically.</p>
            <div>
              <label className="mb-1.5 block text-xs text-gray-500">Amount ({tokenSymbol})</label>
              <Input type="number" step="0.01" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="0.00" />
            </div>
            <Button onClick={handleWithdraw} disabled={withdrawStep !== "idle" || !withdrawAmount} variant="success" className="w-full">
              {withdrawStep === "requesting" ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Requesting</>
                : withdrawStep === "decrypting" ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Decrypting</>
                : withdrawStep === "fulfilling" ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Transferring</>
                : `Withdraw ${tokenSymbol}`}
            </Button>
            {withdrawStep !== "idle" && (
              <p className="text-xs text-indigo-400">
                {withdrawStep === "requesting" && "Submitting request to contract..."}
                {withdrawStep === "decrypting" && "Waiting for relayer to decrypt balance check..."}
                {withdrawStep === "fulfilling" && "Verifying and transferring tokens..."}
              </p>
            )}
            <p className="text-xs text-gray-600">Three-step process: request, decrypt verification, transfer tokens.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
