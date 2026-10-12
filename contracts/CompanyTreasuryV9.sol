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
    function sharesIssuedAt(uint256 companyId, uint256 ts) external view returns (uint256);
    function corporateHolder(uint256 companyId) external pure returns (address);
    function adjustCapital(uint256 companyId, int256 delta) external;
    function addReinvestableIncome(uint256 companyId, uint256 amount) external;
    function takeIncome(uint256 companyId, uint256 amount) external;
}

/// @notice The parts of GovernanceV9 the treasury uses.
interface IGovernanceV9 {
    function companyGovernor(uint256 companyId) external view returns (address);
    function governorOperatingKey(uint256 companyId) external view returns (address);
    function governorTermEnd(uint256 companyId) external view returns (uint256);
    function termNumber(uint256 companyId) external view returns (uint256);
    function termEndedAt(uint256 companyId, uint256 term) external view returns (uint256);
}

/// @title CompanyTreasuryV9
/// @notice What a company does with its money. Rebuilt from v8 around one
/// principle: NO SINGLE ACTOR CAN MOVE VALUE OUT OF A COMPANY ALONE
/// (SECURITY_REVIEW.md Findings 23-26, 33, 35 and the lower-severity notes).
///
///   - No free withdrawal, no fixed-price sales, no INVEST market. (v8's
///     market stays available in the v8 treasury.)
///   - Two buckets per company and token: CAPITAL (0) and INCOME (1). For
///     INVEST the buckets are RoundAuctionV9's `capital` and
///     `reinvestableIncome`; for other tokens they are kept here. Deposits
///     are capital. Sale proceeds keep the bucket of what was sold, so
///     capital can never be turned into reinvestable income (Finding 33).
///   - PAYMENT: the governor proposes (token, bucket, recipient, amount);
///     shareholders vote. SALE: the governor proposes (asset, bucket,
///     amount, payment token, reserve); shareholders vote; then a sealed-bid
///     auction runs with a deposit of 10% of the reserve (Findings 25, 35).
///   - Votes are weighted by shares held ONE DAY BEFORE the proposal
///     (Finding 34). The governor and their operating key can't vote on
///     their own proposals, their shares don't count towards quorum, and
///     they can't be paid (Finding 26). Quorum: 20% of the other shares,
///     40% if the amount is over 5% of that bucket. Pass: 51% of votes cast.
///   - A proposal must finish voting inside the proposer's term, and is
///     void if that term has ended (or was recalled) before it executes.
///   - A failed payment transfer returns the money to the company.
///   - Company-held shares vote through their own company's governor.
///   - Custody only for tokens the owner (a 48-hour timelock) has approved.
///   - End-of-term policy vote, with a record date: "dividend" pays 1% of
///     INVEST capital to shareholders pro rata; "reinvest" moves 1% of
///     INVEST capital to reinvestable income (the only way income starts).
///
/// FICTIONAL SIMULATION. Not a real financial product, security, or claim
/// on any real-world asset.
contract CompanyTreasuryV9 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    string public constant DISCLAIMER = "FICTIONAL SIMULATION. Not a real financial product, security, or claim on any real-world asset. Any resemblance to real entities is a gamified rule-set only.";

    uint8 public constant CAPITAL = 0;
    uint8 public constant INCOME = 1;

    uint256 public constant VOTE_WINDOW = 3 days;
    uint256 public constant SNAPSHOT_LAG = 1 days;
    uint256 public constant MAJORITY_BPS = 5100;
    uint256 public constant QUORUM_BPS = 2000;        // 20% of eligible shares
    uint256 public constant LARGE_QUORUM_BPS = 4000;  // 40% when large
    uint256 public constant LARGE_AMOUNT_BPS = 500;   // large = over 5% of the bucket
    uint256 public constant COMMIT_WINDOW = 2 days;
    uint256 public constant REVEAL_WINDOW = 1 days;
    uint256 public constant DEPOSIT_BPS = 1000;       // bid deposit = 10% of reserve

    IERC20 public immutable investToken;
    ILedgerV9 public immutable roundAuction;
    IGovernanceV9 public immutable governance;

    mapping(address => bool) public approvedToken;
    mapping(uint256 => mapping(address => uint256[2])) internal _bal; // non-INVEST buckets

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

    /// @notice Owner (the timelock) approves tokens for custody and payment.
    function setApprovedToken(address token, bool approved) external onlyOwner {
        require(token != address(investToken), "CT: INVEST is always allowed");
        approvedToken[token] = approved;
        emit TokenApprovalSet(token, approved);
    }

    function _allowed(address token) internal view returns (bool) {
        return token == address(investToken) || approvedToken[token];
    }

    function _known(uint256 companyId) internal view {
        (, uint256 totalShares, , , , , , , ) = roundAuction.companies(companyId);
        require(totalShares > 0, "CT: unknown company");
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
        _known(companyId);
        require(_allowed(token), "CT: token not approved");
        require(amount > 0, "CT: amount must be > 0");
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        _credit(companyId, token, CAPITAL, received);
        emit TokenDeposited(companyId, token, msg.sender, received);
    }

    // ---------------------------------------------------------------------
    // Proposals: payments and sales, decided by shareholder vote
    // ---------------------------------------------------------------------

    enum Kind { Payment, Sale }
    enum Status { Voting, Rejected, Paid, PaymentFailed, Auction, Settled }

    struct Proposal {
        uint256 companyId;
        Kind kind;
        Status status;
        uint8 bucket;
        address token;      // what is paid or sold
        uint256 amount;
        address to;         // payment recipient
        address payToken;   // sale: bids are in this token
        uint256 reserve;    // sale: minimum winning bid
        uint256 term;
        uint256 snapshot;
        uint256 voteEnd;
        uint256 quorumBps;
        address governor;
        address opKey;
        uint256 yes;
        uint256 no;
    }
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    uint256 public nextProposalId;

    event PaymentProposed(uint256 indexed id, uint256 indexed companyId, address token, uint8 bucket, address to, uint256 amount, uint256 voteEnd);
    event SaleProposed(uint256 indexed id, uint256 indexed companyId, address token, uint8 bucket, uint256 amount, address payToken, uint256 reserve, uint256 voteEnd);
    event ProposalVoted(uint256 indexed id, address indexed voter, bool approve, uint256 weight);
    event ProposalRejected(uint256 indexed id);
    event PaymentExecuted(uint256 indexed id, bool transferred);

    function proposePayment(uint256 companyId, address token, uint8 bucket, address to, uint256 amount)
        external onlyGovernor(companyId) nonReentrant returns (uint256 id)
    {
        address gov = governance.companyGovernor(companyId);
        require(to != address(0) && to != gov && to != msg.sender, "CT: recipient not allowed");
        require(to != address(this) && to != address(roundAuction) && to != address(governance), "CT: recipient not allowed");
        require(to != roundAuction.corporateHolder(companyId), "CT: recipient not allowed");
        id = _propose(companyId, Kind.Payment, token, bucket, amount);
        proposals[id].to = to;
        emit PaymentProposed(id, companyId, token, bucket, to, amount, proposals[id].voteEnd);
    }

    function proposeSale(uint256 companyId, address token, uint8 bucket, uint256 amount, address payToken, uint256 reserve)
        external onlyGovernor(companyId) nonReentrant returns (uint256 id)
    {
        require(_allowed(payToken) && payToken != token, "CT: bad payment token");
        require((reserve * DEPOSIT_BPS) / 10_000 > 0, "CT: reserve too small");
        id = _propose(companyId, Kind.Sale, token, bucket, amount);
        proposals[id].payToken = payToken;
        proposals[id].reserve = reserve;
        emit SaleProposed(id, companyId, token, bucket, amount, payToken, reserve, proposals[id].voteEnd);
    }

    function _propose(uint256 companyId, Kind kind, address token, uint8 bucket, uint256 amount) internal returns (uint256 id) {
        require(_allowed(token), "CT: token not approved");
        require(amount > 0, "CT: amount must be > 0");
        uint256 voteEnd = block.timestamp + VOTE_WINDOW;
        require(voteEnd < governance.governorTermEnd(companyId), "CT: vote would outlast the term");
        uint256 bal = balanceOf(companyId, token, bucket);
        bool large = amount * 10_000 > bal * LARGE_AMOUNT_BPS;
        _debit(companyId, token, bucket, amount); // reserved until decided
        id = nextProposalId++;
        Proposal storage p = proposals[id];
        p.companyId = companyId;
        p.kind = kind;
        p.bucket = bucket;
        p.token = token;
        p.amount = amount;
        p.term = governance.termNumber(companyId);
        p.snapshot = block.timestamp - SNAPSHOT_LAG;
        p.voteEnd = voteEnd;
        p.quorumBps = large ? LARGE_QUORUM_BPS : QUORUM_BPS;
        p.governor = governance.companyGovernor(companyId);
        p.opKey = msg.sender;
    }

    function vote(uint256 id, bool approve) external {
        Proposal storage p = proposals[id];
        require(msg.sender != p.governor && msg.sender != p.opKey, "CT: proposer can't vote");
        require(msg.sender != governance.governorOperatingKey(p.companyId), "CT: proposer can't vote");
        _castVote(id, p, msg.sender, approve);
    }

    /// @notice A company's governor votes the shares it holds in the
    /// proposing company — unless they are the same governor.
    function voteAsCorporation(uint256 fromCompanyId, uint256 id, bool approve) external {
        Proposal storage p = proposals[id];
        require(msg.sender == governance.governorOperatingKey(fromCompanyId), "CT: not operating key");
        require(block.timestamp < governance.governorTermEnd(fromCompanyId), "CT: term expired");
        require(fromCompanyId != p.companyId, "CT: same company");
        address fromGov = governance.companyGovernor(fromCompanyId);
        require(fromGov != p.governor && msg.sender != p.opKey && msg.sender != p.governor, "CT: proposer can't vote");
        _castVote(id, p, roundAuction.corporateHolder(fromCompanyId), approve);
    }

    function _castVote(uint256 id, Proposal storage p, address voter, bool approve) internal {
        require(p.status == Status.Voting && p.voteEnd != 0, "CT: not voting");
        require(block.timestamp < p.voteEnd, "CT: voting closed");
        require(!hasVoted[id][voter], "CT: already voted");
        uint256 weight = roundAuction.shareCountAt(p.companyId, voter, p.snapshot);
        require(weight > 0, "CT: no shares at snapshot");
        hasVoted[id][voter] = true;
        if (approve) p.yes += weight; else p.no += weight;
        emit ProposalVoted(id, voter, approve, weight);
    }

    /// @notice Shares that can count towards quorum: issued at the snapshot,
    /// minus whatever the governor and their operating key held then.
    function eligibleShares(uint256 id) public view returns (uint256) {
        Proposal storage p = proposals[id];
        uint256 issued = roundAuction.sharesIssuedAt(p.companyId, p.snapshot);
        uint256 insider = roundAuction.shareCountAt(p.companyId, p.governor, p.snapshot);
        if (p.opKey != p.governor) insider += roundAuction.shareCountAt(p.companyId, p.opKey, p.snapshot);
        return issued > insider ? issued - insider : 0;
    }

    function passes(uint256 id) public view returns (bool) {
        Proposal storage p = proposals[id];
        uint256 cast = p.yes + p.no;
        uint256 eligible = eligibleShares(id);
        return eligible > 0
            && cast * 10_000 >= eligible * p.quorumBps
            && p.yes * 10_000 >= cast * MAJORITY_BPS;
    }

    /// @dev Approved, and the proposer's term is still the live one.
    function _approvedInTerm(uint256 id) internal view returns (bool) {
        Proposal storage p = proposals[id];
        return passes(id) && governance.termNumber(p.companyId) == p.term
            && block.timestamp < governance.governorTermEnd(p.companyId);
    }

    function _decide(uint256 id) internal returns (Proposal storage p, bool ok) {
        p = proposals[id];
        require(p.voteEnd != 0, "CT: unknown proposal");
        require(p.status == Status.Voting, "CT: already decided");
        require(block.timestamp >= p.voteEnd, "CT: voting still open");
        ok = _approvedInTerm(id);
        if (!ok) {
            p.status = Status.Rejected;
            _credit(p.companyId, p.token, p.bucket, p.amount);
            emit ProposalRejected(id);
        }
    }

    /// @notice Permissionless after the vote. Pays if approved and the
    /// proposer's term is still running; otherwise the money goes back.
    function executePayment(uint256 id) external nonReentrant {
        require(proposals[id].kind == Kind.Payment, "CT: not a payment");
        (Proposal storage p, bool ok) = _decide(id);
        if (!ok) return;
        bool sent = _tryTransfer(p.token, p.to, p.amount);
        if (sent) {
            p.status = Status.Paid;
        } else {
            p.status = Status.PaymentFailed;
            _credit(p.companyId, p.token, p.bucket, p.amount);
        }
        emit PaymentExecuted(id, sent);
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

    function commitHashFor(uint256 id, uint256 amount, bytes32 salt, address bidder) public pure returns (bytes32) {
        return keccak256(abi.encode(id, amount, salt, bidder));
    }

    /// @notice Permissionless after the vote: opens the auction if the sale
    /// was approved, otherwise returns the asset.
    function startAuction(uint256 id) external nonReentrant {
        require(proposals[id].kind == Kind.Sale, "CT: not a sale");
        (Proposal storage p, bool ok) = _decide(id);
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
            _credit(p.companyId, p.payToken, p.bucket, a.leadingAmount);
        } else {
            _credit(p.companyId, p.token, p.bucket, p.amount);
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

    // ---------------------------------------------------------------------
    // End-of-term dividend vote (record date = the moment the term ended)
    // ---------------------------------------------------------------------

    uint256 public constant POLICY_VOTE_WINDOW = 3 days;
    uint256 public constant TERM_END_DIVIDEND_BPS = 100; // 1% of INVEST capital
    mapping(uint256 => mapping(uint256 => uint256)) public policyVoteEnd;
    mapping(uint256 => mapping(uint256 => uint256)) public policyRecordDate;
    mapping(uint256 => mapping(uint256 => bool)) public policyResolved;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public policyHasVoted;
    mapping(uint256 => mapping(uint256 => uint256)) public policyDividendWeight;
    mapping(uint256 => mapping(uint256 => uint256)) public policyReinvestWeight;
    mapping(uint256 => mapping(uint256 => uint256)) public dividendPerShare; // scaled by 1e18
    mapping(uint256 => mapping(uint256 => uint256)) public dividendRemaining;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public claimedDividend;

    event PolicyVoteOpened(uint256 indexed companyId, uint256 indexed term, uint256 voteEnd, uint256 recordDate);
    event PolicyVoted(uint256 indexed companyId, uint256 indexed term, address indexed voter, bool wantsDividend, uint256 weight);
    event PolicyResolved(uint256 indexed companyId, uint256 indexed term, bool distributedDividend, uint256 amount);
    event DividendClaimed(uint256 indexed companyId, uint256 indexed term, address indexed holder, uint256 amount);

    function termEndTime(uint256 companyId, uint256 term) public view returns (uint256) {
        uint256 current = governance.termNumber(companyId);
        if (term == 0 || term > current) return 0;
        uint256 endedAt = governance.termEndedAt(companyId, term);
        if (endedAt == 0 && term == current) {
            uint256 liveEnd = governance.governorTermEnd(companyId);
            if (liveEnd != 0 && block.timestamp >= liveEnd) endedAt = liveEnd;
        }
        return endedAt;
    }

    function openPolicyVote(uint256 companyId, uint256 term) external {
        uint256 endedAt = termEndTime(companyId, term);
        require(endedAt != 0, "CT: term not concluded");
        require(policyVoteEnd[companyId][term] == 0, "CT: already opened");
        require(roundAuction.sharesIssuedAt(companyId, endedAt) > 0, "CT: no shares issued");
        policyRecordDate[companyId][term] = endedAt;
        policyVoteEnd[companyId][term] = block.timestamp + POLICY_VOTE_WINDOW;
        emit PolicyVoteOpened(companyId, term, policyVoteEnd[companyId][term], endedAt);
    }

    function votePolicy(uint256 companyId, uint256 term, bool wantsDividend) external {
        _votePolicy(companyId, term, msg.sender, wantsDividend);
    }

    function votePolicyAsCorporation(uint256 fromCompanyId, uint256 companyId, uint256 term, bool wantsDividend) external {
        require(msg.sender == governance.governorOperatingKey(fromCompanyId), "CT: not operating key");
        require(block.timestamp < governance.governorTermEnd(fromCompanyId), "CT: term expired");
        _votePolicy(companyId, term, roundAuction.corporateHolder(fromCompanyId), wantsDividend);
    }

    function _votePolicy(uint256 companyId, uint256 term, address voter, bool wantsDividend) internal {
        uint256 voteEnd = policyVoteEnd[companyId][term];
        require(voteEnd != 0 && block.timestamp < voteEnd, "CT: voting not open");
        require(!policyHasVoted[companyId][term][voter], "CT: already voted");
        uint256 weight = roundAuction.shareCountAt(companyId, voter, policyRecordDate[companyId][term]);
        require(weight > 0, "CT: no shares at record date");
        policyHasVoted[companyId][term][voter] = true;
        if (wantsDividend) policyDividendWeight[companyId][term] += weight;
        else policyReinvestWeight[companyId][term] += weight;
        emit PolicyVoted(companyId, term, voter, wantsDividend, weight);
    }

    function resolvePolicyVote(uint256 companyId, uint256 term) external nonReentrant {
        uint256 voteEnd = policyVoteEnd[companyId][term];
        require(voteEnd != 0, "CT: not opened");
        require(block.timestamp >= voteEnd, "CT: voting still open");
        require(!policyResolved[companyId][term], "CT: already resolved");
        policyResolved[companyId][term] = true;
        uint256 forDividend = policyDividendWeight[companyId][term];
        uint256 forReinvest = policyReinvestWeight[companyId][term];
        (, , , , , , , , uint256 capital) = roundAuction.companies(companyId);
        if (forReinvest > forDividend) {
            // Shareholders chose to reinvest: 1% of INVEST capital becomes
            // reinvestable income, which the governor can bid in other
            // companies. Decided by shareholders, never by the governor alone.
            uint256 move = (capital * TERM_END_DIVIDEND_BPS) / 10_000;
            if (move > 0) {
                roundAuction.adjustCapital(companyId, -int256(move)); // tokens arrive here
                _credit(companyId, address(investToken), INCOME, move);
            }
            emit PolicyResolved(companyId, term, false, move);
            return;
        }
        if (forDividend > forReinvest) {
            uint256 amount = (capital * TERM_END_DIVIDEND_BPS) / 10_000;
            uint256 issued = roundAuction.sharesIssuedAt(companyId, policyRecordDate[companyId][term]);
            uint256 perShare = (amount * 1e18) / issued;
            if (perShare > 0) {
                roundAuction.adjustCapital(companyId, -int256(amount)); // tokens arrive here
                dividendPerShare[companyId][term] = perShare;
                dividendRemaining[companyId][term] = amount;
                emit PolicyResolved(companyId, term, true, amount);
                return;
            }
        }
        emit PolicyResolved(companyId, term, false, 0);
    }

    function dividendOwed(uint256 companyId, uint256 term, address holder) public view returns (uint256) {
        if (!policyResolved[companyId][term] || claimedDividend[companyId][term][holder]) return 0;
        uint256 held = roundAuction.shareCountAt(companyId, holder, policyRecordDate[companyId][term]);
        return (held * dividendPerShare[companyId][term]) / 1e18;
    }

    function claimDividend(uint256 companyId, uint256 term) external nonReentrant {
        uint256 amount = _takeDividend(companyId, term, msg.sender);
        investToken.safeTransfer(msg.sender, amount);
    }

    /// @notice Anyone can collect the dividend owed to shares one company
    /// holds in another; it becomes the holder company's reinvestable income.
    function claimDividendAsCorporation(uint256 fromCompanyId, uint256 dividendCompanyId, uint256 term) external nonReentrant {
        uint256 amount = _takeDividend(dividendCompanyId, term, roundAuction.corporateHolder(fromCompanyId));
        _credit(fromCompanyId, address(investToken), INCOME, amount);
    }

    function _takeDividend(uint256 companyId, uint256 term, address holder) internal returns (uint256 amount) {
        require(policyResolved[companyId][term], "CT: not resolved");
        require(!claimedDividend[companyId][term][holder], "CT: already claimed");
        amount = dividendOwed(companyId, term, holder);
        require(amount > 0, "CT: nothing to claim");
        claimedDividend[companyId][term][holder] = true;
        dividendRemaining[companyId][term] -= amount;
        emit DividendClaimed(companyId, term, holder, amount);
    }
}
