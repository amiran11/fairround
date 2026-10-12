// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title SakartveloTimelock
/// @notice Owner of InvestToken and every v9 contract. Every owner action
/// (listing a company, approving a token, changing the verifier...) is
/// scheduled publicly and can only run after MIN_DELAY. Anyone watching
/// the chain sees it 48 hours in advance.
///
/// Deployed with: proposers = executors = cancellers = [project wallet],
/// admin = address(0), so the timelock administers itself and the delay
/// can only change through the timelock.
contract SakartveloTimelock is TimelockController {
    uint256 public constant MIN_DELAY = 48 hours;

    constructor(address projectWallet)
        TimelockController(MIN_DELAY, _one(projectWallet), _one(projectWallet), address(0))
    {}

    function _one(address a) private pure returns (address[] memory arr) {
        require(a != address(0), "TL: zero address");
        arr = new address[](1);
        arr[0] = a;
    }
}
