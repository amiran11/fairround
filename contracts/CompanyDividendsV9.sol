// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice The parts of RoundAuctionV9 the dividend contract uses.
interface ILedgerDivV9 {
    function companies(uint256 companyId) external view returns (
        string memory name, uint256 totalShares, uint256 sharesIssued, uint256 currentRound,
        uint256 roundEnd, uint256 roundDuration, bool finalized, uint256 firstMintedAt, uint256 capital
    );
    function shareCountAt(uint256 companyId, address holder, uint256 ts) external view returns (uint256);
    function votingWeight(uint256 companyId, address holder, uint256 snapshot) external view returns (uint256);
    function sharesIssuedAt(uint256 companyId, uint256 ts) external view returns (uint256);
    function corporateSharesAt(uint256 companyId, uint256 ts) external view returns (uint256);
    function corporateHolder(uint256 companyId) external pure returns (address);
    function adjustCapital(uint256 companyId, int256 delta) external;
    function addReinvestableIncome(uint256 companyId, uint256 amount) external;
}

/// @notice The parts of GovernanceV9 the dividend contract uses.
interface IGovernanceDivV9 {
    function companyGovernor(uint256 companyId) external view returns (address);
    function governorOperatingKey(uint256 companyId) external view returns (address);
    function governorTermEnd(uint256 companyId) external view returns (uint256);
    function termNumber(uint256 companyId) external view returns (uint256);
    function termEndedAt(uint256 companyId, uint256 term) external view returns (uint256);
    function termGovernor(uint256 companyId, uint256 term) external view returns (address);
}

/// @title CompanyDividendsV9
/// @notice The end-of-term policy vote, split out of CompanyTreasuryV9 to
/// keep both under Arbitrum's contract size limit. After each governor
/// term, shareholders (as of the moment the term ended) vote:
///   - "dividend": 1% of the company's INVEST capital is paid to all
///     shareholders pro rata;
///   - "reinvest": 1% of INVEST capital becomes reinvestable income, which
///     the company can then bid in other companies (by a further vote).
/// The winning side needs 20% of the shares that can vote (issued, minus
/// company-held shares and the shares of that term's governor), and that
/// governor can't vote. Otherwise nothing happens. Has no owner.
///
/// FICTIONAL SIMULATION. Not a real financial product, security, or claim
/// on any real-world asset.
contract CompanyDividendsV9 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    string public constant DISCLAIMER = "FICTIONAL SIMULATION. Not a real financial product, security, or claim on any real-world asset. Any resemblance to real entities is a gamified rule-set only.";

    IERC20 public immutable investToken;
    ILedgerDivV9 public immutable roundAuction;
    IGovernanceDivV9 public immutable governance;

    constructor(address _investToken, address _roundAuction, address _governance) {
        require(_investToken != address(0) && _roundAuction != address(0) && _governance != address(0), "DV: zero address");
        investToken = IERC20(_investToken);
        roundAuction = ILedgerDivV9(_roundAuction);
        governance = IGovernanceDivV9(_governance);
    }

    // ---------------------------------------------------------------------
    // End-of-term policy vote (record date = the moment the term ended)
    // ---------------------------------------------------------------------

    uint256 public constant POLICY_VOTE_WINDOW = 3 days;
    uint256 public constant TERM_END_DIVIDEND_BPS = 100; // 1% of INVEST capital
    uint256 public constant POLICY_QUORUM_BPS = 2000;    // winning side >= 20% of the base
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
        require(endedAt != 0, "DV: term not concluded");
        require(policyVoteEnd[companyId][term] == 0, "DV: already opened");
        require(roundAuction.sharesIssuedAt(companyId, endedAt) > 0, "DV: no shares issued");
        policyRecordDate[companyId][term] = endedAt;
        policyVoteEnd[companyId][term] = block.timestamp + POLICY_VOTE_WINDOW;
        emit PolicyVoteOpened(companyId, term, policyVoteEnd[companyId][term], endedAt);
    }

    /// @notice The governor of that term can't vote on what happens to it.
    function votePolicy(uint256 companyId, uint256 term, bool wantsDividend) external {
        require(msg.sender != governance.termGovernor(companyId, term), "DV: that term's governor can't vote");
        _votePolicy(companyId, term, msg.sender, wantsDividend);
    }

    function votePolicyAsCorporation(uint256 fromCompanyId, uint256 companyId, uint256 term, bool wantsDividend) external {
        require(fromCompanyId != companyId, "DV: same company");
        require(msg.sender == governance.governorOperatingKey(fromCompanyId), "DV: not operating key");
        require(block.timestamp < governance.governorTermEnd(fromCompanyId), "DV: term expired");
        require(governance.companyGovernor(fromCompanyId) != governance.termGovernor(companyId, term), "DV: that term's governor can't vote");
        _votePolicy(companyId, term, roundAuction.corporateHolder(fromCompanyId), wantsDividend);
    }

    function _votePolicy(uint256 companyId, uint256 term, address voter, bool wantsDividend) internal {
        uint256 voteEnd = policyVoteEnd[companyId][term];
        require(voteEnd != 0 && block.timestamp < voteEnd, "DV: voting not open");
        require(!policyHasVoted[companyId][term][voter], "DV: already voted");
        uint256 weight = roundAuction.votingWeight(companyId, voter, policyRecordDate[companyId][term]);
        require(weight > 0, "DV: no shares at record date");
        policyHasVoted[companyId][term][voter] = true;
        if (wantsDividend) policyDividendWeight[companyId][term] += weight;
        else policyReinvestWeight[companyId][term] += weight;
        emit PolicyVoted(companyId, term, voter, wantsDividend, weight);
    }

    /// @notice Quorum base for a policy vote.
    function policyBase(uint256 companyId, uint256 term) public view returns (uint256) {
        uint256 rd = policyRecordDate[companyId][term];
        uint256 issued = roundAuction.sharesIssuedAt(companyId, rd);
        uint256 excluded = roundAuction.corporateSharesAt(companyId, rd)
            + roundAuction.shareCountAt(companyId, governance.termGovernor(companyId, term), rd);
        return issued > excluded ? issued - excluded : 0;
    }

    /// @notice "dividend" pays 1% of INVEST capital pro rata; "reinvest"
    /// moves 1% of INVEST capital to reinvestable income. The winning side
    /// needs 20% of the base; otherwise nothing happens.
    function resolvePolicyVote(uint256 companyId, uint256 term) external nonReentrant {
        uint256 voteEnd = policyVoteEnd[companyId][term];
        require(voteEnd != 0, "DV: not opened");
        require(block.timestamp >= voteEnd, "DV: voting still open");
        require(!policyResolved[companyId][term], "DV: already resolved");
        policyResolved[companyId][term] = true;
        uint256 forDividend = policyDividendWeight[companyId][term];
        uint256 forReinvest = policyReinvestWeight[companyId][term];
        uint256 winning = forDividend > forReinvest ? forDividend : forReinvest;
        if (forDividend == forReinvest || winning * 10_000 < policyBase(companyId, term) * POLICY_QUORUM_BPS) {
            emit PolicyResolved(companyId, term, false, 0);
            return;
        }
        (, , , , , , , , uint256 capital) = roundAuction.companies(companyId);
        uint256 amount = (capital * TERM_END_DIVIDEND_BPS) / 10_000;
        if (forReinvest > forDividend) {
            if (amount > 0) {
                roundAuction.adjustCapital(companyId, -int256(amount)); // tokens arrive here
                _toIncome(companyId, amount);
            }
            emit PolicyResolved(companyId, term, false, amount);
            return;
        }
        uint256 issued = roundAuction.sharesIssuedAt(companyId, policyRecordDate[companyId][term]);
        uint256 perShare = (amount * 1e18) / issued;
        if (perShare > 0) {
            roundAuction.adjustCapital(companyId, -int256(amount)); // tokens arrive here
            dividendPerShare[companyId][term] = perShare;
            dividendRemaining[companyId][term] = amount;
            emit PolicyResolved(companyId, term, true, amount);
            return;
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
        require(fromCompanyId != dividendCompanyId, "DV: same company");
        uint256 amount = _takeDividend(dividendCompanyId, term, roundAuction.corporateHolder(fromCompanyId));
        _toIncome(fromCompanyId, amount);
    }

    function _takeDividend(uint256 companyId, uint256 term, address holder) internal returns (uint256 amount) {
        require(policyResolved[companyId][term], "DV: not resolved");
        require(!claimedDividend[companyId][term][holder], "DV: already claimed");
        amount = dividendOwed(companyId, term, holder);
        require(amount > 0, "DV: nothing to claim");
        claimedDividend[companyId][term][holder] = true;
        dividendRemaining[companyId][term] -= amount;
        emit DividendClaimed(companyId, term, holder, amount);
    }

    /// @dev INVEST held here goes back to RoundAuctionV9 as income.
    function _toIncome(uint256 companyId, uint256 amount) internal {
        investToken.safeTransfer(address(roundAuction), amount);
        roundAuction.addReinvestableIncome(companyId, amount);
    }
}
