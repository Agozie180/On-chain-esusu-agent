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
/// @dev Thesis, enforced here: the agent can pay an owner-allowlisted circle's dues on the owner's
///      behalf, and nothing else. It never chooses the amount (read from the circle), the
///      beneficiary (always `owner`) or the destination (owner-allowlisted, same asset). It cannot
///      withdraw or change policy. The owner can pause instantly; the agent's authority also expires.
contract AgentAllowance is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable owner;
    address public immutable token; // zero = native
    address public agent;

    uint256 public perTxCap;
    uint256 public periodCap;
    uint256 public periodLength;
    uint256 public periodStart;
    uint256 public spentInPeriod;
    uint256 public expiry;
    bool public paused;

    mapping(address => bool) public allowedCircuit;

    event Funded(address indexed from, uint256 amount);
    event PolicySet(address indexed agent, uint256 perTxCap, uint256 periodCap, uint256 periodLength, uint256 expiry);
    event CircuitAllowed(address indexed circuit, bool allowed);
    event Paused(bool paused);
    event AgentPaid(address indexed circuit, uint256 amount);
    event OwnerWithdrew(uint256 amount);

    error NotOwner();
    error NotAgent();
    error IsPaused();
    error Expired();
    error CircuitNotAllowed();
    error AssetMismatch();
    error OverPerTxCap();
    error OverPeriodCap();
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
        spentInPeriod = 0;
        emit PolicySet(agent_, perTxCap_, periodCap_, periodLength_, expiry_);
    }

    function setCircuit(address circuit, bool allowed) external onlyOwner {
        allowedCircuit[circuit] = allowed;
        emit CircuitAllowed(circuit, allowed);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        if (amount > balance()) revert InsufficientBalance();
        if (token == address(0)) {
            (bool ok, ) = owner.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(owner, amount);
        }
        emit OwnerWithdrew(amount);
    }

    // ----------------------------------------------------------------- agent
    function payDues(address circuit) external nonReentrant {
        if (msg.sender != agent) revert NotAgent();
        if (paused) revert IsPaused();
        if (block.timestamp >= expiry) revert Expired();
        if (!allowedCircuit[circuit]) revert CircuitNotAllowed();

        IEsusuCircleLike c = IEsusuCircleLike(circuit);
        if (c.token() != token) revert AssetMismatch();
        uint256 amount = c.dues();
        if (amount > perTxCap) revert OverPerTxCap();
        if (amount > balance()) revert InsufficientBalance();

        if (block.timestamp >= periodStart + periodLength) {
            periodStart = block.timestamp;
            spentInPeriod = 0;
        }
        if (spentInPeriod + amount > periodCap) revert OverPeriodCap();
        spentInPeriod += amount;
        emit AgentPaid(circuit, amount);

        if (token == address(0)) {
            c.contributeFor{value: amount}(owner);
        } else {
            IERC20(token).forceApprove(circuit, amount);
            c.contributeFor(owner);
            IERC20(token).forceApprove(circuit, 0);
        }
    }
}
