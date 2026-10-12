// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice The parts of RoundAuctionV9 that Governance reads.
interface IShareRegistryV9 {
    function companies(uint256 companyId) external view returns (
        string memory name, uint256 totalShares, uint256 sharesIssued, uint256 currentRound,
        uint256 roundEnd, uint256 roundDuration, bool finalized, uint256 firstMintedAt, uint256 capital
    );
    function shareCountAt(uint256 companyId, address holder, uint256 ts) external view returns (uint256);
    function sharesIssuedAt(uint256 companyId, uint256 ts) external view returns (uint256);
    function corporateHolder(uint256 companyId) external pure returns (address);
}

/// @title GovernanceV9
/// @notice Per-company elections, governor terms, operating keys and recall.
/// Rebuilt from v8 after the audit in SECURITY_REVIEW.md (Findings 27, 28,
/// 29, 34 and the lower-severity notes).
///
/// An election:
///   1. Once at least 50% of a company's shares are issued and it has no
///      sitting governor, anyone opens a 5-day CANDIDACY PERIOD. Its
///      snapshot is taken ONE DAY BEFORE it opened: candidacy stakes and all
///      vote weights in this election use share balances at that moment,
///      so shares bought or borrowed after seeing the election count for
///      nothing (Finding 34).
///   2. Shareholders with at least 0.1% of issued shares at the snapshot
///      declare candidacy with a written program; they can withdraw. With
///      20 candidates, a newcomer must hold more than the smallest
///      candidate, who is dropped (Finding 28).
///   3. Voting opens only after the candidacy period (Finding 27).
///   4. A winner needs 51% of votes cast AND votes of at least 20% of the
///      shares issued at the snapshot. With two or fewer candidates left,
///      the leader wins if strictly ahead and over the 20%. With more, and no
///      51%, the top two go to a runoff.
///   5. A round with no winner is a failed round. After two failed rounds
///      the election closes and anyone can open a fresh candidacy period.
///
/// A term lasts 30 days. Its end time is recorded once and never
/// overwritten (Finding 29). Shareholders can end a term early by RECALL:
/// 51% of votes cast and turnout of at least 33% of issued shares.
///
/// FICTIONAL SIMULATION. Not a real financial product, security, or claim
/// on any real-world asset.
contract GovernanceV9 {
    string public constant DISCLAIMER = "FICTIONAL SIMULATION. Not a real financial product, security, or claim on any real-world asset. Any resemblance to real entities is a gamified rule-set only.";

    IShareRegistryV9 public immutable shares;

    uint256 public constant CANDIDACY_PERIOD = 5 days;
    uint256 public constant SNAPSHOT_LAG = 1 days;
    uint256 public constant VOTE_WINDOW = 3 days;
    uint256 public constant TERM_LENGTH = 30 days;
    uint256 public constant MAX_PROGRAM_BYTES = 4500; // ~700 words
    uint256 public constant MAJORITY_BPS = 5100;      // 51% of votes cast
    uint256 public constant WIN_QUORUM_BPS = 2000;    // 20% of issued shares
    uint256 public constant MAX_CANDIDATES = 20;
    uint256 public constant MIN_CANDIDATE_STAKE_BPS = 10; // 0.1% of issued
    uint256 public constant MAX_FAILED_ROUNDS = 2;
    uint256 public constant RECALL_WINDOW = 3 days;
    uint256 public constant RECALL_TURNOUT_BPS = 3300; // 33% of issued shares
    uint256 public constant RECALL_COOLDOWN = 7 days;

    struct Election {
        uint256 id;            // 0 = no election in progress
        uint256 snapshot;
        uint256 candidacyEnd;
        uint256 round;         // current round id, 0 = still in candidacy
        uint256 voteEnd;
        uint256 failedRounds;
    }
    mapping(uint256 => Election) public election;
    mapping(uint256 => uint256) public lastElectionId;
    mapping(uint256 => uint256) public lastRoundId; // never repeats for a company

    struct Candidate {
        string program;
        uint256 stake;
        bool registered;
        bool eliminated;
    }
    mapping(uint256 => mapping(uint256 => mapping(address => Candidate))) public candidates; // company => election => wallet
    mapping(uint256 => mapping(uint256 => address[])) internal candidateList;

    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public roundVotes;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public roundHasVoted;
    mapping(uint256 => mapping(uint256 => uint256)) public roundTotalVotesCast;

    mapping(uint256 => address) public companyGovernor;
    mapping(uint256 => uint256) public governorTermEnd;
    mapping(uint256 => uint256) public termNumber;
    mapping(uint256 => address) public governorOperatingKey;
    mapping(uint256 => mapping(uint256 => uint256)) public termEndedAt; // written once per term

    struct Recall {
        uint256 term;
        uint256 snapshot;
        uint256 voteEnd;
        uint256 yes;
        uint256 no;
        bool resolved;
    }
    mapping(uint256 => uint256) public lastRecallId;
    mapping(uint256 => mapping(uint256 => Recall)) public recalls;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public recallHasVoted;

    event CandidacyOpened(uint256 indexed companyId, uint256 indexed electionId, uint256 snapshot, uint256 candidacyEnd);
    event CandidateDeclared(uint256 indexed companyId, uint256 indexed electionId, address indexed candidate, uint256 stake, string program);
    event CandidateWithdrawn(uint256 indexed companyId, uint256 indexed electionId, address indexed candidate);
    event CandidateDisplaced(uint256 indexed companyId, uint256 indexed electionId, address indexed candidate, uint256 stake);
    event VotingOpened(uint256 indexed companyId, uint256 indexed round, uint256 voteEnd);
    event Voted(uint256 indexed companyId, uint256 indexed round, address indexed voter, address candidate, uint256 weight);
    event RoundAdvanced(uint256 indexed companyId, uint256 newRound, address firstPlace, address secondPlace);
    event RoundFailed(uint256 indexed companyId, uint256 indexed round, uint256 failedRounds);
    event ElectionClosed(uint256 indexed companyId, uint256 indexed electionId);
    event GovernorElected(uint256 indexed companyId, address indexed governor, uint256 winningVotes, uint256 termEnd);
    event TermClosed(uint256 indexed companyId, uint256 indexed term, uint256 endedAt);
    event OperatingKeySet(uint256 indexed companyId, address indexed governor, address indexed operatingKey);
    event RecallOpened(uint256 indexed companyId, uint256 indexed recallId, uint256 term, uint256 voteEnd);
    event RecallVoted(uint256 indexed companyId, uint256 indexed recallId, address indexed voter, bool remove, uint256 weight);
    event RecallResolved(uint256 indexed companyId, uint256 indexed recallId, bool removed);

    constructor(address _shares) {
        require(_shares != address(0), "GOV: zero address");
        shares = IShareRegistryV9(_shares);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function candidateCount(uint256 companyId) external view returns (uint256) {
        return candidateList[companyId][election[companyId].id].length;
    }

    function getCandidates(uint256 companyId) external view returns (address[] memory) {
        return candidateList[companyId][election[companyId].id];
    }

    function governorActive(uint256 companyId) public view returns (bool) {
        return companyGovernor[companyId] != address(0) && block.timestamp < governorTermEnd[companyId];
    }

    // ---------------------------------------------------------------------
    // Candidacy
    // ---------------------------------------------------------------------

    function openCandidacy(uint256 companyId) external {
        (, uint256 totalShares, , , , , , , ) = shares.companies(companyId);
        require(totalShares > 0, "GOV: unknown company");
        require(election[companyId].id == 0, "GOV: election in progress");
        if (companyGovernor[companyId] != address(0)) {
            require(block.timestamp >= governorTermEnd[companyId], "GOV: governor in office");
            _closeTerm(companyId);
        }
        uint256 snapshot = block.timestamp - SNAPSHOT_LAG;
        require(shares.sharesIssuedAt(companyId, snapshot) * 2 >= totalShares, "GOV: under 50% issued at snapshot");
        uint256 id = ++lastElectionId[companyId];
        election[companyId] = Election(id, snapshot, block.timestamp + CANDIDACY_PERIOD, 0, 0, 0);
        emit CandidacyOpened(companyId, id, snapshot, block.timestamp + CANDIDACY_PERIOD);
    }

    function declareCandidacy(uint256 companyId, string calldata program) external {
        Election storage e = election[companyId];
        require(e.id != 0 && e.round == 0 && block.timestamp < e.candidacyEnd, "GOV: candidacy not open");
        require(bytes(program).length <= MAX_PROGRAM_BYTES, "GOV: program too long");
        Candidate storage me = candidates[companyId][e.id][msg.sender];
        require(!me.registered, "GOV: already candidate");
        uint256 stake = shares.shareCountAt(companyId, msg.sender, e.snapshot);
        require(stake > 0, "GOV: no shares at snapshot");
        require(stake * 10_000 >= shares.sharesIssuedAt(companyId, e.snapshot) * MIN_CANDIDATE_STAKE_BPS, "GOV: stake below 0.1%");

        address[] storage list = candidateList[companyId][e.id];
        if (list.length < MAX_CANDIDATES) {
            list.push(msg.sender);
        } else {
            // Full slate: displace the smallest stake (latest one on ties).
            uint256 lowIdx = 0;
            uint256 lowStake = candidates[companyId][e.id][list[0]].stake;
            for (uint256 i = 1; i < list.length; i++) {
                uint256 s = candidates[companyId][e.id][list[i]].stake;
                if (s <= lowStake) { lowIdx = i; lowStake = s; }
            }
            require(stake > lowStake, "GOV: slate full, stake must beat the smallest");
            address out = list[lowIdx];
            candidates[companyId][e.id][out].registered = false;
            list[lowIdx] = msg.sender;
            emit CandidateDisplaced(companyId, e.id, out, lowStake);
        }
        me.program = program;
        me.stake = stake;
        me.registered = true;
        emit CandidateDeclared(companyId, e.id, msg.sender, stake, program);
    }

    function withdrawCandidacy(uint256 companyId) external {
        Election storage e = election[companyId];
        require(e.id != 0 && e.round == 0 && block.timestamp < e.candidacyEnd, "GOV: candidacy not open");
        Candidate storage me = candidates[companyId][e.id][msg.sender];
        require(me.registered, "GOV: not a candidate");
        me.registered = false;
        address[] storage list = candidateList[companyId][e.id];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == msg.sender) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
        emit CandidateWithdrawn(companyId, e.id, msg.sender);
    }

    /// @notice Anyone, once the candidacy period is over. With no
    /// candidates the election simply closes.
    function openVoting(uint256 companyId) external {
        Election storage e = election[companyId];
        require(e.id != 0 && e.round == 0, "GOV: no candidacy period");
        require(block.timestamp >= e.candidacyEnd, "GOV: candidacy period not over");
        if (candidateList[companyId][e.id].length == 0) {
            _closeElection(companyId);
            return;
        }
        _startRound(companyId, e);
    }

    function _startRound(uint256 companyId, Election storage e) internal {
        e.round = ++lastRoundId[companyId];
        e.voteEnd = block.timestamp + VOTE_WINDOW;
        emit VotingOpened(companyId, e.round, e.voteEnd);
    }

    function _closeElection(uint256 companyId) internal {
        emit ElectionClosed(companyId, election[companyId].id);
        delete election[companyId];
    }

    // ---------------------------------------------------------------------
    // Voting
    // ---------------------------------------------------------------------

    function vote(uint256 companyId, address candidate) external {
        _castVote(companyId, msg.sender, candidate);
    }

    /// @notice A company's governor votes the shares that company holds in
    /// another company (cross-holdings built through invest()).
    function voteAsCorporation(uint256 fromCompanyId, uint256 toCompanyId, address candidate) external {
        require(msg.sender == governorOperatingKey[fromCompanyId], "GOV: not operating key");
        require(block.timestamp < governorTermEnd[fromCompanyId], "GOV: term expired");
        _castVote(toCompanyId, shares.corporateHolder(fromCompanyId), candidate);
    }

    function _castVote(uint256 companyId, address voter, address candidate) internal {
        Election storage e = election[companyId];
        uint256 round = e.round;
        require(e.id != 0 && round != 0, "GOV: voting not open");
        require(block.timestamp < e.voteEnd, "GOV: voting closed");
        Candidate storage cand = candidates[companyId][e.id][candidate];
        require(cand.registered && !cand.eliminated, "GOV: not a candidate");
        require(!roundHasVoted[companyId][round][voter], "GOV: already voted");
        uint256 weight = shares.shareCountAt(companyId, voter, e.snapshot);
        require(weight > 0, "GOV: no shares at snapshot");
        roundHasVoted[companyId][round][voter] = true;
        roundVotes[companyId][round][candidate] += weight;
        roundTotalVotesCast[companyId][round] += weight;
        emit Voted(companyId, round, voter, candidate, weight);
    }

    /// @notice Permissionless once a round's voting window has closed.
    function tallyRound(uint256 companyId) external {
        Election storage e = election[companyId];
        uint256 round = e.round;
        require(e.id != 0 && round != 0, "GOV: voting not open");
        require(block.timestamp >= e.voteEnd, "GOV: voting still open");

        address[] storage list = candidateList[companyId][e.id];
        address first;
        address second;
        uint256 firstVotes;
        uint256 secondVotes;
        uint256 remaining;
        for (uint256 i = 0; i < list.length; i++) {
            address cand = list[i];
            if (candidates[companyId][e.id][cand].eliminated) continue;
            remaining++;
            uint256 v = roundVotes[companyId][round][cand];
            if (v > firstVotes) {
                second = first; secondVotes = firstVotes;
                first = cand; firstVotes = v;
            } else if (v > secondVotes) {
                second = cand; secondVotes = v;
            }
        }

        uint256 totalCast = roundTotalVotesCast[companyId][round];
        uint256 issued = shares.sharesIssuedAt(companyId, e.snapshot);
        bool quorum = firstVotes > 0 && firstVotes * 10_000 >= issued * WIN_QUORUM_BPS;
        bool majority = firstVotes * 10_000 >= totalCast * MAJORITY_BPS;

        if (quorum && (majority || (remaining <= 2 && firstVotes > secondVotes))) {
            _installGovernor(companyId, first, firstVotes);
            return;
        }
        if (quorum && remaining > 2 && secondVotes > 0) {
            for (uint256 i = 0; i < list.length; i++) {
                address cand = list[i];
                if (cand != first && cand != second) candidates[companyId][e.id][cand].eliminated = true;
            }
            _startRound(companyId, e);
            emit RoundAdvanced(companyId, e.round, first, second);
            return;
        }
        e.failedRounds++;
        emit RoundFailed(companyId, round, e.failedRounds);
        if (e.failedRounds >= MAX_FAILED_ROUNDS) {
            _closeElection(companyId);
        } else {
            _startRound(companyId, e);
        }
    }

    function _installGovernor(uint256 companyId, address winner, uint256 winningVotes) internal {
        delete election[companyId];
        termNumber[companyId] += 1;
        companyGovernor[companyId] = winner;
        governorTermEnd[companyId] = block.timestamp + TERM_LENGTH;
        governorOperatingKey[companyId] = address(0); // the new governor must register one
        emit GovernorElected(companyId, winner, winningVotes, governorTermEnd[companyId]);
    }

    /// @notice The governor registers (or replaces) the separate wallet that
    /// signs every governor action this term.
    function setOperatingKey(uint256 companyId, address operatingKey) external {
        require(msg.sender == companyGovernor[companyId], "GOV: not governor");
        require(block.timestamp < governorTermEnd[companyId], "GOV: term expired");
        require(operatingKey != address(0), "GOV: zero address");
        governorOperatingKey[companyId] = operatingKey;
        emit OperatingKeySet(companyId, msg.sender, operatingKey);
    }

    /// @notice Anyone, once a term has run out: records its end and frees
    /// the seat. (openCandidacy does this too.)
    function closeTerm(uint256 companyId) external {
        require(companyGovernor[companyId] != address(0), "GOV: no governor");
        require(block.timestamp >= governorTermEnd[companyId], "GOV: term not over");
        _closeTerm(companyId);
    }

    /// @dev Finding 29: the end time is written once, never overwritten.
    function _closeTerm(uint256 companyId) internal {
        uint256 term = termNumber[companyId];
        if (termEndedAt[companyId][term] == 0) {
            termEndedAt[companyId][term] = governorTermEnd[companyId];
            emit TermClosed(companyId, term, governorTermEnd[companyId]);
        }
        companyGovernor[companyId] = address(0);
        governorOperatingKey[companyId] = address(0);
    }

    // ---------------------------------------------------------------------
    // Recall
    // ---------------------------------------------------------------------

    /// @notice Any shareholder (at the snapshot, one day ago) can start a
    /// recall vote against the sitting governor. One at a time, and a week
    /// apart.
    function openRecall(uint256 companyId) external returns (uint256 recallId) {
        require(governorActive(companyId), "GOV: no governor in office");
        uint256 last = lastRecallId[companyId];
        if (last != 0) {
            Recall storage prev = recalls[companyId][last];
            require(prev.resolved || prev.term != termNumber[companyId], "GOV: recall in progress");
            require(prev.term != termNumber[companyId] || block.timestamp >= prev.voteEnd + RECALL_COOLDOWN, "GOV: recall cooldown");
        }
        uint256 snapshot = block.timestamp - SNAPSHOT_LAG;
        require(shares.shareCountAt(companyId, msg.sender, snapshot) > 0, "GOV: no shares at snapshot");
        recallId = ++lastRecallId[companyId];
        recalls[companyId][recallId] = Recall(termNumber[companyId], snapshot, block.timestamp + RECALL_WINDOW, 0, 0, false);
        emit RecallOpened(companyId, recallId, termNumber[companyId], block.timestamp + RECALL_WINDOW);
    }

    function voteRecall(uint256 companyId, bool remove) external {
        _castRecall(companyId, msg.sender, remove);
    }

    function voteRecallAsCorporation(uint256 fromCompanyId, uint256 toCompanyId, bool remove) external {
        require(msg.sender == governorOperatingKey[fromCompanyId], "GOV: not operating key");
        require(block.timestamp < governorTermEnd[fromCompanyId], "GOV: term expired");
        _castRecall(toCompanyId, shares.corporateHolder(fromCompanyId), remove);
    }

    function _castRecall(uint256 companyId, address voter, bool remove) internal {
        uint256 id = lastRecallId[companyId];
        Recall storage r = recalls[companyId][id];
        require(id != 0 && !r.resolved && block.timestamp < r.voteEnd, "GOV: no recall open");
        require(!recallHasVoted[companyId][id][voter], "GOV: already voted");
        uint256 weight = shares.shareCountAt(companyId, voter, r.snapshot);
        require(weight > 0, "GOV: no shares at snapshot");
        recallHasVoted[companyId][id][voter] = true;
        if (remove) r.yes += weight; else r.no += weight;
        emit RecallVoted(companyId, id, voter, remove, weight);
    }

    function recallPasses(uint256 companyId, uint256 recallId) public view returns (bool) {
        Recall storage r = recalls[companyId][recallId];
        uint256 cast = r.yes + r.no;
        uint256 issued = shares.sharesIssuedAt(companyId, r.snapshot);
        return cast > 0
            && cast * 10_000 >= issued * RECALL_TURNOUT_BPS
            && r.yes * 10_000 >= cast * MAJORITY_BPS;
    }

    /// @notice Permissionless after the recall vote closes. If it passed and
    /// the same term is still running, the term ends now.
    function resolveRecall(uint256 companyId) external {
        uint256 id = lastRecallId[companyId];
        Recall storage r = recalls[companyId][id];
        require(id != 0 && !r.resolved, "GOV: no recall open");
        require(block.timestamp >= r.voteEnd, "GOV: recall vote still open");
        r.resolved = true;
        bool removed = recallPasses(companyId, id) && r.term == termNumber[companyId] && governorActive(companyId);
        if (removed) {
            governorTermEnd[companyId] = block.timestamp;
            _closeTerm(companyId);
        }
        emit RecallResolved(companyId, id, removed);
    }
}
