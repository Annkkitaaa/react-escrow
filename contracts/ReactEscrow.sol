// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IReactEscrow.sol";

// ============================================================
// ReactEscrow — Reactive Milestone-Based Escrow Protocol
//
// Somnia Reactivity integration:
//   ON-CHAIN:  ReactiveHandlers.sol subscribes to events emitted
//              by this contract and auto-executes fund releases,
//              timeout triggers, and dispute resolutions.
//   OFF-CHAIN: reactive-service/ subscribes via WebSocket to push
//              live state updates to the frontend.
//
// Key Reactivity events:
//   MilestoneApproved  → handler calls releaseMilestoneFunds()
//   DeadlineReached    → handler calls executeTimeoutRelease()
//   DisputeResolved    → handler calls executeResolutionDistribution()
// ============================================================

contract ReactEscrow is IReactEscrow, ReentrancyGuard {

    // --------------------------------------------------------
    // State
    // --------------------------------------------------------

    uint256 private _escrowCount;

    struct EscrowData {
        address client;
        address freelancer;
        address arbiter;
        uint256 totalAmount;
        EscrowStatus status;
        uint256 currentMilestone;
    }

    mapping(uint256 => EscrowData)  private _escrows;
    mapping(uint256 => Milestone[]) private _milestones;

    // Index for dashboard queries
    mapping(address => uint256[]) private _clientEscrows;
    mapping(address => uint256[]) private _freelancerEscrows;

    address public owner;
    address public reactiveHandler;

    // --------------------------------------------------------
    // Errors
    // --------------------------------------------------------

    error NotOwner();
    error NotClient();
    error NotFreelancer();
    error NotArbiter();
    error NotAuthorized();
    error EscrowNotFound();
    error InvalidFreelancer();
    error InvalidMilestone();
    error NoMilestones();
    error WrongStatus();
    error WrongMilestoneStatus();
    error IncorrectAmount();
    error DeadlineNotPassed();
    error DeadlineMustBeFuture();
    error MilestoneAmountZero();
    error TransferFailed();
    error AlreadyFunded();
    error NotCurrentMilestone();

    // --------------------------------------------------------
    // Modifiers
    // --------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier escrowExists(uint256 id) {
        if (id == 0 || id > _escrowCount) revert EscrowNotFound();
        _;
    }

    // --------------------------------------------------------
    // Constructor
    // --------------------------------------------------------

    constructor() {
        owner = msg.sender;
    }

    // --------------------------------------------------------
    // Admin
    // --------------------------------------------------------

    function setReactiveHandler(address handler) external onlyOwner {
        reactiveHandler = handler;
    }

    // --------------------------------------------------------
    // Core: Create & Fund
    // --------------------------------------------------------

    /// @inheritdoc IReactEscrow
    function createEscrow(
        address freelancer,
        address arbiter,
        MilestoneInput[] calldata milestoneInputs
    ) external payable returns (uint256 escrowId) {
        if (freelancer == address(0) || freelancer == msg.sender) revert InvalidFreelancer();
        if (milestoneInputs.length == 0) revert NoMilestones();

        _escrowCount++;
        escrowId = _escrowCount;

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < milestoneInputs.length; i++) {
            if (milestoneInputs[i].amount == 0) revert MilestoneAmountZero();
            if (milestoneInputs[i].deadline <= block.timestamp) revert DeadlineMustBeFuture();
            totalAmount += milestoneInputs[i].amount;
            _milestones[escrowId].push(Milestone({
                description: milestoneInputs[i].description,
                amount:       milestoneInputs[i].amount,
                deadline:     milestoneInputs[i].deadline,
                status:       MilestoneStatus.Pending,
                resolution:   0
            }));
        }

        EscrowData storage escrow = _escrows[escrowId];
        escrow.client           = msg.sender;
        escrow.freelancer       = freelancer;
        escrow.arbiter          = arbiter;
        escrow.totalAmount      = totalAmount;
        escrow.currentMilestone = 0;

        _clientEscrows[msg.sender].push(escrowId);
        _freelancerEscrows[freelancer].push(escrowId);

        if (msg.value > 0) {
            // Fund immediately if ETH sent
            if (msg.value != totalAmount) revert IncorrectAmount();
            escrow.status = EscrowStatus.Active;
            emit EscrowCreated(escrowId, msg.sender, freelancer, totalAmount);
            emit FundsDeposited(escrowId, msg.value);
        } else {
            escrow.status = EscrowStatus.Created;
            emit EscrowCreated(escrowId, msg.sender, freelancer, totalAmount);
        }
    }

    /// @inheritdoc IReactEscrow
    function depositFunds(uint256 escrowId) external payable escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (msg.sender != escrow.client) revert NotClient();
        if (escrow.status != EscrowStatus.Created) revert AlreadyFunded();
        if (msg.value != escrow.totalAmount) revert IncorrectAmount();

        escrow.status = EscrowStatus.Active;
        emit FundsDeposited(escrowId, msg.value);
    }

    // --------------------------------------------------------
    // Core: Milestone Lifecycle
    // --------------------------------------------------------

    /// @inheritdoc IReactEscrow
    function submitMilestone(
        uint256 escrowId,
        uint256 milestoneIndex
    ) external escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (msg.sender != escrow.freelancer) revert NotFreelancer();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (milestoneIndex >= _milestones[escrowId].length) revert InvalidMilestone();
        if (milestoneIndex != escrow.currentMilestone) revert NotCurrentMilestone();

        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Pending) revert WrongMilestoneStatus();

        milestone.status = MilestoneStatus.Submitted;
        emit MilestoneSubmitted(escrowId, milestoneIndex);
    }

    /// @inheritdoc IReactEscrow
    /// @dev Emits MilestoneApproved — the Somnia ReactiveHandler subscribes to
    ///      this event and automatically calls releaseMilestoneFunds() in response.
    ///      This is the primary showcase of Somnia on-chain Reactivity.
    function approveMilestone(
        uint256 escrowId,
        uint256 milestoneIndex
    ) external escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (msg.sender != escrow.client) revert NotClient();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (milestoneIndex >= _milestones[escrowId].length) revert InvalidMilestone();

        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Submitted) revert WrongMilestoneStatus();

        milestone.status = MilestoneStatus.Approved;
        emit MilestoneApproved(escrowId, milestoneIndex, milestone.amount);

        // Reactive handler auto-calls releaseMilestoneFunds() after this event.
        // If no handler is set (local testing / fallback), release directly.
        if (reactiveHandler == address(0)) {
            _releaseFunds(escrowId, milestoneIndex, escrow.freelancer, milestone.amount);
        }
    }

    /// @inheritdoc IReactEscrow
    /// @dev Called by ReactiveHandler after MilestoneApproved event.
    ///      Client can also call directly as fallback.
    function releaseMilestoneFunds(
        uint256 escrowId,
        uint256 milestoneIndex
    ) external nonReentrant escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        // Allow: reactive handler OR client (fallback)
        if (msg.sender != reactiveHandler && msg.sender != escrow.client) {
            revert NotAuthorized();
        }

        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Approved) revert WrongMilestoneStatus();

        _releaseFunds(escrowId, milestoneIndex, escrow.freelancer, milestone.amount);
    }

    // --------------------------------------------------------
    // Core: Timeout / Deadline
    // --------------------------------------------------------

    /// @inheritdoc IReactEscrow
    /// @dev Anyone can call this once the deadline has passed.
    ///      Emits DeadlineReached — the Somnia ReactiveHandler subscribes and
    ///      automatically calls executeTimeoutRelease() in response.
    function checkAndTriggerTimeout(
        uint256 escrowId,
        uint256 milestoneIndex
    ) external escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (milestoneIndex >= _milestones[escrowId].length) revert InvalidMilestone();
        if (milestoneIndex != escrow.currentMilestone) revert NotCurrentMilestone();

        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        if (
            milestone.status != MilestoneStatus.Submitted &&
            milestone.status != MilestoneStatus.Pending
        ) revert WrongMilestoneStatus();
        if (block.timestamp <= milestone.deadline) revert DeadlineNotPassed();

        emit DeadlineReached(escrowId, milestoneIndex);
    }

    /// @inheritdoc IReactEscrow
    /// @dev Called by ReactiveHandler after DeadlineReached event.
    ///      Anyone can call directly as fallback (conditions enforced on-chain).
    function executeTimeoutRelease(
        uint256 escrowId,
        uint256 milestoneIndex
    ) external nonReentrant escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (milestoneIndex >= _milestones[escrowId].length) revert InvalidMilestone();

        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        if (
            milestone.status != MilestoneStatus.Submitted &&
            milestone.status != MilestoneStatus.Pending
        ) revert WrongMilestoneStatus();
        if (block.timestamp <= milestone.deadline) revert DeadlineNotPassed();

        // Set Approved so _releaseFunds check passes, then release to freelancer
        milestone.status = MilestoneStatus.Approved;
        _releaseFunds(escrowId, milestoneIndex, escrow.freelancer, milestone.amount);
    }

    // --------------------------------------------------------
    // Core: Dispute
    // --------------------------------------------------------

    /// @inheritdoc IReactEscrow
    function raiseDispute(
        uint256 escrowId,
        uint256 milestoneIndex
    ) external escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (msg.sender != escrow.client && msg.sender != escrow.freelancer) {
            revert NotAuthorized();
        }
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (milestoneIndex >= _milestones[escrowId].length) revert InvalidMilestone();

        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        if (
            milestone.status != MilestoneStatus.Pending   &&
            milestone.status != MilestoneStatus.Submitted &&
            milestone.status != MilestoneStatus.Approved
        ) revert WrongMilestoneStatus();

        escrow.status    = EscrowStatus.Disputed;
        milestone.status = MilestoneStatus.Disputed;
        emit DisputeRaised(escrowId, milestoneIndex, msg.sender);
    }

    /// @inheritdoc IReactEscrow
    /// @dev Emits DisputeResolved — the Somnia ReactiveHandler subscribes and
    ///      automatically calls executeResolutionDistribution() in response.
    function resolveDispute(
        uint256 escrowId,
        uint256 milestoneIndex,
        uint8 resolution
    ) external nonReentrant escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (msg.sender != escrow.arbiter) revert NotArbiter();
        if (escrow.status != EscrowStatus.Disputed) revert WrongStatus();
        if (milestoneIndex >= _milestones[escrowId].length) revert InvalidMilestone();
        if (resolution > 2) revert WrongStatus(); // 0=freelancer, 1=client, 2=split

        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Disputed) revert WrongMilestoneStatus();

        milestone.resolution = resolution;
        emit DisputeResolved(escrowId, milestoneIndex, resolution);

        // Reactive handler auto-calls executeResolutionDistribution() after this event.
        // If no handler is set (local testing / fallback), distribute directly.
        if (reactiveHandler == address(0)) {
            _distributeResolution(escrowId, milestoneIndex, escrow);
        }
    }

    /// @inheritdoc IReactEscrow
    /// @dev Called by ReactiveHandler after DisputeResolved event.
    ///      Arbiter can also call directly as fallback.
    function executeResolutionDistribution(
        uint256 escrowId,
        uint256 milestoneIndex
    ) external nonReentrant escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (msg.sender != reactiveHandler && msg.sender != escrow.arbiter) {
            revert NotAuthorized();
        }

        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Disputed) revert WrongMilestoneStatus();
        if (escrow.status != EscrowStatus.Disputed) revert WrongStatus();

        _distributeResolution(escrowId, milestoneIndex, escrow);
    }

    // --------------------------------------------------------
    // Internal: Fund Distribution
    // --------------------------------------------------------

    /// @dev Checks-Effects-Interactions: update all state before any transfer
    function _releaseFunds(
        uint256 escrowId,
        uint256 milestoneIndex,
        address to,
        uint256 amount
    ) internal {
        EscrowData storage escrow = _escrows[escrowId];
        Milestone storage milestone = _milestones[escrowId][milestoneIndex];

        // Effects
        milestone.status = MilestoneStatus.Released;
        emit FundsReleased(escrowId, milestoneIndex, to, amount);

        // Advance current milestone pointer
        if (escrow.currentMilestone == milestoneIndex) {
            escrow.currentMilestone = milestoneIndex + 1;
        }

        // Check completion
        bool allReleased = _allMilestonesReleased(escrowId);
        if (allReleased) {
            escrow.status = EscrowStatus.Completed;
            emit EscrowCompleted(escrowId);
        }

        // Interaction (after all state changes)
        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /// @dev Distributes funds based on dispute resolution. Handles 50/50 split carefully.
    function _distributeResolution(
        uint256 escrowId,
        uint256 milestoneIndex,
        EscrowData storage escrow
    ) internal {
        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        uint8 resolution  = milestone.resolution;
        uint256 amount    = milestone.amount;

        // Effects first
        milestone.status = MilestoneStatus.Released;
        escrow.status    = EscrowStatus.Active; // resume after dispute

        if (escrow.currentMilestone == milestoneIndex) {
            escrow.currentMilestone = milestoneIndex + 1;
        }

        bool allReleased = _allMilestonesReleased(escrowId);
        if (allReleased) {
            escrow.status = EscrowStatus.Completed;
            emit EscrowCompleted(escrowId);
        }

        // Interactions
        if (resolution == 0) {
            // Release to freelancer
            emit FundsReleased(escrowId, milestoneIndex, escrow.freelancer, amount);
            (bool ok, ) = payable(escrow.freelancer).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else if (resolution == 1) {
            // Refund to client
            emit FundsReleased(escrowId, milestoneIndex, escrow.client, amount);
            (bool ok, ) = payable(escrow.client).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            // Split 50/50 — remainder goes to freelancer
            uint256 half      = amount / 2;
            uint256 remainder = amount - half;
            emit FundsReleased(escrowId, milestoneIndex, escrow.freelancer, half);
            emit FundsReleased(escrowId, milestoneIndex, escrow.client,     remainder);
            (bool ok1, ) = payable(escrow.freelancer).call{value: half}("");
            if (!ok1) revert TransferFailed();
            (bool ok2, ) = payable(escrow.client).call{value: remainder}("");
            if (!ok2) revert TransferFailed();
        }
    }

    function _allMilestonesReleased(uint256 escrowId) internal view returns (bool) {
        Milestone[] storage milestones = _milestones[escrowId];
        for (uint256 i = 0; i < milestones.length; i++) {
            if (milestones[i].status != MilestoneStatus.Released) return false;
        }
        return true;
    }

    // --------------------------------------------------------
    // Views
    // --------------------------------------------------------

    function getEscrow(uint256 escrowId) external view escrowExists(escrowId) returns (
        address client,
        address freelancer,
        address arbiter,
        uint256 totalAmount,
        EscrowStatus status,
        uint256 currentMilestone
    ) {
        EscrowData storage e = _escrows[escrowId];
        return (e.client, e.freelancer, e.arbiter, e.totalAmount, e.status, e.currentMilestone);
    }

    function getMilestones(
        uint256 escrowId
    ) external view escrowExists(escrowId) returns (Milestone[] memory) {
        return _milestones[escrowId];
    }

    function getEscrowsByClient(address client) external view returns (uint256[] memory) {
        return _clientEscrows[client];
    }

    function getEscrowsByFreelancer(address freelancer) external view returns (uint256[] memory) {
        return _freelancerEscrows[freelancer];
    }

    function escrowCount() external view returns (uint256) {
        return _escrowCount;
    }
}
