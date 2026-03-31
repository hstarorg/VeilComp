import type { Address, WalletClient } from 'viem';
import type { FhevmInstance, KmsUserDecryptEIP712Type } from '@zama-fhe/relayer-sdk/bundle';

const FHEVM_CHAIN_ID = 11155111;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSdk(): any {
  const sdk = (globalThis as any).relayerSDK ?? (window as any).relayerSDK;
  if (!sdk) throw new Error('Zama SDK not loaded. Ensure relayer-sdk-js.umd.cjs is in index.html.');
  return sdk;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

// ─── State ─────────────────────────────────────────────────

let instance: FhevmInstance;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let keypair: any = null;
let wasmPromise: Promise<void> | null = null;
let wasmLoaded = false;
let boundWallet: string | null = null;

// ─── Init ──────────────────────────────────────────────────

async function loadWasm() {
  if (wasmLoaded) return;
  const sdk = getSdk();

  console.log('[fhevm] crossOriginIsolated:', globalThis.crossOriginIsolated);
  console.log('[fhevm] SharedArrayBuffer:', typeof SharedArrayBuffer !== 'undefined');

  // Verify WASM files are reachable
  for (const f of ['/tfhe_bg.wasm', '/kms_lib_bg.wasm']) {
    const res = await fetch(f, { method: 'HEAD' });
    console.log(`[fhevm] ${f}: ${res.status}`);
    if (!res.ok) throw new Error(`Failed to fetch ${f}: ${res.status}`);
  }

  console.log('[fhevm] initSDK...');
  await sdk.initSDK({ thread: 0 });
  wasmLoaded = true;
  console.log('[fhevm] WASM loaded');
}

async function bindWallet(walletClient: WalletClient) {
  const addr = walletClient.account?.address ?? '';
  if (instance && boundWallet === addr) return;

  const sdk = getSdk();
  console.log('[fhevm] createInstance for', addr.slice(0, 8), '...');
  instance = await withTimeout(
    sdk.createInstance({ ...sdk.SepoliaConfigV2, network: walletClient }),
    30_000,
    'createInstance',
  );
  keypair = instance.generateKeypair();
  boundWallet = addr;
  console.log('[fhevm] instance ready for', addr.slice(0, 8));
}

/**
 * Ensure WASM is loaded and instance is bound to the current wallet.
 * Safe to call repeatedly — only does work when needed.
 */
export async function ensureReady(walletClient: WalletClient) {
  if (!wasmPromise) {
    wasmPromise = loadWasm().catch((err) => {
      console.error('[fhevm] WASM load failed:', err);
      wasmPromise = null;
      throw err;
    });
  }
  await wasmPromise;
  if (!wasmLoaded) throw new Error('fhEVM SDK initialization failed');
  await bindWallet(walletClient);
}

/**
 * Start WASM loading in background. Call early (e.g. on page load) to reduce latency.
 * Does NOT require a wallet — just preloads the heavy WASM modules.
 */
export function preloadFhevm() {
  if (wasmPromise || wasmLoaded) return;
  wasmPromise = loadWasm().catch((err) => {
    console.warn('[fhevm] preload failed:', err.message);
    wasmPromise = null;
  });
}

/**
 * Sign EIP-712 typed data from the Zama SDK.
 * Bridges SDK types → viem signTypedData types:
 *  - Strips `EIP712Domain` from types (viem derives it from domain)
 *  - Converts message `string` fields to `bigint` for uint256 compatibility
 */
async function requestSignature(
  walletClient: WalletClient,
  userAddress: Address,
  eip712: KmsUserDecryptEIP712Type,
): Promise<string> {
  const { EIP712Domain: _, ...typesWithoutDomain } = eip712.types;
  // SDK encodes uint256 fields as string; viem expects bigint
  const message = {
    publicKey: eip712.message.publicKey,
    contractAddresses: eip712.message.contractAddresses,
    startTimestamp: BigInt(eip712.message.startTimestamp),
    durationDays: BigInt(eip712.message.durationDays),
    extraData: eip712.message.extraData,
  };

  return walletClient.signTypedData({
    account: userAddress,
    domain: {
      name: eip712.domain.name,
      version: eip712.domain.version,
      chainId: eip712.domain.chainId,
      verifyingContract: eip712.domain.verifyingContract,
    },
    types: typesWithoutDomain,
    primaryType: eip712.primaryType,
    message,
  });
}

function assertSepolia(chainId: number | undefined) {
  if (chainId !== FHEVM_CHAIN_ID) {
    throw new Error(`FHE is only available on Ethereum Sepolia (chainId ${FHEVM_CHAIN_ID}). Current: ${chainId}.`);
  }
}

// ─── Encrypt ────────────────────────────────────────────────

export interface EncryptedInput {
  handles: Uint8Array[];
  inputProof: Uint8Array;
}

export async function encryptUint64(
  contractAddress: string,
  userAddress: string,
  value: number | bigint,
  walletClient: WalletClient,
  chainId?: number,
): Promise<EncryptedInput> {
  assertSepolia(chainId);
  await ensureReady(walletClient);

  console.log('[fhevm] encrypting...');
  const input = instance.createEncryptedInput(contractAddress, userAddress);
  input.add64(Number(value));
  return withTimeout(input.encrypt(), 30_000, 'encrypt');
}

// ─── Decrypt ────────────────────────────────────────────────

export async function decryptUint64(
  handle: string,
  contractAddress: string,
  walletClient: WalletClient,
  chainId?: number,
): Promise<bigint> {
  assertSepolia(chainId);
  await ensureReady(walletClient);

  const userAddress = walletClient.account!.address;
  const timestamp = Math.floor(Date.now() / 1000);
  const durationDays = 10;

  const eip712 = instance.createEIP712(keypair.publicKey, [contractAddress], timestamp, durationDays);

  const signature = await requestSignature(walletClient, userAddress, eip712);

  const result = await instance.userDecrypt(
    [{ handle, contractAddress }],
    keypair.privateKey,
    keypair.publicKey,
    signature,
    [contractAddress],
    userAddress,
    timestamp,
    durationDays,
  );

  const clearValue = result[handle as `0x${string}`];
  if (clearValue === undefined) {
    throw new Error('Decryption returned no result for this handle');
  }

  return BigInt(clearValue);
}

// ─── Public Decrypt (for fulfillWithdraw) ──────────────────

export interface PublicDecryptProof {
  abiEncodedCleartexts: `0x${string}`;
  decryptionProof: `0x${string}`;
}

/**
 * Public decrypt handles that were marked with makePubliclyDecryptable.
 * Returns the proof needed for contract's checkSignatures / fulfillWithdraw.
 * Polls the relayer until decryption is ready.
 */
export async function publicDecryptWithProof(
  handles: string[],
  walletClient: WalletClient,
  chainId?: number,
): Promise<PublicDecryptProof> {
  assertSepolia(chainId);
  await ensureReady(walletClient);

  const result = await withTimeout(
    instance.publicDecrypt(handles),
    120_000,
    'publicDecrypt',
  );

  return {
    abiEncodedCleartexts: result.abiEncodedClearValues,
    decryptionProof: result.decryptionProof,
  };
}
