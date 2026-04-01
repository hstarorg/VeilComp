import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Address } from "viem";
import { keccak256, encodePacked, parseEventLogs } from "viem";
import { Rocket, Check, Loader2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/AppContext";
import { FACTORY_ADDRESS, FACTORY_ABI } from "@/utils/contracts";
import toast from "react-hot-toast";

type Step = "idle" | "simulating" | "deploying" | "done";

export function DeployPage() {
  const { walletClient, publicClient, address } = useApp();
  const navigate = useNavigate();

  const [tokenAddress, setTokenAddress] = useState("0xa2F47b34de37aeAca14488Cb28dBF8Cb6eFaB869");
  const [step, setStep] = useState<Step>("idle");
  const [payrollAddr, setPayrollAddr] = useState("");
  const [error, setError] = useState("");

  async function handleDeploy() {
    if (!walletClient || !publicClient || !address || !tokenAddress) return;
    setError("");

    const salt = keccak256(
      encodePacked(["address", "uint256"], [address as Address, BigInt(Date.now())])
    );

    const callArgs = {
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: "createPayroll" as const,
      args: [salt, tokenAddress as Address] as const,
      account: address,
    };

    // Step 1: Simulate to catch errors before sending to wallet
    setStep("simulating");
    try {
      await publicClient.simulateContract(callArgs);
    } catch (err: any) {
      const msg = err.shortMessage || err.message || "Simulation failed";
      setError(`Pre-check failed: ${msg}`);
      setStep("idle");
      return;
    }

    // Step 2: Send the actual transaction
    setStep("deploying");
    try {
      const hash = await walletClient.writeContract({
        ...callArgs,
        chain: walletClient.chain,
        gas: 5_000_000n, // explicit gas limit — create2 deploys a full contract
      });

      toast("Transaction sent, waiting for confirmation...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Parse PayrollCreated event to get the deployed address
      const logs = parseEventLogs({
        abi: FACTORY_ABI,
        logs: receipt.logs,
        eventName: "PayrollCreated",
      });

      if (logs.length > 0) {
        const deployed = logs[0].args.payroll as `0x${string}`;
        setPayrollAddr(deployed);
      } else {
        // Fallback: read from factory
        const payrolls = await publicClient.readContract({
          address: FACTORY_ADDRESS,
          abi: FACTORY_ABI,
          functionName: "getEmployerPayrolls",
          args: [address as Address],
        }) as `0x${string}`[];
        setPayrollAddr(payrolls[payrolls.length - 1]);
      }

      setStep("done");
    } catch (err: any) {
      setError(err.shortMessage || err.message || "Deployment failed");
      setStep("idle");
    }
  }

  return (
    <div className="flex flex-col items-center pt-8">
      <h1 className="mb-2 text-2xl font-bold">Create Company Payroll</h1>
      <p className="mb-8 text-sm text-gray-400">Deploy a dedicated payroll contract for your company. One contract per token.</p>

      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Rocket className="h-5 w-5 text-indigo-400" /> New Company Payroll</CardTitle>
          <CardDescription>Choose the ERC-20 token your company will use to pay salaries</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">Payment Token Address</label>
            <Input
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              placeholder="0x... (USDT, USDC, or deploy a Mock Token first)"
              disabled={step !== "idle"}
            />
            <p className="mt-1 text-xs text-gray-600">This cannot be changed after deployment. Deploy a Mock Token at /mock if testing.</p>
          </div>

          {!FACTORY_ADDRESS && (
            <p className="text-sm text-yellow-400">
              VeilFactory address not configured. Set VITE_FACTORY_ADDRESS in .env first.
            </p>
          )}

          {step === "simulating" && (
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Simulating transaction...</span>
            </div>
          )}

          {step === "deploying" && (
            <div className="flex items-center gap-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
              <span>Confirm in wallet, then waiting for block...</span>
            </div>
          )}

          {step === "done" && payrollAddr && (
            <div className="space-y-2 rounded-lg bg-green-950/30 border border-green-900/50 p-3 text-sm">
              <div className="flex items-center gap-2 text-green-400">
                <Check className="h-4 w-4" /> Deployed successfully
              </div>
              <p className="font-mono text-xs text-gray-300">{payrollAddr}</p>
              <button
                onClick={() => { navigator.clipboard.writeText(payrollAddr); toast.success("Copied!"); }}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                Copy address
              </button>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          {step === "idle" && (
            <Button onClick={handleDeploy} disabled={!tokenAddress || !FACTORY_ADDRESS} className="w-full">
              Create Payroll Contract
            </Button>
          )}

          {step === "done" && (
            <Button variant="success" onClick={() => navigate(`/employer/${payrollAddr}`)} className="w-full">
              Manage Payroll <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
