import { useState } from "react";
import type { WalletClient, Address } from "viem";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ADDRESSES, PAYROLL_ABI } from "@/utils/contracts";
import toast from "react-hot-toast";

interface Props {
  walletClient: WalletClient | null;
  address: Address | "";
}

export function AuditPage({ walletClient, address }: Props) {
  const [auditorAddr, setAuditorAddr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGrant() {
    if (!walletClient || !address || !auditorAddr) return;
    setLoading(true);
    try {
      const hash = await walletClient.writeContract({
        address: ADDRESSES.payroll, abi: PAYROLL_ABI, functionName: "grantAuditorAccess",
        args: [auditorAddr as Address], account: address as Address, chain: walletClient.chain,
      });
      toast.success(`Auditor granted! TX: ${hash.slice(0, 10)}...`);
      setAuditorAddr("");
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || "Failed");
    } finally { setLoading(false); }
  }

  async function handleRevoke() {
    if (!walletClient || !address || !auditorAddr) return;
    setLoading(true);
    try {
      const hash = await walletClient.writeContract({
        address: ADDRESSES.payroll, abi: PAYROLL_ABI, functionName: "revokeAuditorAccess",
        args: [auditorAddr as Address], account: address as Address, chain: walletClient.chain,
      });
      toast.success(`Auditor revoked! TX: ${hash.slice(0, 10)}...`);
      setAuditorAddr("");
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || "Failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Auditor Management</h1>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Manage Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">Auditor Address</label>
            <Input value={auditorAddr} onChange={(e) => setAuditorAddr(e.target.value)} placeholder="0x..." />
          </div>
          <div className="flex gap-3">
            <Button onClick={handleGrant} disabled={loading || !auditorAddr}>Grant Access</Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={loading || !auditorAddr}>Revoke Access</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
