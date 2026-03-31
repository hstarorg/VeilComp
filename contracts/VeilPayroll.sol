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
 * @notice All-in-one confidential payroll: employee registry, fund pool, payroll engine, audit ACL.
 *         Each instance is bound to one ERC-20 token (e.g. USDT) and one employer.
 *         Deployed via VeilFactory (create2).
 *
 *         Fund flow:
 *           Deposit:  employer → approve token → deposit(amount) → tokens locked in contract
 *           Payroll:  runPayroll() → internal FHE accounting (no external transfer)
 *           Withdraw: employee → requestWithdraw(amount) → Relayer callback → tokens released
 */
contract VeilPayroll is ZamaEthereumConfig {
    using SafeERC20 for IERC20;

    // ──────────────────── State ────────────────────
    address public employer;
    IERC20 public immutable payToken;
    IVeilFactory public immutable factory;

    // Employee registry
    mapping(address => euint64) internal salaries;
    mapping(address => euint64) internal balances; // earned but not yet withdrawn
    mapping(address => bool) public isEmployee;
    address[] internal employeeList;
    mapping(address => uint256) internal employeeIndex;

    // Payroll engine
    uint64 public taxDivisor;
    euint64 internal lastPayrollTotal;
    uint256 public lastPayrollTimestamp;
    uint256 public payrollNonce;
    uint256 public currentBatchNonce;
    uint256 public constant MAX_BATCH_SIZE = 10;
    uint256 public constant MIN_PAYROLL_INTERVAL = 1 days;

    // Audit ACL
    mapping(address => bool) public isAuditor;
    address[] internal auditorList;
    mapping(address => uint256) internal auditorIndex;

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
    error AlreadyAuditor();
    error NotAuditor();
    error ZeroAddress();
    error ZeroAmount();
    error AmountOverflow();
    error NoEmployees();
    error BatchTooLarge();
    error InvalidRange();
    error InvalidTaxDivisor();
    error PayrollTooSoon();
    error WithdrawNotPending();

    // ──────────────────── Events ────────────────────
    event Deposited(address indexed employer, uint256 amount);
    event EmployeeAdded(address indexed employee);
    event EmployeeRemoved(address indexed employee);
    event SalaryUpdated(address indexed employee);
    event PayrollExecuted(uint256 employeeCount, uint256 timestamp);
    event TaxRateUpdated(uint64 newDivisor);
    event AuditorGranted(address indexed auditor);
    event AuditorRevoked(address indexed auditor);
    event PayrollMadePublic();
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
    /// @param _payToken ERC-20 token for salary payments.
    /// @param _factory  VeilFactory address (for employee reverse index).
    /// @param _employer The company that owns this payroll. Passed by Factory since
    ///                  create2 deployment makes msg.sender = factory, not employer.
    constructor(address _payToken, address _factory, address _employer) {
        employer = _employer;
        payToken = IERC20(_payToken);
        factory = IVeilFactory(_factory);
        taxDivisor = 5; // 20% tax
    }

    // ════════════════════════════════════════════════════
    //  Fund management
    // ════════════════════════════════════════════════════

    /// @notice Employer deposits ERC-20 tokens into the payroll pool.
    function deposit(uint256 amount) external onlyEmployer {
        if (amount == 0) revert ZeroAmount();
        payToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    /// @notice Pool balance (plaintext, public info for employer to check funding).
    function getPoolBalance() external view returns (uint256) {
        return payToken.balanceOf(address(this));
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

        // Init balance to 0
        balances[employee] = FHE.asEuint64(0);
        balances[employee] = FHE.allowThis(balances[employee]);
        balances[employee] = FHE.allow(balances[employee], employee);

        employeeIndex[employee] = employeeList.length;
        employeeList.push(employee);
        isEmployee[employee] = true;

        // Register in factory reverse index
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
        // Note: balance is NOT zeroed — employee can still withdraw earned funds
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

    /// @notice Employee views own encrypted salary.
    function getMySalary() external view returns (euint64) {
        if (!isEmployee[msg.sender]) revert NotEmployee();
        return salaries[msg.sender];
    }

    /// @notice Employee views own encrypted withdrawable balance.
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
    //  Payroll execution
    // ════════════════════════════════════════════════════

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

    function startPayrollBatch() external onlyEmployer {
        if (block.timestamp < lastPayrollTimestamp + MIN_PAYROLL_INTERVAL) revert PayrollTooSoon();
        payrollNonce++;
        currentBatchNonce = payrollNonce;
        lastPayrollTotal = FHE.asEuint64(0);
    }

    function runPayrollBatch(uint256 fromIndex, uint256 toIndex) external onlyEmployer {
        if (currentBatchNonce != payrollNonce) revert InvalidRange();
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
            euint64 salary = salaries[emp];

            euint64 tax = FHE.div(salary, taxDivisor);
            ebool valid = FHE.le(tax, salary);
            euint64 netPay = FHE.sub(salary, tax);
            netPay = FHE.select(valid, netPay, FHE.asEuint64(0));

            // Credit to employee's internal balance (no external transfer)
            balances[emp] = FHE.add(balances[emp], netPay);
            balances[emp] = FHE.allowThis(balances[emp]);
            balances[emp] = FHE.allow(balances[emp], emp);

            totalPaid = FHE.add(totalPaid, netPay);
        }
    }

    function getLastPayrollTotal() external view returns (euint64) {
        return lastPayrollTotal;
    }

    function setTaxRate(uint64 divisor) external onlyEmployer {
        if (divisor < 2 || divisor > 100) revert InvalidTaxDivisor();
        taxDivisor = divisor;
        emit TaxRateUpdated(divisor);
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
    //  Audit ACL
    // ════════════════════════════════════════════════════

    function grantAuditorAccess(address auditor) external onlyEmployer {
        if (auditor == address(0)) revert ZeroAddress();
        if (isAuditor[auditor]) revert AlreadyAuditor();

        isAuditor[auditor] = true;
        auditorIndex[auditor] = auditorList.length;
        auditorList.push(auditor);
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

    function getAggregatePayroll() external view returns (euint64) {
        if (!isAuditor[msg.sender]) revert NotAuditor();
        return lastPayrollTotal;
    }

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
        for (uint256 i = 0; i < auditorList.length; i++) {
            lastPayrollTotal = FHE.allow(lastPayrollTotal, auditorList[i]);
        }
    }
}
