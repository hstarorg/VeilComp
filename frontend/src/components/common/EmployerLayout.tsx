import { Outlet, Link, useParams, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import type { Address } from "viem";
import { LayoutDashboard, Users, CalendarCheck, ArrowLeft, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PAYROLL_ABI, ERC20_ABI } from "@/utils/contracts";
import { useApp } from "@/contexts/AppContext";

const NAV_ITEMS = [
  { key: "", icon: LayoutDashboard, label: "Overview" },
  { key: "/employees", icon: Users, label: "Employees" },
  { key: "/payroll", icon: CalendarCheck, label: "Pay Runs" },
  { key: "/settings", icon: Settings, label: "Settings" },
];

export function EmployerLayout() {
  const { address: payrollAddr } = useParams<{ address: string }>();
  const location = useLocation();
  const { publicClient } = useApp();
  const [tokenSymbol, setTokenSymbol] = useState("ERC20");

  const basePath = `/employer/${payrollAddr}`;

  useEffect(() => {
    if (!publicClient || !payrollAddr) return;
    async function load() {
      try {
        const token = await publicClient!.readContract({ address: payrollAddr as Address, abi: PAYROLL_ABI, functionName: "payToken" });
        const sym = await publicClient!.readContract({ address: token as Address, abi: ERC20_ABI, functionName: "symbol" });
        setTokenSymbol(sym as string);
      } catch {}
    }
    load();
  }, [publicClient, payrollAddr]);

  function isActive(key: string) {
    if (key === "") return location.pathname === basePath;
    return location.pathname.startsWith(basePath + key);
  }

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <aside className="w-52 shrink-0">
        <div className="sticky top-8 space-y-1">
          {/* Back + contract info */}
          <Link to="/employer" className="flex items-center gap-2 mb-4 text-xs text-gray-500 hover:text-gray-300 transition">
            <ArrowLeft className="h-3.5 w-3.5" />
            All Contracts
          </Link>

          <div className="mb-4 px-2">
            <div className="flex items-center gap-2">
              <Badge>{tokenSymbol}</Badge>
            </div>
            <p className="font-mono text-xs text-gray-600 mt-1 truncate" title={payrollAddr}>
              {payrollAddr}
            </p>
          </div>

          {/* Nav items */}
          <nav className="space-y-0.5">
            {NAV_ITEMS.map(({ key, icon: Icon, label }) => {
              const active = isActive(key);
              return (
                <Link
                  key={key}
                  to={basePath + key}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${
                    active
                      ? "bg-indigo-900/40 text-indigo-300 font-medium"
                      : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
