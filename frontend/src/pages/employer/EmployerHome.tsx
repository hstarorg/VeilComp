import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { Address } from "viem";
import { Building2, Plus, ArrowRight, Rocket } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/contexts/AppContext";
import { FACTORY_ADDRESS, FACTORY_ABI, PAYROLL_ABI, ERC20_ABI } from "@/utils/contracts";
import type { PayrollInfo } from "@/types";

export function EmployerHome() {
  const { publicClient, address } = useApp();
  const [payrolls, setPayrolls] = useState<PayrollInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicClient || !address || !FACTORY_ADDRESS) {
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const addrs = await publicClient!.readContract({
          address: FACTORY_ADDRESS,
          abi: FACTORY_ABI,
          functionName: "getEmployerPayrolls",
          args: [address as Address],
        }) as `0x${string}`[];

        const infos: PayrollInfo[] = await Promise.all(
          addrs.map(async (addr) => {
            const tokenAddr = await publicClient!.readContract({ address: addr, abi: PAYROLL_ABI, functionName: "payToken" });
            let tokenSymbol = "ERC20";
            try {
              tokenSymbol = await publicClient!.readContract({ address: tokenAddr as Address, abi: ERC20_ABI, functionName: "symbol" }) as string;
            } catch { /* fallback */ }

            return {
              address: addr,
              payToken: tokenAddr as `0x${string}`,
              employer: address as `0x${string}`,
              tokenSymbol,
            };
          })
        );

        setPayrolls(infos);
      } catch {
        setPayrolls([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [publicClient, address]);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Contracts</h1>
        <Link to="/employer/deploy">
          <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New Contract</Button>
        </Link>
      </div>

      {payrolls.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <Rocket className="h-10 w-10 text-indigo-400/50" />
            <div>
              <p className="text-gray-400">No contracts yet</p>
              <p className="mt-1 max-w-xs text-xs text-gray-600">
                Deploy your first contract to start paying your team confidentially.
              </p>
            </div>
            <Link to="/employer/deploy">
              <Button>Deploy Contract</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {payrolls.map((p) => (
            <Link key={p.address} to={`/employer/${p.address}`}>
              <Card className="transition hover:border-gray-700">
                <CardContent className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-4">
                    <Building2 className="h-8 w-8 text-indigo-400/70" />
                    <div>
                      <p className="text-sm font-medium font-mono">
                        {p.address.slice(0, 6)}...{p.address.slice(-4)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge>{p.tokenSymbol}</Badge>
                    <ArrowRight className="h-4 w-4 text-gray-600" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
