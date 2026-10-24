// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Test-only token: metadata is arbitrary external input, even for a standard ERC-20.
contract MetadataToken is ERC20 {
    constructor(string memory symbol_) ERC20("Metadata test token", symbol_) {}
    function decimals() public pure override returns (uint8) { return 6; }
}
