// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import "./interfaces/IReactEscrow.sol";
import "./interfaces/IEscrowHook.sol";

// ============================================================
// ReactiveHandlers — On-chain Somnia Reactivity Handler
//
// Registered as a Somnia Reactivity subscriber. When specific
// events fire on ReactEscrow, Somnia validators atomically invoke
// _onEvent() on this contract — executing escrow logic with no
// keeper bot, no polling, no separate transaction from any user.
//
// Subscriptions (setup-subscriptions.ts):
//   1. MilestoneApproved  → auto-release funds to freelancer
//   2. DeadlineReached    → auto-release on timeout
//   3. DisputeResolved    → distribute based on arbiter resolution
//   4. CheckpointApproved → stream partial payment to freelancer
//
// After releasing funds, calls HookRegistry (Feature 4) to
// notify registered hook contracts (NFT receipts, reputation, etc.)
// ============================================================

contract ReactiveHandlers is SomniaEventHandler {

    // --------------------------------------------------------
    // State
    // --------------------------------------------------------

    IReactEscrow public immutable reactEscrow;
    address public owner;

    /// @notice Optional hook registry — called after each milestone release.
    ///         Set to address(0) to skip hooks.
    address public hookRegistry;

    // --------------------------------------------------------
    // Event topic hashes — keccak256 of event signature strings
    // --------------------------------------------------------

    /// @dev MilestoneApproved(uint256 indexed escrowId, uint256 milestoneIndex, uint256 amount)
    bytes32 public constant MILESTONE_APPROVED_TOPIC =
        keccak256("MilestoneApproved(uint256,uint256,uint256)");

    /// @dev DeadlineReached(uint256 indexed escrowId, uint256 milestoneIndex)
    bytes32 public constant DEADLINE_REACHED_TOPIC =
        keccak256("DeadlineReached(uint256,uint256)");

    /// @dev DisputeResolved(uint256 indexed escrowId, uint256 milestoneIndex, uint8 resolution)
    bytes32 public constant DISPUTE_RESOLVED_TOPIC =
        keccak256("DisputeResolved(uint256,uint256,uint8)");

    /// @dev CheckpointApproved(uint256 indexed escrowId, uint256 indexed milestoneIndex, uint256 checkpointIndex, uint256 amount)
    bytes32 public constant CHECKPOINT_APPROVED_TOPIC =
        keccak256("CheckpointApproved(uint256,uint256,uint256,uint256)");

    // --------------------------------------------------------
    // Events
    // --------------------------------------------------------

    event HandlerInvoked(bytes32 indexed eventTopic, uint256 indexed escrowId, bool success);

    // --------------------------------------------------------
    // Errors
    // --------------------------------------------------------

    error NotOwner();
    error UnknownEvent();

    // --------------------------------------------------------
    // Constructor
    // --------------------------------------------------------

    constructor(address _reactEscrow) {
        reactEscrow = IReactEscrow(_reactEscrow);
        owner = msg.sender;
    }

    // --------------------------------------------------------
    // Admin
    // --------------------------------------------------------

    /// @notice Set the hook registry address. Set to address(0) to disable hooks.
    function setHookRegistry(address _hookRegistry) external {
        if (msg.sender != owner) revert NotOwner();
        hookRegistry = _hookRegistry;
    }

    // --------------------------------------------------------
    // Somnia Reactivity — Core Handler
    // --------------------------------------------------------

    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal override {
        if (emitter != address(reactEscrow)) return;
        if (eventTopics.length == 0) return;

        bytes32 topic0 = eventTopics[0];

        if (topic0 == MILESTONE_APPROVED_TOPIC) {
            _handleMilestoneApproved(eventTopics, data);
        } else if (topic0 == DEADLINE_REACHED_TOPIC) {
            _handleDeadlineReached(eventTopics, data);
        } else if (topic0 == DISPUTE_RESOLVED_TOPIC) {
            _handleDisputeResolved(eventTopics, data);
        } else if (topic0 == CHECKPOINT_APPROVED_TOPIC) {
            _handleCheckpointApproved(eventTopics, data);
        }
        // Unknown events are ignored
    }

    // --------------------------------------------------------
    // Event Handlers
    // --------------------------------------------------------

    /// @dev MilestoneApproved → releaseMilestoneFunds() → executePostReleaseHooks()
    function _handleMilestoneApproved(
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) private {
        uint256 escrowId = uint256(eventTopics[1]);
        (uint256 milestoneIndex, uint256 amount) = abi.decode(data, (uint256, uint256));

        bool success = _safeCall(
            address(reactEscrow),
            abi.encodeWithSelector(
                IReactEscrow.releaseMilestoneFunds.selector,
                escrowId,
                milestoneIndex
            )
        );

        emit HandlerInvoked(MILESTONE_APPROVED_TOPIC, escrowId, success);

        // Call hook registry if set (Feature 4)
        if (success && hookRegistry != address(0)) {
            _callHooks(escrowId, milestoneIndex, amount);
        }
    }

    /// @dev DeadlineReached → executeTimeoutRelease()
    function _handleDeadlineReached(
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) private {
        uint256 escrowId = uint256(eventTopics[1]);
        uint256 milestoneIndex = abi.decode(data, (uint256));

        bool success = _safeCall(
            address(reactEscrow),
            abi.encodeWithSelector(
                IReactEscrow.executeTimeoutRelease.selector,
                escrowId,
                milestoneIndex
            )
        );

        emit HandlerInvoked(DEADLINE_REACHED_TOPIC, escrowId, success);
    }

    /// @dev DisputeResolved → executeResolutionDistribution()
    function _handleDisputeResolved(
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) private {
        uint256 escrowId = uint256(eventTopics[1]);
        (uint256 milestoneIndex, ) = abi.decode(data, (uint256, uint8));

        bool success = _safeCall(
            address(reactEscrow),
            abi.encodeWithSelector(
                IReactEscrow.executeResolutionDistribution.selector,
                escrowId,
                milestoneIndex
            )
        );

        emit HandlerInvoked(DISPUTE_RESOLVED_TOPIC, escrowId, success);
    }

    /// @dev CheckpointApproved → releaseCheckpointFunds() (Feature 3)
    ///      topics[1] = escrowId, topics[2] = milestoneIndex, data = abi.encode(checkpointIndex, amount)
    function _handleCheckpointApproved(
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) private {
        uint256 escrowId       = uint256(eventTopics[1]);
        uint256 milestoneIndex = uint256(eventTopics[2]);
        (uint256 checkpointIndex, ) = abi.decode(data, (uint256, uint256));

        bool success = _safeCall(
            address(reactEscrow),
            abi.encodeWithSelector(
                IReactEscrow.releaseCheckpointFunds.selector,
                escrowId,
                milestoneIndex,
                checkpointIndex
            )
        );

        emit HandlerInvoked(CHECKPOINT_APPROVED_TOPIC, escrowId, success);
    }

    // --------------------------------------------------------
    // Hook Dispatch (Feature 4)
    // --------------------------------------------------------

    /// @dev Call executePostReleaseHooks on the registry.
    ///      Gets client + freelancer from reactEscrow — safe read, never reverts.
    function _callHooks(uint256 escrowId, uint256 milestoneIndex, uint256 amount) private {
        try reactEscrow.getEscrow(escrowId) returns (
            address client, address freelancer, address, uint256, IReactEscrow.EscrowStatus, uint256
        ) {
            _safeCall(
                hookRegistry,
                abi.encodeWithSelector(
                    IEscrowHook.executePostReleaseHooks.selector,
                    escrowId,
                    milestoneIndex,
                    client,
                    freelancer,
                    amount
                )
            );
        } catch {}
    }

    // --------------------------------------------------------
    // Helpers
    // --------------------------------------------------------

    function _safeCall(address target, bytes memory callData) private returns (bool success) {
        (success, ) = target.call(callData);
    }

    // --------------------------------------------------------
    // Funding
    // --------------------------------------------------------

    receive() external payable {}

    function withdraw(uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        (bool ok, ) = payable(owner).call{value: amount}("");
        require(ok, "Withdraw failed");
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
