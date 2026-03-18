// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ============================================================
// IReactEscrow — Interface for the ReactEscrow contract
// ============================================================

interface IReactEscrow {

    // --------------------------------------------------------
    // Enums
    // --------------------------------------------------------

    enum EscrowStatus {
        Created,   // 0 — created, awaiting funds
        Funded,    // 1 — funds deposited (alias for Active in simple flow)
        Active,    // 2 — work in progress
        Completed, // 3 — all milestones released
        Disputed,  // 4 — dispute raised, funds frozen
        Cancelled  // 5 — cancelled before funding
    }

    enum MilestoneStatus {
        Pending,   // 0 — waiting for freelancer to submit
        Submitted, // 1 — freelancer submitted work
        Approved,  // 2 — client approved, pending reactive release
        Disputed,  // 3 — disputed, funds frozen
        Released   // 4 — funds released to recipient
    }

    // --------------------------------------------------------
    // Structs
    // --------------------------------------------------------

    /// @notice Input struct for creating milestones (no status/resolution fields)
    struct MilestoneInput {
        string description;
        uint256 amount;    // amount in wei
        uint256 deadline;  // unix timestamp
    }

    /// @notice Stored milestone data
    struct Milestone {
        string description;
        uint256 amount;
        uint256 deadline;
        MilestoneStatus status;
        uint8 resolution; // for disputes: 0=freelancer, 1=client, 2=split
    }

    // ── Feature 1: Privacy-Preserving Milestones ─────────────────────────────

    /// @notice Input for a private milestone — amount is hidden as a commitment
    struct PrivateMilestoneInput {
        string description;
        bytes32 commitment; // keccak256(abi.encodePacked(amount, salt))
        uint256 deadline;
    }

    // ── Feature 2: Proof-of-Delivery ─────────────────────────────────────────

    /// @notice Delivery verification data stored per milestone
    struct DeliveryData {
        bytes32 expectedHash;      // set at creation (bytes32(0) = no delivery required)
        bytes32 submittedHash;     // set by freelancer at submission
        uint256 challengeDeadline; // block.timestamp + challengePeriod, or 0 if not started
        bool    challenged;        // true if client challenged during period
    }

    // ── Feature 3: Streaming Checkpoints ─────────────────────────────────────

    /// @notice A single checkpoint within a milestone
    struct CheckpointData {
        string description;
        uint8  weightPercent; // 1-100; all checkpoints in a milestone must sum to 100
        uint8  status;        // 0=Pending, 1=Submitted, 2=Approved, 3=Released
    }

    // --------------------------------------------------------
    // Events — used as Somnia Reactivity subscription sources
    // NOTE: escrowId is always the first indexed param so the
    //       handler can read it from eventTopics[1]
    // --------------------------------------------------------

    /// @notice Emitted when a new escrow is created
    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed client,
        address indexed freelancer,
        uint256 totalAmount
    );

    /// @notice Emitted when funds are deposited into the escrow
    event FundsDeposited(uint256 indexed escrowId, uint256 amount);

    /// @notice Emitted when freelancer submits work for a milestone
    event MilestoneSubmitted(uint256 indexed escrowId, uint256 milestoneIndex);

    /// @notice Emitted when client approves a milestone — triggers ReactiveHandler
    event MilestoneApproved(uint256 indexed escrowId, uint256 milestoneIndex, uint256 amount);

    /// @notice Emitted when milestone funds are transferred to recipient
    event FundsReleased(
        uint256 indexed escrowId,
        uint256 milestoneIndex,
        address indexed to,
        uint256 amount
    );

    /// @notice Emitted when a milestone's deadline has passed — triggers ReactiveHandler
    event DeadlineReached(uint256 indexed escrowId, uint256 milestoneIndex);

    /// @notice Emitted when a dispute is raised — triggers ReactiveHandler
    event DisputeRaised(
        uint256 indexed escrowId,
        uint256 milestoneIndex,
        address indexed raisedBy
    );

    /// @notice Emitted when a dispute is resolved — triggers ReactiveHandler
    event DisputeResolved(uint256 indexed escrowId, uint256 milestoneIndex, uint8 resolution);

    /// @notice Emitted when all milestones in an escrow are released
    event EscrowCompleted(uint256 indexed escrowId);

    /// @notice Emitted when a Created (unfunded) escrow is cancelled by the client
    event EscrowCancelled(uint256 indexed escrowId);

    // ── Feature 1 events ─────────────────────────────────────────────────────

    /// @notice Emitted when a private milestone amount is revealed and approved
    event PrivateMilestoneRevealed(uint256 indexed escrowId, uint256 milestoneIndex, uint256 amount);

    // ── Feature 2 events ─────────────────────────────────────────────────────

    /// @notice Emitted when freelancer's submitted hash matches the expected deliverable hash
    event DeliverableVerified(uint256 indexed escrowId, uint256 indexed milestoneIndex, bytes32 deliverableHash);

    /// @notice Emitted when challenge period expires without a challenge
    event DeliverableChallengePeriodExpired(uint256 indexed escrowId, uint256 indexed milestoneIndex);

    /// @notice Emitted when client challenges a deliverable during the challenge period
    event DeliverableChallenged(uint256 indexed escrowId, uint256 indexed milestoneIndex);

    // ── Feature 3 events ─────────────────────────────────────────────────────

    /// @notice Emitted when freelancer submits a checkpoint — triggers Reactivity
    event CheckpointSubmitted(uint256 indexed escrowId, uint256 indexed milestoneIndex, uint256 checkpointIndex);

    /// @notice Emitted when client approves a checkpoint — triggers ReactiveHandler
    event CheckpointApproved(
        uint256 indexed escrowId,
        uint256 indexed milestoneIndex,
        uint256 checkpointIndex,
        uint256 amount
    );

    /// @notice Emitted when checkpoint funds are released
    event CheckpointReleased(
        uint256 indexed escrowId,
        uint256 milestoneIndex,
        uint256 checkpointIndex,
        uint256 amount
    );

    // --------------------------------------------------------
    // Core Functions
    // --------------------------------------------------------

    /// @notice Create an escrow. Send ETH equal to totalAmount to deposit immediately,
    ///         or send 0 to create without funds (call depositFunds separately).
    function createEscrow(
        address freelancer,
        address arbiter,
        MilestoneInput[] calldata milestones
    ) external payable returns (uint256 escrowId);

    /// @notice Deposit funds into a Created escrow
    function depositFunds(uint256 escrowId) external payable;

    /// @notice Cancel a Created (unfunded) escrow. Only the client can cancel,
    ///         and only before funds are deposited. No funds at risk.
    function cancelEscrow(uint256 escrowId) external;

    /// @notice Freelancer submits work for a specific milestone
    function submitMilestone(uint256 escrowId, uint256 milestoneIndex) external;

    /// @notice Client approves a milestone — emits MilestoneApproved for reactive release
    function approveMilestone(uint256 escrowId, uint256 milestoneIndex) external;

    /// @notice Release funds for an Approved milestone.
    ///         Called by the ReactiveHandler after MilestoneApproved event,
    ///         or by the client directly as a fallback.
    function releaseMilestoneFunds(uint256 escrowId, uint256 milestoneIndex) external;

    /// @notice Check if deadline has passed and emit DeadlineReached — triggers ReactiveHandler
    function checkAndTriggerTimeout(uint256 escrowId, uint256 milestoneIndex) external;

    /// @notice Execute automatic release after timeout. Called by ReactiveHandler after
    ///         DeadlineReached event, or by anyone as fallback.
    function executeTimeoutRelease(uint256 escrowId, uint256 milestoneIndex) external;

    /// @notice Raise a dispute on a milestone (client or freelancer)
    function raiseDispute(uint256 escrowId, uint256 milestoneIndex) external;

    /// @notice Arbiter resolves a dispute: 0=freelancer, 1=client, 2=split
    function resolveDispute(uint256 escrowId, uint256 milestoneIndex, uint8 resolution) external;

    /// @notice Execute fund distribution after dispute resolution. Called by ReactiveHandler
    ///         after DisputeResolved event, or by arbiter directly as fallback.
    function executeResolutionDistribution(uint256 escrowId, uint256 milestoneIndex) external;

    // ── Feature 1: Privacy-Preserving Milestones ─────────────────────────────

    /// @notice Create an escrow where individual milestone amounts are hidden as
    ///         keccak256 commitments. The totalAmount is still public and deposited.
    function createPrivateEscrow(
        address freelancer,
        address arbiter,
        PrivateMilestoneInput[] calldata milestones,
        uint256 totalAmount
    ) external payable returns (uint256 escrowId);

    /// @notice Approve a private milestone by revealing amount + salt.
    ///         Verifies keccak256(abi.encodePacked(amount, salt)) == stored commitment,
    ///         then emits MilestoneApproved so the reactive handler releases funds.
    function approvePrivateMilestone(
        uint256 escrowId,
        uint256 milestoneIndex,
        uint256 amount,
        bytes32 salt
    ) external;

    /// @notice Returns commitment data for a private milestone
    function getMilestoneCommitment(uint256 escrowId, uint256 milestoneIndex)
        external view returns (bytes32 commitment, bool isPrivate);

    // ── Feature 2: Proof-of-Delivery ─────────────────────────────────────────

    /// @notice Create an escrow with on-chain deliverable verification and challenge period.
    ///         When freelancer submits a hash matching the expected hash, a challenge
    ///         period starts. If unchallenged, anyone can call checkAndTriggerChallengeExpiry
    ///         to auto-approve via the reactive MilestoneApproved event.
    function createEscrowWithDelivery(
        address freelancer,
        address arbiter,
        MilestoneInput[] calldata milestones,
        bytes32[] calldata deliverableHashes,  // bytes32(0) = no delivery proof required
        uint256 challengePeriodSeconds         // 0 = default 48h
    ) external payable returns (uint256 escrowId);

    /// @notice Freelancer submits milestone with an associated deliverable hash.
    ///         If hash matches expectedHash, starts the challenge period.
    function submitMilestoneWithDeliverable(
        uint256 escrowId,
        uint256 milestoneIndex,
        bytes32 deliverableHash
    ) external;

    /// @notice Anyone can call after the challenge period expires.
    ///         Sets milestone Approved and emits MilestoneApproved → reactive release.
    function checkAndTriggerChallengeExpiry(
        uint256 escrowId,
        uint256 milestoneIndex
    ) external;

    /// @notice Client challenges a deliverable during the challenge period.
    ///         Moves milestone to Disputed for arbiter resolution.
    function challengeDeliverable(
        uint256 escrowId,
        uint256 milestoneIndex
    ) external;

    /// @notice Returns delivery verification data for a milestone
    function getDeliveryData(uint256 escrowId, uint256 milestoneIndex)
        external view returns (DeliveryData memory);

    /// @notice Returns challenge period for an escrow (in seconds)
    function getChallengePeriod(uint256 escrowId) external view returns (uint256);

    // ── Feature 3: Streaming Checkpoints ─────────────────────────────────────

    /// @notice Add checkpoints to an existing milestone before it is submitted.
    ///         Weights must sum to 100. Enables streaming partial payment releases.
    function addMilestoneCheckpoints(
        uint256 escrowId,
        uint256 milestoneIndex,
        string[] calldata descriptions,
        uint8[] calldata weights
    ) external;

    /// @notice Freelancer marks a checkpoint as submitted
    function submitCheckpoint(
        uint256 escrowId,
        uint256 milestoneIndex,
        uint256 checkpointIndex
    ) external;

    /// @notice Client approves a checkpoint — emits CheckpointApproved for reactive partial release
    function approveCheckpoint(
        uint256 escrowId,
        uint256 milestoneIndex,
        uint256 checkpointIndex
    ) external;

    /// @notice Release funds for an Approved checkpoint.
    ///         Called by ReactiveHandler after CheckpointApproved event,
    ///         or by client as fallback.
    function releaseCheckpointFunds(
        uint256 escrowId,
        uint256 milestoneIndex,
        uint256 checkpointIndex
    ) external;

    /// @notice Returns all checkpoints for a milestone
    function getCheckpoints(uint256 escrowId, uint256 milestoneIndex)
        external view returns (CheckpointData[] memory);

    /// @notice Returns how much has been released for a milestone via checkpoints
    function getMilestoneReleasedAmount(uint256 escrowId, uint256 milestoneIndex)
        external view returns (uint256);

    // --------------------------------------------------------
    // Admin
    // --------------------------------------------------------

    /// @notice Set the ReactiveHandler contract address (owner only)
    function setReactiveHandler(address handler) external;

    // --------------------------------------------------------
    // Views
    // --------------------------------------------------------

    function getEscrow(uint256 escrowId) external view returns (
        address client,
        address freelancer,
        address arbiter,
        uint256 totalAmount,
        EscrowStatus status,
        uint256 currentMilestone
    );

    function getMilestones(uint256 escrowId) external view returns (Milestone[] memory);

    function getEscrowsByClient(address client) external view returns (uint256[] memory);

    function getEscrowsByFreelancer(address freelancer) external view returns (uint256[] memory);

    function escrowCount() external view returns (uint256);
}
