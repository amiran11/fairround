// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice The parts of GovernanceV9 this contract reads.
interface IGovernanceV9Read {
    function companyGovernor(uint256 companyId) external view returns (address);
    function governorOperatingKey(uint256 companyId) external view returns (address);
    function governorTermEnd(uint256 companyId) external view returns (uint256);
    function termNumber(uint256 companyId) external view returns (uint256);
}

/// @title RoundAuctionV9
/// @notice Proportional, round-based privatization auction for share NFTs.
/// Rebuilt from v8 after the audit in SECURITY_REVIEW.md (Findings 30, 31,
/// 38, 39, 40 and the lower-severity notes).
///
/// How a round works:
///   - Bidding opens at `roundStart` and closes at `roundEnd`. A bid is a
///     budget (INVEST locked) plus a per-share price limit (`maxPrice`).
///   - Price of one share in a round:
///       * a bid's effective price is min(budget, maxPrice). If every bid
///         fits at the LOWEST effective price (demand there <= shares on
///         offer), that is the price, as in the paper: the lowest bid buys
///         at least one share;
///       * if the round is oversubscribed, the price is the CLEARING
///         price: the highest price at which demand still covers the
///         offer. A tiny bid can therefore never pin the price
///         (v9 audit RA-1).
///     Demand at price p = sum of floor(budget / p) over bids whose budget
///     and maxPrice are both >= p. Shares are rounded DOWN (Finding 40);
///     a bid pays exactly shares x price.
///   - If demand exceeds the offer, each eligible bid gets the same
///     fraction of its entitlement (pro rata, rounded down) and the few
///     shares left by rounding go one each to the highest bids. Nothing is
///     all-or-nothing (Finding 30).
///   - A bid that got its full entitlement is closed and the remainder
///     (less than one share's price) refunded. A partly filled bid stays
///     active, smaller, for the next round.
///   - After settlement there is a cooldown before the next round opens.
///     During the cooldown nobody can bid, and anyone whose bid is still
///     active may withdraw it.
///   - The book holds at most 100 active bids. When it is full, a new bid
///     must have a higher effective price than the lowest, which is
///     refunded and evicted (Finding 31, RA-N1: nobody can squat the slots
///     with bids that never buy).
///
/// Shares:
///   - Each share is locked for 7 days from its OWN mint time.
///   - One listing per share, deleted whenever the share moves (Finding 39).
///   - Company-held shares can't be listed or moved, and nobody can send
///     shares to a company (Finding 24, v9 audit RA-3). Corporate bids are
///     placed only by the treasury after a shareholder vote.
///
/// FICTIONAL SIMULATION. Not a real financial product, security, or claim
/// on any real-world asset.
contract RoundAuctionV9 is ERC721, Ownable, ReentrancyGuard {
    using Checkpoints for Checkpoints.Trace208;

    string public constant DISCLAIMER = "FICTIONAL SIMULATION. Not a real financial product, security, or claim on any real-world asset. Any resemblance to real entities is a gamified rule-set only.";

    IERC20 public immutable investToken;
    uint256 public nextTokenId;
    uint256 public constant ROUND_COOLDOWN = 1 hours;
    uint256 public constant LOCK_PERIOD = 7 days;
    uint256 public constant HOST_FEE_BPS = 100; // 1%
    uint256 public constant MIN_BID = 1 * 10 ** 18; // 1 whole INVEST
    uint256 public constant MAX_ACTIVE_BIDS = 100;
    uint256 public constant MAX_SHARES_PER_ROUND = 150;
    uint256 public constant MAX_COMPANY_ID = type(uint64).max;

    address public host;
    uint256 public hostFeeAccrued;
    address public treasury;
    address public dividends; // CompanyDividendsV9: may also use the treasury hooks
    IGovernanceV9Read public governance;

    // Same field order as v8, so readers of companies() decode it unchanged.
    struct Company {
        string name;
        uint256 totalShares;
        uint256 sharesIssued;
        uint256 currentRound;
        uint256 roundEnd;
        uint256 roundDuration;
        bool finalized;
        uint256 firstMintedAt;
        uint256 capital;
    }

    struct Bid {
        address bidder;
        uint256 amount;   // remaining budget (INVEST locked here)
        uint256 maxPrice; // highest price per share this bid accepts
        uint256 seq;      // global placement order, for earliest-first tie-breaks
    }

    mapping(uint256 => Company) public companies;
    mapping(uint256 => uint256) public roundStart; // bidding opens at this time
    mapping(uint256 => Bid[]) internal activeBids;
    mapping(uint256 => mapping(address => uint256)) public activeBidSlot; // index + 1, 0 = none
    uint256 public nextBidSeq;

    // tokenId => companyId (bits 192..255) | mintedAt (bits 128..191) | ordinal (bits 0..127)
    mapping(uint256 => uint256) internal shareInfo;

    mapping(uint256 => mapping(address => Checkpoints.Trace208)) internal holdingHistory;
    mapping(uint256 => Checkpoints.Trace208) internal issuedHistory;
    mapping(uint256 => Checkpoints.Trace208) internal corporateHistory; // shares held by companies

    mapping(uint256 => uint256) public reinvestableIncome;
    /// @dev Company addresses: a fixed 96-bit prefix + the 64-bit company id,
    /// so any company address — listed yet or not — is recognisable.
    uint160 internal constant CORP_PREFIX = 0x0ab48f255a5f26189f2c25fb; // first 12 bytes of keccak("SAKARTVELO_CORPORATE_HOLDER_V9")

    // Governor compensation for corporate bids: the governor is fixed when
    // the bid is placed; 1% of everything the bid fills, counted cumulatively.
    uint256 public constant COMPENSATION_LOCK = 60 days; // two 30-day terms
    mapping(uint256 => mapping(address => address)) public corporateBidGovernor; // companyId => corporate bidder => governor
    mapping(uint256 => mapping(address => uint256)) public corporateBidFilled;
    mapping(uint256 => mapping(address => uint256)) public corporateBidCompPaid;
    mapping(uint256 => uint256) public compensationUnlockTime; // tokenId => time

    uint256 public companiesListed;
    uint256 public companiesFinalized;

    event CompanyListed(uint256 indexed companyId, string name, uint256 totalShares, uint256 roundEnd);
    event BidPlaced(uint256 indexed companyId, address indexed bidder, uint256 amount, uint256 maxPrice, uint256 bidIndex);
    event BidEvicted(uint256 indexed companyId, address indexed bidder, uint256 amount);
    event BidWithdrawn(uint256 indexed companyId, address indexed bidder, uint256 amount);
    event BidFilled(uint256 indexed companyId, address indexed bidder, uint256 shares, uint256 paid);
    event BidRefunded(uint256 indexed companyId, address indexed bidder, uint256 amount);
    event RoundSettled(uint256 indexed companyId, uint256 indexed round, uint256 sharesIssuedThisRound, uint256 price);
    event RoundReopened(uint256 indexed companyId, uint256 indexed newRound, uint256 roundStart, uint256 roundEnd);
    event CompanySoldOut(uint256 indexed companyId, uint256 refundedBidders);
    event HostFeesWithdrawn(address indexed host, uint256 amount);
    event HostSet(address indexed host);
    event TreasurySet(address indexed treasury);
    event DividendsSet(address indexed dividends);
    event GovernanceSet(address indexed governance);
    event CorporateInvestment(uint256 indexed fromCompanyId, uint256 indexed toCompanyId, uint256 amount);
    event ShareListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event ShareSold(uint256 indexed tokenId, address seller, address indexed buyer, uint256 price);
    event ListingCancelled(uint256 indexed tokenId);

    constructor(address _investToken) ERC721("Sovereign Share v9", "RSHARE9") Ownable(msg.sender) {
        require(_investToken != address(0), "RA: zero address");
        investToken = IERC20(_investToken);
        host = msg.sender;
    }

    // ---------------------------------------------------------------------
    // Admin wiring (treasury and governance set exactly once)
    // ---------------------------------------------------------------------

    function setHost(address _host) external onlyOwner {
        require(_host != address(0), "RA: zero address");
        host = _host;
        emit HostSet(_host);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(treasury == address(0), "RA: treasury already set");
        require(_treasury != address(0), "RA: zero address");
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    function setDividends(address _dividends) external onlyOwner {
        require(dividends == address(0), "RA: dividends already set");
        require(_dividends != address(0), "RA: zero address");
        dividends = _dividends;
        emit DividendsSet(_dividends);
    }

    function setGovernance(address _governance) external onlyOwner {
        require(address(governance) == address(0), "RA: governance already set");
        require(_governance != address(0), "RA: zero address");
        governance = IGovernanceV9Read(_governance);
        emit GovernanceSet(_governance);
    }

    function withdrawHostFees() external nonReentrant {
        require(msg.sender == host, "RA: not host");
        uint256 amount = hostFeeAccrued;
        require(amount > 0, "RA: nothing to withdraw");
        hostFeeAccrued = 0;
        require(investToken.transfer(host, amount), "RA: transfer failed");
        emit HostFeesWithdrawn(host, amount);
    }

    modifier onlyTreasury() {
        require(msg.sender == treasury || (msg.sender == dividends && msg.sender != address(0)), "RA: not treasury");
        _;
    }

    modifier onlyGovernor(uint256 companyId) {
        require(msg.sender == governance.governorOperatingKey(companyId), "RA: not operating key");
        require(block.timestamp < governance.governorTermEnd(companyId), "RA: term expired");
        _;
    }

    // ---------------------------------------------------------------------
    // Treasury hooks. Invariant: this contract holds INVEST >= every
    // company's capital + reinvestable income + host fees + active bids.
    // ---------------------------------------------------------------------

    /// @notice Negative delta pays the tokens to the treasury in the same
    /// call; positive delta requires the treasury to have sent them first.
    function adjustCapital(uint256 companyId, int256 delta) external onlyTreasury nonReentrant {
        if (delta >= 0) {
            companies[companyId].capital += uint256(delta);
        } else {
            uint256 dec = uint256(-delta);
            require(companies[companyId].capital >= dec, "RA: capital underflow");
            companies[companyId].capital -= dec;
            require(investToken.transfer(msg.sender, dec), "RA: transfer failed");
        }
    }

    function addReinvestableIncome(uint256 companyId, uint256 amount) external onlyTreasury {
        reinvestableIncome[companyId] += amount;
    }

    /// @notice Treasury takes income out (for a voted payment or sale).
    function takeIncome(uint256 companyId, uint256 amount) external onlyTreasury nonReentrant {
        require(reinvestableIncome[companyId] >= amount, "RA: income underflow");
        reinvestableIncome[companyId] -= amount;
        require(investToken.transfer(msg.sender, amount), "RA: transfer failed");
    }

    function listCompany(uint256 companyId, string calldata name, uint256 totalShares, uint256 roundDuration) external onlyOwner {
        require(companyId <= MAX_COMPANY_ID, "RA: company id too large");
        require(companies[companyId].totalShares == 0, "RA: already listed");
        require(totalShares > 0 && totalShares < type(uint128).max, "RA: bad share count");
        require(roundDuration > 0 && roundDuration <= 30 days, "RA: bad duration");
        companies[companyId] = Company(name, totalShares, 0, 1, block.timestamp + roundDuration, roundDuration, false, 0, 0);
        roundStart[companyId] = block.timestamp;
        companiesListed++;
        emit CompanyListed(companyId, name, totalShares, companies[companyId].roundEnd);
    }

    // ---------------------------------------------------------------------
    // Bidding
    // ---------------------------------------------------------------------

    /// @param maxPrice highest price per share you accept (in INVEST wei).
    function placeBid(uint256 companyId, uint256 amount, uint256 maxPrice) external nonReentrant {
        require(investToken.transferFrom(msg.sender, address(this), amount), "RA: transfer failed");
        _addBid(companyId, msg.sender, amount, maxPrice);
    }

    /// @notice The treasury places a company's bid in ANOTHER company, after
    /// the shareholders of `fromCompanyId` voted for it. The INVEST (from
    /// that company's income) has already been sent here.
    function placeCorporateBid(uint256 fromCompanyId, uint256 toCompanyId, uint256 amount, uint256 maxPrice, address governor)
        external onlyTreasury nonReentrant
    {
        require(fromCompanyId != toCompanyId, "RA: can't invest in itself");
        require(companies[fromCompanyId].totalShares > 0, "RA: unknown company");
        address corp = corporateHolder(fromCompanyId);
        _addBid(toCompanyId, corp, amount, maxPrice);
        corporateBidGovernor[toCompanyId][corp] = governor;
        corporateBidFilled[toCompanyId][corp] = 0;
        corporateBidCompPaid[toCompanyId][corp] = 0;
        emit CorporateInvestment(fromCompanyId, toCompanyId, amount);
    }

    function _addBid(uint256 companyId, address bidder, uint256 amount, uint256 maxPrice) internal {
        Company storage c = companies[companyId];
        require(c.totalShares > 0, "RA: unknown company");
        require(!c.finalized, "RA: sold out");
        require(block.timestamp >= roundStart[companyId], "RA: cooldown, round not open yet");
        require(block.timestamp < c.roundEnd, "RA: round closed");
        require(amount >= MIN_BID, "RA: bid below 1 INVEST");
        require(maxPrice >= MIN_BID, "RA: max price below 1 INVEST");
        require(activeBidSlot[companyId][bidder] == 0, "RA: already have active bid");
        Bid[] storage list = activeBids[companyId];
        uint256 seq = nextBidSeq++;
        if (list.length < MAX_ACTIVE_BIDS) {
            list.push(Bid(bidder, amount, maxPrice, seq));
            activeBidSlot[companyId][bidder] = list.length;
        } else {
            // Full book: evict the bid with the lowest effective price
            // min(amount, maxPrice) — latest one on ties (v9 audit RA-N1).
            uint256 lowIdx = 0;
            uint256 lowEff = _eff(list[0]);
            for (uint256 i = 1; i < list.length; i++) {
                uint256 e = _eff(list[i]);
                if (e < lowEff || (e == lowEff && list[i].seq > list[lowIdx].seq)) {
                    lowIdx = i;
                    lowEff = e;
                }
            }
            Bid memory out = list[lowIdx];
            require((amount < maxPrice ? amount : maxPrice) > lowEff, "RA: book full, bid must beat the lowest");
            delete activeBidSlot[companyId][out.bidder];
            list[lowIdx] = Bid(bidder, amount, maxPrice, seq);
            activeBidSlot[companyId][bidder] = lowIdx + 1;
            emit BidEvicted(companyId, out.bidder, out.amount);
            _refund(companyId, out.bidder, out.amount);
        }
        emit BidPlaced(companyId, bidder, amount, maxPrice, seq);
    }

    /// @notice During the cooldown after a settlement, withdraw your
    /// still-active bid.
    function withdrawBid(uint256 companyId) external nonReentrant {
        _withdraw(companyId, msg.sender);
    }

    /// @notice Same, for a company's own bid in another company, by that
    /// company's governor. The money returns to its reinvestable income.
    function withdrawCorporateBid(uint256 fromCompanyId, uint256 toCompanyId) external onlyGovernor(fromCompanyId) nonReentrant {
        _withdraw(toCompanyId, corporateHolder(fromCompanyId));
    }

    function _withdraw(uint256 companyId, address bidder) internal {
        require(block.timestamp < roundStart[companyId], "RA: withdraw only during cooldown");
        uint256 slot = activeBidSlot[companyId][bidder];
        require(slot != 0, "RA: no active bid");
        Bid[] storage list = activeBids[companyId];
        uint256 amount = list[slot - 1].amount;
        uint256 last = list.length - 1;
        if (slot - 1 != last) {
            list[slot - 1] = list[last];
            activeBidSlot[companyId][list[slot - 1].bidder] = slot;
        }
        list.pop();
        delete activeBidSlot[companyId][bidder];
        emit BidWithdrawn(companyId, bidder, amount);
        _refund(companyId, bidder, amount);
    }

    function getActiveBids(uint256 companyId) external view returns (Bid[] memory) {
        return activeBids[companyId];
    }

    function activeBidCount(uint256 companyId) external view returns (uint256) {
        return activeBids[companyId].length;
    }

    // ---------------------------------------------------------------------
    // Settlement
    // ---------------------------------------------------------------------

    /// @notice Permissionless once a round closes.
    function settleRound(uint256 companyId) external nonReentrant {
        Company storage c = companies[companyId];
        require(c.totalShares > 0, "RA: unknown company");
        require(!c.finalized, "RA: sold out");
        require(block.timestamp >= c.roundEnd, "RA: round still open");

        Bid[] storage list = activeBids[companyId];
        uint256 n = list.length;
        if (n == 0) {
            _openNextRound(companyId, c);
            return;
        }

        Bid[] memory bs = new Bid[](n);
        for (uint256 i = 0; i < n; i++) bs[i] = list[i];
        _sortDesc(bs);

        uint256 remaining = c.totalShares - c.sharesIssued;
        uint256 offer = remaining > MAX_SHARES_PER_ROUND ? MAX_SHARES_PER_ROUND : remaining;
        uint256 price = _clearingPrice(bs, offer);
        uint256[] memory alloc = _allocate(bs, price, offer);

        uint256 issued = 0;
        uint256 roundCapital = 0;
        uint256 roundFee = 0;
        if (c.firstMintedAt == 0) c.firstMintedAt = block.timestamp;

        for (uint256 k = 0; k < n; k++) {
            uint256 got = alloc[k];
            if (got == 0) continue;
            _mintShares(companyId, c, bs[k].bidder, got);
            issued += got;
            uint256 charge = got * price;
            uint256 fee = (charge * HOST_FEE_BPS) / 10_000;
            roundFee += fee;
            roundCapital += charge - fee;
            emit BidFilled(companyId, bs[k].bidder, got, charge);
            uint256 left = bs[k].amount - charge;
            if (got == bs[k].amount / price) {
                // Full entitlement: close the bid, refund what's left.
                bs[k].amount = 0;
                if (left > 0) _refund(companyId, bs[k].bidder, left);
            } else {
                bs[k].amount = left; // partly filled: stays active, >= price
            }
        }

        c.capital += roundCapital;
        hostFeeAccrued += roundFee;
        issuedHistory[companyId].push(uint48(block.timestamp), uint208(c.sharesIssued));
        emit RoundSettled(companyId, c.currentRound, issued, price);

        bool soldOut = c.sharesIssued == c.totalShares;
        uint256 refunded = 0;
        for (uint256 i = 0; i < n; i++) {
            delete activeBidSlot[companyId][bs[i].bidder];
        }
        uint256 w = 0;
        for (uint256 k = 0; k < n; k++) {
            if (bs[k].amount == 0) continue;
            if (soldOut) {
                _refund(companyId, bs[k].bidder, bs[k].amount);
                refunded++;
                continue;
            }
            list[w] = bs[k];
            activeBidSlot[companyId][bs[k].bidder] = w + 1;
            w++;
        }
        while (list.length > w) list.pop();

        if (soldOut) {
            c.finalized = true;
            companiesFinalized++;
            emit CompanySoldOut(companyId, refunded);
        } else {
            _openNextRound(companyId, c);
        }
    }

    /// @dev The highest price per share a bid can actually pay.
    function _eff(Bid memory b) internal pure returns (uint256) {
        return b.amount < b.maxPrice ? b.amount : b.maxPrice;
    }

    /// @dev Entitlement of a bid at price p: floor(amount / p) if both its
    /// budget and its maxPrice reach p, else 0.
    function _ent(Bid memory b, uint256 p) internal pure returns (uint256) {
        return (b.amount >= p && b.maxPrice >= p) ? b.amount / p : 0;
    }

    function _demand(Bid[] memory bs, uint256 p) internal pure returns (uint256 d) {
        for (uint256 k = 0; k < bs.length; k++) d += _ent(bs[k], p);
    }

    /// @dev Floor = the lowest effective price min(amount, maxPrice): at
    /// the floor EVERY bid is eligible, so a bid can't set a price it
    /// refuses to pay (v9 audit RA-N1/N2). If demand at the floor fits the
    /// offer, that is the price; otherwise the highest price whose demand
    /// still covers the offer (binary search: demand only falls as the
    /// price rises).
    function _clearingPrice(Bid[] memory bs, uint256 offer) internal pure returns (uint256) {
        uint256 lo = type(uint256).max;
        uint256 hi = 0;
        for (uint256 k = 0; k < bs.length; k++) {
            uint256 e = _eff(bs[k]);
            if (e < lo) lo = e;
            if (e > hi) hi = e; // demand above the highest effective price is 0
        }
        if (_demand(bs, lo) <= offer) return lo;
        while (lo < hi) {
            uint256 mid = lo + (hi - lo + 1) / 2;
            if (_demand(bs, mid) >= offer) lo = mid; else hi = mid - 1;
        }
        return lo;
    }

    /// @dev If entitlements fit, everyone gets theirs. Otherwise pro rata,
    /// rounded down, and the shares left by rounding (fewer than the number
    /// of eligible bids) go one each to the highest eligible bids. Each
    /// eligible bid's pro-rata share is then strictly below its entitlement,
    /// so the +1 never exceeds it.
    function _allocate(Bid[] memory bs, uint256 price, uint256 offer) internal pure returns (uint256[] memory alloc) {
        uint256 n = bs.length;
        alloc = new uint256[](n);
        uint256 totalEnt = 0;
        for (uint256 k = 0; k < n; k++) {
            alloc[k] = _ent(bs[k], price);
            totalEnt += alloc[k];
        }
        if (totalEnt <= offer) return alloc;
        uint256 given = 0;
        for (uint256 k = 0; k < n; k++) {
            alloc[k] = (alloc[k] * offer) / totalEnt;
            given += alloc[k];
        }
        uint256 extra = offer - given;
        for (uint256 k = 0; k < n && extra > 0; k++) {
            if (_ent(bs[k], price) == 0) continue;
            alloc[k] += 1;
            extra--;
        }
    }

    function _openNextRound(uint256 companyId, Company storage c) internal {
        c.currentRound++;
        uint256 start = block.timestamp + ROUND_COOLDOWN;
        roundStart[companyId] = start;
        c.roundEnd = start + c.roundDuration;
        emit RoundReopened(companyId, c.currentRound, start, c.roundEnd);
    }

    /// @dev Highest amount first, earliest bid first on ties (<= 100 entries).
    function _sortDesc(Bid[] memory a) internal pure {
        for (uint256 i = 1; i < a.length; i++) {
            Bid memory key = a[i];
            uint256 j = i;
            while (j > 0 && (a[j - 1].amount < key.amount || (a[j - 1].amount == key.amount && a[j - 1].seq > key.seq))) {
                a[j] = a[j - 1];
                j--;
            }
            a[j] = key;
        }
    }

    /// @dev Citizen refunds are paid in INVEST; a company's bid goes back to
    /// that company's reinvestable income (the tokens stay here).
    function _refund(uint256 companyId, address bidder, uint256 amount) internal {
        uint256 originPlusOne = corporateCompanyPlusOne(bidder);
        if (originPlusOne != 0) {
            reinvestableIncome[originPlusOne - 1] += amount;
        } else {
            require(investToken.transfer(bidder, amount), "RA: transfer failed");
        }
        emit BidRefunded(companyId, bidder, amount);
    }

    /// @dev For a corporate win, the governor recorded with the bid earns
    /// 1% of all shares the bid has filled so far (counted cumulatively, so
    /// small fills add up), locked for COMPENSATION_LOCK from mint.
    function _mintShares(uint256 companyId, Company storage c, address to, uint256 qty) internal {
        if (corporateCompanyPlusOne(to) != 0) {
            address gov = corporateBidGovernor[companyId][to];
            uint256 filled = corporateBidFilled[companyId][to] + qty;
            corporateBidFilled[companyId][to] = filled;
            uint256 due = filled / 100 - corporateBidCompPaid[companyId][to];
            if (gov != address(0) && due > 0) {
                if (due > qty) due = qty;
                corporateBidCompPaid[companyId][to] += due;
                uint256 first = nextTokenId;
                _mintBatch(companyId, c, gov, due);
                for (uint256 t = first; t < first + due; t++) {
                    compensationUnlockTime[t] = block.timestamp + COMPENSATION_LOCK;
                }
                qty -= due;
            }
            if (qty > 0) {
                Checkpoints.Trace208 storage h = corporateHistory[companyId];
                h.push(uint48(block.timestamp), h.latest() + uint208(qty));
            }
        }
        _mintBatch(companyId, c, to, qty);
    }

    function _mintBatch(uint256 companyId, Company storage c, address to, uint256 qty) internal {
        if (qty == 0) return;
        uint256 ordinal = c.sharesIssued;
        uint256 tokenId = nextTokenId;
        uint256 head = (companyId << 192) | (block.timestamp << 128);
        for (uint256 s = 0; s < qty; s++) {
            ordinal++;
            shareInfo[tokenId] = head | ordinal;
            _mint(to, tokenId); // no receiver callback: a contract can't block settlement
            tokenId++;
        }
        nextTokenId = tokenId;
        c.sharesIssued = ordinal;
        _addHolding(companyId, to, qty);
    }

    // ---------------------------------------------------------------------
    // Share balances, current and historical
    // ---------------------------------------------------------------------

    function shareCompany(uint256 tokenId) public view returns (uint256) {
        return shareInfo[tokenId] >> 192;
    }

    function shareMintedAt(uint256 tokenId) public view returns (uint256) {
        return (shareInfo[tokenId] >> 128) & type(uint64).max;
    }

    function shareOrdinal(uint256 tokenId) public view returns (uint256) {
        return shareInfo[tokenId] & type(uint128).max;
    }

    /// @notice When this share can first be transferred or listed.
    function shareUnlocksAt(uint256 tokenId) public view returns (uint256) {
        return shareMintedAt(tokenId) + LOCK_PERIOD;
    }

    function companyShareCount(uint256 companyId, address holder) public view returns (uint256) {
        return holdingHistory[companyId][holder].latest();
    }

    /// @notice Shares `holder` held in `companyId` at the end of second `ts`.
    function shareCountAt(uint256 companyId, address holder, uint256 ts) external view returns (uint256) {
        return holdingHistory[companyId][holder].upperLookupRecent(uint48(ts));
    }

    /// @notice Shares of `companyId` held by companies (which vote only
    /// through their governor) as of the end of second `ts`.
    function corporateSharesAt(uint256 companyId, uint256 ts) external view returns (uint256) {
        return corporateHistory[companyId].upperLookupRecent(uint48(ts));
    }

    /// @notice Vote weight: the smaller of the shares held at the snapshot
    /// and the shares held now. Shares borrowed for the snapshot moment and
    /// returned count for nothing (v9 audit GOV-1); shares can't vote twice.
    function votingWeight(uint256 companyId, address holder, uint256 snapshot) external view returns (uint256) {
        uint256 atSnap = holdingHistory[companyId][holder].upperLookupRecent(uint48(snapshot));
        uint256 current = holdingHistory[companyId][holder].latest();
        return atSnap < current ? atSnap : current;
    }

    /// @notice Shares of `companyId` issued as of the end of second `ts`.
    function sharesIssuedAt(uint256 companyId, uint256 ts) external view returns (uint256) {
        return issuedHistory[companyId].upperLookupRecent(uint48(ts));
    }

    function _addHolding(uint256 companyId, address holder, uint256 qty) internal {
        Checkpoints.Trace208 storage h = holdingHistory[companyId][holder];
        h.push(uint48(block.timestamp), h.latest() + uint208(qty));
    }

    function _subHolding(uint256 companyId, address holder, uint256 qty) internal {
        Checkpoints.Trace208 storage h = holdingHistory[companyId][holder];
        h.push(uint48(block.timestamp), h.latest() - uint208(qty));
    }

    function _checkTransferable(uint256 tokenId) internal view {
        require(block.timestamp >= shareUnlocksAt(tokenId), "RA: share still locked");
        require(block.timestamp >= compensationUnlockTime[tokenId], "RA: comp shares locked");
    }

    /// @dev Locks, balance history, and listing cleanup on every move.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            _checkTransferable(tokenId);
            require(corporateCompanyPlusOne(to) == 0, "RA: can't send shares to a company");
            uint256 companyId = shareCompany(tokenId);
            _subHolding(companyId, from, 1);
            _addHolding(companyId, to, 1);
            if (listings[tokenId].seller != address(0)) {
                delete listings[tokenId]; // Finding 39: a listing never survives a move
                emit ListingCancelled(tokenId);
            }
        } else if (to == address(0)) {
            revert("RA: shares can't be burned");
        }
        return super._update(to, tokenId, auth);
    }

    // ---------------------------------------------------------------------
    // Share market: one listing per share
    // ---------------------------------------------------------------------

    struct Listing {
        address seller;
        uint256 price;
    }
    mapping(uint256 => Listing) public listings; // tokenId => listing

    function listShare(uint256 tokenId, uint256 price) external {
        require(ownerOf(tokenId) == msg.sender, "RA: not the owner");
        require(price > 0, "RA: price must be > 0");
        _checkTransferable(tokenId);
        listings[tokenId] = Listing(msg.sender, price);
        emit ShareListed(tokenId, msg.sender, price);
    }

    function cancelListing(uint256 tokenId) external {
        require(listings[tokenId].seller == msg.sender, "RA: not seller");
        delete listings[tokenId];
        emit ListingCancelled(tokenId);
    }

    /// @param maxPrice protects the buyer from a price change in the same block.
    function buyShare(uint256 tokenId, uint256 maxPrice) external nonReentrant {
        Listing memory l = listings[tokenId];
        require(l.seller != address(0), "RA: not listed");
        require(ownerOf(tokenId) == l.seller, "RA: seller no longer owns share");
        require(l.price <= maxPrice, "RA: price above max");
        require(msg.sender != l.seller, "RA: own listing");
        delete listings[tokenId];
        require(investToken.transferFrom(msg.sender, address(this), l.price), "RA: transfer failed");
        require(investToken.transfer(l.seller, l.price), "RA: transfer failed");
        // auth = 0: the seller consented by listing; _update enforces every lock.
        _update(msg.sender, tokenId, address(0));
        emit ShareSold(tokenId, l.seller, msg.sender, l.price);
    }

    /// @dev Synthetic, keyless address standing for a company as a
    /// shareholder in another company. Its shares can never move, and no
    /// share can ever be sent to one.
    function corporateHolder(uint256 companyId) public pure returns (address) {
        require(companyId <= MAX_COMPANY_ID, "RA: company id too large");
        return address((CORP_PREFIX << 64) | uint160(companyId));
    }

    /// @notice companyId + 1 if `a` is a company address, else 0.
    function corporateCompanyPlusOne(address a) public pure returns (uint256) {
        uint160 v = uint160(a);
        return (v >> 64) == CORP_PREFIX ? uint256(uint64(v)) + 1 : 0;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "RA: nonexistent token");
        Company storage c = companies[shareCompany(tokenId)];
        string memory ord = Strings.toString(shareOrdinal(tokenId));
        string memory total = Strings.toString(c.totalShares);
        string memory svg = string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">',
            '<rect width="400" height="400" fill="#141B18"/>',
            '<circle cx="200" cy="180" r="130" fill="none" stroke="#C98A3E" stroke-width="8"/>',
            '<text x="200" y="140" font-family="serif" font-weight="bold" font-size="22" fill="#EDE6D6" text-anchor="middle">', c.name, '</text>',
            '<text x="200" y="190" font-family="monospace" font-size="18" fill="#C98A3E" text-anchor="middle">SHARE ', ord, ' OF ', total, '</text>',
            '<text x="200" y="360" font-family="monospace" font-size="10" fill="#EDE6D6" opacity="0.5" text-anchor="middle">FICTIONAL SIMULATION - NOT A REAL FINANCIAL PRODUCT</text>',
            '</svg>'
        ));
        string memory json = string(abi.encodePacked(
            '{"name":"', c.name, ' - Share ', ord, '/', total, '",',
            '"description":"Sovereign Share NFT (v9) from a fictional privatization simulation. Not a real financial product, security, or claim on any real-world asset.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '"}'
        ));
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }
}
