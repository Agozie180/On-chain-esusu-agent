// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICircle { function join(uint256) external payable; function withdraw() external; }

/// Test-only attacker: tries to re-enter withdraw() from its receive hook.
contract Reenterer {
    ICircle public circle;
    uint256 public attempts;
    bool public reentrySucceeded;
    constructor(address c) { circle = ICircle(c); }
    function joinSlot(uint256 slot) external payable { circle.join{value: msg.value}(slot); }
    function pull() external { circle.withdraw(); }
    receive() external payable {
        attempts++;
        try circle.withdraw() { reentrySucceeded = true; } catch {}
    }
}
