import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import type { Address } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PAYROLL_ABI, ERC20_ABI } from "@/utils/contracts";
import { useApp } from "@/contexts/AppContext";

export function SettingsPage() {
  const { address: payrollAddr } = useParams<{ address: string }>();
  const { publicClient } = useApp();

  const [employer, setEmployer] = useState("");
  const [tokenAddr, setTokenAddr] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("ERC20");

  useEffect(() => {
    if (!publicClient || !payrollAddr) return;
    async function load() {
      const [emp, token] = await Promise.all([
        publicClient!.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "employer" }),
        publicClient!.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "payToken" }),
      ]);
      setEmployer(emp as string);
      setTokenAddr(token as string);
      try {
        const sym = await publicClient!.readContract({ address: token as Address, abi: ERC20_ABI, functionName: "symbol" });
        setTokenSymbol(sym as string);
      } catch {}
    }
    load();
  }, [publicClient, payrollAddr]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader><CardTitle className="text-sm text-gray-400">Contract Info</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <InfoRow label="Contract" value={payrollAddr ?? ""} />
          <InfoRow label="Employer" value={employer} />
          <InfoRow label="Pay Token" value={`${tokenSymbol} (${tokenAddr.slice(0, 8)}...${tokenAddr.slice(-6)})`} />
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono text-gray-300 text-xs">{value}</span>
    </div>
  );
}
