// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {FHE, euint64, externalEuint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

interface IVeilFactory {
    function registerEmployee(address employee) external;
    function unregisterEmployee(address employee) external;
}

/**
 * @title  VeilPayroll
 * @notice Confidential payroll with independent employee management and monthly payroll runs.
 *         Each instance is bound to one ERC-20 token and one employer. Deployed via VeilFactory.
 *
 *         Monthly workflow:
 *           1. Manage employees (add/remove/update salary) — anytime
 *           2. createPayrollRun(employees[]) — snapshot selected employees
 *           3. deposit(amount) — ensure pool is funded
 *           4. executePayrollRun(runId) — irreversible salary distribution
 */
contract VeilPayroll is ZamaEthereumConfig {
    using SafeERC20 for IERC20;

    // ──────────────────── Enums & Structs ────────────────────

    enum PayrollStatus { Created, Executed }

    struct PayrollRun {
        uint256 employeeCount;
        PayrollStatus status;
        uint256 createdAt;
        uint256 executedAt;
        uint256 batchProcessed; // tracks progress for batch execution
    }

    // ──────────────────── State ────────────────────

    address public employer;
    IERC20 public immutable payToken;
    IVeilFactory public immutable factory;

    // Employee registry (independent management)
    mapping(address => euint64) internal salaries;
    mapping(address => euint64) internal balances; // earned but not yet withdrawn
    mapping(address => bool) public isEmployee;
    address[] internal employeeList;
    mapping(address => uint256) internal employeeIndex;

    // Payroll runs
    uint64 public taxDivisor;
    uint256 public nextRunId;
    mapping(uint256 => PayrollRun) public payrollRuns;
    mapping(uint256 => address[]) internal _runEmployees; // runId → snapshot
    mapping(uint256 => euint64) internal _runTotalPaid;   // runId → encrypted total

    // Withdraw
    struct WithdrawRequest {
        address user;
        uint256 amount;
        bool pending;
    }
    uint256 public nextWithdrawId;
    mapping(uint256 => WithdrawRequest) public withdrawRequests;
    mapping(uint256 => euint64) internal _withdrawDeducted;

    // ──────────────────── Errors ────────────────────
    error OnlyEmployer();
    error AlreadyEmployee();
    error NotEmployee();
    error ZeroAddress();
    error ZeroAmount();
    error AmountOverflow();
    error NoEmployees();
    error InvalidRange();
    error InvalidTaxDivisor();
    error RunNotCreated();
    error RunAlreadyExecuted();
    error BatchOutOfOrder();
    error WithdrawNotPending();

    // ──────────────────── Events ────────────────────
    event Deposited(address indexed employer, uint256 amount);
    event EmployeeAdded(address indexed employee);
    event EmployeeRemoved(address indexed employee);
    event SalaryUpdated(address indexed employee);
    event PayrollRunCreated(uint256 indexed runId, uint256 employeeCount);
    event PayrollRunExecuted(uint256 indexed runId, uint256 employeeCount, uint256 timestamp);
    event PayrollBatchProcessed(uint256 indexed runId, uint256 fromIndex, uint256 toIndex);
    event TaxRateUpdated(uint64 newDivisor);
    event WithdrawRequested(uint256 indexed id, address indexed user, uint256 amount);
    event WithdrawCompleted(uint256 indexed id, address indexed user, uint256 amount);
    event WithdrawFailed(uint256 indexed id, address indexed user);

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
    constructor(address _payToken, address _factory, address _employer) {
        employer = _employer;
        payToken = IERC20(_payToken);
        factory = IVeilFactory(_factory);
        taxDivisor = 5; // 20% tax
    }

    // ════════════════════════════════════════════════════
    //  Fund management
    // ════════════════════════════════════════════════════

    function deposit(uint256 amount) external onlyEmployer {
        if (amount == 0) revert ZeroAmount();
        payToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    function getPoolBalance() external view returns (uint256) {
        return payToken.balanceOf(address(this));
    }

    // ════════════════════════════════════════════════════
    //  Employee management (independent, anytime)
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

        balances[employee] = FHE.asEuint64(0);
        balances[employee] = FHE.allowThis(balances[employee]);
        balances[employee] = FHE.allow(balances[employee], employee);

        employeeIndex[employee] = employeeList.length;
        employeeList.push(employee);
        isEmployee[employee] = true;

        factory.registerEmployee(employee);

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

        factory.unregisterEmployee(employee);

        emit EmployeeRemoved(employee);
    }

    function getMySalary() external view returns (euint64) {
        if (!isEmployee[msg.sender]) revert NotEmployee();
        return salaries[msg.sender];
    }

    function getMyBalance() external view returns (euint64) {
        return balances[msg.sender];
    }

    function getEmployeeCount() external view returns (uint256) {
        return employeeList.length;
    }

    function getEmployeeList() external view onlyEmployer returns (address[] memory) {
        return employeeList;
    }

    // ════════════════════════════════════════════════════
    //  Payroll runs (monthly lifecycle)
    // ════════════════════════════════════════════════════

    /// @notice Create a payroll run with selected employees (snapshot).
    /// @param employees Array of employee addresses to include in this run.
    function createPayrollRun(address[] calldata employees) external onlyEmployer returns (uint256 runId) {
        uint256 count = employees.length;
        if (count == 0) revert NoEmployees();

        // Validate all addresses are current employees
        for (uint256 i = 0; i < count; i++) {
            if (!isEmployee[employees[i]]) revert NotEmployee();
        }

        runId = nextRunId++;

        // Snapshot employee list
        _runEmployees[runId] = employees;

        // Init encrypted total
        _runTotalPaid[runId] = FHE.asEuint64(0);
        _runTotalPaid[runId] = FHE.allowThis(_runTotalPaid[runId]);

        payrollRuns[runId] = PayrollRun({
            employeeCount: count,
            status: PayrollStatus.Created,
            createdAt: block.timestamp,
            executedAt: 0,
            batchProcessed: 0
        });

        emit PayrollRunCreated(runId, count);
    }

    /// @notice Execute a payroll run in sequential batches.
    ///         Call repeatedly with consecutive ranges: [0, a), [a, b), [b, count).
    ///         Works for both small and large employee counts.
    function executePayrollRunBatch(uint256 runId, uint256 fromIndex, uint256 toIndex) external onlyEmployer {
        PayrollRun storage run = payrollRuns[runId];
        if (run.createdAt == 0) revert RunNotCreated();
        if (run.status == PayrollStatus.Executed) revert RunAlreadyExecuted();
        if (fromIndex != run.batchProcessed) revert BatchOutOfOrder();
        if (toIndex <= fromIndex) revert InvalidRange();
        if (toIndex > run.employeeCount) revert InvalidRange();

        euint64 batchTotal = _processRunRange(runId, fromIndex, toIndex);
        _runTotalPaid[runId] = FHE.add(_runTotalPaid[runId], batchTotal);
        _runTotalPaid[runId] = FHE.allowThis(_runTotalPaid[runId]);

        run.batchProcessed = toIndex;

        if (toIndex == run.employeeCount) {
            run.status = PayrollStatus.Executed;
            run.executedAt = block.timestamp;
            _allowRunTotal(runId);
            emit PayrollRunExecuted(runId, run.employeeCount, block.timestamp);
        } else {
            emit PayrollBatchProcessed(runId, fromIndex, toIndex);
        }
    }

    /// @dev Process a range of employees in a payroll run, crediting balances.
    function _processRunRange(uint256 runId, uint256 from, uint256 to) internal returns (euint64 totalPaid) {
        totalPaid = FHE.asEuint64(0);
        address[] storage employees = _runEmployees[runId];

        for (uint256 i = from; i < to; i++) {
            address emp = employees[i];
            euint64 salary = salaries[emp];

            euint64 tax = FHE.div(salary, taxDivisor);
            ebool valid = FHE.le(tax, salary);
            euint64 netPay = FHE.sub(salary, tax);
            netPay = FHE.select(valid, netPay, FHE.asEuint64(0));

            balances[emp] = FHE.add(balances[emp], netPay);
            balances[emp] = FHE.allowThis(balances[emp]);
            balances[emp] = FHE.allow(balances[emp], emp);

            totalPaid = FHE.add(totalPaid, netPay);
        }
    }

    function setTaxRate(uint64 divisor) external onlyEmployer {
        if (divisor < 2 || divisor > 100) revert InvalidTaxDivisor();
        taxDivisor = divisor;
        emit TaxRateUpdated(divisor);
    }

    // ════════════════════════════════════════════════════
    //  Payroll run queries
    // ════════════════════════════════════════════════════

    function getPayrollRun(uint256 runId) external view returns (PayrollRun memory) {
        return payrollRuns[runId];
    }

    function getRunEmployees(uint256 runId) external view onlyEmployer returns (address[] memory) {
        return _runEmployees[runId];
    }

    function getRunTotalPaid(uint256 runId) external view returns (euint64) {
        return _runTotalPaid[runId];
    }

    function getRunCount() external view returns (uint256) {
        return nextRunId;
    }

    // ════════════════════════════════════════════════════
    //  Employee withdrawal (async via Zama Gateway)
    // ════════════════════════════════════════════════════

    function requestWithdraw(uint256 amount) external returns (uint256 id) {
        if (amount == 0) revert ZeroAmount();
        if (amount > type(uint64).max) revert AmountOverflow();

        id = nextWithdrawId++;

        euint64 encAmount = FHE.asEuint64(uint64(amount));
        ebool sufficient = FHE.le(encAmount, balances[msg.sender]);
        euint64 deducted = FHE.select(sufficient, encAmount, FHE.asEuint64(0));

        balances[msg.sender] = FHE.sub(balances[msg.sender], deducted);
        balances[msg.sender] = FHE.allowThis(balances[msg.sender]);
        balances[msg.sender] = FHE.allow(balances[msg.sender], msg.sender);

        _withdrawDeducted[id] = deducted;
        _withdrawDeducted[id] = FHE.allowThis(_withdrawDeducted[id]);
        FHE.makePubliclyDecryptable(_withdrawDeducted[id]);

        withdrawRequests[id] = WithdrawRequest({
            user: msg.sender,
            amount: amount,
            pending: true
        });

        emit WithdrawRequested(id, msg.sender, amount);
    }

    function fulfillWithdraw(
        uint256 id,
        bytes32[] calldata handlesList,
        bytes calldata abiEncodedCleartexts,
        bytes calldata decryptionProof
    ) external {
        WithdrawRequest storage req = withdrawRequests[id];
        if (!req.pending) revert WithdrawNotPending();

        FHE.checkSignatures(handlesList, abiEncodedCleartexts, decryptionProof);

        uint64 decryptedAmount = abi.decode(abiEncodedCleartexts, (uint64));
        req.pending = false;

        if (decryptedAmount == uint64(req.amount)) {
            payToken.safeTransfer(req.user, req.amount);
            emit WithdrawCompleted(id, req.user, req.amount);
        } else {
            emit WithdrawFailed(id, req.user);
        }
    }

    // ════════════════════════════════════════════════════
    //  Internal
    // ════════════════════════════════════════════════════

    function _allowRunTotal(uint256 runId) internal {
        _runTotalPaid[runId] = FHE.allowThis(_runTotalPaid[runId]);
        _runTotalPaid[runId] = FHE.allow(_runTotalPaid[runId], employer);
    }
}
