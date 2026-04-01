import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Building2, Plus, ChevronRight, Rocket } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/contexts/AppContext";
import { getEmployerPayrolls, type PayrollInfo } from "@/services/factory";

export function EmployerHome() {
  const { publicClient, address } = useApp();
  const [payrolls, setPayrolls] = useState<PayrollInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicClient || !address) { setLoading(false); return; }
    setLoading(true);
    getEmployerPayrolls(publicClient, address)
      .then(setPayrolls)
      .catch(() => setPayrolls([]))
      .finally(() => setLoading(false));
  }, [publicClient, address]);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">My Company Payrolls</h1>
        <Link to="/employer/deploy">
          <Button size="sm" className="transition-all duration-200"><Plus className="mr-1 h-4 w-4" /> New Company Payroll</Button>
        </Link>
      </div>

      {payrolls.length === 0 ? (
        <Card className="border-dashed border-gray-800">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/10">
              <Rocket className="h-7 w-7 text-indigo-400/60" />
            </div>
            <div>
              <p className="text-gray-400 font-medium">No company payroll yet</p>
              <p className="mt-1 max-w-xs text-xs text-gray-600">Create your first company payroll contract to start paying your team confidentially.</p>
            </div>
            <Link to="/employer/deploy"><Button className="transition-all duration-200">Create Company Payroll</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {payrolls.map((p) => (
            <Link key={p.address} to={`/employer/${p.address}`}>
              <Card className="group transition-all duration-200 hover:border-gray-700 hover:bg-gray-900/30">
                <CardContent className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10">
                      <Building2 className="h-5 w-5 text-indigo-400/70" />
                    </div>
                    <div>
                      <p className="text-sm font-medium font-mono text-gray-200">{p.address.slice(0, 6)}...{p.address.slice(-4)}</p>
                      <p className="text-xs text-gray-600 mt-0.5">Token: {p.tokenSymbol}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className="bg-gray-800/60 text-gray-400 border-gray-700/50">{p.tokenSymbol}</Badge>
                    <ChevronRight className="h-4 w-4 text-gray-700 group-hover:text-gray-500 transition-colors duration-200" />
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
