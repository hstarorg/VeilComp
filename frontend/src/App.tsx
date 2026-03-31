import { RouterProvider } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/config/wagmi";
import { AppProvider } from "@/contexts/AppContext";
import { router } from "@/router";
import { Analytics } from "@vercel/analytics/react";

import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: "#6366f1" })}>
          <AppProvider>
            <Toaster
              position="top-right"
              toastOptions={{
                style: { background: "#1f2937", color: "#f3f4f6", fontSize: "14px" },
              }}
            />
            <RouterProvider router={router} />
            <Analytics />
          </AppProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
