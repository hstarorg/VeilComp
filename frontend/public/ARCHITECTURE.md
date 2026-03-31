# System Architecture

## Overview

VeilComp consists of two smart contracts, a frontend service layer, and the Zama fhEVM FHE infrastructure. All salary and balance data is fully homomorphically encrypted on-chain.

```
+------------------+     +------------------+     +------------------+
|    Frontend      |     |   Zama Relayer   |     |   Sepolia Chain  |
|  (React + Viem)  |<--->|   (FHE Gateway)  |<--->|  (fhEVM Copro.)  |
+------------------+     +------------------+     +------------------+
        |                                                  |
        |  encrypt/decrypt                                 |
        v                                                  v
+------------------+                            +------------------+
| Zama Relayer SDK |                            |  VeilFactory     |
| (WASM in browser)|                            |  (Singleton)     |
+------------------+                            +--------+---------+
                                                         |
                                                         | create2
                                                         v
                                                +------------------+
                                                | VeilPayroll #1   |
                                                | (Per Company)    |
                                                +------------------+
                                                | VeilPayroll #2   |
                                                +------------------+
```

## Smart Contracts

### VeilFactory (Global Singleton)

Deployed once. No FHE operations.

**Responsibilities:**
- Deploy VeilPayroll instances via CREATE2
- Maintain employer -> payroll[] index
- Maintain employee -> payroll[] reverse index (for employee portal)

| Function | Access | Description |
|----------|--------|-------------|
| `createPayroll(salt, payToken)` | Anyone | Deploy new VeilPayroll via CREATE2 |
| `getEmployerPayrolls(employer)` | View | All payrolls owned by employer |
| `getMyPayrolls()` | View (msg.sender) | All payrolls where caller is employee |
| `registerEmployee(employee)` | Only Payroll | Called by VeilPayroll on addEmployee |
| `unregisterEmployee(employee)` | Only Payroll | Called by VeilPayroll on removeEmployee |

### VeilPayroll (Per-Company Instance)

One instance per company per token. Inherits `ZamaEthereumConfig` for FHE coprocessor access.

**State:**

| Variable | Type | Visibility |
|----------|------|-----------|
| `employer` | address | Public |
| `payToken` | IERC20 | Public (immutable) |
| `salaries[emp]` | euint64 | Encrypted (employee + contract) |
| `balances[emp]` | euint64 | Encrypted (employee + contract) |
| `isEmployee[emp]` | bool | Public |
| `employeeList` | address[] | Employer only |
| `payrollRuns[id]` | PayrollRun | Public |
| `_runEmployees[id]` | address[] | Employer only |
| `_runTotalPaid[id]` | euint64 | Encrypted (employer) |

**PayrollRun struct:**

```
{
  employeeCount: uint256
  status: enum { Created=0, Executed=1 }
  createdAt: uint256
  executedAt: uint256
  batchProcessed: uint256   // tracks resume point
}
```

### Contract Functions

#### Fund Management

| Function | Access | Description |
|----------|--------|-------------|
| `deposit(amount)` | Employer | Transfer ERC-20 into contract pool |
| `getPoolBalance()` | View | Contract's token balance |

#### Employee Management

| Function | Access | Description |
|----------|--------|-------------|
| `addEmployee(addr, encSalary, proof)` | Employer | Register employee with encrypted salary |
| `updateSalary(addr, encSalary, proof)` | Employer | Update encrypted salary |
| `removeEmployee(addr)` | Employer | Unregister employee |
| `getMySalary()` | Employee (self) | Own encrypted salary handle |
| `getMyBalance()` | Employee (self) | Own encrypted balance handle |
| `getEmployeeList()` | Employer | All employee addresses |
| `getEmployeeCount()` | View | Total employees |

#### Pay Runs

| Function | Access | Description |
|----------|--------|-------------|
| `createPayrollRun(employees[])` | Employer | Snapshot employees, create run |
| `executePayrollRunBatch(runId, from, to)` | Employer | Process batch (max 10 per tx) |
| `getPayrollRun(runId)` | View | Run metadata |
| `getRunEmployees(runId)` | Employer | Employees in run |
| `getRunTotalPaid(runId)` | View | Encrypted total paid |
| `getRunCount()` | View | Number of runs |

#### Withdrawal (3-Step Async)

| Function | Access | Description |
|----------|--------|-------------|
| `requestWithdraw(amount)` | Employee | Start withdrawal, mark for decryption |
| `fulfillWithdraw(id, handles, cleartext, proof)` | Anyone | Complete with decryption proof |
| `getWithdrawDeducted(id)` | View | Encrypted handle for public decrypt |

## FHE Data Flow

### Salary Encryption (Write Path)

```
Browser                          Contract
  |                                 |
  | 1. createEncryptedInput()       |
  |    input.add64(salary)          |
  |    input.encrypt()              |
  |         |                       |
  |         v                       |
  | 2. addEmployee(addr, handle,    |
  |    inputProof)                  |
  |------------------------------>  |
  |                                 | 3. FHE.fromExternal(handle, proof)
  |                                 |    salaries[emp] = salary
  |                                 |    FHE.allowThis(salary)
  |                                 |    FHE.allow(salary, emp)
```

### Salary Decryption (Read Path)

```
Browser                     Relayer                  Contract
  |                            |                        |
  | 1. getMySalary()           |                        |
  |----------------------------------------------->     |
  |  <--- encrypted handle ----|----------------------  |
  |                            |                        |
  | 2. createEIP712(pubkey,    |                        |
  |    contract, timestamp)    |                        |
  | 3. wallet.signTypedData()  |                        |
  |                            |                        |
  | 4. userDecrypt(handle,     |                        |
  |    privkey, pubkey, sig)   |                        |
  |--------------------------->|                        |
  |                            | 5. Verify sig + decrypt|
  |  <--- cleartext value -----|                        |
```

### Pay Run Execution

```
Employer                         Contract
  |                                 |
  | 1. createPayrollRun([A, B, C]) |
  |------------------------------>  |
  |                                 | snapshot employees
  |                                 | status = Created
  |                                 |
  | 2. executePayrollRunBatch(      |
  |    runId, 0, 3)                 |
  |------------------------------>  |
  |                                 | for each employee:
  |                                 |   balance += salary (FHE.add)
  |                                 |   allow(balance, emp)
  |                                 | totalPaid += salary
  |                                 | status = Executed
```

### Withdrawal Flow

```
Employee              Browser/Relayer           Contract
  |                        |                       |
  | 1. requestWithdraw     |                       |
  |   (amount)             |                       |
  |----------------------------------------------> |
  |                        |                       | deducted = select(
  |                        |                       |   le(amount, balance),
  |                        |                       |   amount, 0)
  |                        |                       | makePubliclyDecryptable(
  |                        |                       |   deducted)
  |                        |                       | pending = true
  |                        |                       |
  | 2. getWithdrawDeducted |                       |
  |----------------------------------------------> |
  |  <--- handle --------- | --------------------- |
  |                        |                       |
  | 3. publicDecrypt       |                       |
  |   (handle)             |                       |
  |----------------------> |                       |
  |                        | decrypt via Gateway   |
  |  <--- proof + clear -- |                       |
  |                        |                       |
  | 4. fulfillWithdraw     |                       |
  |   (id, handles,        |                       |
  |    cleartext, proof)   |                       |
  |----------------------------------------------> |
  |                        |                       | checkSignatures(proof)
  |                        |                       | if clear == amount:
  |                        |                       |   balance -= amount
  |                        |                       |   transfer(user, amount)
  |                        |                       | else:
  |                        |                       |   emit Failed (insufficient)
```

## Frontend Service Layer

```
Pages (UI)
  |
  v
services/
  ├── payroll.ts    — All VeilPayroll contract interactions
  |     ├── Read: getPayrollOverview, getEmployeeList, getAllRuns, getRunDetail
  |     ├── Write: deposit, createPayrollRun, executePayrollRun
  |     ├── Employee: addEmployee, updateSalary, removeEmployee
  |     └── Withdraw: requestAndFulfillWithdraw (3-step)
  |
  └── factory.ts    — VeilFactory contract interactions
        ├── getEmployerPayrolls
        └── getEmployeePayrolls

utils/
  ├── fhevm.ts      — Zama SDK wrapper (encrypt, decrypt, publicDecrypt)
  └── contracts.ts  — ABI definitions + constants
```

### Key Types

```typescript
interface TokenInfo { address, symbol, decimals }
interface PayrollOverview { employeeCount, runCount, poolBalance, token }
interface PayrollRunInfo { id, employeeCount, status, createdAt, executedAt, batchProcessed }
interface PayrollRunDetail extends PayrollRunInfo { employees[], poolBalance, token }
```

## Privacy Model

| Data | On-Chain Visibility | Who Can Decrypt |
|------|-------------------|-----------------|
| Deposit amounts | Public | N/A (plaintext ERC-20) |
| Individual salaries | Encrypted (euint64) | Employee only |
| Employee balances | Encrypted (euint64) | Employee only |
| Pay run totals | Encrypted (euint64) | Employer only |
| Withdrawal amounts | Public after fulfill | N/A (plaintext transfer) |
| Employee addresses | Public | N/A |
| Employee count | Public | N/A |

## Security Considerations

**Overflow Protection**: All FHE subtractions use `FHE.select(FHE.le(a, b), result, zero)` to prevent underflow.

**Withdrawal Safety**: Balance is NOT deducted in `requestWithdraw`. Deduction only happens in `fulfillWithdraw` after proof verification. If balance is insufficient, `deducted` decrypts to 0 and the transaction is rejected.

**Access Control**: `FHE.allowThis()` + `FHE.allow(handle, user)` on every balance/salary mutation. Handles must be reassigned after allow operations.

**Batch Ordering**: `executePayrollRunBatch` enforces `fromIndex == batchProcessed` to prevent out-of-order or duplicate execution.
