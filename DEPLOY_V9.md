# Deploy checklist: v9 alongside v8 (14 October 2026)

v9 adds a new, audited set of contracts **next to** v8. Nothing in v8 is
switched off: same INVEST token, same balances, v8 companies keep running
(continuity commitment, `EXPERIMENT_EARLY_TRADABILITY.md` §6a).

| # | Contract | New / kept | What it does |
|---|---|---|---|
| – | InvestToken `0x99ED3761F8416342D814ad4CCAe81993c2Ab7e4a` | **kept** | INVEST and the citizen list |
| 1 | RoundAuctionV9 | new | Share auctions, share NFTs, company capital and income |
| 2 | GovernanceV9 | new | Elections, terms, operating keys, recall |
| 3 | CompanyTreasuryV9 | new | Payments, sales and investments, all by shareholder vote |
| 4 | CompanyDividendsV9 | new | End-of-term dividend / reinvest vote |
| 5 | OpenVerifierV2 | new (replaces OpenVerifier) | Self-verification: normal wallets, 50 per hour |
| 6 | SakartveloTimelock | new | Owner of everything, 48-hour delay |

**Rehearsed:** this exact sequence, with the same read-back checks, runs
clean on a local chain with Arbitrum's limits
(`test/rehearse-v9-deploy.mjs`).

**Golden rule (unchanged):** after every transaction, read the value back
and compare. A green receipt is not proof. Check MetaMask says
**Arbitrum One** and the receipt has a real block number (not 1, 2, 3 —
that's the Remix VM).

Write each address down as you go:

| | Address | Block |
|---|---|---|
| RA9 (RoundAuctionV9) | | |
| GOV9 (GovernanceV9) | | |
| CT9 (CompanyTreasuryV9) | | |
| DV9 (CompanyDividendsV9) | | |
| OV2 (OpenVerifierV2) | | |
| TL (SakartveloTimelock) | | |

---

## Part 0 — Before you start

1. The early-tradability experiment is closed (see the 14 October
   amendment in `EXPERIMENT_EARLY_TRADABILITY.md`).
2. In **v8**, switch USDC off on CompanyTreasury so Finding 23 (a governor
   selling company INVEST for USDC without a vote) can't be used on v8:
   load CompanyTreasury `0xaD50c4726E78a8e8a18a1A188bd60E7ef0A501e8` with
   At Address, click **setApprovedPaymentToken** with
   `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, `false`. Read back:
   **approvedPaymentTokens**(that address) = false.
3. About 0.003 ETH on Arbitrum in your wallet for gas (6 deploys, about
   25 setup transactions).
4. Have the company list below open. **List every company in Part 3,
   before Part 4**: after the timelock takes over, each listing waits 48
   hours.

## Part 1 — Compile in Remix (once)

1. Open remix.ethereum.org. In **File explorer**, create a folder `v9` and
   upload from the repo's `contracts/` folder: `RoundAuctionV9.sol`,
   `GovernanceV9.sol`, `CompanyTreasuryV9.sol`, `CompanyDividendsV9.sol`,
   `OpenVerifierV2.sol`, `SakartveloTimelock.sol`.
2. **Solidity compiler** tab:
   - Compiler: **0.8.34**
   - Click **Advanced Configurations**: EVM version **cancun**, tick
     **Enable optimization**, runs **200**, and in the JSON config set
     `"viaIR": true` (same settings as v8).
3. Compile each of the six files. Each must compile with no red errors.

## Part 2 — Deploy (6 transactions)

**Deploy & run** tab → Environment **Injected Provider - MetaMask** →
confirm the account is your owner wallet `0xD9fb…2de0` and the network is
Arbitrum One (chain 42161).

| Step | Contract | Constructor input |
|---|---|---|
| 2.1 | RoundAuctionV9 | `_investToken` = `0x99ED3761F8416342D814ad4CCAe81993c2Ab7e4a` |
| 2.2 | GovernanceV9 | `_shares` = RA9 |
| 2.3 | CompanyTreasuryV9 | `_investToken` = InvestToken, `_roundAuction` = RA9, `_governance` = GOV9 |
| 2.4 | CompanyDividendsV9 | same three as 2.3 |
| 2.5 | OpenVerifierV2 | `_investToken` = InvestToken, `_guardian` = your wallet |
| 2.6 | SakartveloTimelock | `projectWallet` = your wallet |

After each: copy the address from **Deployed Contracts**, write it in the
table, and open it — check the function list shows the new functions
(e.g. RA9 has **placeCorporateBid**, **corporateCompanyPlusOne**; CT9 has
**proposeInvest**). That proves Remix didn't deploy stale code.

## Part 3 — Wire it up (while you still own everything)

On **RA9**:

| Step | Click | Input | Read back |
|---|---|---|---|
| 3.1 | setGovernance | GOV9 | **governance** = GOV9 |
| 3.2 | setTreasury | CT9 | **treasury** = CT9 |
| 3.3 | setDividends | DV9 | **dividends** = DV9 |
| 3.4 | listCompany, once per company in the table below | id, name, totalShares, 3600 | **companies**(id) shows the name and share count |

Each of 3.1–3.3 can be set **once only**. Double-check the address before
you click.

**Companies for step 3.4** (round length 3600 seconds = 1 hour for all).
Type the name exactly as written: the site shows the Georgian name by
matching it.

| id | name | totalShares | tier |
|---|---|---|---|
| 0 | Bolnisi Gold Mines | 3000 | 3,000 |
| 1 | Georgian Railway | 6000 | 6,000 |
| 2 | Enguri Hydropower Plant | 6000 | 6,000 |
| 3 | Batumi Sea Port | 6000 | 6,000 |
| 4 | Sakartvelo Land Fund | 3000 | 3,000 |
| 5 | Tkibuli Coal Basin | 1000 | 1,000 |
| 6 | Racha Marble Works | 1000 | 1,000 |
| 7 | National Forest Fund | 1000 | 1,000 |
| 8 | Chiatura Manganese Concern | 3000 | 3,000 |
| 9 | Zestafoni Ferroalloys Plant | 3000 | 3,000 |
| 10 | Anaklia Deep Sea Port | 6000 | 6,000 |
| 11 | Georgian Stock Exchange | 12000 | 12,000 |

v9 sells at most 150 shares a round, so a 1,000-share company needs at
least 4 rounds with enough demand to reach 50% and open an election;
12,000 shares needs at least 40.

On **InvestToken** (load it with **At Address**
`0x99ED3761F8416342D814ad4CCAe81993c2Ab7e4a`, using the v8 InvestToken
ABI):

| Step | Click | Input | Read back |
|---|---|---|---|
| 3.5 | setAuthorizedSink | RA9, `true` | **authorizedSink**(RA9) = true |
| 3.6 | setAuthorizedSink | CT9, `true` | **authorizedSink**(CT9) = true |
| 3.7 | setAuthorizedSink | DV9, `true` | **authorizedSink**(DV9) = true |
| 3.8 | setVerifier | OV2, `true` | **verifier**(OV2) = true |
| 3.9 | setVerifier | old OpenVerifier `0x444653dDbBb24B24bcD8D674e30b371800Cc2ad2`, `false` | **verifier**(old) = false |

**Do NOT touch** (each would break something for everyone):

- **setRoundAuctionForTradability** — must keep pointing at the **v8**
  RoundAuction `0x9739…b796`. RA9 has no tradability switch; pointing
  InvestToken at it would make every INVEST transfer fail.
- **setAuctionHouse** — leave unset; setting it would block all claims.
- The v8 sinks (v8 RoundAuction and CompanyTreasury) stay **true**
  forever.
- **renounceOwnership** on anything — never.

Optional on **CT9**: **setApprovedToken**(USDC, `true`) if companies
should be able to hold and be paid in USDC. In v9 this is safe: there is
no fixed-price market, every sale is a voted auction.

## Part 4 — Hand ownership to the timelock (3 transactions)

| Step | Contract | Click | Input | Read back |
|---|---|---|---|---|
| 4.1 | RA9 | transferOwnership | TL | **owner** = TL |
| 4.2 | CT9 | transferOwnership | TL | **owner** = TL |
| 4.3 | InvestToken | transferOwnership | TL | **owner** = TL |

GOV9 and DV9 have no owner at all. OV2's guardian (your wallet) can only
pause and unpause new verifications — that stays with you as the
emergency switch.

From now on every owner action (listing a company, approving a token,
changing the citizen limit) takes **48 hours** and is visible on-chain in
advance. v8's RoundAuction and CompanyTreasury stay owned by your wallet;
moving them to the timelock too is optional (decide separately).

## Part 5 — Using the timelock later (example: list a new company)

1. In Remix, open RA9, fill in **listCompany** but **don't click it**:
   click the small **copy calldata** icon next to it instead.
2. Open TL. Click **schedule** with:
   `target` = RA9, `value` = 0, `data` = (paste), `predecessor` =
   `0x0000000000000000000000000000000000000000000000000000000000000000`,
   `salt` = the same zeros (or any new 32-byte value if you repeat an
   identical call), `delay` = `172800`.
3. After 48 hours, click **execute** on TL with the same five values
   (no delay). Read the result back on RA9.

## Part 6 — Site and announcement

1. **Send Claude the six addresses** from your table (RA9, GOV9, CT9, DV9,
   OV2, TL). They go into the site's settings, the pull request is
   updated, and you merge it on GitHub (green **Merge** button). Vercel
   publishes the site within a few minutes.
2. Open www.sakartvelo-exchange.com and check: the register lists the 12
   companies; the footer shows "Version 9 contracts" with your addresses;
   /v8 still shows the version 8 companies.
3. **Verify** all six contracts on Arbiscan, same compiler settings as
   Part 1 (Remix's Contract Verification plugin, as for v8).
4. Announce with the v9 rules in plain words (the site's Rules page) and
   the audit record (`SECURITY_REVIEW.md`). Moving to v9 is each holder's
   own choice; v8 stays.

The host (who receives the 1% fees) is the deploying wallet. Change it
later, if ever, with **setHost** through the timelock.
