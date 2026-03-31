import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { Address } from "viem";
import { Shield, Lock, DollarSign, CalendarCheck, Building2, ArrowRight, Briefcase } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/contexts/AppContext";
import { FACTORY_ADDRESS, FACTORY_ABI, PAYROLL_ABI, ERC20_ABI } from "@/utils/contracts";
import type { PayrollInfo } from "@/types";

export function HomePage() {
  const { isConnected } = useApp();

  if (!isConnected) return <Landing />;
  return <EmployeeHome />;
}

// ─── Landing ────────────────────────────────────────

function Landing() {
  return (
    <div className="flex flex-col items-center pt-16">
      <div className="flex items-center gap-3 mb-4">
        <Shield className="h-10 w-10 text-indigo-400" />
        <h1 className="text-4xl font-bold">VeilComp</h1>
      </div>
      <p className="mb-2 text-lg text-gray-400">Confidential Compensation Protocol</p>
      <p className="mb-10 max-w-md text-center text-sm text-gray-500">
        Pay salaries on public blockchains with full privacy. All compensation data stays encrypted using Fully Homomorphic Encryption.
      </p>
      <div className="mb-10 grid w-full max-w-2xl grid-cols-3 gap-4">
        <FeatureCard icon={<Lock className="h-5 w-5 text-indigo-400" />} title="Encrypted Salaries" desc="Individual pay is FHE-encrypted. Only the employee can view their own." />
        <FeatureCard icon={<DollarSign className="h-5 w-5 text-green-400" />} title="Multi-Token" desc="Pay in USDT, USDC, or any ERC-20. One payroll per token." />
        <FeatureCard icon={<CalendarCheck className="h-5 w-5 text-yellow-400" />} title="Monthly Payroll" desc="Create runs, select employees, execute in batches — full lifecycle control." />
      </div>
      <p className="text-sm text-gray-400">Connect your wallet above to get started</p>
      <p className="mt-4 text-xs text-gray-600">Sepolia Testnet · Powered by Zama fhEVM</p>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Card className="text-center">
      <CardContent className="flex flex-col items-center gap-2 p-5">
        {icon}
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-gray-500">{desc}</p>
      </CardContent>
    </Card>
  );
}

// ─── Employee Home — my payrolls list ──────────────

function EmployeeHome() {
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
          functionName: "getMyPayrolls",
          account: address as Address,
        }) as `0x${string}`[];

        const infos: PayrollInfo[] = await Promise.all(
          addrs.map(async (addr) => {
            const [employerAddr, tokenAddr] = await Promise.all([
              publicClient!.readContract({ address: addr, abi: PAYROLL_ABI, functionName: "employer" }),
              publicClient!.readContract({ address: addr, abi: PAYROLL_ABI, functionName: "payToken" }),
            ]);

            let tokenSymbol = "ERC20";
            try {
              tokenSymbol = await publicClient!.readContract({
                address: tokenAddr as `0x${string}`,
                abi: ERC20_ABI,
                functionName: "symbol",
              }) as string;
            } catch { /* fallback */ }

            return {
              address: addr,
              payToken: tokenAddr as `0x${string}`,
              employer: employerAddr as `0x${string}`,
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
      <h1 className="text-2xl font-bold">My Compensation</h1>

      {payrolls.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Briefcase className="h-10 w-10 text-gray-700" />
            <p className="text-gray-400">No companies found</p>
            <p className="max-w-xs text-xs text-gray-600">
              Ask your employer to add your wallet address to their payroll contract.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {payrolls.map((p) => (
            <Link key={p.address} to={`/company/${p.address}`}>
              <Card className="transition hover:border-gray-700">
                <CardContent className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-4">
                    <Building2 className="h-8 w-8 text-indigo-400/70" />
                    <div>
                      <p className="text-sm font-medium font-mono">
                        {p.employer.slice(0, 6)}...{p.employer.slice(-4)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Payroll: {p.address.slice(0, 6)}...{p.address.slice(-4)}
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
