// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VeilPayroll} from "./VeilPayroll.sol";

/**
 * @title  VeilFactory
 * @notice Global factory for deploying VeilPayroll instances via create2.
 *         Maintains reverse index: employee → payroll contracts.
 *         No FHE operations — does not inherit ZamaEthereumConfig.
 */
contract VeilFactory {
    // ──────────────────── State ────────────────────
    mapping(address => address[]) public employerPayrolls;  // employer → [payroll1, payroll2, ...]
    mapping(address => address[]) internal _employeePayrolls; // employee → [payroll1, payroll2, ...]
    mapping(address => bool) public isPayroll;
    address[] public allPayrolls;

    // For employee payroll removal (O(1) swap-and-pop)
    mapping(address => mapping(address => uint256)) internal _employeePayrollIndex; // employee → payroll → index

    // ──────────────────── Errors ────────────────────
    error OnlyPayroll();
    error ZeroAddress();
    error DeployFailed();

    // ──────────────────── Events ────────────────────
    event PayrollCreated(address indexed employer, address indexed payroll, address indexed payToken);

    // ──────────────────── Modifiers ────────────────────
    modifier onlyPayroll() {
        if (!isPayroll[msg.sender]) revert OnlyPayroll();
        _;
    }

    // ════════════════════════════════════════════════════
    //  Deploy
    // ════════════════════════════════════════════════════

    /**
     * @notice Deploy a new VeilPayroll for the caller (employer).
     * @param salt      Salt for create2 (employer can choose for address predictability).
     * @param payToken  ERC-20 token address for salary payments (e.g. USDT, USDC).
     * @return payroll  The deployed VeilPayroll address.
     */
    function createPayroll(bytes32 salt, address payToken) external returns (address payroll) {
        if (payToken == address(0)) revert ZeroAddress();

        // Combine caller into salt so each employer gets unique addresses
        bytes32 finalSalt = keccak256(abi.encodePacked(msg.sender, salt));

        // Deploy via create2 — employer becomes owner (VeilPayroll constructor uses msg.sender,
        // but create2 deploys from this factory, so we pass employer via a different pattern).
        // We use a thin approach: deploy, then the payroll's msg.sender is this factory.
        // So VeilPayroll constructor sets employer = msg.sender = factory, which is wrong.
        // Fix: pass employer as constructor arg.

        // Actually, we need to adjust. Let's deploy with constructor args.
        bytes memory bytecode = abi.encodePacked(
            type(VeilPayroll).creationCode,
            abi.encode(payToken, address(this), msg.sender)
        );

        assembly {
            payroll := create2(0, add(bytecode, 0x20), mload(bytecode), finalSalt)
        }
        if (payroll == address(0)) revert DeployFailed();

        isPayroll[payroll] = true;
        employerPayrolls[msg.sender].push(payroll);
        allPayrolls.push(payroll);

        emit PayrollCreated(msg.sender, payroll, payToken);
    }

    // ════════════════════════════════════════════════════
    //  Employee reverse index (called by VeilPayroll)
    // ════════════════════════════════════════════════════

    function registerEmployee(address employee) external onlyPayroll {
        _employeePayrollIndex[employee][msg.sender] = _employeePayrolls[employee].length;
        _employeePayrolls[employee].push(msg.sender);
    }

    function unregisterEmployee(address employee) external onlyPayroll {
        address[] storage payrolls = _employeePayrolls[employee];
        uint256 idx = _employeePayrollIndex[employee][msg.sender];
        address last = payrolls[payrolls.length - 1];
        payrolls[idx] = last;
        _employeePayrollIndex[employee][last] = idx;
        payrolls.pop();
        delete _employeePayrollIndex[employee][msg.sender];
    }

    // ════════════════════════════════════════════════════
    //  Queries
    // ════════════════════════════════════════════════════

    /// @notice Employee queries which payrolls they belong to.
    function getMyPayrolls() external view returns (address[] memory) {
        return _employeePayrolls[msg.sender];
    }

    /// @notice Get all payrolls deployed by an employer.
    function getEmployerPayrolls(address employer) external view returns (address[] memory) {
        return employerPayrolls[employer];
    }

    /// @notice Total number of deployed payrolls.
    function getPayrollCount() external view returns (uint256) {
        return allPayrolls.length;
    }
}
