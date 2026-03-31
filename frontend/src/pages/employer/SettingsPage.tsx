import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import type { Address } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PAYROLL_ABI } from "@/utils/contracts";
import { getTokenInfo, type TokenInfo } from "@/services/payroll";
import { useApp } from "@/contexts/AppContext";

export function SettingsPage() {
  const { address: payrollAddr } = useParams<{ address: string }>();
  const { publicClient } = useApp();

  const [employer, setEmployer] = useState("");
  const [token, setToken] = useState<TokenInfo | null>(null);

  useEffect(() => {
    if (!publicClient || !payrollAddr) return;
    async function load() {
      const [emp, tokenAddr] = await Promise.all([
        publicClient!.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "employer" }),
        publicClient!.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "payToken" }),
      ]);
      setEmployer(emp as string);
      setToken(await getTokenInfo(publicClient!, tokenAddr as Address));
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
          {token && <InfoRow label="Pay Token" value={`${token.symbol} (${token.address.slice(0, 8)}...${token.address.slice(-6)})`} />}
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
