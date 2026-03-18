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
//   MilestoneApproved   → handler calls releaseMilestoneFunds()
//   DeadlineReached     → handler calls executeTimeoutRelease()
//   DisputeResolved     → handler calls executeResolutionDistribution()
//   CheckpointApproved  → handler calls releaseCheckpointFunds()
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

    // ── Feature 1: Privacy-Preserving Milestones (commit-reveal) ─────────────
    // commitment = keccak256(abi.encodePacked(amount, salt))
    // amount is stored as 0 until revealed via approvePrivateMilestone()
    mapping(uint256 => mapping(uint256 => bytes32)) private _milestoneCommitments;
    mapping(uint256 => mapping(uint256 => bool))    private _milestoneIsPrivate;

    // ── Feature 2: Proof-of-Delivery ─────────────────────────────────────────
    mapping(uint256 => mapping(uint256 => DeliveryData)) private _deliveryData;
    mapping(uint256 => uint256) private _challengePeriods; // escrowId → seconds

    // ── Feature 3: Streaming Checkpoints ─────────────────────────────────────
    mapping(uint256 => mapping(uint256 => CheckpointData[])) private _checkpoints;
    mapping(uint256 => mapping(uint256 => uint256)) private _milestoneReleasedAmount;

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

    // Feature 1 errors
    error InvalidCommitment();
    error NotPrivateMilestone();

    // Feature 2 errors
    error ChallengePeriodNotStarted();
    error ChallengePeriodActive();
    error ChallengeExpired();
    error AlreadyChallenged();

    // Feature 3 errors
    error InvalidWeights();
    error NoCheckpoints();
    error CheckpointsAlreadyExist();
    error InvalidCheckpointIndex();
    error WrongCheckpointStatus();

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
    function cancelEscrow(uint256 escrowId) external escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (msg.sender != escrow.client) revert NotClient();
        if (escrow.status != EscrowStatus.Created) revert WrongStatus();
        escrow.status = EscrowStatus.Cancelled;
        emit EscrowCancelled(escrowId);
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

        if (reactiveHandler == address(0)) {
            _releaseFunds(escrowId, milestoneIndex, escrow.freelancer, milestone.amount);
        }
    }

    /// @inheritdoc IReactEscrow
    function releaseMilestoneFunds(
        uint256 escrowId,
        uint256 milestoneIndex
    ) external nonReentrant escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
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
    function resolveDispute(
        uint256 escrowId,
        uint256 milestoneIndex,
        uint8 resolution
    ) external nonReentrant escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (msg.sender != escrow.arbiter) revert NotArbiter();
        if (escrow.status != EscrowStatus.Disputed) revert WrongStatus();
        if (milestoneIndex >= _milestones[escrowId].length) revert InvalidMilestone();
        if (resolution > 2) revert WrongStatus();

        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Disputed) revert WrongMilestoneStatus();

        milestone.resolution = resolution;
        emit DisputeResolved(escrowId, milestoneIndex, resolution);

        if (reactiveHandler == address(0)) {
            _distributeResolution(escrowId, milestoneIndex, escrow);
        }
    }

    /// @inheritdoc IReactEscrow
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
    // Feature 1: Privacy-Preserving Milestones
    // --------------------------------------------------------

    /// @inheritdoc IReactEscrow
    /// @dev milestone.amount is stored as 0 until revealed. totalAmount is public.
    function createPrivateEscrow(
        address freelancer,
        address arbiter,
        PrivateMilestoneInput[] calldata milestoneInputs,
        uint256 totalAmount
    ) external payable returns (uint256 escrowId) {
        if (freelancer == address(0) || freelancer == msg.sender) revert InvalidFreelancer();
        if (milestoneInputs.length == 0) revert NoMilestones();

        _escrowCount++;
        escrowId = _escrowCount;

        for (uint256 i = 0; i < milestoneInputs.length; i++) {
            if (milestoneInputs[i].commitment == bytes32(0)) revert InvalidCommitment();
            if (milestoneInputs[i].deadline <= block.timestamp) revert DeadlineMustBeFuture();
            // Store amount=0 — hidden until revealed via approvePrivateMilestone
            _milestones[escrowId].push(Milestone({
                description: milestoneInputs[i].description,
                amount:       0,
                deadline:     milestoneInputs[i].deadline,
                status:       MilestoneStatus.Pending,
                resolution:   0
            }));
            _milestoneCommitments[escrowId][i] = milestoneInputs[i].commitment;
            _milestoneIsPrivate[escrowId][i]   = true;
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
    function approvePrivateMilestone(
        uint256 escrowId,
        uint256 milestoneIndex,
        uint256 amount,
        bytes32 salt
    ) external escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (msg.sender != escrow.client) revert NotClient();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (milestoneIndex >= _milestones[escrowId].length) revert InvalidMilestone();
        if (!_milestoneIsPrivate[escrowId][milestoneIndex]) revert NotPrivateMilestone();

        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Submitted) revert WrongMilestoneStatus();

        // Verify commitment: keccak256(abi.encodePacked(amount, salt)) == stored commitment
        bytes32 expected = _milestoneCommitments[escrowId][milestoneIndex];
        if (keccak256(abi.encodePacked(amount, salt)) != expected) revert InvalidCommitment();

        // Reveal the amount and approve
        milestone.amount = amount;
        milestone.status = MilestoneStatus.Approved;

        emit PrivateMilestoneRevealed(escrowId, milestoneIndex, amount);
        emit MilestoneApproved(escrowId, milestoneIndex, amount);

        if (reactiveHandler == address(0)) {
            _releaseFunds(escrowId, milestoneIndex, escrow.freelancer, amount);
        }
    }

    /// @inheritdoc IReactEscrow
    function getMilestoneCommitment(uint256 escrowId, uint256 milestoneIndex)
        external view returns (bytes32 commitment, bool isPrivate)
    {
        return (
            _milestoneCommitments[escrowId][milestoneIndex],
            _milestoneIsPrivate[escrowId][milestoneIndex]
        );
    }

    // --------------------------------------------------------
    // Feature 2: Proof-of-Delivery Oracle
    // --------------------------------------------------------

    /// @inheritdoc IReactEscrow
    function createEscrowWithDelivery(
        address freelancer,
        address arbiter,
        MilestoneInput[] calldata milestoneInputs,
        bytes32[] calldata deliverableHashes,
        uint256 challengePeriodSeconds
    ) external payable returns (uint256 escrowId) {
        if (freelancer == address(0) || freelancer == msg.sender) revert InvalidFreelancer();
        if (milestoneInputs.length == 0) revert NoMilestones();
        if (deliverableHashes.length != milestoneInputs.length) revert InvalidMilestone();

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
            if (deliverableHashes[i] != bytes32(0)) {
                _deliveryData[escrowId][i].expectedHash = deliverableHashes[i];
            }
        }

        _challengePeriods[escrowId] = challengePeriodSeconds > 0 ? challengePeriodSeconds : 172800;

        EscrowData storage escrow = _escrows[escrowId];
        escrow.client           = msg.sender;
        escrow.freelancer       = freelancer;
        escrow.arbiter          = arbiter;
        escrow.totalAmount      = totalAmount;
        escrow.currentMilestone = 0;

        _clientEscrows[msg.sender].push(escrowId);
        _freelancerEscrows[freelancer].push(escrowId);

        if (msg.value > 0) {
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
    function submitMilestoneWithDeliverable(
        uint256 escrowId,
        uint256 milestoneIndex,
        bytes32 deliverableHash
    ) external escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (msg.sender != escrow.freelancer) revert NotFreelancer();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (milestoneIndex >= _milestones[escrowId].length) revert InvalidMilestone();
        if (milestoneIndex != escrow.currentMilestone) revert NotCurrentMilestone();

        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Pending) revert WrongMilestoneStatus();

        DeliveryData storage dd = _deliveryData[escrowId][milestoneIndex];
        dd.submittedHash = deliverableHash;
        milestone.status = MilestoneStatus.Submitted;
        emit MilestoneSubmitted(escrowId, milestoneIndex);

        // If hashes match, start challenge period
        if (dd.expectedHash != bytes32(0) && dd.expectedHash == deliverableHash) {
            uint256 period = _challengePeriods[escrowId];
            if (period == 0) period = 172800;
            dd.challengeDeadline = block.timestamp + period;
            emit DeliverableVerified(escrowId, milestoneIndex, deliverableHash);
        }
    }

    /// @inheritdoc IReactEscrow
    function checkAndTriggerChallengeExpiry(
        uint256 escrowId,
        uint256 milestoneIndex
    ) external escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();

        DeliveryData storage dd = _deliveryData[escrowId][milestoneIndex];
        if (dd.challengeDeadline == 0) revert ChallengePeriodNotStarted();
        if (dd.challenged) revert AlreadyChallenged();
        if (block.timestamp < dd.challengeDeadline) revert ChallengePeriodActive();

        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Submitted) revert WrongMilestoneStatus();

        // Auto-approve — emits MilestoneApproved → reactive handler releases funds
        milestone.status = MilestoneStatus.Approved;
        emit DeliverableChallengePeriodExpired(escrowId, milestoneIndex);
        emit MilestoneApproved(escrowId, milestoneIndex, milestone.amount);

        if (reactiveHandler == address(0)) {
            _releaseFunds(escrowId, milestoneIndex, escrow.freelancer, milestone.amount);
        }
    }

    /// @inheritdoc IReactEscrow
    function challengeDeliverable(
        uint256 escrowId,
        uint256 milestoneIndex
    ) external escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (msg.sender != escrow.client) revert NotClient();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();

        DeliveryData storage dd = _deliveryData[escrowId][milestoneIndex];
        if (dd.challengeDeadline == 0) revert ChallengePeriodNotStarted();
        if (dd.challenged) revert AlreadyChallenged();
        if (block.timestamp >= dd.challengeDeadline) revert ChallengeExpired();

        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Submitted) revert WrongMilestoneStatus();

        dd.challenged        = true;
        dd.challengeDeadline = 0;
        escrow.status        = EscrowStatus.Disputed;
        milestone.status     = MilestoneStatus.Disputed;

        emit DeliverableChallenged(escrowId, milestoneIndex);
        emit DisputeRaised(escrowId, milestoneIndex, msg.sender);
    }

    /// @inheritdoc IReactEscrow
    function getDeliveryData(uint256 escrowId, uint256 milestoneIndex)
        external view returns (DeliveryData memory)
    {
        return _deliveryData[escrowId][milestoneIndex];
    }

    /// @inheritdoc IReactEscrow
    function getChallengePeriod(uint256 escrowId) external view returns (uint256) {
        uint256 p = _challengePeriods[escrowId];
        return p > 0 ? p : 172800;
    }

    // --------------------------------------------------------
    // Feature 3: Streaming Checkpoints
    // --------------------------------------------------------

    /// @inheritdoc IReactEscrow
    function addMilestoneCheckpoints(
        uint256 escrowId,
        uint256 milestoneIndex,
        string[] calldata descriptions,
        uint8[] calldata weights
    ) external escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (msg.sender != escrow.client) revert NotClient();
        if (milestoneIndex >= _milestones[escrowId].length) revert InvalidMilestone();
        if (descriptions.length == 0 || descriptions.length != weights.length) revert InvalidWeights();
        if (_checkpoints[escrowId][milestoneIndex].length > 0) revert CheckpointsAlreadyExist();

        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Pending) revert WrongMilestoneStatus();

        uint256 totalWeight = 0;
        for (uint256 i = 0; i < weights.length; i++) {
            if (weights[i] == 0) revert InvalidWeights();
            totalWeight += weights[i];
        }
        if (totalWeight != 100) revert InvalidWeights();

        for (uint256 i = 0; i < descriptions.length; i++) {
            _checkpoints[escrowId][milestoneIndex].push(CheckpointData({
                description:   descriptions[i],
                weightPercent: weights[i],
                status:        0 // Pending
            }));
        }
    }

    /// @inheritdoc IReactEscrow
    function submitCheckpoint(
        uint256 escrowId,
        uint256 milestoneIndex,
        uint256 checkpointIndex
    ) external escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (msg.sender != escrow.freelancer) revert NotFreelancer();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (milestoneIndex >= _milestones[escrowId].length) revert InvalidMilestone();
        if (milestoneIndex != escrow.currentMilestone) revert NotCurrentMilestone();

        CheckpointData[] storage checkpoints = _checkpoints[escrowId][milestoneIndex];
        if (checkpoints.length == 0) revert NoCheckpoints();
        if (checkpointIndex >= checkpoints.length) revert InvalidCheckpointIndex();
        if (checkpoints[checkpointIndex].status != 0) revert WrongCheckpointStatus();

        checkpoints[checkpointIndex].status = 1; // Submitted
        emit CheckpointSubmitted(escrowId, milestoneIndex, checkpointIndex);
    }

    /// @inheritdoc IReactEscrow
    function approveCheckpoint(
        uint256 escrowId,
        uint256 milestoneIndex,
        uint256 checkpointIndex
    ) external escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (msg.sender != escrow.client) revert NotClient();
        if (escrow.status != EscrowStatus.Active) revert WrongStatus();
        if (milestoneIndex >= _milestones[escrowId].length) revert InvalidMilestone();

        CheckpointData[] storage checkpoints = _checkpoints[escrowId][milestoneIndex];
        if (checkpoints.length == 0) revert NoCheckpoints();
        if (checkpointIndex >= checkpoints.length) revert InvalidCheckpointIndex();
        if (checkpoints[checkpointIndex].status != 1) revert WrongCheckpointStatus(); // must be Submitted

        checkpoints[checkpointIndex].status = 2; // Approved

        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        uint256 amount = (milestone.amount * checkpoints[checkpointIndex].weightPercent) / 100;

        emit CheckpointApproved(escrowId, milestoneIndex, checkpointIndex, amount);

        if (reactiveHandler == address(0)) {
            _releaseCheckpointInternal(escrowId, milestoneIndex, checkpointIndex, escrow, milestone);
        }
    }

    /// @inheritdoc IReactEscrow
    function releaseCheckpointFunds(
        uint256 escrowId,
        uint256 milestoneIndex,
        uint256 checkpointIndex
    ) external nonReentrant escrowExists(escrowId) {
        EscrowData storage escrow = _escrows[escrowId];
        if (msg.sender != reactiveHandler && msg.sender != escrow.client) {
            revert NotAuthorized();
        }

        CheckpointData[] storage checkpoints = _checkpoints[escrowId][milestoneIndex];
        if (checkpoints.length == 0) revert NoCheckpoints();
        if (checkpointIndex >= checkpoints.length) revert InvalidCheckpointIndex();
        if (checkpoints[checkpointIndex].status != 2) revert WrongCheckpointStatus(); // must be Approved

        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        _releaseCheckpointInternal(escrowId, milestoneIndex, checkpointIndex, escrow, milestone);
    }

    /// @inheritdoc IReactEscrow
    function getCheckpoints(uint256 escrowId, uint256 milestoneIndex)
        external view returns (CheckpointData[] memory)
    {
        return _checkpoints[escrowId][milestoneIndex];
    }

    /// @inheritdoc IReactEscrow
    function getMilestoneReleasedAmount(uint256 escrowId, uint256 milestoneIndex)
        external view returns (uint256)
    {
        return _milestoneReleasedAmount[escrowId][milestoneIndex];
    }

    // --------------------------------------------------------
    // Internal: Checkpoint Release
    // --------------------------------------------------------

    /// @dev CEI: all state updates before any transfer
    function _releaseCheckpointInternal(
        uint256 escrowId,
        uint256 milestoneIndex,
        uint256 checkpointIndex,
        EscrowData storage escrow,
        Milestone storage milestone
    ) internal {
        CheckpointData[] storage checkpoints = _checkpoints[escrowId][milestoneIndex];

        // Mark checkpoint Released
        checkpoints[checkpointIndex].status = 3;

        // Last checkpoint gets rounding remainder
        uint256 amount;
        bool isLast = (checkpointIndex == checkpoints.length - 1);
        if (isLast) {
            uint256 released = _milestoneReleasedAmount[escrowId][milestoneIndex];
            amount = milestone.amount > released ? milestone.amount - released : 0;
        } else {
            amount = (milestone.amount * checkpoints[checkpointIndex].weightPercent) / 100;
        }

        _milestoneReleasedAmount[escrowId][milestoneIndex] += amount;

        emit CheckpointReleased(escrowId, milestoneIndex, checkpointIndex, amount);

        // Check if all checkpoints released → complete the milestone
        bool allDone = true;
        for (uint256 i = 0; i < checkpoints.length; i++) {
            if (checkpoints[i].status != 3) { allDone = false; break; }
        }

        if (allDone) {
            milestone.status = MilestoneStatus.Released;
            emit FundsReleased(escrowId, milestoneIndex, escrow.freelancer, milestone.amount);

            if (escrow.currentMilestone == milestoneIndex) {
                escrow.currentMilestone = milestoneIndex + 1;
            }
            if (_allMilestonesReleased(escrowId)) {
                escrow.status = EscrowStatus.Completed;
                emit EscrowCompleted(escrowId);
            }
        }

        // Transfer (interaction after all state changes)
        if (amount > 0) {
            (bool ok, ) = payable(escrow.freelancer).call{value: amount}("");
            if (!ok) revert TransferFailed();
        }
    }

    // --------------------------------------------------------
    // Internal: Fund Distribution
    // --------------------------------------------------------

    function _releaseFunds(
        uint256 escrowId,
        uint256 milestoneIndex,
        address to,
        uint256 amount
    ) internal {
        EscrowData storage escrow = _escrows[escrowId];
        Milestone storage milestone = _milestones[escrowId][milestoneIndex];

        milestone.status = MilestoneStatus.Released;
        emit FundsReleased(escrowId, milestoneIndex, to, amount);

        if (escrow.currentMilestone == milestoneIndex) {
            escrow.currentMilestone = milestoneIndex + 1;
        }

        bool allReleased = _allMilestonesReleased(escrowId);
        if (allReleased) {
            escrow.status = EscrowStatus.Completed;
            emit EscrowCompleted(escrowId);
        }

        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    function _distributeResolution(
        uint256 escrowId,
        uint256 milestoneIndex,
        EscrowData storage escrow
    ) internal {
        Milestone storage milestone = _milestones[escrowId][milestoneIndex];
        uint8 resolution  = milestone.resolution;
        uint256 amount    = milestone.amount;

        milestone.status = MilestoneStatus.Released;
        escrow.status    = EscrowStatus.Active;

        if (escrow.currentMilestone == milestoneIndex) {
            escrow.currentMilestone = milestoneIndex + 1;
        }

        bool allReleased = _allMilestonesReleased(escrowId);
        if (allReleased) {
            escrow.status = EscrowStatus.Completed;
            emit EscrowCompleted(escrowId);
        }

        if (resolution == 0) {
            emit FundsReleased(escrowId, milestoneIndex, escrow.freelancer, amount);
            (bool ok, ) = payable(escrow.freelancer).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else if (resolution == 1) {
            emit FundsReleased(escrowId, milestoneIndex, escrow.client, amount);
            (bool ok, ) = payable(escrow.client).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
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
