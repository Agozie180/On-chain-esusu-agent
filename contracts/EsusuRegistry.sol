// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EsusuCircle} from "./EsusuCircle.sol";

/// @title EsusuRegistry
/// @notice Factory + portable reputation for esusu circles.
///         Only circles deployed by this registry can write reputation, so a score cannot be
///         forged by an arbitrary contract. Any protocol can read `scoreOf(address)`.
contract EsusuRegistry is Ownable {
    uint16 public constant MAX_FEE_BPS = 200; // 2%

    struct Rep {
        uint32 completed;   // circles finished without a default
        uint32 paidRounds;  // rounds paid in time
        uint32 defaults;    // rounds missed
    }

    address public treasury;
    uint16 public feeBps;
    address[] public circles;
    mapping(address => bool) public isCircle;
    mapping(address => Rep) private _rep;

    event CircleCreated(address indexed circle, address indexed creator, address indexed token, uint256 dues, uint256 size, uint256 roundDuration, uint256 minScore);
    event FeeSet(uint16 feeBps, address treasury);

    error NotCircle();
    error FeeTooHigh();

    constructor(address owner_, address treasury_, uint16 feeBps_) Ownable(owner_) {
        _setFee(feeBps_, treasury_);
    }

    function setFee(uint16 feeBps_, address treasury_) external onlyOwner {
        _setFee(feeBps_, treasury_);
    }

    function _setFee(uint16 feeBps_, address treasury_) internal {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (feeBps_ > 0 && treasury_ == address(0)) revert FeeTooHigh();
        feeBps = feeBps_;
        treasury = treasury_;
        emit FeeSet(feeBps_, treasury_);
    }

    /// @param token ERC-20 used for dues and collateral, or address(0) for the native token.
    /// @param minScore reputation required to join (0 = open to everyone).
    function createCircle(address token, uint256 dues, uint256 size, uint256 roundDuration, uint256 minScore)
        external
        returns (address circle)
    {
        EsusuCircle c = new EsusuCircle(address(this), msg.sender, token, dues, size, roundDuration, minScore, feeBps, treasury);
        circle = address(c);
        isCircle[circle] = true;
        circles.push(circle);
        emit CircleCreated(circle, msg.sender, token, dues, size, roundDuration, minScore);
    }

    // ------------------------------------------------------ reputation (circles only)
    modifier onlyCircle() {
        if (!isCircle[msg.sender]) revert NotCircle();
        _;
    }

    function onPaid(address member) external onlyCircle {
        unchecked { _rep[member].paidRounds += 1; }
    }

    function onDefault(address member) external onlyCircle {
        unchecked { _rep[member].defaults += 1; }
    }

    function onCompleted(address member) external onlyCircle {
        unchecked { _rep[member].completed += 1; }
    }

    // ----------------------------------------------------------------- views
    function reputation(address who) external view returns (Rep memory) {
        return _rep[who];
    }

    /// @notice 0..1000. +150 per clean completed circle, +15 per round paid, -250 per missed round.
    function scoreOf(address who) public view returns (uint256) {
        Rep memory r = _rep[who];
        uint256 up = uint256(r.completed) * 150 + uint256(r.paidRounds) * 15;
        if (up > 1000) up = 1000;
        uint256 down = uint256(r.defaults) * 250;
        return down >= up ? 0 : up - down;
    }

    function circlesCount() external view returns (uint256) {
        return circles.length;
    }

    function circlesPage(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 n = circles.length;
        if (offset >= n) return new address[](0);
        uint256 end = offset + limit > n ? n : offset + limit;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) page[i - offset] = circles[i];
    }
}
