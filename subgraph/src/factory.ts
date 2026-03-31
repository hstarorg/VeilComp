import { PayrollCreated } from "../generated/VeilFactory/VeilFactory";
import { VeilPayroll as VeilPayrollTemplate } from "../generated/templates";
import { Payroll } from "../generated/schema";
import { BigInt } from "@graphprotocol/graph-ts";

export function handlePayrollCreated(event: PayrollCreated): void {
  let payroll = new Payroll(event.params.payroll);
  payroll.employer = event.params.employer;
  payroll.payToken = event.params.payToken;
  payroll.taxDivisor = 5; // default
  payroll.poolDeposited = BigInt.zero();
  payroll.createdAt = event.block.timestamp;
  payroll.createdTx = event.transaction.hash;
  payroll.save();

  // Start indexing events from the new payroll contract
  VeilPayrollTemplate.create(event.params.payroll);
}
