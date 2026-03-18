// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IEscrowHook.sol";

/// @dev Test helper: a hook that always reverts in onMilestoneReleased.
///      Used to verify HookRegistry's try-catch isolation.
contract MockRevertHook is IEscrowHook {
    error AlwaysReverts();

    function onMilestoneReleased(
        uint256, uint256, address, address, uint256
    ) external pure override {
        revert AlwaysReverts();
    }

    function executePostReleaseHooks(
        uint256, uint256, address, address, uint256
    ) external pure override {
        revert("Use HookRegistry");
    }
}
