import { BigInt } from "@graphprotocol/graph-ts";
import {
  Deposited,
  EmployeeAdded,
  EmployeeRemoved,
  PayrollRunCreated,
  PayrollRunExecuted,
  TaxRateUpdated,
  WithdrawRequested,
  WithdrawCompleted,
  WithdrawFailed,
} from "../generated/templates/VeilPayroll/VeilPayroll";
import {
  Payroll,
  Employee,
  PayrollRun,
  Deposit,
  Withdrawal,
} from "../generated/schema";

// ── Fund management ──

export function handleDeposited(event: Deposited): void {
  let id =
    event.transaction.hash.toHexString() +
    "-" +
    event.logIndex.toString();
  let deposit = new Deposit(id);
  deposit.payroll = event.address;
  deposit.employer = event.params.employer;
  deposit.amount = event.params.amount;
  deposit.timestamp = event.block.timestamp;
  deposit.tx = event.transaction.hash;
  deposit.save();

  let payroll = Payroll.load(event.address);
  if (payroll) {
    payroll.poolDeposited = payroll.poolDeposited.plus(event.params.amount);
    payroll.save();
  }
}

// ── Employee management ──

export function handleEmployeeAdded(event: EmployeeAdded): void {
  let id =
    event.address.toHexString() + "-" + event.params.employee.toHexString();
  let employee = Employee.load(id);
  if (!employee) {
    employee = new Employee(id);
    employee.payroll = event.address;
    employee.address = event.params.employee;
  }
  employee.active = true;
  employee.addedAt = event.block.timestamp;
  employee.removedAt = null;
  employee.save();
}

export function handleEmployeeRemoved(event: EmployeeRemoved): void {
  let id =
    event.address.toHexString() + "-" + event.params.employee.toHexString();
  let employee = Employee.load(id);
  if (employee) {
    employee.active = false;
    employee.removedAt = event.block.timestamp;
    employee.save();
  }
}

// ── Payroll runs ──

export function handlePayrollRunCreated(event: PayrollRunCreated): void {
  let id =
    event.address.toHexString() + "-" + event.params.runId.toString();
  let run = new PayrollRun(id);
  run.payroll = event.address;
  run.runId = event.params.runId;
  run.employeeCount = event.params.employeeCount.toI32();
  run.status = "Created";
  run.createdAt = event.block.timestamp;
  run.createdTx = event.transaction.hash;
  run.save();
}

export function handlePayrollRunExecuted(event: PayrollRunExecuted): void {
  let id =
    event.address.toHexString() + "-" + event.params.runId.toString();
  let run = PayrollRun.load(id);
  if (run) {
    run.status = "Executed";
    run.executedAt = event.params.timestamp;
    run.executedTx = event.transaction.hash;
    run.save();
  }
}

// ── Tax rate ──

export function handleTaxRateUpdated(event: TaxRateUpdated): void {
  let payroll = Payroll.load(event.address);
  if (payroll) {
    payroll.taxDivisor = event.params.newDivisor.toI32();
    payroll.save();
  }
}

// ── Withdrawals ──

export function handleWithdrawRequested(event: WithdrawRequested): void {
  let id =
    event.address.toHexString() + "-" + event.params.id.toString();
  let withdrawal = new Withdrawal(id);
  withdrawal.payroll = event.address;
  withdrawal.withdrawId = event.params.id;
  withdrawal.user = event.params.user;
  withdrawal.amount = event.params.amount;
  withdrawal.status = "Pending";
  withdrawal.requestedAt = event.block.timestamp;
  withdrawal.requestTx = event.transaction.hash;
  withdrawal.save();
}

export function handleWithdrawCompleted(event: WithdrawCompleted): void {
  let id =
    event.address.toHexString() + "-" + event.params.id.toString();
  let withdrawal = Withdrawal.load(id);
  if (withdrawal) {
    withdrawal.status = "Completed";
    withdrawal.completedAt = event.block.timestamp;
    withdrawal.completeTx = event.transaction.hash;
    withdrawal.save();
  }
}

export function handleWithdrawFailed(event: WithdrawFailed): void {
  let id =
    event.address.toHexString() + "-" + event.params.id.toString();
  let withdrawal = Withdrawal.load(id);
  if (withdrawal) {
    withdrawal.status = "Failed";
    withdrawal.completedAt = event.block.timestamp;
    withdrawal.completeTx = event.transaction.hash;
    withdrawal.save();
  }
}
