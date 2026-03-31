import {
  createInstance,
  SepoliaConfig,
  type FhevmInstance,
  type HandleContractPair,
} from "@zama-fhe/relayer-sdk/web";
import { BrowserProvider } from "ethers";

// ─── Singleton Instance ────────────────────────────────────

let instance: FhevmInstance | null = null;

/**
 * Initialize or return the cached FhevmInstance.
 * Must be called after wallet is connected (needs window.ethereum as the network provider).
 */
export async function getFhevmInstance(): Promise<FhevmInstance> {
  if (instance) return instance;

  if (!window.ethereum) {
    throw new Error("MetaMask not found");
  }

  instance = await createInstance({
    ...SepoliaConfig,
    network: window.ethereum,
  });

  return instance;
}

// ─── Encrypt ────────────────────────────────────────────────

export interface EncryptedInput {
  handles: Uint8Array[];
  inputProof: Uint8Array;
}

/**
 * Encrypt a uint64 value for a specific contract call.
 * @param contractAddress  Target contract (e.g., VeilPayroll or VeilToken).
 * @param userAddress      The caller's wallet address.
 * @param value            Plaintext value to encrypt (e.g., salary in 6-decimal USDT).
 */
export async function encryptUint64(
  contractAddress: string,
  userAddress: string,
  value: number | bigint
): Promise<EncryptedInput> {
  const fhevm = await getFhevmInstance();
  const input = fhevm.createEncryptedInput(contractAddress, userAddress);
  input.add64(value);
  return input.encrypt();
}

// ─── Decrypt ────────────────────────────────────────────────

/**
 * Decrypt an encrypted euint64 handle using user's ephemeral keypair + EIP-712 signature.
 *
 * Flow:
 * 1. Generate an ephemeral keypair
 * 2. Sign an EIP-712 message granting the relayer permission to decrypt
 * 3. Send to relayer → KMS decrypts → returns cleartext
 *
 * @param handle           The encrypted handle (bytes32) from the contract.
 * @param contractAddress  The contract that owns this handle.
 */
export async function decryptUint64(
  handle: string,
  contractAddress: string
): Promise<bigint> {
  const fhevm = await getFhevmInstance();

  if (!window.ethereum) throw new Error("MetaMask not found");

  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const userAddress = await signer.getAddress();

  // 1. Generate ephemeral keypair
  const { publicKey, privateKey } = fhevm.generateKeypair();

  // 2. Create EIP-712 typed data for user decrypt permission
  const now = Math.floor(Date.now() / 1000);
  const durationDays = 1;

  const eip712 = fhevm.createEIP712(
    publicKey,
    [contractAddress],
    now,
    durationDays
  );

  // 3. Sign with user's wallet
  // ethers signTypedData expects mutable types — strip readonly and remove EIP712Domain
  const { EIP712Domain: _, ...sigTypes } = eip712.types;
  const mutableTypes: Record<string, Array<{ name: string; type: string }>> = {};
  for (const [key, val] of Object.entries(sigTypes)) {
    mutableTypes[key] = [...(val as readonly { name: string; type: string }[])];
  }

  const signature = await signer.signTypedData(
    eip712.domain as Record<string, unknown>,
    mutableTypes,
    eip712.message
  );

  // 4. Request decryption from relayer
  const handleContractPair: HandleContractPair = {
    handle,
    contractAddress,
  };

  const results = await fhevm.userDecrypt(
    [handleContractPair],
    privateKey,
    publicKey,
    signature,
    [contractAddress],
    userAddress,
    now,
    durationDays
  );

  // Results is Record<handle, clearValue>
  const handleHex = handle.toLowerCase() as `0x${string}`;
  const clearValue = (results as Record<string, bigint | boolean | string>)[handleHex]
    ?? (results as Record<string, bigint | boolean | string>)[handle];

  if (clearValue === undefined) {
    throw new Error("Decryption returned no result for this handle");
  }

  return BigInt(clearValue);
}
