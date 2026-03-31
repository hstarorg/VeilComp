import { createContext, useContext, useCallback, useEffect, type ReactNode } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import type { PublicClient, WalletClient, Address } from 'viem';
import { ensureReady, decryptUint64 } from '@/utils/fhevm';

interface AppContextValue {
  address: Address | undefined;
  chainId: number | undefined;
  isConnected: boolean;
  publicClient: PublicClient | undefined;
  walletClient: WalletClient | undefined;
  onDecrypt: (handle: string, contractAddress?: string) => Promise<bigint>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // On wallet connect or switch: preload WASM + bind instance to new wallet
  useEffect(() => {
    if (!walletClient || chainId !== 11155111) return;
    ensureReady(walletClient).catch((err) => {
      console.warn('[fhevm] ensureReady on wallet change failed:', err.message);
    });
  }, [walletClient, address, chainId]);

  const onDecrypt = useCallback(
    async (handle: string, contractAddress?: string): Promise<bigint> => {
      if (!walletClient) throw new Error('Wallet not connected');
      return decryptUint64(handle, contractAddress || '', walletClient, chainId);
    },
    [walletClient, chainId],
  );

  return (
    <AppContext.Provider value={{ address, chainId, isConnected, publicClient, walletClient, onDecrypt }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
