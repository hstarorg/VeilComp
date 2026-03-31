import { createBrowserRouter } from "react-router-dom";
import { Layout } from "@/components/common/Layout";
import { HomePage } from "@/pages/HomePage";
import { CompensationPage } from "@/pages/employee/CompensationPage";
import { EmployerHome } from "@/pages/employer/EmployerHome";
import { DeployPage } from "@/pages/employer/DeployPage";
import { DashboardPage } from "@/pages/employer/DashboardPage";
import { EmployeesPage } from "@/pages/employer/EmployeesPage";
import { PayrollPage } from "@/pages/employer/PayrollPage";
import { MockTokenPage } from "@/pages/mock/MockTokenPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      // Default: employee view (my payrolls list)
      { index: true, element: <HomePage /> },

      // Employee: salary details for a specific company
      { path: "company/:address", element: <CompensationPage /> },

      // Employer: my payroll contracts list
      { path: "employer", element: <EmployerHome /> },

      // Employer: deploy new payroll
      { path: "employer/deploy", element: <DeployPage /> },

      // Employer: specific payroll management
      { path: "employer/:address", element: <DashboardPage /> },
      { path: "employer/:address/employees", element: <EmployeesPage /> },
      { path: "employer/:address/payroll", element: <PayrollPage /> },

      // Mock tools (testnet)
      { path: "mock", element: <MockTokenPage /> },
    ],
  },
]);
