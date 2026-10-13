// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice The parts of RoundAuctionV9 that Governance reads.
interface IShareRegistryV9 {
    function companies(uint256 companyId) external view returns (
        string memory name, uint256 totalShares, uint256 sharesIssued, uint256 currentRound,
        uint256 roundEnd, uint256 roundDuration, bool finalized, uint256 firstMintedAt, uint256 capital
    );
    function votingWeight(uint256 companyId, address holder, uint256 snapshot) external view returns (uint256);
    function sharesIssuedAt(uint256 companyId, uint256 ts) external view returns (uint256);
    function corporateSharesAt(uint256 companyId, uint256 ts) external view returns (uint256);
    function corporateHolder(uint256 companyId) external pure returns (address);
}

/// @title GovernanceV9
/// @notice Per-company elections, governor terms, operating keys and recall.
/// Rebuilt from v8 after the audit in SECURITY_REVIEW.md (Findings 27, 28,
/// 29, 34) and revised after the independent audit of v9 (GOV-1..GOV-9).
///
/// Vote weight everywhere = min(shares held at the snapshot, shares held
/// now). The snapshot is one day before the election or recall opened.
/// Shares borrowed for the snapshot and handed back weigh nothing; the same
/// share can never weigh twice.
///
/// "Electorate" = shares issued at the snapshot minus shares held by
/// companies (those vote only through their own governor, may have none,
/// and must not be able to freeze a company by sitting out).
///
/// An election:
///   1. Once at least 50% of a company's shares are issued and it has no
///      sitting governor, anyone opens a 5-day CANDIDACY PERIOD.
///   2. Any holder of at least 0.1% of the electorate declares candidacy
///      with a program. Every holder can NOMINATE one candidate with their
///      weight (declaring nominates yourself). The ballot is the 20
///      candidates with the most nomination weight, so a majority can always
///      put its candidate on it however many puppets a whale registers.
///   3. Voting opens only after the candidacy period. A voter may vote for a
///      candidate or AGAINST ALL (candidate = address(0)).
///   4. A winner needs 20% of the electorate AND either 51% of votes cast,
///      or (two or fewer candidates left) more votes than the runner-up and
///      more than "against all". With more candidates, no 51%, and turnout
///      of at least 20%, the top two go to a runoff. Ties go to the earlier
///      declaration.
///   5. A round with no winner and no runoff fails. Two failed rounds close
///      the election; anyone can open a fresh candidacy period.
///
/// A term lasts 30 days. Its end is recorded once, never overwritten.
/// RECALL: a holder of at least 1% of the electorate opens it; it passes
/// with 51% of votes cast and turnout of 33% of the electorate. Only a
/// recall that reached turnout starts the 7-day cooldown.
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
    uint256 public constant WIN_QUORUM_BPS = 2000;    // 20% of the electorate
    uint256 public constant MAX_CANDIDATES = 20;      // on the ballot
    uint256 public constant MIN_CANDIDATE_STAKE_BPS = 10; // 0.1%
    uint256 public constant MAX_FAILED_ROUNDS = 2;
    uint256 public constant RECALL_WINDOW = 3 days;
    uint256 public constant RECALL_TURNOUT_BPS = 3300; // 33% of the electorate
    uint256 public constant RECALL_OPEN_BPS = 100;     // 1% to open a recall
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
    uint256 internal nextDeclarationSeq;

    struct Candidate {
        string program;
        uint256 support;   // nomination weight
        uint256 seq;       // declaration order, for tie-breaks
        bool registered;
        bool onBallot;
        bool eliminated;
    }
    mapping(uint256 => mapping(uint256 => mapping(address => Candidate))) public candidates; // company => election => wallet
    mapping(uint256 => mapping(uint256 => address[])) internal ballot;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasNominated;

    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public roundVotes; // address(0) = against all
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public roundHasVoted;
    mapping(uint256 => mapping(uint256 => uint256)) public roundTotalVotesCast;

    mapping(uint256 => address) public companyGovernor;
    mapping(uint256 => uint256) public governorTermEnd;
    mapping(uint256 => uint256) public termNumber;
    mapping(uint256 => address) public governorOperatingKey;
    mapping(uint256 => address) public pendingOperatingKey;
    mapping(uint256 => mapping(uint256 => uint256)) public termEndedAt;     // written once per term
    mapping(uint256 => mapping(uint256 => address)) public termGovernor;    // who governed each term

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
    event CandidateDeclared(uint256 indexed companyId, uint256 indexed electionId, address indexed candidate, string program);
    event Nominated(uint256 indexed companyId, uint256 indexed electionId, address indexed nominator, address candidate, uint256 weight);
    event BallotChanged(uint256 indexed companyId, uint256 indexed electionId, address added, address removed);
    event CandidateWithdrawn(uint256 indexed companyId, uint256 indexed electionId, address indexed candidate);
    event VotingOpened(uint256 indexed companyId, uint256 indexed round, uint256 voteEnd);
    event Voted(uint256 indexed companyId, uint256 indexed round, address indexed voter, address candidate, uint256 weight);
    event RoundAdvanced(uint256 indexed companyId, uint256 newRound, address firstPlace, address secondPlace);
    event RoundFailed(uint256 indexed companyId, uint256 indexed round, uint256 failedRounds);
    event ElectionClosed(uint256 indexed companyId, uint256 indexed electionId);
    event GovernorElected(uint256 indexed companyId, address indexed governor, uint256 winningVotes, uint256 termEnd);
    event TermClosed(uint256 indexed companyId, uint256 indexed term, uint256 endedAt);
    event OperatingKeyProposed(uint256 indexed companyId, address indexed governor, address indexed operatingKey);
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
        return ballot[companyId][election[companyId].id].length;
    }

    function getCandidates(uint256 companyId) external view returns (address[] memory) {
        return ballot[companyId][election[companyId].id];
    }

    function governorActive(uint256 companyId) public view returns (bool) {
        return companyGovernor[companyId] != address(0) && block.timestamp < governorTermEnd[companyId];
    }

    /// @notice Shares that count in quorum denominators at `snapshot`.
    function electorate(uint256 companyId, uint256 snapshot) public view returns (uint256) {
        return shares.sharesIssuedAt(companyId, snapshot) - shares.corporateSharesAt(companyId, snapshot);
    }

    // ---------------------------------------------------------------------
    // Candidacy and nomination
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

    function _candidacyOpen(Election storage e) internal view {
        require(e.id != 0 && e.round == 0 && block.timestamp < e.candidacyEnd, "GOV: candidacy not open");
    }

    /// @notice Declare candidacy; your own weight nominates you.
    function declareCandidacy(uint256 companyId, string calldata program) external {
        Election storage e = election[companyId];
        _candidacyOpen(e);
        require(bytes(program).length <= MAX_PROGRAM_BYTES, "GOV: program too long");
        Candidate storage me = candidates[companyId][e.id][msg.sender];
        require(!me.registered && me.seq == 0, "GOV: already declared");
        uint256 stake = shares.votingWeight(companyId, msg.sender, e.snapshot);
        require(stake > 0, "GOV: no shares at snapshot");
        require(stake * 10_000 >= electorate(companyId, e.snapshot) * MIN_CANDIDATE_STAKE_BPS, "GOV: stake below 0.1%");
        require(!hasNominated[companyId][e.id][msg.sender], "GOV: already nominated someone");
        me.program = program;
        me.registered = true;
        me.seq = ++nextDeclarationSeq;
        emit CandidateDeclared(companyId, e.id, msg.sender, program);
        _nominate(companyId, e, msg.sender, msg.sender, stake);
    }

    /// @notice Back a declared candidate with your weight (once per election).
    function nominate(uint256 companyId, address candidate) external {
        Election storage e = election[companyId];
        _candidacyOpen(e);
        uint256 weight = shares.votingWeight(companyId, msg.sender, e.snapshot);
        require(weight > 0, "GOV: no shares at snapshot");
        _nominate(companyId, e, msg.sender, candidate, weight);
    }

    function nominateAsCorporation(uint256 fromCompanyId, uint256 toCompanyId, address candidate) external {
        _requireCorporateVoter(fromCompanyId, toCompanyId);
        Election storage e = election[toCompanyId];
        _candidacyOpen(e);
        address corp = shares.corporateHolder(fromCompanyId);
        uint256 weight = shares.votingWeight(toCompanyId, corp, e.snapshot);
        require(weight > 0, "GOV: no shares at snapshot");
        _nominate(toCompanyId, e, corp, candidate, weight);
    }

    function _nominate(uint256 companyId, Election storage e, address nominator, address candidate, uint256 weight) internal {
        require(!hasNominated[companyId][e.id][nominator], "GOV: already nominated");
        Candidate storage cand = candidates[companyId][e.id][candidate];
        require(cand.registered, "GOV: not a candidate");
        hasNominated[companyId][e.id][nominator] = true;
        cand.support += weight;
        emit Nominated(companyId, e.id, nominator, candidate, weight);
        if (cand.onBallot) return;
        address[] storage list = ballot[companyId][e.id];
        if (list.length < MAX_CANDIDATES) {
            list.push(candidate);
            cand.onBallot = true;
            emit BallotChanged(companyId, e.id, candidate, address(0));
            return;
        }
        // Full ballot: replace the least-supported (latest declared on ties).
        uint256 lowIdx = 0;
        Candidate storage low = candidates[companyId][e.id][list[0]];
        for (uint256 i = 1; i < list.length; i++) {
            Candidate storage x = candidates[companyId][e.id][list[i]];
            if (x.support < low.support || (x.support == low.support && x.seq > low.seq)) { lowIdx = i; low = x; }
        }
        if (cand.support > low.support) {
            address out = list[lowIdx];
            low.onBallot = false;
            list[lowIdx] = candidate;
            cand.onBallot = true;
            emit BallotChanged(companyId, e.id, candidate, out);
        }
    }

    function withdrawCandidacy(uint256 companyId) external {
        Election storage e = election[companyId];
        _candidacyOpen(e);
        Candidate storage me = candidates[companyId][e.id][msg.sender];
        require(me.registered, "GOV: not a candidate");
        me.registered = false;
        if (me.onBallot) {
            me.onBallot = false;
            address[] storage list = ballot[companyId][e.id];
            for (uint256 i = 0; i < list.length; i++) {
                if (list[i] == msg.sender) {
                    list[i] = list[list.length - 1];
                    list.pop();
                    break;
                }
            }
            emit BallotChanged(companyId, e.id, address(0), msg.sender);
        }
        emit CandidateWithdrawn(companyId, e.id, msg.sender);
    }

    /// @notice Anyone, once the candidacy period is over. With an empty
    /// ballot the election simply closes.
    function openVoting(uint256 companyId) external {
        Election storage e = election[companyId];
        require(e.id != 0 && e.round == 0, "GOV: no candidacy period");
        require(block.timestamp >= e.candidacyEnd, "GOV: candidacy period not over");
        if (ballot[companyId][e.id].length == 0) {
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

    /// @param candidate a candidate on the ballot, or address(0) = against all.
    function vote(uint256 companyId, address candidate) external {
        _castVote(companyId, msg.sender, candidate);
    }

    function voteAsCorporation(uint256 fromCompanyId, uint256 toCompanyId, address candidate) external {
        _requireCorporateVoter(fromCompanyId, toCompanyId);
        _castVote(toCompanyId, shares.corporateHolder(fromCompanyId), candidate);
    }

    function _requireCorporateVoter(uint256 fromCompanyId, uint256 toCompanyId) internal view {
        require(fromCompanyId != toCompanyId, "GOV: same company");
        require(msg.sender == governorOperatingKey[fromCompanyId], "GOV: not operating key");
        require(block.timestamp < governorTermEnd[fromCompanyId], "GOV: term expired");
    }

    function _castVote(uint256 companyId, address voter, address candidate) internal {
        Election storage e = election[companyId];
        uint256 round = e.round;
        require(e.id != 0 && round != 0, "GOV: voting not open");
        require(block.timestamp < e.voteEnd, "GOV: voting closed");
        if (candidate != address(0)) {
            Candidate storage cand = candidates[companyId][e.id][candidate];
            require(cand.onBallot && !cand.eliminated, "GOV: not on the ballot");
        }
        require(!roundHasVoted[companyId][round][voter], "GOV: already voted");
        uint256 weight = shares.votingWeight(companyId, voter, e.snapshot);
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

        address[] storage list = ballot[companyId][e.id];
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
            if (v == 0) continue;
            if (_ahead(companyId, e.id, v, cand, firstVotes, first)) {
                second = first; secondVotes = firstVotes;
                first = cand; firstVotes = v;
            } else if (_ahead(companyId, e.id, v, cand, secondVotes, second)) {
                second = cand; secondVotes = v;
            }
        }

        uint256 totalCast = roundTotalVotesCast[companyId][round];
        uint256 against = roundVotes[companyId][round][address(0)];
        uint256 quorumVotes = electorate(companyId, e.snapshot) * WIN_QUORUM_BPS;
        bool winnerQuorum = firstVotes > 0 && firstVotes * 10_000 >= quorumVotes;
        bool majority = firstVotes * 10_000 >= totalCast * MAJORITY_BPS;
        bool plurality = remaining <= 2 && firstVotes > secondVotes && firstVotes > against;

        if (winnerQuorum && (majority || plurality)) {
            _installGovernor(companyId, first, firstVotes);
            return;
        }
        if (remaining > 2 && secondVotes > 0 && totalCast * 10_000 >= quorumVotes) {
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

    /// @dev More votes, or equal votes and declared earlier.
    function _ahead(uint256 companyId, uint256 eid, uint256 v, address cand, uint256 otherVotes, address other) internal view returns (bool) {
        if (v != otherVotes) return v > otherVotes;
        if (other == address(0)) return true;
        return candidates[companyId][eid][cand].seq < candidates[companyId][eid][other].seq;
    }

    function _installGovernor(uint256 companyId, address winner, uint256 winningVotes) internal {
        delete election[companyId];
        uint256 term = ++termNumber[companyId];
        termGovernor[companyId][term] = winner;
        companyGovernor[companyId] = winner;
        governorTermEnd[companyId] = block.timestamp + TERM_LENGTH;
        governorOperatingKey[companyId] = address(0); // the new governor must register one
        pendingOperatingKey[companyId] = address(0);
        emit GovernorElected(companyId, winner, winningVotes, governorTermEnd[companyId]);
    }

    /// @notice Step 1: the governor names the separate wallet that will sign
    /// governor actions. Step 2: that wallet accepts. Nobody can be made an
    /// operating key without agreeing (v9 audit CT-5).
    function setOperatingKey(uint256 companyId, address operatingKey) external {
        require(msg.sender == companyGovernor[companyId], "GOV: not governor");
        require(block.timestamp < governorTermEnd[companyId], "GOV: term expired");
        require(operatingKey != address(0), "GOV: zero address");
        pendingOperatingKey[companyId] = operatingKey;
        emit OperatingKeyProposed(companyId, msg.sender, operatingKey);
    }

    function acceptOperatingKey(uint256 companyId) external {
        require(msg.sender == pendingOperatingKey[companyId], "GOV: not the proposed key");
        require(governorActive(companyId), "GOV: term expired");
        pendingOperatingKey[companyId] = address(0);
        governorOperatingKey[companyId] = msg.sender;
        emit OperatingKeySet(companyId, companyGovernor[companyId], msg.sender);
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
        pendingOperatingKey[companyId] = address(0);
    }

    // ---------------------------------------------------------------------
    // Recall
    // ---------------------------------------------------------------------

    function openRecall(uint256 companyId) external returns (uint256 recallId) {
        require(governorActive(companyId), "GOV: no governor in office");
        uint256 term = termNumber[companyId];
        uint256 last = lastRecallId[companyId];
        if (last != 0) {
            Recall storage prev = recalls[companyId][last];
            if (prev.term == term) {
                require(prev.resolved || block.timestamp >= prev.voteEnd, "GOV: recall in progress");
                if (_turnoutReached(companyId, prev)) {
                    require(block.timestamp >= prev.voteEnd + RECALL_COOLDOWN, "GOV: recall cooldown");
                }
            }
        }
        uint256 snapshot = block.timestamp - SNAPSHOT_LAG;
        uint256 weight = shares.votingWeight(companyId, msg.sender, snapshot);
        require(weight > 0 && weight * 10_000 >= electorate(companyId, snapshot) * RECALL_OPEN_BPS, "GOV: need 1% to open a recall");
        recallId = ++lastRecallId[companyId];
        recalls[companyId][recallId] = Recall(term, snapshot, block.timestamp + RECALL_WINDOW, 0, 0, false);
        emit RecallOpened(companyId, recallId, term, block.timestamp + RECALL_WINDOW);
    }

    function voteRecall(uint256 companyId, bool remove) external {
        _castRecall(companyId, msg.sender, remove);
    }

    function voteRecallAsCorporation(uint256 fromCompanyId, uint256 toCompanyId, bool remove) external {
        _requireCorporateVoter(fromCompanyId, toCompanyId);
        _castRecall(toCompanyId, shares.corporateHolder(fromCompanyId), remove);
    }

    function _castRecall(uint256 companyId, address voter, bool remove) internal {
        uint256 id = lastRecallId[companyId];
        Recall storage r = recalls[companyId][id];
        require(id != 0 && !r.resolved && block.timestamp < r.voteEnd, "GOV: no recall open");
        require(!recallHasVoted[companyId][id][voter], "GOV: already voted");
        uint256 weight = shares.votingWeight(companyId, voter, r.snapshot);
        require(weight > 0, "GOV: no shares at snapshot");
        recallHasVoted[companyId][id][voter] = true;
        if (remove) r.yes += weight; else r.no += weight;
        emit RecallVoted(companyId, id, voter, remove, weight);
    }

    function _turnoutReached(uint256 companyId, Recall storage r) internal view returns (bool) {
        uint256 cast = r.yes + r.no;
        return cast > 0 && cast * 10_000 >= electorate(companyId, r.snapshot) * RECALL_TURNOUT_BPS;
    }

    function recallPasses(uint256 companyId, uint256 recallId) public view returns (bool) {
        Recall storage r = recalls[companyId][recallId];
        return _turnoutReached(companyId, r) && r.yes * 10_000 >= (r.yes + r.no) * MAJORITY_BPS;
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
