// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {VeilToken} from "./VeilToken.sol";

/**
 * @title  VeilPayroll
 * @notice All-in-one confidential payroll contract: employee registry, salary engine, and audit ACL.
 *         Merging avoids cross-contract FHE ACL headaches — salary handles stay internal.
 */
contract VeilPayroll is ZamaEthereumConfig {
    // ──────────────────── State ────────────────────
    address public employer;
    VeilToken public token;

    // Employee registry
    mapping(address => euint64) internal salaries;
    mapping(address => bool) public isEmployee;
    address[] internal employeeList;
    mapping(address => uint256) internal employeeIndex;

    // Payroll engine
    uint64 public taxDivisor;
    euint64 internal lastPayrollTotal;
    uint256 public lastPayrollTimestamp;
    uint256 public payrollNonce;           // Increments each full payroll cycle
    uint256 public currentBatchNonce;      // Tracks which cycle batches belong to
    uint256 public constant MAX_BATCH_SIZE = 10;
    uint256 public constant MIN_PAYROLL_INTERVAL = 1 days;

    // Audit ACL
    mapping(address => bool) public isAuditor;
    address[] internal auditorList;
    mapping(address => uint256) internal auditorIndex;

    // ──────────────────── Errors ────────────────────
    error OnlyEmployer();
    error AlreadyEmployee();
    error NotEmployee();
    error AlreadyAuditor();
    error NotAuditor();
    error ZeroAddress();
    error NoEmployees();
    error BatchTooLarge();
    error InvalidRange();
    error InvalidTaxDivisor();
    error PayrollTooSoon();

    // ──────────────────── Events ────────────────────
    event EmployeeAdded(address indexed employee);
    event EmployeeRemoved(address indexed employee);
    event SalaryUpdated(address indexed employee);
    event PayrollExecuted(uint256 employeeCount, uint256 timestamp);
    event TaxRateUpdated(uint64 newDivisor);
    event AuditorGranted(address indexed auditor);
    event AuditorRevoked(address indexed auditor);
    event PayrollMadePublic();

    // ──────────────────── Modifiers ────────────────────
    modifier onlyEmployer() {
        if (msg.sender != employer) revert OnlyEmployer();
        _;
    }

    modifier employeeExists(address employee) {
        if (!isEmployee[employee]) revert NotEmployee();
        _;
    }

    // ──────────────────── Constructor ────────────────────
    constructor(address _token) {
        employer = msg.sender;
        token = VeilToken(_token);
        taxDivisor = 5; // 20% tax
    }

    // ════════════════════════════════════════════════════
    //  Employee management
    // ════════════════════════════════════════════════════

    function addEmployee(
        address employee,
        externalEuint64 encSalary,
        bytes calldata inputProof
    ) external onlyEmployer {
        if (employee == address(0)) revert ZeroAddress();
        if (isEmployee[employee]) revert AlreadyEmployee();

        euint64 salary = FHE.fromExternal(encSalary, inputProof);
        salaries[employee] = salary;
        salaries[employee] = FHE.allowThis(salaries[employee]);
        salaries[employee] = FHE.allow(salaries[employee], employee);

        employeeIndex[employee] = employeeList.length;
        employeeList.push(employee);
        isEmployee[employee] = true;

        emit EmployeeAdded(employee);
    }

    function updateSalary(
        address employee,
        externalEuint64 encSalary,
        bytes calldata inputProof
    ) external onlyEmployer employeeExists(employee) {
        euint64 salary = FHE.fromExternal(encSalary, inputProof);
        salaries[employee] = salary;
        salaries[employee] = FHE.allowThis(salaries[employee]);
        salaries[employee] = FHE.allow(salaries[employee], employee);

        emit SalaryUpdated(employee);
    }

    function removeEmployee(address employee) external onlyEmployer employeeExists(employee) {
        salaries[employee] = FHE.asEuint64(0);
        isEmployee[employee] = false;

        uint256 idx = employeeIndex[employee];
        address last = employeeList[employeeList.length - 1];
        employeeList[idx] = last;
        employeeIndex[last] = idx;
        employeeList.pop();
        delete employeeIndex[employee];

        emit EmployeeRemoved(employee);
    }

    /// @notice Employee views own encrypted salary.
    function getMySalary() external view returns (euint64) {
        if (!isEmployee[msg.sender]) revert NotEmployee();
        return salaries[msg.sender];
    }

    function getEmployeeCount() external view returns (uint256) {
        return employeeList.length;
    }

    function getEmployeeList() external view onlyEmployer returns (address[] memory) {
        return employeeList;
    }

    // ════════════════════════════════════════════════════
    //  Payroll execution
    // ════════════════════════════════════════════════════

    /**
     * @notice Run payroll for all employees (≤ MAX_BATCH_SIZE).
     *         For each employee: netPay = salary - salary/taxDivisor.
     */
    function runPayroll() external onlyEmployer {
        if (block.timestamp < lastPayrollTimestamp + MIN_PAYROLL_INTERVAL) revert PayrollTooSoon();

        uint256 count = employeeList.length;
        if (count == 0) revert NoEmployees();
        if (count > MAX_BATCH_SIZE) revert BatchTooLarge();

        lastPayrollTotal = _processRange(0, count);
        _allowPayrollTotal();
        lastPayrollTimestamp = block.timestamp;
        payrollNonce++;

        emit PayrollExecuted(count, block.timestamp);
    }

    /**
     * @notice Start a new batch payroll cycle. Must be called before runPayrollBatch.
     *         Resets the accumulator and enforces the cooldown period.
     */
    function startPayrollBatch() external onlyEmployer {
        if (block.timestamp < lastPayrollTimestamp + MIN_PAYROLL_INTERVAL) revert PayrollTooSoon();
        payrollNonce++;
        currentBatchNonce = payrollNonce;
        lastPayrollTotal = FHE.asEuint64(0);
    }

    /**
     * @notice Run payroll for a slice [fromIndex, toIndex). Use for >10 employees.
     *         Must call startPayrollBatch() first for each new pay period.
     */
    function runPayrollBatch(uint256 fromIndex, uint256 toIndex) external onlyEmployer {
        if (currentBatchNonce != payrollNonce) revert InvalidRange(); // must call startPayrollBatch first
        if (toIndex <= fromIndex) revert InvalidRange();
        if (toIndex - fromIndex > MAX_BATCH_SIZE) revert BatchTooLarge();
        if (toIndex > employeeList.length) revert InvalidRange();

        euint64 batchTotal = _processRange(fromIndex, toIndex);
        lastPayrollTotal = FHE.add(lastPayrollTotal, batchTotal);
        _allowPayrollTotal();
        lastPayrollTimestamp = block.timestamp;

        emit PayrollExecuted(toIndex - fromIndex, block.timestamp);
    }

    function _processRange(uint256 from, uint256 to) internal returns (euint64 totalPaid) {
        totalPaid = FHE.asEuint64(0);

        for (uint256 i = from; i < to; i++) {
            address emp = employeeList[i];
            euint64 salary = salaries[emp]; // No cross-contract ACL needed!

            euint64 tax = FHE.div(salary, taxDivisor);
            ebool valid = FHE.le(tax, salary);
            euint64 netPay = FHE.sub(salary, tax);
            netPay = FHE.select(valid, netPay, FHE.asEuint64(0));

            // Allow token contract to use this handle
            netPay = FHE.allowThis(netPay);
            netPay = FHE.allow(netPay, address(token));

            token.encryptedTransferFrom(employer, emp, netPay);
            totalPaid = FHE.add(totalPaid, netPay);
        }
    }

    /// @notice Returns the encrypted total of the last payroll run.
    function getLastPayrollTotal() external view returns (euint64) {
        return lastPayrollTotal;
    }

    // ════════════════════════════════════════════════════
    //  Tax configuration
    // ════════════════════════════════════════════════════

    function setTaxRate(uint64 divisor) external onlyEmployer {
        if (divisor < 2 || divisor > 100) revert InvalidTaxDivisor();
        taxDivisor = divisor;
        emit TaxRateUpdated(divisor);
    }

    // ════════════════════════════════════════════════════
    //  Audit ACL
    // ════════════════════════════════════════════════════

    function grantAuditorAccess(address auditor) external onlyEmployer {
        if (auditor == address(0)) revert ZeroAddress();
        if (isAuditor[auditor]) revert AlreadyAuditor();

        isAuditor[auditor] = true;
        auditorIndex[auditor] = auditorList.length;
        auditorList.push(auditor);

        // Grant FHE permission on the payroll total
        FHE.allow(lastPayrollTotal, auditor);

        emit AuditorGranted(auditor);
    }

    function revokeAuditorAccess(address auditor) external onlyEmployer {
        if (!isAuditor[auditor]) revert NotAuditor();

        isAuditor[auditor] = false;
        uint256 idx = auditorIndex[auditor];
        address last = auditorList[auditorList.length - 1];
        auditorList[idx] = last;
        auditorIndex[last] = idx;
        auditorList.pop();
        delete auditorIndex[auditor];

        emit AuditorRevoked(auditor);
    }

    /// @notice Auditor views encrypted aggregate payroll total.
    function getAggregatePayroll() external view returns (euint64) {
        if (!isAuditor[msg.sender]) revert NotAuditor();
        return lastPayrollTotal;
    }

    /// @notice Make the payroll total publicly decryptable.
    function makePayrollPublic() external onlyEmployer {
        FHE.makePubliclyDecryptable(lastPayrollTotal);
        emit PayrollMadePublic();
    }

    function getAuditorCount() external view returns (uint256) {
        return auditorList.length;
    }

    // ════════════════════════════════════════════════════
    //  Internal
    // ════════════════════════════════════════════════════

    function _allowPayrollTotal() internal {
        lastPayrollTotal = FHE.allowThis(lastPayrollTotal);
        lastPayrollTotal = FHE.allow(lastPayrollTotal, employer);
        // Pre-allow all current auditors
        for (uint256 i = 0; i < auditorList.length; i++) {
            lastPayrollTotal = FHE.allow(lastPayrollTotal, auditorList[i]);
        }
    }
}
