// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice The parts of RoundAuctionV9 the treasury uses.
interface ILedgerV9 {
    function companies(uint256 companyId) external view returns (
        string memory name, uint256 totalShares, uint256 sharesIssued, uint256 currentRound,
        uint256 roundEnd, uint256 roundDuration, bool finalized, uint256 firstMintedAt, uint256 capital
    );
    function reinvestableIncome(uint256 companyId) external view returns (uint256);
    function shareCountAt(uint256 companyId, address holder, uint256 ts) external view returns (uint256);
    function votingWeight(uint256 companyId, address holder, uint256 snapshot) external view returns (uint256);
    function sharesIssuedAt(uint256 companyId, uint256 ts) external view returns (uint256);
    function corporateSharesAt(uint256 companyId, uint256 ts) external view returns (uint256);
    function corporateHolder(uint256 companyId) external pure returns (address);
    function adjustCapital(uint256 companyId, int256 delta) external;
    function addReinvestableIncome(uint256 companyId, uint256 amount) external;
    function takeIncome(uint256 companyId, uint256 amount) external;
    function placeCorporateBid(uint256 fromCompanyId, uint256 toCompanyId, uint256 amount, uint256 maxPrice, address governor) external;
    function host() external view returns (address);
    function dividends() external view returns (address);
}

/// @notice The parts of GovernanceV9 the treasury uses.
interface IGovernanceV9 {
    function companyGovernor(uint256 companyId) external view returns (address);
    function governorOperatingKey(uint256 companyId) external view returns (address);
    function governorTermEnd(uint256 companyId) external view returns (uint256);
    function termNumber(uint256 companyId) external view returns (uint256);
    function pendingRecallOpenedAt(uint256 companyId) external view returns (uint256);
}

/// @title CompanyTreasuryV9
/// @notice What a company does with its money. Built around one principle:
/// NO SINGLE ACTOR CAN MOVE VALUE OUT OF A COMPANY ALONE (SECURITY_REVIEW.md
/// Findings 23-26, 33, 35; revised after the independent v9 audit CT-1..8).
///
///   - No free withdrawal, no fixed-price sales, no INVEST market.
///   - Two buckets per company and token: CAPITAL (0) and INCOME (1). For
///     INVEST they are RoundAuctionV9's `capital` and `reinvestableIncome`.
///     Deposits are capital. Sale proceeds keep the bucket of what was sold.
///     Capital becomes income only by the shareholders' end-of-term vote
///     (CompanyDividendsV9).
///   - Every exit is a proposal by the governor, decided by shareholders:
///       PAYMENT (token, bucket, recipient, amount);
///       SALE (asset, bucket, amount, payment token, reserve) -> sealed-bid
///         auction, deposit 10% of the reserve;
///       INVEST (income -> bid in another company, with a max price per
///         share) — corporate investment is no longer a governor-alone act.
///   - Vote weight = min(shares at the snapshot, shares now); snapshot one
///     day before the proposal. The governor and operating key AT PROPOSAL
///     can't vote, can't be paid, and their shares are out of the quorum
///     base; so are company-held shares (they vote via their governor).
///   - Passing needs YES votes of at least 20% of that base (40% if, with
///     everything already proposed this term, the bucket's outflow passes 5%)
///     and 51% of votes cast. Payments, investments and sales together may
///     not take more than 20% of a bucket per term; sale proceeds can't be
///     paid out again in the same term. The recipient of a payment can't
///     vote on it, directly or through a company they govern.
///   - After a vote passes, 5 days must pass before execution (longer than
///     a recall vote), a recall opened before it falls due holds it back
///     until resolved, and a
///     recall or the end of the term voids anything not yet executed.
///   - A failed payment transfer returns the money to the company.
///   - Custody only for tokens the owner (48-hour timelock) approved;
///     withdrawing approval stops new deposits but never freezes balances.
///   - A sold auction pays a 1% host fee out of the winning bid (the same
///     1% as share auctions); the company receives the other 99%.
///   - The end-of-term dividend/reinvest vote lives in CompanyDividendsV9.
///
/// FICTIONAL SIMULATION. Not a real financial product, security, or claim
/// on any real-world asset.
contract CompanyTreasuryV9 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    string public constant DISCLAIMER = "DEMO WITH TEST CREDITS. Not a real financial product, security, or claim on any real-world asset. Demo listings are fictional.";

    uint8 public constant CAPITAL = 0;
    uint8 public constant INCOME = 1;

    uint256 public constant VOTE_WINDOW = 3 days;
    uint256 public constant SNAPSHOT_LAG = 1 days;
    uint256 public constant EXECUTION_DELAY = 5 days; // > the 3-day recall vote (v9 audit CT-M1)
    uint256 public constant RECALL_WINDOW = 3 days;   // GovernanceV9.RECALL_WINDOW
    uint256 public constant MAJORITY_BPS = 5100;
    uint256 public constant QUORUM_BPS = 2000;        // yes >= 20% of the base
    uint256 public constant LARGE_QUORUM_BPS = 4000;  // 40% when large
    uint256 public constant LARGE_AMOUNT_BPS = 500;   // large = over 5% of the bucket this term (with the 5% cap this tier no longer triggers)
    uint256 public constant TERM_CAP_BPS = 500;       // payments + investments + sales <= 5% of a bucket per term (FairRound)
    uint256 public constant COMMIT_WINDOW = 2 days;
    uint256 public constant REVEAL_WINDOW = 1 days;
    uint256 public constant DEPOSIT_BPS = 1000;       // bid deposit = 10% of reserve
    uint256 public constant HOST_FEE_BPS = 100;       // 1% of a winning auction bid

    mapping(address => uint256) public hostFeeAccrued; // token => amount

    IERC20 public immutable investToken;
    ILedgerV9 public immutable roundAuction;
    IGovernanceV9 public immutable governance;

    mapping(address => bool) public approvedToken;   // may be deposited
    mapping(address => bool) public everApproved;    // may still be paid out or sold
    mapping(uint256 => mapping(address => uint256[2])) internal _bal; // non-INVEST buckets
    // company => term => token => bucket => amount proposed for payment, investment or sale
    mapping(uint256 => mapping(uint256 => mapping(address => uint256[2]))) public outflowThisTerm;

    event TokenApprovalSet(address indexed token, bool approved);
    event TokenDeposited(uint256 indexed companyId, address indexed token, address indexed from, uint256 amount);

    constructor(address _investToken, address _roundAuction, address _governance) Ownable(msg.sender) {
        require(_investToken != address(0) && _roundAuction != address(0) && _governance != address(0), "CT: zero address");
        investToken = IERC20(_investToken);
        roundAuction = ILedgerV9(_roundAuction);
        governance = IGovernanceV9(_governance);
    }

    modifier onlyGovernor(uint256 companyId) {
        require(msg.sender == governance.governorOperatingKey(companyId), "CT: not operating key");
        require(block.timestamp < governance.governorTermEnd(companyId), "CT: term expired");
        _;
    }

    function setApprovedToken(address token, bool approved) external onlyOwner {
        require(token != address(investToken), "CT: INVEST is always allowed");
        approvedToken[token] = approved;
        if (approved) everApproved[token] = true;
        emit TokenApprovalSet(token, approved);
    }

    function _held(address token) internal view returns (bool) {
        return token == address(investToken) || everApproved[token];
    }

    // ---------------------------------------------------------------------
    // Buckets
    // ---------------------------------------------------------------------

    function balanceOf(uint256 companyId, address token, uint8 bucket) public view returns (uint256) {
        require(bucket <= INCOME, "CT: bad bucket");
        if (token == address(investToken)) {
            if (bucket == CAPITAL) {
                (, , , , , , , , uint256 capital) = roundAuction.companies(companyId);
                return capital;
            }
            return roundAuction.reinvestableIncome(companyId);
        }
        return _bal[companyId][token][bucket];
    }

    /// @dev Tokens must already be held here.
    function _credit(uint256 companyId, address token, uint8 bucket, uint256 amount) internal {
        if (amount == 0) return;
        if (token == address(investToken)) {
            investToken.safeTransfer(address(roundAuction), amount);
            if (bucket == CAPITAL) roundAuction.adjustCapital(companyId, int256(amount));
            else roundAuction.addReinvestableIncome(companyId, amount);
        } else {
            _bal[companyId][token][bucket] += amount;
        }
    }

    /// @dev Afterwards the tokens are held here.
    function _debit(uint256 companyId, address token, uint8 bucket, uint256 amount) internal {
        if (token == address(investToken)) {
            if (bucket == CAPITAL) roundAuction.adjustCapital(companyId, -int256(amount));
            else roundAuction.takeIncome(companyId, amount);
        } else {
            require(_bal[companyId][token][bucket] >= amount, "CT: insufficient balance");
            _bal[companyId][token][bucket] -= amount;
        }
    }

    /// @notice Anyone can add an approved token to a company. It is capital.
    function depositToken(uint256 companyId, address token, uint256 amount) external nonReentrant {
        (, uint256 totalShares, , , , , , , ) = roundAuction.companies(companyId);
        require(totalShares > 0, "CT: unknown company");
        require(token == address(investToken) || approvedToken[token], "CT: token not approved");
        require(amount > 0, "CT: amount must be > 0");
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        _credit(companyId, token, CAPITAL, received);
        emit TokenDeposited(companyId, token, msg.sender, received);
    }

    // ---------------------------------------------------------------------
    // Proposals: payments, sales and investments, decided by shareholders
    // ---------------------------------------------------------------------

    enum Kind { Payment, Sale, Invest }
    enum Status { Voting, Rejected, Paid, PaymentFailed, Auction, Settled, Invested }

    struct Proposal {
        uint256 companyId;
        Kind kind;
        Status status;
        uint8 bucket;
        address token;      // what is paid, sold or invested
        uint256 amount;
        address to;         // payment recipient
        address payToken;   // sale: bids are in this token
        uint256 reserve;    // sale: minimum winning bid; invest: max price per share
        uint256 target;     // invest: company to bid in
        uint256 term;
        uint256 snapshot;
        uint256 voteEnd;
        uint256 quorumBps;
        address governor;
        address opKey;
        uint256 yes;
        uint256 no;
        uint256 corpCast;   // weight cast by company-held shares
    }
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    uint256 public nextProposalId;

    event PaymentProposed(uint256 indexed id, uint256 indexed companyId, address token, uint8 bucket, address to, uint256 amount, uint256 voteEnd);
    event SaleProposed(uint256 indexed id, uint256 indexed companyId, address token, uint8 bucket, uint256 amount, address payToken, uint256 reserve, uint256 voteEnd);
    event InvestProposed(uint256 indexed id, uint256 indexed companyId, uint256 indexed targetCompanyId, uint256 amount, uint256 maxPrice, uint256 voteEnd);
    event ProposalVoted(uint256 indexed id, address indexed voter, bool approve, uint256 weight);
    event ProposalRejected(uint256 indexed id);
    event PaymentExecuted(uint256 indexed id, bool transferred);
    event InvestExecuted(uint256 indexed id, bool placed);

    function proposePayment(uint256 companyId, address token, uint8 bucket, address to, uint256 amount)
        external onlyGovernor(companyId) nonReentrant returns (uint256 id)
    {
        require(to != address(0) && to != governance.companyGovernor(companyId) && to != msg.sender, "CT: recipient not allowed");
        require(to != address(this) && to != address(roundAuction) && to != address(governance) && to != roundAuction.dividends(), "CT: recipient not allowed");
        require(to != roundAuction.corporateHolder(companyId), "CT: recipient not allowed");
        id = _propose(companyId, Kind.Payment, token, bucket, amount);
        proposals[id].to = to;
        emit PaymentProposed(id, companyId, token, bucket, to, amount, proposals[id].voteEnd);
    }

    function proposeSale(uint256 companyId, address token, uint8 bucket, uint256 amount, address payToken, uint256 reserve)
        external onlyGovernor(companyId) nonReentrant returns (uint256 id)
    {
        require(_held(payToken) && payToken != token, "CT: bad payment token");
        require((reserve * DEPOSIT_BPS) / 10_000 > 0, "CT: reserve too small");
        id = _propose(companyId, Kind.Sale, token, bucket, amount);
        proposals[id].payToken = payToken;
        proposals[id].reserve = reserve;
        emit SaleProposed(id, companyId, token, bucket, amount, payToken, reserve, proposals[id].voteEnd);
    }

    /// @notice Bid `amount` of this company's INVEST income in another
    /// company's round, paying at most `maxPrice` per share.
    function proposeInvest(uint256 companyId, uint256 targetCompanyId, uint256 amount, uint256 maxPrice)
        external onlyGovernor(companyId) nonReentrant returns (uint256 id)
    {
        require(targetCompanyId != companyId, "CT: can't invest in itself");
        require(maxPrice > 0, "CT: max price required");
        id = _propose(companyId, Kind.Invest, address(investToken), INCOME, amount);
        proposals[id].target = targetCompanyId;
        proposals[id].reserve = maxPrice;
        emit InvestProposed(id, companyId, targetCompanyId, amount, maxPrice, proposals[id].voteEnd);
    }

    function _propose(uint256 companyId, Kind kind, address token, uint8 bucket, uint256 amount) internal returns (uint256 id) {
        require(_held(token), "CT: token not approved");
        require(amount > 0, "CT: amount must be > 0");
        uint256 voteEnd = block.timestamp + VOTE_WINDOW;
        // Room for the vote, the delay and a full recall vote before the term
        // ends, so a last-minute empty recall can't run out the clock
        // (v9 audit round 3).
        require(voteEnd + EXECUTION_DELAY + RECALL_WINDOW < governance.governorTermEnd(companyId), "CT: would outlast the term");
        uint256 term = governance.termNumber(companyId);
        uint256 bal = balanceOf(companyId, token, bucket);
        // Payments, investments and sales together: at most 20% of a bucket
        // per term, and "large" (40% quorum) once the term's total passes 5%
        // (v9 audit CT-3, CT-M2).
        uint256 already = outflowThisTerm[companyId][term][token][bucket];
        uint256 base = bal + already; // the bucket as it was before this term's proposals
        require((already + amount) * 10_000 <= base * TERM_CAP_BPS, "CT: over 5% of the bucket this term");
        bool large = (already + amount) * 10_000 > base * LARGE_AMOUNT_BPS;
        outflowThisTerm[companyId][term][token][bucket] = already + amount;
        _debit(companyId, token, bucket, amount); // reserved until decided
        id = nextProposalId++;
        Proposal storage p = proposals[id];
        p.companyId = companyId;
        p.kind = kind;
        p.bucket = bucket;
        p.token = token;
        p.amount = amount;
        p.term = term;
        p.snapshot = block.timestamp - SNAPSHOT_LAG;
        p.voteEnd = voteEnd;
        p.quorumBps = large ? LARGE_QUORUM_BPS : QUORUM_BPS;
        p.governor = governance.companyGovernor(companyId);
        p.opKey = msg.sender;
    }

    function vote(uint256 id, bool approve) external {
        Proposal storage p = proposals[id];
        require(msg.sender != p.governor && msg.sender != p.opKey, "CT: proposer can't vote");
        require(msg.sender != p.to, "CT: recipient can't vote");
        _castVote(id, p, msg.sender, approve);
    }

    /// @notice A company's governor votes the shares it holds in the
    /// proposing company — unless they are the proposer's own people.
    function voteAsCorporation(uint256 fromCompanyId, uint256 id, bool approve) external {
        Proposal storage p = proposals[id];
        require(msg.sender == governance.governorOperatingKey(fromCompanyId), "CT: not operating key");
        require(block.timestamp < governance.governorTermEnd(fromCompanyId), "CT: term expired");
        require(fromCompanyId != p.companyId, "CT: same company");
        address fromGov = governance.companyGovernor(fromCompanyId);
        require(fromGov != p.governor && fromGov != p.opKey && msg.sender != p.opKey && msg.sender != p.governor, "CT: proposer can't vote");
        require(p.to == address(0) || (fromGov != p.to && msg.sender != p.to), "CT: recipient can't vote");
        p.corpCast += _castVote(id, p, roundAuction.corporateHolder(fromCompanyId), approve);
    }

    function _castVote(uint256 id, Proposal storage p, address voter, bool approve) internal returns (uint256 weight) {
        require(p.status == Status.Voting && p.voteEnd != 0, "CT: not voting");
        require(block.timestamp < p.voteEnd, "CT: voting closed");
        require(!hasVoted[id][voter], "CT: already voted");
        weight = roundAuction.votingWeight(p.companyId, voter, p.snapshot);
        require(weight > 0, "CT: no shares at snapshot");
        hasVoted[id][voter] = true;
        if (approve) p.yes += weight; else p.no += weight;
        emit ProposalVoted(id, voter, approve, weight);
    }

    /// @notice Quorum base: shares issued at the snapshot, minus company-held
    /// shares that did not vote and whatever the governor and operating key
    /// held then.
    function eligibleShares(uint256 id) public view returns (uint256) {
        Proposal storage p = proposals[id];
        uint256 issued = roundAuction.sharesIssuedAt(p.companyId, p.snapshot);
        uint256 excluded = roundAuction.corporateSharesAt(p.companyId, p.snapshot)
            + roundAuction.shareCountAt(p.companyId, p.governor, p.snapshot);
        if (p.opKey != p.governor) excluded += roundAuction.shareCountAt(p.companyId, p.opKey, p.snapshot);
        issued += p.corpCast;
        return issued > excluded ? issued - excluded : 0;
    }

    /// @notice Yes votes reach the quorum on their own (a "no" can never
    /// help a proposal pass), and are 51% of votes cast.
    function passes(uint256 id) public view returns (bool) {
        Proposal storage p = proposals[id];
        uint256 eligible = eligibleShares(id);
        return eligible > 0
            && p.yes * 10_000 >= eligible * p.quorumBps
            && p.yes * 10_000 >= (p.yes + p.no) * MAJORITY_BPS;
    }

    function _termLive(Proposal storage p) internal view returns (bool) {
        return governance.termNumber(p.companyId) == p.term && block.timestamp < governance.governorTermEnd(p.companyId);
    }

    /// @dev After the vote and the execution delay. Rejected (or voided by
    /// the end of the term / a recall): the reserved amount goes back.
    function _decide(uint256 id, Kind kind) internal returns (Proposal storage p, bool ok) {
        p = proposals[id];
        require(p.voteEnd != 0 && p.kind == kind, "CT: unknown proposal");
        require(p.status == Status.Voting, "CT: already decided");
        bool live = _termLive(p);
        require(block.timestamp >= p.voteEnd + EXECUTION_DELAY || !live, "CT: execution delay");
        // A recall opened before this proposal fell due holds it back until
        // resolved; a recall opened later can't be used to stall it again.
        if (live) {
            uint256 openedAt = governance.pendingRecallOpenedAt(p.companyId);
            require(openedAt == 0 || openedAt > p.voteEnd + EXECUTION_DELAY, "CT: recall pending");
        }
        ok = passes(id) && _termLive(p);
        if (!ok) {
            p.status = Status.Rejected;
            _refundProposal(p);
            emit ProposalRejected(id);
        }
    }

    function _refundProposal(Proposal storage p) internal {
        outflowThisTerm[p.companyId][p.term][p.token][p.bucket] -= p.amount;
        _credit(p.companyId, p.token, p.bucket, p.amount);
    }

    /// @notice Permissionless. Pays if approved and the term is still live.
    function executePayment(uint256 id) external nonReentrant {
        (Proposal storage p, bool ok) = _decide(id, Kind.Payment);
        if (!ok) return;
        bool sent = _tryTransfer(p.token, p.to, p.amount);
        if (sent) {
            p.status = Status.Paid;
        } else {
            p.status = Status.PaymentFailed;
            _refundProposal(p); // also frees the term's allowance (v9 audit CT-L1)
        }
        emit PaymentExecuted(id, sent);
    }

    /// @notice The governor's operating key chooses when to place the
    /// approved bid (the target round must be open). If it can't be placed
    /// right now the call reverts and can be retried; once the term is over,
    /// anyone can call it to return the income.
    function executeInvest(uint256 id) external nonReentrant {
        Proposal storage q = proposals[id];
        require(!_termLive(q) || !passes(id) || msg.sender == governance.governorOperatingKey(q.companyId), "CT: not operating key");
        (Proposal storage p, bool ok) = _decide(id, Kind.Invest);
        if (!ok) return;
        roundAuction.placeCorporateBid(p.companyId, p.target, p.amount, p.reserve, p.governor);
        investToken.safeTransfer(address(roundAuction), p.amount);
        p.status = Status.Invested;
        emit InvestExecuted(id, true);
    }

    function _tryTransfer(address token, address to, uint256 amount) internal returns (bool) {
        (bool success, bytes memory ret) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!success) return false;
        if (ret.length == 0) return token.code.length > 0;
        return ret.length == 32 && abi.decode(ret, (bool));
    }

    // ---------------------------------------------------------------------
    // Sales: sealed-bid auction after an approving vote
    // ---------------------------------------------------------------------

    struct Auction {
        uint256 commitEnd;
        uint256 revealEnd;
        uint256 deposit;
        uint256 committed;
        uint256 revealed;
        address leader;
        uint256 leadingAmount;
    }
    struct SealedBid {
        bytes32 commitHash;
        uint256 revealedAmount;
        bool revealed;
        bool claimed;
    }
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => mapping(address => SealedBid)) public sealedBids;

    event AuctionOpened(uint256 indexed id, uint256 commitEnd, uint256 revealEnd, uint256 deposit);
    event BidCommitted(uint256 indexed id, address indexed bidder);
    event BidRevealed(uint256 indexed id, address indexed bidder, uint256 amount);
    event AuctionSettled(uint256 indexed id, address winner, uint256 winningAmount);
    event AuctionClaimed(uint256 indexed id, address indexed bidder, uint256 returned, bool won);
    event HostFeesWithdrawn(address indexed host, address indexed token, uint256 amount);

    /// @notice The host (same address as RoundAuctionV9's host) collects the
    /// 1% fee on sold treasury auctions, per payment token.
    function withdrawHostFees(address token) external nonReentrant {
        address h = roundAuction.host();
        require(msg.sender == h, "CT: not host");
        uint256 amount = hostFeeAccrued[token];
        require(amount > 0, "CT: nothing to withdraw");
        hostFeeAccrued[token] = 0;
        IERC20(token).safeTransfer(h, amount);
        emit HostFeesWithdrawn(h, token, amount);
    }

    function commitHashFor(uint256 id, uint256 amount, bytes32 salt, address bidder) public pure returns (bytes32) {
        return keccak256(abi.encode(id, amount, salt, bidder));
    }

    /// @notice Permissionless after the vote and delay: opens the auction if
    /// the sale was approved, otherwise returns the asset.
    function startAuction(uint256 id) external nonReentrant {
        (Proposal storage p, bool ok) = _decide(id, Kind.Sale);
        if (!ok) return;
        p.status = Status.Auction;
        Auction storage a = auctions[id];
        a.commitEnd = block.timestamp + COMMIT_WINDOW;
        a.revealEnd = a.commitEnd + REVEAL_WINDOW;
        a.deposit = (p.reserve * DEPOSIT_BPS) / 10_000;
        emit AuctionOpened(id, a.commitEnd, a.revealEnd, a.deposit);
    }

    function commitBid(uint256 id, bytes32 commitHash) external nonReentrant {
        Auction storage a = auctions[id];
        require(proposals[id].status == Status.Auction && block.timestamp < a.commitEnd, "CT: commit window closed");
        require(commitHash != bytes32(0), "CT: empty commit");
        SealedBid storage b = sealedBids[id][msg.sender];
        require(b.commitHash == bytes32(0), "CT: already committed");
        _pull(proposals[id].payToken, a.deposit);
        b.commitHash = commitHash;
        a.committed++;
        emit BidCommitted(id, msg.sender);
    }

    /// @notice Bids below the reserve can't be revealed: their deposit is
    /// forfeited like an unrevealed one.
    function revealBid(uint256 id, uint256 amount, bytes32 salt) external nonReentrant {
        Auction storage a = auctions[id];
        Proposal storage p = proposals[id];
        require(p.status == Status.Auction && block.timestamp >= a.commitEnd && block.timestamp < a.revealEnd, "CT: not reveal window");
        SealedBid storage b = sealedBids[id][msg.sender];
        require(b.commitHash != bytes32(0), "CT: no commit found");
        require(!b.revealed, "CT: already revealed");
        require(amount >= p.reserve, "CT: below reserve");
        require(commitHashFor(id, amount, salt, msg.sender) == b.commitHash, "CT: hash mismatch");
        _pull(p.payToken, amount);
        b.revealed = true;
        b.revealedAmount = amount;
        a.revealed++;
        if (amount > a.leadingAmount) {
            a.leader = msg.sender;
            a.leadingAmount = amount;
        }
        emit BidRevealed(id, msg.sender, amount);
    }

    /// @dev Exact-amount pull: fee-on-transfer tokens are rejected.
    function _pull(address token, uint256 amount) internal {
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        require(IERC20(token).balanceOf(address(this)) - before == amount, "CT: token took a fee");
    }

    /// @notice Permissionless after the reveal window. The winning bid goes
    /// to the bucket the asset came from; unrevealed deposits go to capital;
    /// with no valid bid the asset returns.
    function settleAuction(uint256 id) external nonReentrant {
        Proposal storage p = proposals[id];
        Auction storage a = auctions[id];
        require(p.status == Status.Auction, "CT: no auction");
        require(block.timestamp >= a.revealEnd, "CT: reveal window still open");
        p.status = Status.Settled;
        _credit(p.companyId, p.payToken, CAPITAL, (a.committed - a.revealed) * a.deposit);
        if (a.leader != address(0)) {
            uint256 fee = (a.leadingAmount * HOST_FEE_BPS) / 10_000;
            hostFeeAccrued[p.payToken] += fee;
            _credit(p.companyId, p.payToken, p.bucket, a.leadingAmount - fee);
            // Proceeds can't be paid straight out again in the same term
            // through the other token's fresh allowance (v9 audit CT-M2).
            outflowThisTerm[p.companyId][p.term][p.payToken][p.bucket] += a.leadingAmount - fee;
        } else {
            _refundProposal(p);
        }
        emit AuctionSettled(id, a.leader, a.leadingAmount);
    }

    /// @notice After settlement: the winner gets the asset and their deposit
    /// back; every other revealed bidder gets deposit + bid back.
    function claimAuction(uint256 id) external nonReentrant {
        Proposal storage p = proposals[id];
        Auction storage a = auctions[id];
        require(p.status == Status.Settled, "CT: not settled");
        SealedBid storage b = sealedBids[id][msg.sender];
        require(b.revealed, "CT: nothing to claim");
        require(!b.claimed, "CT: already claimed");
        b.claimed = true;
        bool won = msg.sender == a.leader;
        uint256 back = won ? a.deposit : a.deposit + b.revealedAmount;
        IERC20(p.payToken).safeTransfer(msg.sender, back);
        if (won) IERC20(p.token).safeTransfer(msg.sender, p.amount);
        emit AuctionClaimed(id, msg.sender, back, won);
    }
}
