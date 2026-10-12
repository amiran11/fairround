// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice The parts of InvestToken this verifier uses.
interface IInvestTokenVerify {
    function verifiedCitizen(address account) external view returns (bool);
    function claimed(address account) external view returns (bool);
    function setVerifiedCitizen(address citizen, bool verified) external;
}

/// @title OpenVerifierV2
/// @notice Interim self-verification for INVEST claims, replacing
/// OpenVerifier (SECURITY_REVIEW.md Finding 32). Still NOT proof of
/// personhood — it only raises the cost of farming:
///   - ordinary wallets only: a contract can't verify (no factory that
///     verifies and claims for thousands of addresses in one transaction);
///   - the wallet must hold at least 0.0083 ETH (checked, not spent);
///   - at most DAILY_CAP new citizens per UTC day, so a farm is slow and
///     visible on-chain while it happens;
///   - a wallet already verified or already claimed doesn't use up the cap.
/// The guardian can only pause and unpause new verifications — it has no
/// other power. (InvestToken's owner sits behind a 48-hour timelock, so an
/// emergency stop needs to live here.)
///
/// FICTIONAL SIMULATION. Not a real financial product, security, or claim
/// on any real-world asset.
contract OpenVerifierV2 {
    IInvestTokenVerify public immutable investToken;
    address public immutable guardian;

    uint256 public constant MIN_BALANCE = 0.0083 ether;
    uint256 public constant DAILY_CAP = 200;

    bool public paused;
    mapping(uint256 => uint256) public verifiedOnDay; // day number => count

    event SelfVerified(address indexed citizen, uint256 indexed day);
    event PausedSet(bool paused);

    constructor(address _investToken, address _guardian) {
        require(_investToken != address(0) && _guardian != address(0), "OV2: zero address");
        investToken = IInvestTokenVerify(_investToken);
        guardian = _guardian;
    }

    function today() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function remainingToday() external view returns (uint256) {
        uint256 used = verifiedOnDay[today()];
        return used >= DAILY_CAP ? 0 : DAILY_CAP - used;
    }

    function verifySelf() external {
        require(!paused, "OV2: paused");
        require(msg.sender == tx.origin, "OV2: ordinary wallets only");
        require(msg.sender.balance >= MIN_BALANCE, "OV2: insufficient ETH balance");
        require(!investToken.verifiedCitizen(msg.sender), "OV2: already verified");
        require(!investToken.claimed(msg.sender), "OV2: already claimed");
        uint256 day = today();
        require(verifiedOnDay[day] < DAILY_CAP, "OV2: daily limit reached, try tomorrow");
        verifiedOnDay[day]++;
        investToken.setVerifiedCitizen(msg.sender, true);
        emit SelfVerified(msg.sender, day);
    }

    function setPaused(bool _paused) external {
        require(msg.sender == guardian, "OV2: not guardian");
        paused = _paused;
        emit PausedSet(_paused);
    }
}
