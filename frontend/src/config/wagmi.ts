import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { metaMaskWallet } from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { sepolia, mainnet } from 'wagmi/chains';

// Build wallet list — only include WalletConnect if projectId is set
const wallets = [metaMaskWallet];

const connectors = connectorsForWallets([{ groupName: 'Wallets', wallets }], {
  appName: 'VeilComp',
  projectId: 'none',
});

export const wagmiConfig = createConfig({
  connectors,
  chains: [sepolia, mainnet],
  transports: {
    [sepolia.id]: http(),
    [mainnet.id]: http(),
  },
});
