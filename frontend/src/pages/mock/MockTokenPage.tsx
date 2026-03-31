import { useState } from "react";
import type { Address } from "viem";
import { formatUnits } from "viem";
import { FlaskConical, Coins, Plus, Check, Loader2, Factory } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/contexts/AppContext";
import bytecodes from "@/utils/bytecodes.json";
import toast from "react-hot-toast";

const FACTORY_ABI = [
  { type: "constructor", inputs: [], stateMutability: "nonpayable" },
] as const;

const MOCK_USDT_ABI = [
  { type: "constructor", inputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "mint", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

interface DeployedContract {
  address: `0x${string}`;
  label: string;
}

export function MockTokenPage() {
  const { walletClient, publicClient, address } = useApp();

  // Deployed contracts
  const [deployedContracts, setDeployedContracts] = useState<DeployedContract[]>([]);
  const [deployingFactory, setDeployingFactory] = useState(false);
  const [deployingToken, setDeployingToken] = useState(false);

  // Mint form
  const [selectedToken, setSelectedToken] = useState("");
  const [mintTo, setMintTo] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [minting, setMinting] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);

  async function handleDeployFactory() {
    if (!walletClient || !publicClient || !address) return;
    setDeployingFactory(true);
    try {
      const hash = await walletClient.deployContract({
        abi: FACTORY_ABI,
        bytecode: bytecodes.factory as `0x${string}`,
        account: address,
        chain: walletClient.chain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const addr = receipt.contractAddress!;
      setDeployedContracts((prev) => [...prev, { address: addr, label: "VeilFactory" }]);
      toast.success(`VeilFactory deployed! Set VITE_FACTORY_ADDRESS=${addr}`);
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || "Deploy failed");
    } finally {
      setDeployingFactory(false);
    }
  }

  async function handleDeployToken() {
    if (!walletClient || !publicClient || !address) return;
    setDeployingToken(true);
    try {
      const hash = await walletClient.deployContract({
        abi: MOCK_USDT_ABI,
        bytecode: bytecodes.mockUSDT as `0x${string}`,
        account: address,
        chain: walletClient.chain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const addr = receipt.contractAddress!;
      setDeployedContracts((prev) => [...prev, { address: addr, label: "MockUSDT" }]);
      setSelectedToken(addr);
      toast.success(`MockUSDT deployed at ${addr.slice(0, 10)}...`);
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || "Deploy failed");
    } finally {
      setDeployingToken(false);
    }
  }

  async function handleMint() {
    if (!walletClient || !publicClient || !address || !selectedToken || !mintAmount) return;
    setMinting(true);
    try {
      const to = (mintTo || address) as Address;
      const amount = BigInt(Math.round(parseFloat(mintAmount) * 1e6));

      const hash = await walletClient.writeContract({
        address: selectedToken as Address,
        abi: MOCK_USDT_ABI,
        functionName: "mint",
        args: [to, amount],
        account: address,
        chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success(`Minted ${mintAmount} USDT to ${to.slice(0, 8)}...`);

      const bal = await publicClient.readContract({
        address: selectedToken as Address,
        abi: MOCK_USDT_ABI,
        functionName: "balanceOf",
        args: [to],
      });
      setBalance(formatUnits(bal as bigint, 6));
      setMintAmount("");
    } catch (err: any) {
      toast.error(err.shortMessage || err.message || "Mint failed");
    } finally {
      setMinting(false);
    }
  }

  function copyAddr(addr: string) {
    navigator.clipboard.writeText(addr);
    toast.success("Copied!");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-6 w-6 text-yellow-400" />
        <h1 className="text-2xl font-bold">Dev Tools</h1>
        <Badge variant="default" className="bg-yellow-900/50 text-yellow-300 border border-yellow-800">
          Testnet Only
        </Badge>
      </div>
      <p className="text-sm text-gray-500">Deploy test contracts and mint tokens. Access via <code className="text-gray-400">/mock</code></p>

      <div className="grid gap-6 sm:grid-cols-3">
        {/* Deploy Factory */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Factory className="h-5 w-5 text-indigo-400" /> VeilFactory</CardTitle>
            <CardDescription>Global payroll factory contract</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleDeployFactory} disabled={deployingFactory || !address} className="w-full">
              {deployingFactory ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deploying...</> : "Deploy Factory"}
            </Button>
          </CardContent>
        </Card>

        {/* Deploy Mock Token */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-5 w-5 text-green-400" /> MockUSDT</CardTitle>
            <CardDescription>ERC-20 with free minting</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleDeployToken} disabled={deployingToken || !address} variant="success" className="w-full">
              {deployingToken ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deploying...</> : "Deploy MockUSDT"}
            </Button>
          </CardContent>
        </Card>

        {/* Mint */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Coins className="h-5 w-5 text-yellow-400" /> Mint</CardTitle>
            <CardDescription>Mint test tokens to any address</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
              placeholder="Token address"
              className="text-xs"
            />
            <Input
              value={mintTo}
              onChange={(e) => setMintTo(e.target.value)}
              placeholder="Recipient (blank = self)"
              className="text-xs"
            />
            <Input
              type="number"
              step="0.01"
              value={mintAmount}
              onChange={(e) => setMintAmount(e.target.value)}
              placeholder="Amount"
              className="text-xs"
            />
            <Button onClick={handleMint} disabled={minting || !selectedToken || !mintAmount} className="w-full" size="sm">
              {minting ? "Minting..." : "Mint"}
            </Button>
            {balance !== null && (
              <p className="flex items-center gap-1 text-xs">
                <Check className="h-3 w-3 text-green-400" />
                <span className="text-gray-400">Balance:</span>
                <span className="font-mono text-green-400">${balance}</span>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deployed addresses */}
      {deployedContracts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Deployed Contracts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {deployedContracts.map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-gray-800/50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge>{c.label}</Badge>
                  <span className="font-mono text-xs text-gray-300">{c.address}</span>
                </div>
                <button onClick={() => copyAddr(c.address)} className="text-xs text-indigo-400 hover:text-indigo-300">
                  Copy
                </button>
              </div>
            ))}
            <p className="mt-2 text-xs text-gray-600">
              Copy the VeilFactory address and set it as <code className="text-gray-400">VITE_FACTORY_ADDRESS</code> in your .env file, then restart the dev server.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
