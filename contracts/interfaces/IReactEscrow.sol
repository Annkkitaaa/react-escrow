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
