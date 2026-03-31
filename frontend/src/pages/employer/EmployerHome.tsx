import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Building2, Plus, ArrowRight, Rocket } from "lucide-react";
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
              <p className="mt-1 max-w-xs text-xs text-gray-600">Deploy your first contract to start paying your team confidentially.</p>
            </div>
            <Link to="/employer/deploy"><Button>Deploy Contract</Button></Link>
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
                      <p className="text-sm font-medium font-mono">{p.address.slice(0, 6)}...{p.address.slice(-4)}</p>
                      <p className="text-xs text-gray-500">Token: {p.tokenSymbol}</p>
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
