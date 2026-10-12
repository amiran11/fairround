// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Token whose transfers to one blocked address revert (like a USDC blacklist).
contract BlockingToken is ERC20 {
    address public blocked;
    constructor() ERC20("BLK", "BLK") {}
    function mint(address to, uint256 amt) external { _mint(to, amt); }
    function setBlocked(address a) external { blocked = a; }
    function _update(address from, address to, uint256 value) internal override {
        require(to != blocked, "BLK: blocked");
        super._update(from, to, value);
    }
}

interface IOV2 { function verifySelf() external; }

/// A contract trying to verify itself (a claim factory).
contract VerifyFactory {
    function tryVerify(address ov) external { IOV2(ov).verifySelf(); }
    receive() external payable {}
}
