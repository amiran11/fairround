// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title TradabilityLock
/// @notice Stand-in "tradability switch" for InvestToken.
/// InvestToken asks roundAuctionForTradability.globalTradabilityUnlocked()
/// before every transfer. Pointing it here (InvestToken.setRoundAuctionForTradability)
/// re-closes the loop: INVEST can again only move into/out of the auction
/// house and authorized sinks. The owner can reopen trading later with
/// setUnlocked(true) — no redeploy needed.
contract TradabilityLock is Ownable {
    bool public globalTradabilityUnlocked; // starts false = locked

    event TradabilitySet(bool unlocked);

    constructor() Ownable(msg.sender) {}

    function setUnlocked(bool unlocked) external onlyOwner {
        globalTradabilityUnlocked = unlocked;
        emit TradabilitySet(unlocked);
    }
}
