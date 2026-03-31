# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

VeilComp — Confidential compensation protocol on public chains, powered by FHE (Zama fhEVM).
Employers deploy payroll contracts via a global factory, deposit ERC-20 tokens (USDT/USDC), and pay salaries with FHE-encrypted amounts. Employees see only their own data and can withdraw to their wallets.

## Tech Stack

- **Contracts**: Solidity 0.8.24, Zama fhEVM (@fhevm/solidity 0.11.1), OpenZeppelin 5.x, Hardhat 2.x
- **Frontend**: React 19 + TypeScript, Vite, viem, TailwindCSS v4 + shadcn/ui, react-router-dom, react-markdown
- **FHE SDK**: @zama-fhe/relayer-sdk 0.4.1 (UMD bundle loaded via script tag, not ESM import)
- **Package manager**: pnpm (always use pnpm, never npm/npx)

## Commands

```bash
pnpm exec hardhat compile          # Compile contracts
pnpm exec hardhat test             # Run all tests
pnpm exec hardhat test --grep "X"  # Run single test by name
pnpm exec hardhat clean            # Clean artifacts

cd frontend && pnpm run dev        # Start frontend dev server
cd frontend && pnpm run build      # Build frontend
cd frontend && pnpm exec tsc -b --noEmit  # TypeScript check
```

## Architecture

Two contracts:

- **VeilFactory.sol** — Global singleton. Deploys VeilPayroll instances via CREATE2. Maintains reverse index: employee -> payroll[]. No FHE operations.

- **VeilPayroll.sol** — Per-company per-token instance. Employee registry + fund pool (deposit ERC-20) + pay run engine (FHE salary -> internal balance) + async withdrawal via Zama Gateway. Deployed by Factory, owner is the employer.

**Fund flow**: Employer deposits ERC-20 -> createPayrollRun() snapshots employees -> executePayrollRunBatch() credits encrypted balances -> Employee requestWithdraw() -> publicDecrypt via Relayer -> fulfillWithdraw() transfers tokens.

**No tax**: Salaries are credited in full (netPay = salary). No tax deduction logic.

**Multi-token**: Each payroll is bound to one ERC-20 (immutable). Same employer can deploy multiple payrolls for different tokens.

**Deploy**: VeilFactory() once globally. Each company calls factory.createPayroll(salt, tokenAddress).

## Frontend Structure

```
frontend/src/
  services/
    payroll.ts    — All VeilPayroll read/write operations
    factory.ts    — VeilFactory queries (employer + employee payrolls)
  utils/
    fhevm.ts      — Zama SDK wrapper (encrypt, userDecrypt, publicDecrypt)
    contracts.ts  — ABI definitions + constants
  contexts/
    AppContext.tsx — Wallet state + FHE init on connect
  components/
    common/       — Layout, EmployerLayout (sidebar), EncryptedValue
    ui/           — shadcn/ui components
  pages/
    HomePage.tsx           — Landing + Employee compensation cards
    DocsPage.tsx           — Markdown docs with tabs
    employee/
      CompensationPage.tsx — Salary details + 3-step withdraw
    employer/
      EmployerHome.tsx     — Contract list
      DeployPage.tsx       — Deploy new payroll
      DashboardPage.tsx    — Overview + deposit (sidebar layout)
      EmployeesPage.tsx    — Employee list + add/edit/remove
      PayrollListPage.tsx  — Pay run history
      PayrollCreatePage.tsx — Select employees + create run
      PayrollDetailPage.tsx — Execute/resume pay run
      SettingsPage.tsx     — Contract info
    mock/
      MockTokenPage.tsx    — Deploy Factory + MockUSDT, mint tokens
```

## FHE Patterns

- After every balance/salary mutation: `FHE.allowThis()` + `FHE.allow(handle, user)` — must reassign: `x = FHE.allowThis(x)`
- Overflow protection: `FHE.select(FHE.le(a, b), result, zero)` before every `FHE.sub`
- `euint64` is `bytes32` user-defined type — cannot use `delete`, use `FHE.asEuint64(0)` instead
- Public decryption: `FHE.makePubliclyDecryptable(handle)` -> frontend `publicDecrypt()` -> `FHE.checkSignatures(handles, cleartext, proof)`
- No `requestDecryption` callback in v0.11.1 — use `makePubliclyDecryptable` + frontend-driven fulfill pattern

## Withdrawal Flow (3-Step, Frontend-Driven)

1. `requestWithdraw(amount)` — contract computes encrypted `deducted = select(le(amount, balance), amount, 0)`, marks publicly decryptable. Balance is NOT deducted yet.
2. Frontend calls `publicDecrypt([handle])` via Relayer SDK — polls until decryption is ready.
3. Frontend calls `fulfillWithdraw(id, handles, cleartext, proof)` — contract verifies proof via `checkSignatures`, deducts balance and transfers tokens if `decryptedAmount == requestedAmount`.

## FHE Frontend SDK

- Loaded as UMD via `<script>` tag in index.html, accessed via `globalThis.relayerSDK`
- WASM files (`tfhe_bg.wasm`, `kms_lib_bg.wasm`) served from `/public`
- `initSDK({ thread: N })` — thread=0 disables threading (avoids SharedArrayBuffer requirement)
- `createInstance({ ...SepoliaConfigV2, network: walletClient })` — binds to wallet
- Instance is re-created on wallet switch (tracked by `boundWallet`)
- `signTypedData` bridge: strip `EIP712Domain` from SDK types, convert string fields to bigint for viem compatibility

## Testing

Uses `@fhevm/hardhat-plugin` mock mode. Key APIs:
- `hre.fhevm.createEncryptedInput(contractAddr, signerAddr)` -> `input.add64(val)` -> `input.encrypt()`
- `hre.fhevm.userDecryptEuint(FhevmType.euint64, handle, contractAddr, signer)`
- `hre.fhevm.assertCoprocessorInitialized(contract, name)` in `before()` hooks

## Bytecodes

`frontend/src/utils/bytecodes.json` is generated from compiled artifacts. Regenerate after contract changes:
```bash
pnpm exec hardhat compile
node -e "const f=require('./artifacts/contracts/VeilFactory.sol/VeilFactory.json');const m=require('./artifacts/contracts/test/MockUSDT.sol/MockUSDT.json');console.log(JSON.stringify({factory:f.bytecode,mockUSDT:m.bytecode}))" > frontend/src/utils/bytecodes.json
```

## Docs

- `frontend/public/USAGE.md` — Usage guide (rendered at `/docs`)
- `frontend/public/ARCHITECTURE.md` — System architecture (rendered at `/docs`)
- Keep both in sync with contract/frontend changes
