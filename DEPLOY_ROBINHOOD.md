# Deploy checklist: FairRound on Robinhood Chain

A fresh, standalone FairRound set on Robinhood Chain: the same audited code
that runs on Arbitrum One since 14 October 2026, with its own test-credit
token and six demo launches. Nothing on Arbitrum One changes.

**Rehearsed:** this exact sequence, with the same read-back checks, runs
clean on a local chain with Arbitrum's limits
(`test/rehearse-robinhood-deploy.mjs`, 28 checks passed).

**Golden rule:** after every transaction, read the value back and compare.
A green receipt is not proof. Check MetaMask says **Robinhood Chain** and
the receipt has a real block number (not 1, 2, 3: that's the Remix VM).

| # | Contract | Constructor input | Address (fill in) | Block |
|---|---|---|---|---|
| 1 | InvestToken (test credits) | `_maxCitizens` = `10000` | | |
| 2 | RoundAuctionV9 (RA) | `_investToken` = #1 | | |
| 3 | GovernanceV9 (GOV) | `_shares` = #2 | | |
| 4 | CompanyTreasuryV9 (CT) | #1, #2, #3 | | |
| 5 | CompanyDividendsV9 (DV) | #1, #2, #3 | | |
| 6 | OpenVerifierV2 (OV) | #1, your wallet | | |
| 7 | SakartveloTimelock (TL) | your wallet | | |

---

## Part 0 — Before you start (about 20 minutes)

1. **Check the HackQuest Robinhood track rules** and screenshot them for
   Claude: what counts as "deployed on Robinhood Chain".
2. **Add Robinhood Chain to MetaMask.** MetaMask → network menu → **Add a
   custom network**:
   - Network name: `Robinhood Chain`
   - RPC URL: `https://rpc.mainnet.chain.robinhood.com`
   - Chain ID: `4663`
   - Currency symbol: `ETH`
   - Block explorer: `https://robinhoodchain.blockscout.com`

   Then open the explorer link and check it loads.
3. **Get gas.** Go to **portal.arbitrum.io** → Bridge → from **Arbitrum
   One** to **Robinhood Chain** → send **0.005 ETH** from your owner wallet.
   It arrives in a few minutes; MetaMask on Robinhood Chain shows it.
   About 30 transactions in total; the rest stays in the wallet.
   If the portal says Robinhood Chain isn't available where you are, stop
   and tell Claude.

## Part 1 — Compile in Remix (once)

1. remix.ethereum.org → **File explorer** → new folder `robinhood` →
   upload from the repo's `contracts/` folder: `InvestToken.sol`,
   `RoundAuctionV9.sol`, `GovernanceV9.sol`, `CompanyTreasuryV9.sol`,
   `CompanyDividendsV9.sol`, `OpenVerifierV2.sol`, `SakartveloTimelock.sol`.
2. **Solidity compiler** tab, the same settings as Arbitrum:
   - Compiler **0.8.34**
   - **Advanced Configurations**: EVM version **cancun**, **Enable
     optimization** ticked, runs **200**, and `"viaIR": true` in the JSON.
3. Compile all seven. No red errors.

## Part 2 — Deploy (7 transactions)

**Deploy & run** tab → Environment **Injected Provider - MetaMask** →
the account is your owner wallet and the network is **Robinhood Chain
(4663)**.

Deploy in the order of the table above. After each one:
- copy the address into the table;
- open it in **Deployed Contracts** and check the function list:
  RA has **placeCorporateBid**; CT has **proposeInvest**;
- on #1 click **maxCitizens**: `10000`; **symbol**: `INVEST`;
- on #6 click **HOURLY_CAP**: `50`.

## Part 3 — Wire it up (while you still own everything)

On **RA** (#2):

| Step | Click | Input | Read back |
|---|---|---|---|
| 3.1 | setGovernance | GOV | **governance** = GOV |
| 3.2 | setTreasury | CT | **treasury** = CT |
| 3.3 | setDividends | DV | **dividends** = DV |
| 3.4 | listCompany ×6 | see below | **companies**(id) shows the name and size |

Each of 3.1–3.3 can be set **once only**. Double-check before clicking.

**Demo launches for 3.4** (round length `3600` = 1 hour for all):

| id | name | totalShares |
|---|---|---|
| 0 | Demo Project Alpha | 12000 |
| 1 | Demo Project Beta | 30000 |
| 2 | Demo Project Gamma | 60000 |
| 3 | Demo Project Delta | 120000 |
| 4 | Demo Project Epsilon | 300000 |
| 5 | Demo Project Zeta | 12000 |

On **InvestToken** (#1):

| Step | Click | Input | Read back |
|---|---|---|---|
| 3.5 | setAuthorizedSink | RA, `true` | **authorizedSink**(RA) = true |
| 3.6 | setAuthorizedSink | CT, `true` | **authorizedSink**(CT) = true |
| 3.7 | setAuthorizedSink | DV, `true` | **authorizedSink**(DV) = true |
| 3.8 | setVerifier | OV, `true` | **verifier**(OV) = true |

**Do NOT touch** on InvestToken: **setRoundAuctionForTradability** and
**setAuctionHouse** stay unset (test credits stay closed-loop, which the
rehearsal checks), and never **renounceOwnership**.

## Part 4 — Hand ownership to the timelock (3 transactions)

| Step | Contract | Click | Input | Read back |
|---|---|---|---|---|
| 4.1 | RA | transferOwnership | TL | **owner** = TL |
| 4.2 | CT | transferOwnership | TL | **owner** = TL |
| 4.3 | InvestToken | transferOwnership | TL | **owner** = TL |

GOV and DV have no owner. OV's guardian (your wallet) can pause new
verifications: the same disclosed emergency switch as on Arbitrum.

## Part 5 — Verify and send

1. **Verify** all seven on Blockscout: Remix → **Contract Verification**
   plugin → Blockscout, chain 4663, same settings as Part 1. (Fallback:
   robinhoodchain.blockscout.com → the contract → **Verify & publish** →
   Solidity standard JSON input from Remix.)
2. **Send Claude the table** (seven addresses and the block of #1). They go
   into the site's settings so the site shows a network switch: Arbitrum
   One / Robinhood Chain.
3. Do one test yourself on Robinhood Chain: verify, claim, bid 10 in Demo
   Project Alpha. After the round settles you hold one unit.
