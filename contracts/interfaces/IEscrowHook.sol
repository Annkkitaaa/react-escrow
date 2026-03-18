// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ============================================================
// IEscrowHook — Interface for individual hook contracts
//
// Implement this to register a hook with HookRegistry.
// Hooks are called after each milestone release, enabling
// composable integrations: NFT receipts, reputation, DAOs, etc.
// ============================================================

interface IEscrowHook {
    /// @notice Called when a milestone's funds are released
    function onMilestoneReleased(
        uint256 escrowId,
        uint256 milestoneIndex,
        address client,
        address freelancer,
        uint256 amount
    ) external;

    /// @notice Called by ReactiveHandlers to dispatch to all registered hooks
    ///         Implemented by HookRegistry (not individual hooks)
    function executePostReleaseHooks(
        uint256 escrowId,
        uint256 milestoneIndex,
        address client,
        address freelancer,
        uint256 amount
    ) external;
}
