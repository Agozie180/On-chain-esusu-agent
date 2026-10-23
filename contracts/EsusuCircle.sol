// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IEsusuRegistry {
    function scoreOf(address who) external view returns (uint256);
    function onPaid(address member) external;
    function onDefault(address member) external;
    function onCompleted(address member) external;
}

/// @title EsusuCircle
/// @notice Rotating savings circle (esusu / ajo / ROSCA) in the native token or one ERC-20.
///
/// Rules, all enforced here:
///  - `size` members each hold one payout SLOT (0..size-1). Slot r receives the pot in round r.
///  - Members pick their slot when they join and post collateral that depends on it:
///        collateral(slot) = dues * max(1, size - 1 - slot)
///    An early slot receives money sooner, so it locks more. After a member's own payout, their
///    remaining obligation is (size - 1 - slot) * dues, which the collateral covers exactly.
///    => a member who has been paid can never leave the circle owing it money (invariant I10).
///  - A member who misses a round loses `dues` of collateral into that round's pot and is flagged.
///  - STRIKE RULE: a flagged (defaulted) member forfeits their payout slot for good, even if they keep paying later
///    rounds; the pot rolls to the next slot (last slot: split among members who never defaulted).
///  - Payouts and refunds are pull-based. A protocol fee (<= 2%) is taken from payouts only.
contract EsusuCircle is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State { Open, Active, Completed }

    /// @dev settleRound loops over every member (~30k gas each, measured: 1.5M gas at 50). Real ajo groups are small;
    ///      30 keeps settlement cheap even if the target chain prices gas unexpectedly.
    uint256 public constant MAX_SIZE = 30;

    // ---------------------------------------------------------------- config
    address public immutable registry;     // optional (zero = standalone, no reputation)
    address public immutable creator;
    address public immutable token;        // zero = native
    uint256 public immutable dues;         // per member per round
    uint256 public immutable size;         // members == slots == rounds
    uint256 public immutable roundDuration;
    uint256 public immutable minScore;     // reputation needed to join (needs registry)
    uint16  public immutable feeBps;
    address public immutable treasury;

    // ----------------------------------------------------------------- state
    State public state;
    uint256 public filled;
    mapping(uint256 => address) public slotOwner;
    mapping(address => bool) public isMember;
    mapping(address => uint256) public slotOf;
    mapping(address => uint256) public collateralLeft;
    mapping(address => bool) public defaulted;

    uint256 public currentRound;
    uint256 public roundDeadline;
    mapping(uint256 => mapping(address => bool)) public paid;
    mapping(uint256 => uint256) public pot;
    mapping(uint256 => uint256) public paidCount;
    mapping(address => uint256) public credit;

    // ---------------------------------------------------------------- events
    event Joined(address indexed member, uint256 indexed slot, uint256 collateral);
    event Left(address indexed member, uint256 indexed slot);
    event Started(uint256 deadline);
    event Contributed(uint256 indexed round, address indexed member, address indexed payer);
    event Defaulted(uint256 indexed round, address indexed member, uint256 slashed);
    event RoundSettled(uint256 indexed round, address indexed recipient, uint256 collected, uint256 fee, bool rolledOver);
    event Completed();
    event Withdrawn(address indexed to, uint256 amount);

    // ---------------------------------------------------------------- errors
    error WrongState();
    error WrongAmount();
    error NotMember();
    error AlreadyMember();
    error SlotTaken();
    error ScoreTooLow();
    error AlreadyPaid();
    error RoundClosed();
    error RoundStillOpen();
    error NothingToWithdraw();
    error BadConfig();
    error TransferFailed();
    error UnsupportedToken();

    constructor(
        address registry_, address creator_, address token_, uint256 dues_, uint256 size_,
        uint256 roundDuration_, uint256 minScore_, uint16 feeBps_, address treasury_
    ) {
        if (dues_ == 0 || size_ < 2 || size_ > MAX_SIZE || roundDuration_ < 60) revert BadConfig();
        if (feeBps_ > 200 || (feeBps_ > 0 && treasury_ == address(0))) revert BadConfig();
        if (minScore_ > 0 && registry_ == address(0)) revert BadConfig();
        registry = registry_;
        creator = creator_;
        token = token_;
        dues = dues_;
        size = size_;
        roundDuration = roundDuration_;
        minScore = minScore_;
        feeBps = feeBps_;
        treasury = treasury_;
    }

    // ------------------------------------------------------------------ join
    function collateralFor(uint256 slot) public view returns (uint256) {
        uint256 rounds = size - 1 - slot;
        return dues * (rounds == 0 ? 1 : rounds);
    }

    /// @notice Take payout slot `slot`, locking the collateral for that slot.
    function join(uint256 slot) external payable nonReentrant {
        if (state != State.Open) revert WrongState();
        if (slot >= size || slotOwner[slot] != address(0)) revert SlotTaken();
        if (isMember[msg.sender]) revert AlreadyMember();
        if (minScore > 0 && IEsusuRegistry(registry).scoreOf(msg.sender) < minScore) revert ScoreTooLow();

        uint256 col = collateralFor(slot);
        slotOwner[slot] = msg.sender;
        slotOf[msg.sender] = slot;
        isMember[msg.sender] = true;
        collateralLeft[msg.sender] = col;
        filled += 1;
        _pull(msg.sender, col);
        emit Joined(msg.sender, slot, col);

        if (filled == size) {
            state = State.Active;
            roundDeadline = block.timestamp + roundDuration;
            emit Started(roundDeadline);
        }
    }

    /// @notice Leave before the circle starts; refunds collateral and frees the slot.
    function leave() external nonReentrant {
        if (state != State.Open) revert WrongState();
        if (!isMember[msg.sender]) revert NotMember();
        uint256 slot = slotOf[msg.sender];
        uint256 refund = collateralLeft[msg.sender];
        collateralLeft[msg.sender] = 0;
        isMember[msg.sender] = false;
        slotOwner[slot] = address(0);
        slotOf[msg.sender] = 0;
        filled -= 1;
        _push(msg.sender, refund);
        emit Left(msg.sender, slot);
    }

    // ------------------------------------------------------------ contribute
    function contribute() external payable nonReentrant {
        _contribute(msg.sender);
    }

    /// @notice Pay `member`'s dues for the current round. Payer can be anyone (e.g. an agent vault);
    ///         the payment only ever credits `member`.
    function contributeFor(address member) external payable nonReentrant {
        _contribute(member);
    }

    function _contribute(address member) internal {
        if (state != State.Active) revert WrongState();
        if (!isMember[member]) revert NotMember();
        if (block.timestamp >= roundDeadline) revert RoundClosed();
        uint256 r = currentRound;
        if (paid[r][member]) revert AlreadyPaid();

        paid[r][member] = true;
        paidCount[r] += 1;
        pot[r] += dues;
        _pull(msg.sender, dues);
        emit Contributed(r, member, msg.sender);
    }

    // ---------------------------------------------------------------- settle
    /// @notice Close the round once everyone paid or the deadline passed. Anyone may call.
    function settleRound() external nonReentrant {
        if (state != State.Active) revert WrongState();
        uint256 r = currentRound;
        if (paidCount[r] != size && block.timestamp < roundDeadline) revert RoundStillOpen();

        IEsusuRegistry reg = IEsusuRegistry(registry);
        bool hasReg = registry != address(0);

        for (uint256 i = 0; i < size; i++) {
            address m = slotOwner[i];
            if (paid[r][m]) {
                if (hasReg) { try reg.onPaid(m) {} catch {} }
            } else {
                uint256 left = collateralLeft[m];
                uint256 cut = left < dues ? left : dues;
                collateralLeft[m] = left - cut;
                pot[r] += cut;
                defaulted[m] = true;
                emit Defaulted(r, m, cut);
                if (hasReg) { try reg.onDefault(m) {} catch {} }
            }
        }

        address recipient = slotOwner[r];
        uint256 collected = pot[r];
        pot[r] = 0;
        uint256 fee;
        bool rolled;

        if (!defaulted[recipient]) {
            fee = (collected * feeBps) / 10_000;
            credit[recipient] += collected - fee;
            if (fee > 0) credit[treasury] += fee;
        } else if (r + 1 < size) {
            pot[r + 1] += collected;
            rolled = true;
        } else {
            _splitAmongHonest(collected);
            rolled = true;
        }
        emit RoundSettled(r, recipient, collected, fee, rolled);

        if (r + 1 == size) {
            state = State.Completed;
            for (uint256 i = 0; i < size; i++) {
                address m = slotOwner[i];
                credit[m] += collateralLeft[m];
                collateralLeft[m] = 0;
                if (!defaulted[m] && hasReg) { try reg.onCompleted(m) {} catch {} }
            }
            emit Completed();
        } else {
            currentRound = r + 1;
            roundDeadline = block.timestamp + roundDuration;
        }
    }

    function _splitAmongHonest(uint256 amount) internal {
        uint256 honest;
        for (uint256 i = 0; i < size; i++) if (!defaulted[slotOwner[i]]) honest++;
        if (honest == 0) {
            credit[creator] += amount;
            return;
        }
        uint256 share = amount / honest;
        uint256 dust = amount - share * honest;
        bool dustGiven;
        for (uint256 i = 0; i < size; i++) {
            address m = slotOwner[i];
            if (!defaulted[m]) {
                credit[m] += share + (dustGiven ? 0 : dust);
                dustGiven = true;
            }
        }
    }

    // -------------------------------------------------------------- withdraw
    function withdraw() external nonReentrant {
        uint256 amount = credit[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        credit[msg.sender] = 0;
        _push(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ------------------------------------------------------------- transfers
    function _pull(address from, uint256 amount) internal {
        if (token == address(0)) {
            if (msg.value != amount) revert WrongAmount();
        } else {
            if (msg.value != 0) revert WrongAmount();
            IERC20 t = IERC20(token);
            uint256 before = t.balanceOf(address(this));
            t.safeTransferFrom(from, address(this), amount);
            if (t.balanceOf(address(this)) - before != amount) revert UnsupportedToken(); // fee-on-transfer etc.
        }
    }

    function _push(address to, uint256 amount) internal {
        if (amount == 0) return;
        if (token == address(0)) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    // ----------------------------------------------------------------- views
    function members() external view returns (address[] memory out) {
        out = new address[](size);
        for (uint256 i = 0; i < size; i++) out[i] = slotOwner[i];
    }

    function currentRecipient() external view returns (address) {
        return state == State.Active ? slotOwner[currentRound] : address(0);
    }

    function hasPaid(address member) external view returns (bool) {
        return paid[currentRound][member];
    }

    /// @notice Everything the contract owes, for solvency checks: balance must equal this.
    /// @param extra non-member addresses that may hold credit (treasury, creator). MUST NOT include members (they are counted already).
    function liabilities(address[] calldata extra) external view returns (uint256 total) {
        for (uint256 i = 0; i < size; i++) {
            address m = slotOwner[i];
            total += credit[m] + collateralLeft[m];
        }
        for (uint256 i = 0; i < extra.length; i++) total += credit[extra[i]];
        for (uint256 r = currentRound; r < size; r++) total += pot[r];
    }
}
