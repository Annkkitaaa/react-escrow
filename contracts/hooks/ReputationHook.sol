// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IEscrowHook.sol";
import "../ReputationSBT.sol";

// ============================================================
// ReputationHook — Reputation update hook (Feature 5)
//
// Implements IEscrowHook. Registered in HookRegistry.
// On each milestone release, mints/updates ReputationSBT for
// both the freelancer and client.
//
// The Merkle root is updated by the off-chain reactive-service
// using @openzeppelin/merkle-tree after computing the new tree.
// ============================================================

contract ReputationHook is IEscrowHook {

    // --------------------------------------------------------
    // State
    // --------------------------------------------------------

    address public owner;
    address public hookRegistry;
    ReputationSBT public reputationSBT;

    // --------------------------------------------------------
    // Errors
    // --------------------------------------------------------

    error NotOwner();
    error NotHookRegistry();

    // --------------------------------------------------------
    // Constructor
    // --------------------------------------------------------

    constructor(address _hookRegistry, address _reputationSBT) {
        owner         = msg.sender;
        hookRegistry  = _hookRegistry;
        reputationSBT = ReputationSBT(_reputationSBT);
    }

    // --------------------------------------------------------
    // Admin
    // --------------------------------------------------------

    function setHookRegistry(address _hookRegistry) external {
        if (msg.sender != owner) revert NotOwner();
        hookRegistry = _hookRegistry;
    }

    function setReputationSBT(address _reputationSBT) external {
        if (msg.sender != owner) revert NotOwner();
        reputationSBT = ReputationSBT(_reputationSBT);
    }

    // --------------------------------------------------------
    // IEscrowHook implementation
    // --------------------------------------------------------

    /// @notice Called by HookRegistry on each milestone release.
    ///         Updates reputation for both freelancer and client.
    ///         Merkle root is bytes32(0) here — updated off-chain by reactive-service.
    function onMilestoneReleased(
        uint256 escrowId,
        uint256 /* milestoneIndex */,
        address client,
        address freelancer,
        uint256 amount
    ) external override {
        if (msg.sender != hookRegistry) revert NotHookRegistry();

        // Update freelancer reputation (earns the amount)
        try reputationSBT.mintOrUpdate(
            freelancer, escrowId, amount, false, bytes32(0)
        ) {} catch {}

        // Update client reputation (spent the amount, tracked separately)
        try reputationSBT.mintOrUpdate(
            client, escrowId, 0, false, bytes32(0)
        ) {} catch {}
    }

    /// @dev Not used by this hook — only onMilestoneReleased is called
    function executePostReleaseHooks(
        uint256, uint256, address, address, uint256
    ) external pure override {
        revert("Use HookRegistry");
    }
}
