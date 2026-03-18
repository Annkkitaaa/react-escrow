// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IEscrowHook.sol";

// ============================================================
// HookRegistry — Cross-Contract Composability (Feature 4)
//
// Stores a list of hook contracts that are called after each
// milestone release. Any IEscrowHook-compliant contract can be
// registered. Hooks are called with try-catch so one failing
// hook never blocks others.
//
// Only ReactiveHandlers can call executePostReleaseHooks().
// Only the owner can register or remove hooks.
// ============================================================

contract HookRegistry {

    // --------------------------------------------------------
    // State
    // --------------------------------------------------------

    address public owner;
    address public reactiveHandlers;

    address[] private _hooks;
    mapping(address => bool) public isRegistered;

    // --------------------------------------------------------
    // Events
    // --------------------------------------------------------

    event HookRegistered(address indexed hook);
    event HookRemoved(address indexed hook);
    event HooksExecuted(uint256 escrowId, uint256 milestoneIndex, uint256 hooksCount);

    // --------------------------------------------------------
    // Errors
    // --------------------------------------------------------

    error NotOwner();
    error NotReactiveHandlers();
    error AlreadyRegistered();
    error NotRegistered();

    // --------------------------------------------------------
    // Constructor
    // --------------------------------------------------------

    constructor(address _reactiveHandlers) {
        owner             = msg.sender;
        reactiveHandlers  = _reactiveHandlers;
    }

    // --------------------------------------------------------
    // Admin
    // --------------------------------------------------------

    function setReactiveHandlers(address _reactiveHandlers) external {
        if (msg.sender != owner) revert NotOwner();
        reactiveHandlers = _reactiveHandlers;
    }

    /// @notice Register a new hook contract
    function registerHook(address hook) external {
        if (msg.sender != owner) revert NotOwner();
        if (isRegistered[hook]) revert AlreadyRegistered();
        isRegistered[hook] = true;
        _hooks.push(hook);
        emit HookRegistered(hook);
    }

    /// @notice Remove a hook contract (swap-and-pop for gas efficiency)
    function removeHook(address hook) external {
        if (msg.sender != owner) revert NotOwner();
        if (!isRegistered[hook]) revert NotRegistered();
        isRegistered[hook] = false;

        for (uint256 i = 0; i < _hooks.length; i++) {
            if (_hooks[i] == hook) {
                _hooks[i] = _hooks[_hooks.length - 1];
                _hooks.pop();
                break;
            }
        }
        emit HookRemoved(hook);
    }

    // --------------------------------------------------------
    // Hook Dispatch — called by ReactiveHandlers
    // --------------------------------------------------------

    /// @notice Execute all registered hooks. Never reverts — failed hooks are skipped.
    function executePostReleaseHooks(
        uint256 escrowId,
        uint256 milestoneIndex,
        address client,
        address freelancer,
        uint256 amount
    ) external {
        if (msg.sender != reactiveHandlers) revert NotReactiveHandlers();

        uint256 len = _hooks.length;
        for (uint256 i = 0; i < len; i++) {
            try IEscrowHook(_hooks[i]).onMilestoneReleased(
                escrowId, milestoneIndex, client, freelancer, amount
            ) {} catch {}
        }

        emit HooksExecuted(escrowId, milestoneIndex, len);
    }

    // --------------------------------------------------------
    // Views
    // --------------------------------------------------------

    function getHooks() external view returns (address[] memory) {
        return _hooks;
    }

    function hookCount() external view returns (uint256) {
        return _hooks.length;
    }
}
