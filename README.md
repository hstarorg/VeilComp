# VeilComp

**Confidential Compensation on Public Chains**

> Your salary. Your secret. On-chain.

VeilComp is a fully on-chain payroll protocol where **no one — not even the employer — can see individual salaries** after they're set. Built on [Zama fhEVM](https://www.zama.ai/fhevm), every compensation figure is encrypted using Fully Homomorphic Encryption (FHE) and lives transparently on Ethereum, yet remains private to each employee.

---

## The Problem

Web3 companies face a paradox: they operate on **transparent blockchains** where every transaction is public, yet **salary confidentiality** is a fundamental expectation in any workplace. Today, if a company pays employees on-chain, anyone can see who earns what — destroying trust, creating conflicts, and exposing sensitive business data.

Existing solutions either go off-chain (defeating the purpose of Web3) or use centralized payroll services that reintroduce the trust assumptions crypto was designed to eliminate.

## The Solution

VeilComp makes salary data **encrypted at rest and in computation** on a public chain. The employer sets each salary through FHE encryption in the browser — once submitted, the plaintext never exists on-chain. The protocol can add balances, check sufficiency, and process withdrawals, all without ever decrypting the underlying values.

**Only the employee can decrypt their own salary and balance.** Not the employer. Not validators. Not MEV bots. Nobody.

---

## How It Works

```
  Employer                          VeilComp (on-chain)                    Employee
     |                                    |                                    |
     |  1. Deploy payroll contract        |                                    |
     |  2. Add employees with             |                                    |
     |     FHE-encrypted salaries  -----> |  Stores euint64 (encrypted)        |
     |  3. Deposit USDT/USDC      -----> |  ERC-20 pool                       |
     |  4. Create & execute pay run ----> |  balance[emp] += salary (FHE)      |
     |                                    |                                    |
     |                                    |  <---- 5. Decrypt own balance      |
     |                                    |  <---- 6. Request withdrawal       |
     |                                    |         Gateway verifies ---------> |
     |                                    |         Tokens transferred -------> |
```

### Key Flows

**Employer:** Deploy contract -> Add employees (encrypted salary) -> Fund pool -> Create pay run -> Execute (batch processing)

**Employee:** Connect wallet -> View encrypted salary & balance -> Decrypt with wallet signature -> Withdraw tokens to wallet

---

## Features

**For Employers**
- Deploy per-token payroll contracts via factory (CREATE2)
- Set individual salaries with client-side FHE encryption
- Monthly pay runs with employee selection and batch execution
- Resumable execution — interrupted pay runs continue from where they stopped
- Real-time pool balance and deposit management

**For Employees**
- View and decrypt own salary and accumulated balance
- 3-step withdrawal: request -> Gateway verification -> automatic transfer
- Multi-company support — see all payrolls across employers in one view

**Privacy Guarantees**
| Data | Visibility |
|------|-----------|
| Individual salaries | Encrypted — only the employee can decrypt |
| Employee balances | Encrypted — only the employee can decrypt |
| Pay run totals | Encrypted — only the employer can decrypt |
| Deposit/withdraw amounts | Public (standard ERC-20 transfers) |
| Employee addresses | Public |

---

## Architecture

```
VeilFactory (singleton)
  |
  |-- createPayroll(salt, token) --> VeilPayroll #1 (Company A, USDT)
  |                                    ├── Employee registry (encrypted salaries)
  |                                    ├── Fund pool (ERC-20 deposits)
  |                                    ├── Pay run engine (FHE batch processing)
  |                                    └── Async withdrawal (Gateway verification)
  |
  |-- createPayroll(salt, token) --> VeilPayroll #2 (Company A, USDC)
  |
  |-- createPayroll(salt, token) --> VeilPayroll #3 (Company B, USDT)
```

- **VeilFactory** — Global singleton. Deploys payroll instances, maintains employer and employee reverse indexes. Zero FHE operations.
- **VeilPayroll** — Per-company per-token. All salary data stored as `euint64` (FHE-encrypted 64-bit integers). Pay runs credit encrypted internal balances. Withdrawals use `makePubliclyDecryptable` + `checkSignatures` for Gateway-verified token release.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.24, Zama fhEVM (`@fhevm/solidity` 0.11.1), OpenZeppelin 5.x |
| Development | Hardhat 2.x, `@fhevm/hardhat-plugin` (mock FHE for testing) |
| Frontend | React 19, TypeScript, Vite, viem, TailwindCSS v4, shadcn/ui |
| FHE Client | `@zama-fhe/relayer-sdk` 0.4.1 (WASM, browser-side encryption) |
| Network | Ethereum Sepolia (Zama fhEVM coprocessor) |
| Package Manager | pnpm |

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 9+
- A wallet with Sepolia ETH

### Setup

```bash
# Clone
git clone https://github.com/user/VeilComp.git
cd VeilComp

# Install dependencies
pnpm install

# Compile contracts
pnpm exec hardhat compile

# Run tests (24 tests, FHE mock mode)
pnpm exec hardhat test

# Start frontend
cd frontend
cp .env.example .env   # Set VITE_FACTORY_ADDRESS after deploying
pnpm run dev
```

### Deploy on Sepolia

1. Open the app at `http://localhost:5173`
2. Go to `/mock` — deploy VeilFactory and MockUSDT
3. Copy the Factory address to `frontend/.env` as `VITE_FACTORY_ADDRESS`
4. Restart the dev server
5. Go to **Employer > Deploy Contract** to create your first payroll

---

## FHE Under the Hood

VeilComp uses three core FHE patterns from Zama fhEVM:

**Encrypted Input** — Salaries are encrypted in the browser using `createEncryptedInput().add64(value).encrypt()`, producing a handle + zero-knowledge proof. The contract verifies the proof and stores only the encrypted handle.

**Encrypted Computation** — Pay runs execute `FHE.add(balance, salary)` directly on encrypted values. The coprocessor performs the addition without decrypting either operand. Overflow protection uses `FHE.select(FHE.le(a, b), result, zero)`.

**Conditional Decryption** — Withdrawals compute `select(le(amount, balance), amount, 0)` encrypted, then mark the result for public decryption. The Zama Gateway decrypts and signs a proof. The contract verifies the proof on-chain before releasing tokens — ensuring no one can forge a withdrawal.

---

## Project Structure

```
VeilComp/
  contracts/
    VeilFactory.sol       # Global factory (CREATE2 deployer)
    VeilPayroll.sol       # Per-company payroll (FHE engine)
    test/MockUSDT.sol     # Test ERC-20 token
  test/
    VeilFactory.test.ts   # Factory deployment tests
    VeilPayroll.test.ts   # Payroll + FHE integration tests (24 tests)
  frontend/
    src/
      services/           # Contract interaction layer
        payroll.ts        # All payroll read/write operations
        factory.ts        # Factory queries
      utils/
        fhevm.ts          # Zama SDK wrapper (encrypt/decrypt)
        contracts.ts      # ABIs + constants
      pages/              # Route-based page components
        employer/         # Dashboard, Employees, Pay Runs, Settings
        employee/         # Salary details + Withdraw
      components/         # Shared UI components
    public/
      USAGE.md            # Usage guide (rendered at /docs)
      ARCHITECTURE.md     # System architecture (rendered at /docs)
```

---

## What Makes VeilComp Different

**Not just encrypted transfers.** Many privacy protocols encrypt token transfers. VeilComp encrypts the *employment relationship* — the salary figure, the accumulated balance, the pay run computation. The entire compensation lifecycle happens under encryption.

**No off-chain trust.** There's no backend server holding salary data. No database to breach. The encrypted state lives on Ethereum, verified by the fhEVM coprocessor. The only trust assumption is the Zama KMS threshold network for decryption key management.

**Real payroll, not a demo.** VeilComp handles the full lifecycle: multi-employee management, salary updates, monthly pay runs with batch processing, pool funding, and 3-step verified withdrawals. It's designed to be used, not just demonstrated.

---

## Limitations & Future Work

- **Withdrawal requires browser session** — The 3-step withdrawal must complete in one session. Future: event-driven background fulfillment.
- **No ownership transfer** — Employer address is immutable. Future: multi-sig or DAO governance.
- **Sepolia only** — Requires Zama coprocessor. Mainnet deployment pending Zama's Ethereum mainnet launch.
- **Gas costs** — FHE operations are expensive (~2-5x regular EVM). Batch processing (10 employees/tx) mitigates this.

---

## License

MIT
