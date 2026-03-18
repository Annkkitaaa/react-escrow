// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

// ============================================================
// ReputationSBT — Soulbound Reputation Token (Feature 5)
//
// Non-transferable ERC721 minted to each user (freelancer + client)
// on their first milestone release. Tracks aggregate stats and a
// Merkle root encoding all individual escrow completions.
//
// Third parties can verify claims about a user's history using
// Merkle proofs without revealing all individual escrow details.
//
// Merkle root is updated by the trusted ReputationHook contract
// after each new escrow completion.
// ============================================================

contract ReputationSBT is ERC721 {

    // --------------------------------------------------------
    // State
    // --------------------------------------------------------

    address public owner;
    address public trustedUpdater; // ReputationHook contract

    uint256 private _nextTokenId;

    struct RepData {
        bytes32 merkleRoot;          // root of all escrow completion leaves
        uint256 totalEscrows;        // total milestones released
        uint256 totalAmountEarned;   // total STT received (for freelancers)
        uint256 disputeCount;        // how many milestones involved disputes
        uint256 lastUpdated;         // block.timestamp of last update
    }

    mapping(address => RepData)    public reputation;
    mapping(address => uint256)    public addressToTokenId; // 0 = no token yet

    // --------------------------------------------------------
    // Events
    // --------------------------------------------------------

    event ReputationUpdated(
        address indexed user,
        uint256 escrowId,
        uint256 totalEscrows,
        uint256 totalAmountEarned
    );

    // --------------------------------------------------------
    // Errors
    // --------------------------------------------------------

    error NotOwner();
    error NotTrustedUpdater();
    error Soulbound();

    // --------------------------------------------------------
    // Constructor
    // --------------------------------------------------------

    constructor() ERC721("ReactEscrow Reputation", "REP") {
        owner = msg.sender;
    }

    // --------------------------------------------------------
    // Admin
    // --------------------------------------------------------

    function setTrustedUpdater(address _updater) external {
        if (msg.sender != owner) revert NotOwner();
        trustedUpdater = _updater;
    }

    // --------------------------------------------------------
    // Reputation Update — called by ReputationHook
    // --------------------------------------------------------

    /// @notice Mint SBT (if first time) and update reputation stats.
    ///         The Merkle root is computed off-chain by the reactive-service
    ///         and passed in. Pass bytes32(0) to skip root update.
    function mintOrUpdate(
        address user,
        uint256 escrowId,
        uint256 amount,
        bool hadDispute,
        bytes32 newMerkleRoot
    ) external {
        if (msg.sender != trustedUpdater) revert NotTrustedUpdater();

        // Mint SBT on first update
        if (addressToTokenId[user] == 0) {
            _nextTokenId++;
            _mint(user, _nextTokenId);
            addressToTokenId[user] = _nextTokenId;
        }

        RepData storage rep = reputation[user];
        rep.totalEscrows++;
        rep.totalAmountEarned += amount;
        if (hadDispute) rep.disputeCount++;
        rep.lastUpdated = block.timestamp;
        if (newMerkleRoot != bytes32(0)) {
            rep.merkleRoot = newMerkleRoot;
        }

        emit ReputationUpdated(user, escrowId, rep.totalEscrows, rep.totalAmountEarned);
    }

    // --------------------------------------------------------
    // Verification
    // --------------------------------------------------------

    /// @notice Verify a Merkle proof claim about a user's history.
    ///         leaf = keccak256(abi.encode(escrowId, client, freelancer, amount, timestamp))
    function verifyReputationClaim(
        address user,
        bytes32 leaf,
        bytes32[] calldata proof
    ) external view returns (bool) {
        bytes32 root = reputation[user].merkleRoot;
        if (root == bytes32(0)) return false;
        return MerkleProof.verify(proof, root, leaf);
    }

    // --------------------------------------------------------
    // Soulbound — block all transfers
    // --------------------------------------------------------

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    // --------------------------------------------------------
    // Views
    // --------------------------------------------------------

    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }

    function hasToken(address user) external view returns (bool) {
        return addressToTokenId[user] != 0;
    }
}
