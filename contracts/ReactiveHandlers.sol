// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import "./interfaces/IReactEscrow.sol";

// ============================================================
// ReactiveHandlers — On-chain Somnia Reactivity Handler
//
// Registered as a Somnia Reactivity subscriber. When specific
// events fire on ReactEscrow, Somnia validators atomically invoke
// _onEvent() on this contract — executing escrow logic with no
// keeper bot, no polling, no separate transaction from any user.
//
// Subscriptions created via setup-subscriptions.ts:
//   1. MilestoneApproved  → auto-release funds to freelancer
//   2. DeadlineReached    → auto-release on timeout
//   3. DisputeResolved    → distribute based on arbiter resolution
//
// Requirements:
//   - This contract must hold >= 32 STT to fund invocations
//   - gasLimit >= 2,000,000 per subscription callback
//   - priorityFeePerGas >= 2 gwei
//
// Handler pattern (from SomniaEventHandler.sol):
//   onEvent() [external, only callable by 0x0100 precompile]
//     └─ _onEvent() [internal, our implementation]
//          ├─ decode topics[0] to identify event type
//          ├─ decode topics[1] → escrowId (always indexed first)
//          └─ decode data → remaining non-indexed params
// ============================================================

contract ReactiveHandlers is SomniaEventHandler {

    // --------------------------------------------------------
    // State
    // --------------------------------------------------------

    IReactEscrow public immutable reactEscrow;
    address public owner;

    // --------------------------------------------------------
    // Event topic hashes — keccak256 of event signature strings
    // These must exactly match the events in ReactEscrow.sol
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
    // Somnia Reactivity — Core Handler
    //
    // Called by Somnia validators (via 0x0100 precompile) when
    // a subscribed event fires. Inherited onEvent() validates
    // that msg.sender == 0x0100 before calling _onEvent().
    // --------------------------------------------------------

    /// @dev Override from SomniaEventHandler
    /// @param emitter The contract that emitted the event (should be ReactEscrow)
    /// @param eventTopics topics[0] = event sig hash, topics[1..] = indexed params
    /// @param data ABI-encoded non-indexed event parameters
    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal override {
        // Only process events from our ReactEscrow contract
        if (emitter != address(reactEscrow)) return;
        if (eventTopics.length == 0) return;

        bytes32 topic0 = eventTopics[0];

        if (topic0 == MILESTONE_APPROVED_TOPIC) {
            _handleMilestoneApproved(eventTopics, data);
        } else if (topic0 == DEADLINE_REACHED_TOPIC) {
            _handleDeadlineReached(eventTopics, data);
        } else if (topic0 == DISPUTE_RESOLVED_TOPIC) {
            _handleDisputeResolved(eventTopics, data);
        }
        // Unknown events are ignored (no revert — don't fail validator invocations)
    }

    // --------------------------------------------------------
    // Event Handlers
    // --------------------------------------------------------

    /// @dev MilestoneApproved(uint256 indexed escrowId, uint256 milestoneIndex, uint256 amount)
    ///      topics[1] = escrowId, data = abi.encode(milestoneIndex, amount)
    ///
    /// Action: Call reactEscrow.releaseMilestoneFunds() to transfer funds to freelancer.
    /// This is the primary Reactivity showcase — client approves once, funds auto-release.
    function _handleMilestoneApproved(
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) private {
        uint256 escrowId = uint256(eventTopics[1]);
        (uint256 milestoneIndex, ) = abi.decode(data, (uint256, uint256));

        bool success = _safeCall(
            address(reactEscrow),
            abi.encodeWithSelector(
                IReactEscrow.releaseMilestoneFunds.selector,
                escrowId,
                milestoneIndex
            )
        );

        emit HandlerInvoked(MILESTONE_APPROVED_TOPIC, escrowId, success);
    }

    /// @dev DeadlineReached(uint256 indexed escrowId, uint256 milestoneIndex)
    ///      topics[1] = escrowId, data = abi.encode(milestoneIndex)
    ///
    /// Action: Call reactEscrow.executeTimeoutRelease() to release funds to freelancer
    /// automatically when the client has not responded by the deadline.
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

    /// @dev DisputeResolved(uint256 indexed escrowId, uint256 milestoneIndex, uint8 resolution)
    ///      topics[1] = escrowId, data = abi.encode(milestoneIndex, resolution)
    ///
    /// Action: Call reactEscrow.executeResolutionDistribution() to distribute funds
    /// per the arbiter's resolution: 0=freelancer, 1=client, 2=split.
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

    // --------------------------------------------------------
    // Helpers
    // --------------------------------------------------------

    /// @dev Safe low-level call that returns success/failure without reverting.
    ///      We use this to avoid bubbling up errors that would cause the validator
    ///      invocation to revert (which wastes gas and may penalise the subscription).
    function _safeCall(address target, bytes memory callData) private returns (bool success) {
        (success, ) = target.call(callData);
    }

    // --------------------------------------------------------
    // Funding
    // --------------------------------------------------------

    /// @dev Receive STT to fund on-chain subscription invocations.
    ///      This contract must hold >= 32 STT at all times.
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
