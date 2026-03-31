import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Shield, Lock, DollarSign, CalendarCheck, Building2, Briefcase, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EncryptedValue } from "@/components/common/EncryptedValue";
import { useApp } from "@/contexts/AppContext";
import { getEmployeePayrolls } from "@/services/factory";

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

// ─── Employee Home ──────────────────────────────────

function EmployeeHome() {
  const { publicClient, address, onDecrypt } = useApp();
  const [payrolls, setPayrolls] = useState<Awaited<ReturnType<typeof getEmployeePayrolls>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicClient || !address) { setLoading(false); return; }
    setLoading(true);
    getEmployeePayrolls(publicClient, address)
      .then(setPayrolls)
      .catch(() => setPayrolls([]))
      .finally(() => setLoading(false));
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
            <p className="max-w-xs text-xs text-gray-600">Ask your employer to add your wallet address to their payroll contract.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {payrolls.map((p) => (
            <Card key={p.address} className="transition hover:border-gray-700">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-3">
                  <Building2 className="h-6 w-6 text-indigo-400/70" />
                  <div>
                    <CardTitle className="text-sm font-mono">{p.employer.slice(0, 6)}...{p.employer.slice(-4)}</CardTitle>
                    <p className="text-xs text-gray-500 mt-0.5">{p.address.slice(0, 6)}...{p.address.slice(-4)}</p>
                  </div>
                </div>
                <Badge>{p.tokenSymbol}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-gray-800/40 p-3">
                    <p className="flex items-center gap-1.5 text-xs text-gray-500 mb-1"><DollarSign className="h-3 w-3" /> Monthly Salary</p>
                    <EncryptedValue handle={p.salaryHandle} contractAddress={p.address} onDecrypt={onDecrypt} />
                  </div>
                  <div className="rounded-lg bg-gray-800/40 p-3">
                    <p className="flex items-center gap-1.5 text-xs text-gray-500 mb-1"><Wallet className="h-3 w-3" /> Balance</p>
                    <EncryptedValue handle={p.balanceHandle} contractAddress={p.address} onDecrypt={onDecrypt} />
                  </div>
                </div>
                <Link to={`/company/${p.address}`}>
                  <Button variant="ghost" size="sm" className="w-full text-xs text-gray-400 hover:text-gray-200">View Details</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
