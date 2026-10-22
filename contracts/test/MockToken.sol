// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Test-only stable-value token (6 decimals like USDT/USDC).
contract MockToken is ERC20 {
    constructor() ERC20("Mock Dollar", "mUSD") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
