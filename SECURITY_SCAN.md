# Automated security scan — 29 October 2026

Three free automated tools were run on the FairRound contracts that matter on mainnet (InvestToken,
RoundAuctionV9, GovernanceV9, CompanyTreasuryV9, CompanyDividendsV9, OpenVerifierV2,
FairRoundTimelock) and on the new VotedUnrig (vUNRIG), compiled as deployed (solc 0.8.34, viaIR,
optimizer 200, cancun).

**Result: no real vulnerability found.** Every high or medium finding was checked by hand against
the code; all are known false positives or deliberate design. This is not a substitute for a human
audit: these tools catch common bug classes, not logic errors in the rules themselves.

| Tool | What it does | Scope | Result |
|---|---|---|---|
| Slither 0.11 (Trail of Bits) | static analysis, ~90 detectors | all 8 contracts | 0 real issues (triage below) |
| Aderyn (Cyfrin) | static analysis | all 8 contracts | 0 real issues (triage below) |
| Mythril 0.24.8 (Consensys) | symbolic execution: tries to reach bad states | VotedUnrig, OpenVerifierV2, InvestToken | VotedUnrig and InvestToken: no issues detected; OpenVerifierV2: 7 low notes, all intended (below) |

## Triage of what the tools flagged

| Finding | Where | Verdict | Why |
|---|---|---|---|
| "Uninitialized state" (Slither, high) | `GovernanceV9.ballot`, `RoundAuctionV9.activeBids` | False positive | Both are mappings of arrays; they start empty by design and are filled with `push`. |
| "Uninitialized local variables" | `GovernanceV9.tallyRound` (`first`, `second`, counts) | False positive | Solidity sets them to zero; the loop then fills them. |
| Reentrancy (Slither medium/low, Aderyn high) | Treasury, Dividends, Governance, Verifier, vUNRIG | Not exploitable | Every flagged external call goes to FairRound's own contracts or to UNRIG (no transfer hooks); the state-changing entry points are `nonReentrant`; treasury tokens other than UNRIG can only be added by the timelocked owner. |
| Divide before multiply | `CompanyDividendsV9.resolvePolicyVote` | Accepted | Rounding loss is at most a few wei per term; the remainder stays in the listing. |
| Strict equality | Treasury `_pull`, `_credit`; Governance; RoundAuction bit check | Intended | `_pull` deliberately rejects fee-on-transfer tokens; the others compare exact states or zero. |
| Unused return values | many `companies(...)` / `auctions(...)` reads | False positive | Only the needed fields of a multi-value getter are read. |
| Block timestamp | everywhere | Intended | Rounds, votes, locks and the hourly cap are time-based by design; a validator can shift time by seconds, not hours. |
| `abi.encodePacked` hash collision (Aderyn, high) | `RoundAuctionV9.tokenURI` | False positive | Used only to build the unit's picture and text, never hashed. |
| "Storage array edited with memory" (Aderyn, high) | `RoundAuctionV9._addBid` | False positive | The bid list is a `storage` reference; edits persist. |
| Unsafe integer casting (Aderyn, high) | timestamps cast to `uint48` | Safe | `uint48` seconds last until the year 8.9 million. |
| External calls in a loop | `RoundAuctionV9.settleRound` refunds | Bounded | At most 100 bids per listing; tested within Arbitrum's gas limit. |
| `tx.origin` used (Mythril, low, 5 notes) | `OpenVerifierV2.verifySelf` | Intended | `msg.sender == tx.origin` is the deliberate "ordinary wallets only" rule that stops claim factories (contracts verifying many wallets in one go). It is not used as authorization for anything else. |
| Call to a caller-supplied address / several calls in one transaction (Mythril, low) | `OpenVerifierV2.verifySelf` | False positive | The only callee is InvestToken, fixed at deployment; Mythril treats constructor inputs as attacker-controlled. |
| Centralization risk (Aderyn, low) | owner functions | Known, disclosed | Owner is the 48-hour timelock; powers are listed in SECURITY_REVIEW.md. |

## Not covered by these tools

- Whether the rules are economically sound (capture by many wallets, bot behaviour): that is what
  the field experiment tests.
- Mythril on the large contracts (RoundAuctionV9, GovernanceV9, CompanyTreasuryV9) times out at
  this depth; they are covered by the existing test suites and SECURITY_REVIEW.md.
- A human audit is still needed before real value sits in the system.
