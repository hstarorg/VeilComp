// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {FHE, euint64, externalEuint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title  VeilToken (vcUSDT)
 * @notice 1:1 encrypted wrapper around USDT for the VeilComp payroll protocol.
 *
 *         Deposit:  User approves USDT → calls deposit(amount) → USDT locked, encrypted vcUSDT minted.
 *         Withdraw: Requires async FHE decryption (Zama Gateway) — future implementation.
 *
 *         All vcUSDT balances are stored as FHE-encrypted euint64.
 *         Public ERC20 read functions return 0; plaintext transfer functions revert.
 */
contract VeilToken is ERC20, ZamaEthereumConfig {
    using SafeERC20 for IERC20;

    // ──────────────────── State ────────────────────
    IERC20 public immutable usdt;

    mapping(address => euint64) internal _encBalances;
    euint64 internal _encTotalSupply;
    mapping(address => mapping(address => bool)) internal _fheApprovals;

    // Withdrawal state
    struct WithdrawRequest {
        address user;
        uint256 amount;
        bool pending;
    }
    uint256 public nextWithdrawId;
    mapping(uint256 => WithdrawRequest) public withdrawRequests;
    mapping(uint256 => euint64) internal _withdrawDeducted; // actual deducted amount (0 if insufficient)

    // ──────────────────── Errors ────────────────────
    error TransferToZeroAddress();
    error ApprovalToZeroAddress();
    error NotApproved();
    error PlaintextTransferDisabled();
    error ZeroAmount();
    error AmountOverflow();
    error InvalidWithdrawId();
    error WithdrawNotPending();
    error InvalidDecryptionProof();

    // ──────────────────── Events ────────────────────
    event Deposit(address indexed user, uint256 amount);
    event WithdrawRequested(uint256 indexed id, address indexed user, uint256 amount);
    event WithdrawCompleted(uint256 indexed id, address indexed user, uint256 amount);
    event WithdrawFailed(uint256 indexed id, address indexed user);
    event EncryptedTransfer(address indexed from, address indexed to);
    event FheApproval(address indexed owner, address indexed spender, bool approved);

    // ──────────────────── Constructor ────────────────────
    /// @param _usdt Address of the USDT token on this chain.
    constructor(address _usdt) ERC20("VeilComp Confidential USDT", "vcUSDT") {
        usdt = IERC20(_usdt);
    }

    // ════════════════════════════════════════════════════
    //  USDT ↔ vcUSDT
    // ════════════════════════════════════════════════════

    /**
     * @notice Deposit USDT to mint encrypted vcUSDT 1:1.
     *         Caller must have approved this contract for `amount` USDT first.
     * @param amount  Plaintext USDT amount (6 decimals).
     */
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (amount > type(uint64).max) revert AmountOverflow();

        // Lock USDT in this contract
        usdt.safeTransferFrom(msg.sender, address(this), amount);

        // Mint equivalent encrypted vcUSDT
        euint64 encAmount = FHE.asEuint64(uint64(amount));
        _encBalances[msg.sender] = FHE.add(_encBalances[msg.sender], encAmount);
        _encTotalSupply = FHE.add(_encTotalSupply, encAmount);

        _encBalances[msg.sender] = FHE.allowThis(_encBalances[msg.sender]);
        _encBalances[msg.sender] = FHE.allow(_encBalances[msg.sender], msg.sender);

        emit Deposit(msg.sender, amount);
    }

    /**
     * @notice Step 1: Request withdrawal. Deducts from encrypted balance immediately.
     *         If balance insufficient, FHE.select deducts 0 instead (user gets nothing).
     *         The deducted amount handle is marked publicly decryptable so the Relayer
     *         can read it and call fulfillWithdraw with a KMS proof.
     * @param amount  Plaintext USDT amount to withdraw (6 decimals).
     * @return id     The withdrawal request ID.
     */
    function requestWithdraw(uint256 amount) external returns (uint256 id) {
        if (amount == 0) revert ZeroAmount();
        if (amount > type(uint64).max) revert AmountOverflow();

        id = nextWithdrawId++;

        // Encrypted deduction with overflow protection
        euint64 encAmount = FHE.asEuint64(uint64(amount));
        ebool sufficient = FHE.le(encAmount, _encBalances[msg.sender]);
        euint64 deducted = FHE.select(sufficient, encAmount, FHE.asEuint64(0));

        _encBalances[msg.sender] = FHE.sub(_encBalances[msg.sender], deducted);
        _encTotalSupply = FHE.sub(_encTotalSupply, deducted);

        // Re-establish ACL
        _encBalances[msg.sender] = FHE.allowThis(_encBalances[msg.sender]);
        _encBalances[msg.sender] = FHE.allow(_encBalances[msg.sender], msg.sender);

        // Store deducted handle and make it publicly decryptable for Relayer
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

    /**
     * @notice Step 2: Relayer/Keeper calls this after decrypting the deducted amount.
     *         Provides the decrypted value + KMS proof. Contract verifies proof,
     *         then releases USDT if the deducted amount matches the requested amount.
     * @param id                  Withdrawal request ID.
     * @param handlesList         The handles that were decrypted.
     * @param abiEncodedCleartexts ABI-encoded decrypted values.
     * @param decryptionProof     KMS signatures proof.
     */
    function fulfillWithdraw(
        uint256 id,
        bytes32[] calldata handlesList,
        bytes calldata abiEncodedCleartexts,
        bytes calldata decryptionProof
    ) external {
        WithdrawRequest storage req = withdrawRequests[id];
        if (!req.pending) revert WithdrawNotPending();

        // Verify KMS signatures — reverts if invalid
        FHE.checkSignatures(handlesList, abiEncodedCleartexts, decryptionProof);

        // Decode the decrypted deducted amount
        uint64 decryptedAmount = abi.decode(abiEncodedCleartexts, (uint64));

        req.pending = false;

        if (decryptedAmount == uint64(req.amount)) {
            // Balance was sufficient — release USDT
            usdt.safeTransfer(req.user, req.amount);
            emit WithdrawCompleted(id, req.user, req.amount);
        } else {
            // Balance was insufficient — deducted was 0, nothing to refund
            emit WithdrawFailed(id, req.user);
        }
    }

    // ════════════════════════════════════════════════════
    //  Encrypted operations
    // ════════════════════════════════════════════════════

    /**
     * @notice Transfer encrypted amount from caller to `to`.
     */
    function encryptedTransfer(
        address to,
        externalEuint64 encAmount,
        bytes calldata inputProof
    ) external {
        euint64 amount = FHE.fromExternal(encAmount, inputProof);
        _encTransferInternal(msg.sender, to, amount);
    }

    /**
     * @notice Transfer encrypted amount on behalf of `from`.
     *         Caller must be fheApproved by `from` (used by VeilPayroll).
     */
    function encryptedTransferFrom(
        address from,
        address to,
        euint64 amount
    ) external {
        if (!_fheApprovals[from][msg.sender]) revert NotApproved();
        _encTransferInternal(from, to, amount);
    }

    /**
     * @dev Core internal transfer with overflow protection.
     *      If sender has insufficient balance, transfers 0 (cannot revert on encrypted condition).
     */
    function _encTransferInternal(
        address from,
        address to,
        euint64 amount
    ) internal {
        if (to == address(0)) revert TransferToZeroAddress();

        ebool sufficient = FHE.le(amount, _encBalances[from]);
        euint64 safeAmount = FHE.select(sufficient, amount, FHE.asEuint64(0));

        _encBalances[from] = FHE.sub(_encBalances[from], safeAmount);
        _encBalances[to] = FHE.add(_encBalances[to], safeAmount);

        _encBalances[from] = FHE.allowThis(_encBalances[from]);
        _encBalances[from] = FHE.allow(_encBalances[from], from);
        _encBalances[to] = FHE.allowThis(_encBalances[to]);
        _encBalances[to] = FHE.allow(_encBalances[to], to);

        emit EncryptedTransfer(from, to);
    }

    /**
     * @notice Approve or revoke `spender` for encrypted transferFrom.
     */
    function fheApprove(address spender, bool approved) external {
        if (spender == address(0)) revert ApprovalToZeroAddress();
        _fheApprovals[msg.sender][spender] = approved;
        emit FheApproval(msg.sender, spender, approved);
    }

    // ════════════════════════════════════════════════════
    //  Encrypted queries
    // ════════════════════════════════════════════════════

    /// @notice Returns the caller's encrypted vcUSDT balance handle.
    function encryptedBalanceOf() external view returns (euint64) {
        return _encBalances[msg.sender];
    }

    // ════════════════════════════════════════════════════
    //  ERC20 overrides (privacy protection)
    // ════════════════════════════════════════════════════

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function balanceOf(address) public pure override returns (uint256) {
        return 0;
    }

    function totalSupply() public pure override returns (uint256) {
        return 0;
    }

    function transfer(address, uint256) public pure override returns (bool) {
        revert PlaintextTransferDisabled();
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert PlaintextTransferDisabled();
    }

    function approve(address, uint256) public pure override returns (bool) {
        revert PlaintextTransferDisabled();
    }
}
