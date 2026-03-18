// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "../interfaces/IEscrowHook.sol";

// ============================================================
// EscrowReceiptNFT — On-chain NFT Receipt (Feature 4 Hook)
//
// Mints a non-transferable ERC721 to the freelancer each time
// a milestone is released. The tokenURI contains fully on-chain
// JSON metadata encoding: escrow ID, milestone, amount, timestamp.
//
// Registered in HookRegistry — automatically minted on every
// reactive fund release without any user action.
// ============================================================

contract EscrowReceiptNFT is ERC721, IEscrowHook {

    using Strings for uint256;

    // --------------------------------------------------------
    // State
    // --------------------------------------------------------

    address public owner;
    address public hookRegistry;
    uint256 private _nextTokenId;

    struct ReceiptData {
        uint256 escrowId;
        uint256 milestoneIndex;
        address client;
        address freelancer;
        uint256 amount;
        uint256 timestamp;
    }

    mapping(uint256 => ReceiptData) public receipts;

    // --------------------------------------------------------
    // Events
    // --------------------------------------------------------

    event ReceiptMinted(
        uint256 indexed tokenId,
        uint256 indexed escrowId,
        address indexed freelancer,
        uint256 amount
    );

    // --------------------------------------------------------
    // Errors
    // --------------------------------------------------------

    error NotOwner();
    error NotHookRegistry();
    error Soulbound();

    // --------------------------------------------------------
    // Constructor
    // --------------------------------------------------------

    constructor(address _hookRegistry) ERC721("ReactEscrow Receipt", "RER") {
        owner        = msg.sender;
        hookRegistry = _hookRegistry;
    }

    // --------------------------------------------------------
    // Admin
    // --------------------------------------------------------

    function setHookRegistry(address _hookRegistry) external {
        if (msg.sender != owner) revert NotOwner();
        hookRegistry = _hookRegistry;
    }

    // --------------------------------------------------------
    // IEscrowHook implementation
    // --------------------------------------------------------

    /// @notice Called by HookRegistry on each milestone release
    function onMilestoneReleased(
        uint256 escrowId,
        uint256 milestoneIndex,
        address client,
        address freelancer,
        uint256 amount
    ) external override {
        if (msg.sender != hookRegistry) revert NotHookRegistry();

        _nextTokenId++;
        uint256 tokenId = _nextTokenId;

        receipts[tokenId] = ReceiptData({
            escrowId:       escrowId,
            milestoneIndex: milestoneIndex,
            client:         client,
            freelancer:     freelancer,
            amount:         amount,
            timestamp:      block.timestamp
        });

        _mint(freelancer, tokenId);
        emit ReceiptMinted(tokenId, escrowId, freelancer, amount);
    }

    /// @dev Not used — only onMilestoneReleased is called by HookRegistry
    function executePostReleaseHooks(
        uint256, uint256, address, address, uint256
    ) external pure override {
        revert("Use HookRegistry");
    }

    // --------------------------------------------------------
    // Soulbound — block all transfers
    // --------------------------------------------------------

    /// @dev OZ v5 uses _update for all transfers. Revert if not a mint (from != address(0)).
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
    // On-chain tokenURI
    // --------------------------------------------------------

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        ReceiptData memory r = receipts[tokenId];

        string memory json = string(abi.encodePacked(
            '{"name":"ReactEscrow Receipt #', tokenId.toString(), '",'
            '"description":"On-chain receipt for a milestone release on ReactEscrow (Somnia Testnet)",'
            '"attributes":['
                '{"trait_type":"Escrow ID","value":"', r.escrowId.toString(), '"},'
                '{"trait_type":"Milestone","value":"', r.milestoneIndex.toString(), '"},'
                '{"trait_type":"Amount (wei)","value":"', r.amount.toString(), '"},'
                '{"trait_type":"Timestamp","value":"', r.timestamp.toString(), '"}'
            ']}'
        ));

        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(bytes(json))
        ));
    }

    // --------------------------------------------------------
    // Views
    // --------------------------------------------------------

    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }
}
