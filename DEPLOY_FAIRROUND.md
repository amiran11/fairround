# Deploy checklist: FairRound, fresh, on Arbitrum One and Robinhood Chain

Saturday plan: run this whole checklist **twice**, first on **Arbitrum One**,
then on **Robinhood Chain**. Same contracts, same steps, same values; only
the network in MetaMask changes. About 2 hours each with Claude guiding.

The code is the audited v9 code with FairRound names written on-chain
(unit NFTs "FairRound Unit" / FRUNIT, test credits "Unrig" / UNRIG, the timelock "FairRoundTimelock"). **Tested:** 134 contract tests
and this exact sequence (`test/rehearse-fairround-deploy.mjs`, 29 checks)
pass on a local chain with Arbitrum's limits.

The old Sakartvelo Exchange contracts on Arbitrum stay where they are
(source: commit `d0e4185`); the site simply stops using them.

**Golden rule:** after every transaction, read the value back. A green
receipt is not proof. Check MetaMask shows the right network and the
receipt has a real block number (not 1, 2, 3: that's the Remix VM).

## Address tables (fill in as you go)

| # | Contract | Constructor input | Arbitrum One | Robinhood Chain |
|---|---|---|---|---|
| 1 | InvestToken (IT) | `_maxCitizens` = `10000` | | |
| 2 | RoundAuctionV9 (RA) | `_investToken` = #1 | | |
| 3 | GovernanceV9 (GOV) | `_shares` = #2 | | |
| 4 | CompanyTreasuryV9 (CT) | #1, #2, #3 | | |
| 5 | CompanyDividendsV9 (DV) | #1, #2, #3 | | |
| 6 | OpenVerifierV2 (OV) | #1, your wallet | | |
| 7 | FairRoundTimelock (TL) | your wallet | | |

Also write down the **block number of #1** on each chain (the receipt
shows it).

---

## Part 0 — Before you start

1. **Merge pull request #7** on GitHub (the contracts in Remix must come
   from the merged `contracts/` folder).
2. **Gas.** About 0.005 ETH on each chain in the owner wallet.
   - Arbitrum One: you already have ETH there.
   - Robinhood Chain: portal.arbitrum.io → Bridge → from **Arbitrum One**
     to **Robinhood Chain** → 0.005 ETH. Arrives in minutes.
3. **Robinhood Chain in MetaMask** (once): network menu → **Add a custom
   network**: name `Robinhood Chain`, RPC `https://rpc.mainnet.chain.robinhood.com`,
   chain ID `4663`, symbol `ETH`, explorer `https://robinhoodchain.blockscout.com`.

## Part 1 — Compile in Remix (once, for both chains)

1. remix.ethereum.org → **File explorer** → new folder `fairround` → upload
   from the repo's `contracts/` folder: `InvestToken.sol`,
   `RoundAuctionV9.sol`, `GovernanceV9.sol`, `CompanyTreasuryV9.sol`,
   `CompanyDividendsV9.sol`, `OpenVerifierV2.sol`, `FairRoundTimelock.sol`.
2. **Solidity compiler** tab: compiler **0.8.34**; **Advanced
   Configurations**: EVM version **cancun**, **Enable optimization** ticked,
   runs **200**, `"viaIR": true` in the JSON.
3. Compile all seven. No red errors.

## Part 2 — Deploy (7 transactions)

**Deploy & run** → Environment **Injected Provider - MetaMask** → your
owner wallet, the right network (Arbitrum One = 42161; Robinhood = 4663).

Deploy in table order. After each one, copy the address into the table and
check in **Deployed Contracts**:
- #1 **name** = `Unrig`, **symbol** = `UNRIG`, **maxCitizens** = `10000`
- #2 **name** = `FairRound Unit`, **symbol** = `FRUNIT`; has **placeCorporateBid**
- #4 has **proposeInvest**
- #6 **HOURLY_CAP** = `50`

## Part 3 — Wire it up (while you still own everything)

On **RA** (#2):

| Step | Click | Input | Read back |
|---|---|---|---|
| 3.1 | setGovernance | GOV | **governance** = GOV |
| 3.2 | setTreasury | CT | **treasury** = CT |
| 3.3 | setDividends | DV | **dividends** = DV |
| 3.4 | listCompany ×6 | table below | **companies**(id) shows the name and size |

Each of 3.1–3.3 can be set **once only**.

**Demo listings** (round length `3600` = 1 hour for all):

| id | name | totalShares |
|---|---|---|
| 0 | Demo Project Alpha | 12000 |
| 1 | Demo Project Beta | 30000 |
| 2 | Demo Project Gamma | 60000 |
| 3 | Demo Project Delta | 120000 |
| 4 | Demo Project Epsilon | 300000 |
| 5 | Demo Project Zeta | 12000 |

On **IT** (#1):

| Step | Click | Input | Read back |
|---|---|---|---|
| 3.5 | setAuthorizedSink | RA, `true` | **authorizedSink**(RA) = true |
| 3.6 | setAuthorizedSink | CT, `true` | **authorizedSink**(CT) = true |
| 3.7 | setAuthorizedSink | DV, `true` | **authorizedSink**(DV) = true |
| 3.8 | setVerifier | OV, `true` | **verifier**(OV) = true |

**Do NOT touch** on IT: **setRoundAuctionForTradability** and
**setAuctionHouse** (leave unset: test credits stay closed-loop), and never
**renounceOwnership**.

## Part 4 — Hand ownership to the timelock (3 transactions)

| Step | Contract | Click | Input | Read back |
|---|---|---|---|---|
| 4.1 | RA | transferOwnership | TL | **owner** = TL |
| 4.2 | CT | transferOwnership | TL | **owner** = TL |
| 4.3 | IT | transferOwnership | TL | **owner** = TL |

GOV and DV have no owner. OV's guardian (your wallet) can pause new
verifications: the one disclosed emergency switch. (On the new set there
is no v8 trading switch any more, so that second instant power is gone.)

## Part 5 — Verify, test, send

1. **Verify** all seven: Remix **Contract Verification** plugin, same
   settings as Part 1. Arbitrum: Arbiscan. Robinhood: Blockscout (chain 4663).
2. **Test yourself:** verify your wallet on OV, **claim** on IT, then
   **approve** RA and **placeBid**(0, `10000000000000000000`,
   `10000000000000000000`) = 10 UNRIG at most 10 each. After the round
   settles you hold one FairRound Unit.
3. **Send Claude both tables** (14 addresses, two block numbers). Claude
   updates the site: a network switch (Arbitrum One / Robinhood Chain), the
   new addresses, Rules page disclosures, README, llms.txt. You merge.
4. **Resubmit on HackQuest** with both deployments.
