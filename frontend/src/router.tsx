import { createBrowserRouter } from "react-router-dom";
import { Layout } from "@/components/common/Layout";
import { EmployerLayout } from "@/components/common/EmployerLayout";
import { HomePage } from "@/pages/HomePage";
import { CompensationPage } from "@/pages/employee/CompensationPage";
import { EmployerHome } from "@/pages/employer/EmployerHome";
import { DeployPage } from "@/pages/employer/DeployPage";
import { DashboardPage } from "@/pages/employer/DashboardPage";
import { EmployeesPage } from "@/pages/employer/EmployeesPage";
import { SettingsPage } from "@/pages/employer/SettingsPage";
import { PayrollListPage } from "@/pages/employer/PayrollListPage";
import { PayrollCreatePage } from "@/pages/employer/PayrollCreatePage";
import { PayrollDetailPage } from "@/pages/employer/PayrollDetailPage";
import { MockTokenPage } from "@/pages/mock/MockTokenPage";
import { DocsPage } from "@/pages/DocsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "company/:address", element: <CompensationPage /> },
      { path: "employer", element: <EmployerHome /> },
      { path: "employer/deploy", element: <DeployPage /> },

      // Employer contract management — with sidebar
      {
        path: "employer/:address",
        element: <EmployerLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "employees", element: <EmployeesPage /> },
          { path: "payroll", element: <PayrollListPage /> },
          { path: "payroll/new", element: <PayrollCreatePage /> },
          { path: "payroll/:runId", element: <PayrollDetailPage /> },
          { path: "settings", element: <SettingsPage /> },
        ],
      },

      { path: "docs", element: <DocsPage /> },
      { path: "mock", element: <MockTokenPage /> },
    ],
  },
]);
