import { useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";

interface Props {
  handle: string;
  contractAddress: string;
  onDecrypt: (handle: string, contractAddress?: string) => Promise<bigint>;
  decimals?: number;
  label?: string;
}

function formatUSDT(value: bigint, decimals: number): string {
  const whole = value / BigInt(10 ** decimals);
  const frac = value % BigInt(10 ** decimals);
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

function isZero(handle: string): boolean {
  if (!handle) return true;
  // Strip 0x, check if all zeros
  const hex = handle.startsWith("0x") ? handle.slice(2) : handle;
  return hex.length === 0 || /^0+$/.test(hex);
}

export function EncryptedValue({ handle, contractAddress, onDecrypt, decimals = 6, label }: Props) {
  const { chainId } = useApp();
  const [clearValue, setClearValue] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isSepolia = chainId === 11155111;

  if (isZero(handle)) {
    return (
      <span className="text-gray-500">
        {label && <span className="mr-1 text-xs text-gray-600">{label}</span>}
        --
      </span>
    );
  }

  if (clearValue !== null) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-green-400">
        <Unlock className="h-3.5 w-3.5" />
        {label && <span className="mr-1 text-xs text-gray-400">{label}</span>}
        ${formatUSDT(clearValue, decimals)}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Lock className="h-3.5 w-3.5 text-gray-500" />
      {label && <span className="mr-1 text-xs text-gray-400">{label}</span>}
      <span className="text-gray-500">Encrypted</span>
      {isSepolia ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setError("");
            try {
              const val = await onDecrypt(handle, contractAddress);
              setClearValue(val);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "Decrypt failed";
              setError(msg.length > 80 ? msg.slice(0, 80) + "..." : msg);
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? "Decrypting..." : "Decrypt"}
        </Button>
      ) : (
        <span className="text-xs text-gray-600">(Sepolia only)</span>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
