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
///   - at most HOURLY_CAP new citizens per hour (240 a day), so a farm is
///     slow and visible on-chain while it happens, and can't grab a whole
///     day's places at midnight (v9 audit CT-8);
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
    uint256 public constant HOURLY_CAP = 10;

    bool public paused;
    mapping(uint256 => uint256) public verifiedInHour; // hour number => count

    event SelfVerified(address indexed citizen, uint256 indexed hour);
    event PausedSet(bool paused);

    constructor(address _investToken, address _guardian) {
        require(_investToken != address(0) && _guardian != address(0), "OV2: zero address");
        investToken = IInvestTokenVerify(_investToken);
        guardian = _guardian;
    }

    function currentHour() public view returns (uint256) {
        return block.timestamp / 1 hours;
    }

    function remainingThisHour() external view returns (uint256) {
        uint256 used = verifiedInHour[currentHour()];
        return used >= HOURLY_CAP ? 0 : HOURLY_CAP - used;
    }

    function verifySelf() external {
        require(!paused, "OV2: paused");
        require(msg.sender == tx.origin, "OV2: ordinary wallets only");
        require(msg.sender.balance >= MIN_BALANCE, "OV2: insufficient ETH balance");
        require(!investToken.verifiedCitizen(msg.sender), "OV2: already verified");
        require(!investToken.claimed(msg.sender), "OV2: already claimed");
        uint256 hour = currentHour();
        require(verifiedInHour[hour] < HOURLY_CAP, "OV2: limit for this hour reached, try next hour");
        verifiedInHour[hour]++;
        investToken.setVerifiedCitizen(msg.sender, true);
        emit SelfVerified(msg.sender, hour);
    }

    function setPaused(bool _paused) external {
        require(msg.sender == guardian, "OV2: not guardian");
        paused = _paused;
        emit PausedSet(_paused);
    }
}
