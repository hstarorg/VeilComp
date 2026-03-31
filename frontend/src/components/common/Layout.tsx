import { Outlet, Link, useLocation } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Building2, BookOpen } from "lucide-react";
import logoSvg from "@/assets/logo.svg";
import { useApp } from "@/contexts/AppContext";

export function Layout() {
  const { isConnected } = useApp();
  const location = useLocation();
  const isEmployerRoute = location.pathname.startsWith("/employer");

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-6">
            {/* Logo → Employee home */}
            <Link to="/" className="flex items-center gap-2 text-lg font-bold text-white">
              <img src={logoSvg} alt="VeilComp" className="h-7 w-7" />
              VeilComp
            </Link>

            {/* Employer standalone link */}
            {isConnected && (
              <Link
                to="/employer"
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  isEmployerRoute
                    ? "bg-indigo-900/50 text-indigo-300 border border-indigo-800"
                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                Employer
              </Link>
            )}
          </div>

          <div className="flex items-center gap-4">
            <Link
              to="/docs"
              className={`flex items-center gap-1.5 text-xs font-medium transition ${
                location.pathname === "/docs"
                  ? "text-gray-200"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Docs
            </Link>
            <ConnectButton showBalance={true} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
