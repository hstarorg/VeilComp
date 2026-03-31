# VeilComp Usage Guide

## Overview

VeilComp is a confidential compensation protocol on Ethereum Sepolia, powered by Zama fhEVM. Employers deploy payroll contracts via a global factory, deposit ERC-20 tokens (USDT/USDC), and pay salaries with FHE-encrypted amounts. Only the employee can see their own compensation data.

### Architecture

- **VeilFactory** — Global singleton. Deploys VeilPayroll instances. Maintains reverse index: employee -> payroll contracts.
- **VeilPayroll** — Per-company per-token instance. Employee registry + fund pool + pay run engine + encrypted withdrawal.

### Roles

| Role | Description |
|------|-------------|
| **Employer** | Deploys payroll contracts, manages employees, funds pool, executes pay runs |
| **Employee** | Views own encrypted salary/balance, requests withdrawals |

---

## Employer Guide

### 1. Deploy a Payroll Contract

Go to **Employer > Deploy Contract**.

- Enter a salt (any unique string) and the ERC-20 token address (e.g. MockUSDT on Sepolia)
- The Factory deploys a new VeilPayroll instance via CREATE2
- The deployed contract address appears — copy it or click through to manage

Each payroll contract is bound to **one token**. Deploy multiple contracts for different tokens.

### 2. Add Employees

Go to **Employer > [Contract] > Employees**.

- Enter the employee's wallet address and monthly salary amount
- The salary is **FHE-encrypted in the browser** before being sent on-chain
- Nobody (not even the employer) can read individual salaries after submission
- The employee is automatically registered in the Factory's reverse index

**Update salary**: Hover over an employee row, click the pencil icon, enter a new amount. The new salary is encrypted and submitted.

**Remove employee**: Hover over an employee row, click the trash icon. The employee is unregistered and can no longer access salary data.

### 3. Fund the Pool

Go to **Employer > [Contract] > Overview**.

The pool balance card shows the current ERC-20 balance held by the contract. To deposit:

- Enter the amount in the deposit form (right side of the pool card)
- Two transactions are sent: ERC-20 `approve` then `deposit`
- The pool balance updates after confirmation

The pool must have sufficient funds **before** executing a pay run. If the pool is empty, a warning is shown.

### 4. Create a Pay Run

Go to **Employer > [Contract] > Pay Runs > New Pay Run**.

- All employees are pre-selected by default
- Uncheck any employees you want to exclude from this run
- Click "Confirm N Employees" — this creates the pay run on-chain (snapshot of selected employees)
- You are redirected to the pay run detail page

### 5. Execute a Pay Run

On the pay run detail page:

- If the pool has sufficient funds, click "Pay N Employees"
- Employees are paid in batches of 10 (one transaction per batch)
- Progress is shown in real-time: `Batch 1/3 (employees 1-10)`
- Each employee's internal balance is credited with their full salary (encrypted)

**Resumable**: If execution is interrupted (browser closed, TX failure), refresh the page. The contract tracks `batchProcessed` — clicking "Resume" continues from where it stopped.

**Pay run states**:
| Status | Meaning |
|--------|---------|
| Pending (yellow) | Created but not yet executed |
| Partial (orange) | Execution started but interrupted |
| Paid (green) | All employees paid |

### 6. View Pay Run History

Go to **Employer > [Contract] > Pay Runs**.

All pay runs are listed in reverse chronological order with status badges. Click any run to see details, employee list, and execution status.

### 7. Settings

Go to **Employer > [Contract] > Settings**.

View contract info: contract address, employer address, pay token details.

---

## Employee Guide

### 1. View Compensation

After connecting your wallet, the **home page** shows all payroll contracts where you are registered as an employee.

Each card displays:
- **Monthly Salary** — encrypted, click "Decrypt" to reveal
- **Withdrawable Balance** — encrypted, click "Decrypt" to reveal
- Company (employer address) and token symbol

Decryption requires signing an EIP-712 message with your wallet. Only your wallet can decrypt your own data.

### 2. View Salary Details

Click "View Details" on any compensation card to see the full detail page with:
- Monthly salary (encrypted)
- Withdrawable balance (encrypted)
- Withdraw form

### 3. Withdraw Funds

On the salary detail page, use the **Withdraw** form on the right side:

1. Enter the amount you want to withdraw (in token units, e.g. `5000`)
2. Click "Withdraw [TOKEN]"

The withdrawal is a **3-step process**, all automated:

| Step | What Happens | UI State |
|------|-------------|----------|
| **Requesting** | `requestWithdraw` is called on-chain. The contract encrypts a sufficiency check and marks it for public decryption. | Spinner: "Requesting" |
| **Decrypting** | The frontend polls the Zama Relayer to decrypt the sufficiency check. This verifies your balance covers the requested amount. | Spinner: "Decrypting" |
| **Transferring** | The frontend calls `fulfillWithdraw` with the decryption proof. The contract verifies the proof, deducts your balance, and transfers ERC-20 tokens to your wallet. | Spinner: "Transferring" |

**If balance is insufficient**: The decrypted check returns 0, and the contract rejects the withdrawal. No balance is deducted.

**After success**: Tokens are transferred directly to your wallet. The balance display refreshes automatically.

---

## Privacy Model

| Data | Visibility |
|------|-----------|
| ERC-20 deposit amounts | Public (standard ERC-20 transfers) |
| Individual salaries | FHE-encrypted — only the employee can decrypt |
| Employee balances | FHE-encrypted — only the employee can decrypt |
| Pay run total | FHE-encrypted — only the employer can decrypt |
| Employee wallet addresses | Public (on-chain) |
| Employee count | Public |
| Pay run count & timestamps | Public |
| Withdrawal amounts (after fulfill) | Public (ERC-20 transfer) |

---

## Dev Tools (Testnet)

Go to `/mock` in the browser to access developer tools:

- **Deploy VeilFactory** — deploys the global factory contract. Copy the address to `VITE_FACTORY_ADDRESS` in `.env`
- **Deploy MockUSDT** — deploys a test ERC-20 token with free minting
- **Mint** — mint test tokens to any address

### Local Setup

```bash
# 1. Deploy contracts on Sepolia
pnpm exec hardhat compile

# 2. Start frontend
cd frontend && pnpm run dev

# 3. Go to /mock, deploy Factory + MockUSDT
# 4. Copy Factory address to frontend/.env as VITE_FACTORY_ADDRESS
# 5. Restart dev server
```

---

## Limitations

- **Withdrawal requires browser interaction**: The 3-step withdrawal (request → decrypt → fulfill) must be completed in one browser session. If interrupted, the withdraw request stays pending and cannot be resumed (a new request must be submitted).
- **Silent pay failure**: If the pool balance is insufficient during a pay run, FHE operations cannot revert on encrypted conditions — affected employees may receive 0. Ensure adequate pool balance before executing.
- **Gas costs**: FHE operations are expensive. Pay runs are batched at 10 employees per transaction.
- **No ownership transfer**: The employer address is set at deploy time and cannot be changed.
- **Sepolia only**: FHE operations require the Zama coprocessor on Sepolia (chainId 11155111).
