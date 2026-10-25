// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title VotedUnrig (vUNRIG)
/// @notice A freely transferable token backed 1:1 by UNRIG, that can only be
/// created for UNRIG that left a project treasury through a decision its
/// holders voted for: an executed treasury payment, or a settled treasury
/// sale. UNRIG claimed from the faucet, refunded from a bid or received any
/// other way can never be wrapped, so free claims stay inside FairRound.
///
/// UNRIG itself stays closed-loop: a wallet may only send it into FairRound
/// contracts. This contract must be made an authorized sink of InvestToken
/// (one timelocked owner call) so that a payment recipient can hand their
/// UNRIG in, and so that unwrapping can pay UNRIG back out.
///
/// The "stamp" is the treasury proposal id: each executed payment or settled
/// sale can be wrapped once, up to its amount, only by the wallet it paid.
///
/// No owner, no admin, no upgrade. Every rule is fixed at deployment.
contract VotedUnrig is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    string public constant DISCLAIMER =
        "DEMO TOKEN. Backed 1:1 by UNRIG test credits released by a treasury vote. Not a security, not an investment, no promise of value.";

    // CompanyTreasuryV9 enums, as they are ABI-encoded (uint8).
    uint8 internal constant KIND_PAYMENT = 0;
    uint8 internal constant KIND_SALE = 1;
    uint8 internal constant STATUS_PAID = 2;
    uint8 internal constant STATUS_SETTLED = 5;

    IERC20 public immutable unrig;
    ITreasuryV9View public immutable treasury;
    IRoundAuctionV9View public immutable roundAuction;
    /// @notice Only treasuries of listings with at least this many units can
    /// release wrappable UNRIG. Small listings can be bought outright by one
    /// person, who could then vote payments to their own other wallets.
    uint256 public immutable minListingUnits;

    /// @notice proposal id => UNRIG already wrapped from it.
    mapping(uint256 => uint256) public wrappedFrom;

    event Wrapped(uint256 indexed proposalId, uint256 indexed companyId, address indexed account, uint256 amount);
    event Unwrapped(address indexed account, uint256 amount);

    /// Mirrors CompanyTreasuryV9.Proposal, field for field (enums as uint8),
    /// so the public getter's return data decodes straight into it.
    struct ProposalView {
        uint256 companyId;
        uint8 kind;
        uint8 status;
        uint8 bucket;
        address token;
        uint256 amount;
        address to;
        address payToken;
        uint256 reserve;
        uint256 target;
        uint256 term;
        uint256 snapshot;
        uint256 voteEnd;
        uint256 quorumBps;
        address governor;
        address opKey;
        uint256 yes;
        uint256 no;
        uint256 corpCast;
    }

    constructor(address _unrig, address _treasury, address _roundAuction, uint256 _minListingUnits)
        ERC20("Voted UNRIG", "vUNRIG")
    {
        require(_unrig != address(0) && _treasury != address(0) && _roundAuction != address(0), "vUNRIG: zero address");
        require(_minListingUnits > 0, "vUNRIG: min listing size");
        require(ITreasuryV9View(_treasury).investToken() == _unrig, "vUNRIG: treasury uses another token");
        require(ITreasuryV9View(_treasury).roundAuction() == _roundAuction, "vUNRIG: treasury uses another auction");
        unrig = IERC20(_unrig);
        treasury = ITreasuryV9View(_treasury);
        roundAuction = IRoundAuctionV9View(_roundAuction);
        minListingUnits = _minListingUnits;
    }

    /// @notice Wrap UNRIG you received from an executed treasury payment.
    /// Approve this contract for `amount` UNRIG first.
    function wrapPayment(uint256 proposalId, uint256 amount) external nonReentrant {
        ProposalView memory p = _proposal(proposalId);
        require(p.kind == KIND_PAYMENT, "vUNRIG: not a payment");
        require(p.status == STATUS_PAID, "vUNRIG: payment not executed");
        require(p.to == msg.sender, "vUNRIG: not the recipient");
        _wrap(proposalId, p, amount);
    }

    /// @notice Wrap UNRIG you won in a treasury sale, after claiming it.
    /// Approve this contract for `amount` UNRIG first.
    function wrapSale(uint256 proposalId, uint256 amount) external nonReentrant {
        ProposalView memory p = _proposal(proposalId);
        require(p.kind == KIND_SALE, "vUNRIG: not a sale");
        require(p.status == STATUS_SETTLED, "vUNRIG: sale not settled");
        (,,,,, address leader,) = treasury.auctions(proposalId);
        require(leader == msg.sender, "vUNRIG: not the winner");
        (,,, bool claimed) = treasury.sealedBids(proposalId, msg.sender);
        require(claimed, "vUNRIG: claim the sale first");
        _wrap(proposalId, p, amount);
    }

    /// @notice Turn vUNRIG back into UNRIG (closed-loop again: it can then
    /// be spent inside FairRound, e.g. on bids). Anyone holding vUNRIG may
    /// unwrap; unwrapped UNRIG can't be wrapped a second time.
    function unwrap(uint256 amount) external nonReentrant {
        require(amount > 0, "vUNRIG: amount must be > 0");
        _burn(msg.sender, amount);
        unrig.safeTransfer(msg.sender, amount);
        emit Unwrapped(msg.sender, amount);
    }

    /// @notice How much of a proposal's UNRIG can still be wrapped, and by
    /// whom (zero address if nothing can be wrapped from it).
    function wrappable(uint256 proposalId) external view returns (address account, uint256 amount) {
        ProposalView memory p = _proposal(proposalId);
        if (p.token != address(unrig) || !_eligible(p.companyId)) return (address(0), 0);
        if (p.kind == KIND_PAYMENT && p.status == STATUS_PAID) account = p.to;
        else if (p.kind == KIND_SALE && p.status == STATUS_SETTLED) (,,,,, account,) = treasury.auctions(proposalId);
        if (account == address(0)) return (address(0), 0);
        amount = p.amount - wrappedFrom[proposalId];
    }

    function _wrap(uint256 proposalId, ProposalView memory p, uint256 amount) internal {
        require(amount > 0, "vUNRIG: amount must be > 0");
        require(p.token == address(unrig), "vUNRIG: not UNRIG");
        require(_eligible(p.companyId), "vUNRIG: listing too small");
        uint256 done = wrappedFrom[proposalId] + amount;
        require(done <= p.amount, "vUNRIG: more than the treasury released");
        wrappedFrom[proposalId] = done;
        // Effects before the pull; UNRIG has no transfer hooks, and the
        // guard covers the rest.
        unrig.safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);
        emit Wrapped(proposalId, p.companyId, msg.sender, amount);
    }

    function _eligible(uint256 companyId) internal view returns (bool) {
        (, uint256 totalShares,,,,,,,) = roundAuction.companies(companyId);
        return totalShares >= minListingUnits;
    }

    function _proposal(uint256 id) internal view returns (ProposalView memory p) {
        (bool ok, bytes memory data) = address(treasury).staticcall(abi.encodeWithSelector(ITreasuryV9View.proposals.selector, id));
        require(ok && data.length >= 19 * 32, "vUNRIG: unknown proposal");
        p = abi.decode(data, (ProposalView));
    }
}

interface ITreasuryV9View {
    function investToken() external view returns (address);
    function roundAuction() external view returns (address);
    function proposals(uint256 id) external view; // decoded by hand (19 fields)
    function auctions(uint256 id) external view returns (uint256 commitEnd, uint256 revealEnd, uint256 deposit, uint256 committed, uint256 revealed, address leader, uint256 leadingAmount);
    function sealedBids(uint256 id, address bidder) external view returns (bytes32 commitHash, uint256 revealedAmount, bool revealed, bool claimed);
}

interface IRoundAuctionV9View {
    function companies(uint256 id) external view returns (
        string memory name, uint256 totalShares, uint256 sharesIssued, uint256 currentRound, uint256 roundEnd,
        uint256 roundDuration, bool finalized, uint256 firstMintedAt, uint256 capital
    );
}
