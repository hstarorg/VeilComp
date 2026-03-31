import { createBrowserRouter } from "react-router-dom";
import { Layout } from "@/components/common/Layout";
import { HomePage } from "@/pages/HomePage";
import { CompensationPage } from "@/pages/employee/CompensationPage";
import { EmployerHome } from "@/pages/employer/EmployerHome";
import { DeployPage } from "@/pages/employer/DeployPage";
import { DashboardPage } from "@/pages/employer/DashboardPage";
import { EmployeesPage } from "@/pages/employer/EmployeesPage";
import { PayrollListPage } from "@/pages/employer/PayrollListPage";
import { PayrollCreatePage } from "@/pages/employer/PayrollCreatePage";
import { PayrollDetailPage } from "@/pages/employer/PayrollDetailPage";
import { MockTokenPage } from "@/pages/mock/MockTokenPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "company/:address", element: <CompensationPage /> },
      { path: "employer", element: <EmployerHome /> },
      { path: "employer/deploy", element: <DeployPage /> },
      { path: "employer/:address", element: <DashboardPage /> },
      { path: "employer/:address/employees", element: <EmployeesPage /> },
      { path: "employer/:address/payroll", element: <PayrollListPage /> },
      { path: "employer/:address/payroll/new", element: <PayrollCreatePage /> },
      { path: "employer/:address/payroll/:runId", element: <PayrollDetailPage /> },
      { path: "mock", element: <MockTokenPage /> },
    ],
  },
]);
