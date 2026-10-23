// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IEsusuCircleLike {
    function dues() external view returns (uint256);
    function token() external view returns (address);
    function contributeFor(address member) external payable;
}

/// @title AgentAllowance
/// @notice Policy-bounded spending vault for an AI agent, for ONE asset (native or one ERC-20).
///
/// The agent key has exactly two abilities, both bounded by limits only the owner can change:
///
///   LANE 1  payDues(circle)   Pay the owner's dues into an owner-allowlisted esusu circle.
///                             The agent never chooses the amount (read from the circle) or the beneficiary (always `owner`).
///   LANE 2  payService(payee, amount, ref)
///                             Pay an owner-allowlisted service provider (an API, a keeper, a data feed), up to a
///                             per-payment cap, a per-payee per-period cap and the shared period cap. `ref` is an
///                             opaque receipt id so the provider can match payment to request (x402 style).
///
/// Never possible for the agent: withdraw, change policy, un-pause, allowlist anything, pay any address the owner has not
/// allowlisted, pay itself (a payee equal to the agent is refused), exceed a cap, or act after expiry or pause.
/// Worst case of a stolen agent key: dues pre-paid into the owner's own circles, and at most `periodCap` per period sent
/// to providers the owner already trusts, until the owner pauses (one transaction).
contract AgentAllowance is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable owner;
    address public immutable token; // zero = native
    address public agent;

    uint256 public perTxCap;
    uint256 public periodCap;
    uint256 public periodLength;
    uint256 public periodStart;
    uint256 public periodId;
    uint256 public spentInPeriod;
    uint256 public expiry;
    bool public paused;

    mapping(address => bool) public allowedCircuit;

    mapping(address => bool) public allowedPayee;
    mapping(address => uint256) public payeeCap; // per period
    mapping(uint256 => mapping(address => uint256)) public payeeSpent; // periodId => payee => spent

    event Funded(address indexed from, uint256 amount);
    event PolicySet(address indexed agent, uint256 perTxCap, uint256 periodCap, uint256 periodLength, uint256 expiry);
    event CircuitAllowed(address indexed circuit, bool allowed);
    event PayeeSet(address indexed payee, bool allowed, uint256 capPerPeriod);
    event Paused(bool paused);
    event AgentPaid(address indexed circuit, uint256 amount);
    event ServicePaid(address indexed payee, uint256 amount, bytes32 indexed ref);
    event OwnerWithdrew(uint256 amount);

    error NotOwner();
    error NotAgent();
    error IsPaused();
    error Expired();
    error CircuitNotAllowed();
    error PayeeNotAllowed();
    error PayeeIsAgent();
    error AssetMismatch();
    error ZeroAmount();
    error OverPerTxCap();
    error OverPeriodCap();
    error OverPayeeCap();
    error InsufficientBalance();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_, address token_) {
        owner = owner_;
        token = token_;
    }

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    function balance() public view returns (uint256) {
        return token == address(0) ? address(this).balance : IERC20(token).balanceOf(address(this));
    }

    // ----------------------------------------------------------------- owner
    function setPolicy(address agent_, uint256 perTxCap_, uint256 periodCap_, uint256 periodLength_, uint256 expiry_)
        external onlyOwner
    {
        agent = agent_;
        perTxCap = perTxCap_;
        periodCap = periodCap_;
        periodLength = periodLength_;
        expiry = expiry_;
        periodStart = block.timestamp;
        periodId += 1;
        spentInPeriod = 0;
        emit PolicySet(agent_, perTxCap_, periodCap_, periodLength_, expiry_);
    }

    function setCircuit(address circuit, bool allowed) external onlyOwner {
        allowedCircuit[circuit] = allowed;
        emit CircuitAllowed(circuit, allowed);
    }

    /// @notice Allow (or remove) a service provider the agent may pay, with its own per-period cap.
    function setPayee(address payee, bool allowed, uint256 capPerPeriod) external onlyOwner {
        allowedPayee[payee] = allowed;
        payeeCap[payee] = allowed ? capPerPeriod : 0;
        emit PayeeSet(payee, allowed, allowed ? capPerPeriod : 0);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        if (amount > balance()) revert InsufficientBalance();
        _send(owner, amount);
        emit OwnerWithdrew(amount);
    }

    // ----------------------------------------------------------------- agent
    function _guard() internal view {
        if (msg.sender != agent) revert NotAgent();
        if (paused) revert IsPaused();
        if (block.timestamp >= expiry) revert Expired();
    }

    /// @dev Roll the rolling window if it has elapsed, then book `amount` against the shared period cap.
    function _spend(uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (amount > perTxCap) revert OverPerTxCap();
        if (amount > balance()) revert InsufficientBalance();
        if (block.timestamp >= periodStart + periodLength) {
            periodStart = block.timestamp;
            periodId += 1;
            spentInPeriod = 0;
        }
        if (spentInPeriod + amount > periodCap) revert OverPeriodCap();
        spentInPeriod += amount;
    }

    /// LANE 1: pay the owner's esusu dues.
    function payDues(address circuit) external nonReentrant {
        _guard();
        if (!allowedCircuit[circuit]) revert CircuitNotAllowed();

        IEsusuCircleLike c = IEsusuCircleLike(circuit);
        if (c.token() != token) revert AssetMismatch();
        uint256 amount = c.dues();
        _spend(amount);
        emit AgentPaid(circuit, amount);

        if (token == address(0)) {
            c.contributeFor{value: amount}(owner);
        } else {
            IERC20(token).forceApprove(circuit, amount);
            c.contributeFor(owner);
            IERC20(token).forceApprove(circuit, 0);
        }
    }

    /// LANE 2: pay an allowlisted service provider. `ref` ties the payment to one API request.
    function payService(address payee, uint256 amount, bytes32 ref) external nonReentrant {
        _guard();
        if (!allowedPayee[payee]) revert PayeeNotAllowed();
        if (payee == agent) revert PayeeIsAgent();
        _spend(amount);
        uint256 spent = payeeSpent[periodId][payee] + amount;
        if (spent > payeeCap[payee]) revert OverPayeeCap();
        payeeSpent[periodId][payee] = spent;
        emit ServicePaid(payee, amount, ref);
        _send(payee, amount);
    }

    function _send(address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
