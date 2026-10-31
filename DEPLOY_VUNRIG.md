# Deploy vUNRIG on Arbitrum One

> **Status (31 Oct 2026):** deployed and timelock step scheduled.
> - vUNRIG: `0xe945B87f8B506B05Eb50c5d19ffe954398E49684` (deploy tx
>   `0xefa79f7d9889b21a400b4c4f215977872c63bb75e96f5cdd5d5a859a13ba5f90`, block 519986335,
>   minListingUnits 9; source verified on Sourcify)
> - Timelock `schedule` tx `0xb3c35b75ec0e8c60b737029291ff27cafabb013b5b8f23cc07961d74e3413b3f`
>   (block 519988911), operation id `0x39cad4d92e6118300a025f4d7d1948b7653bbd02dba9052be36410f599e6031a`
> - **Execute** from Monday 2 Nov 2026, ~16:40 Tbilisi time, with the same five values:
>   target `0xbc780aeB45FdDA0258aB163a99fE92f97209E2c0`, value `0`, data
>   `0x28e95402000000000000000000000000e945b87f8b506b05eb50c5d19ffe954398e496840000000000000000000000000000000000000000000000000000000000000001`,
>   predecessor `0x00…00` (64 zeros), salt `0x00…01` (63 zeros then 1).

One contract, then one timelock action (48-hour wait). About 15 minutes of clicking plus the
wait. Everything here was rehearsed on a local chain with the same contracts and timelock
(`test/voted-unrig.test.mjs`, 50 of 50 passed).

**What doesn't change:** UNRIG stays closed-loop. Nothing new can leave FairRound until a
treasury vote pays someone out *and* that person converts it.

---

## Part 0 — Before you start

1. **Decide `minListingUnits`.** Only treasuries of listings at least this big can release
   convertible UNRIG. It is fixed forever at deployment.
   - **9 (chosen, 28 Oct 2026):** The Fellowship and larger, so the founder can run the full
     lifecycle in public on The Fellowship with three wallets. Units are cheap while UNRIG is
     free, so the size limit is weak protection anyway: the real protection is closing the free
     claim before any pool (see `VOTED_UNRIG.md`).
   - 1000: only The Thousand and larger; the first vUNRIG would take many weeks.
2. **Merge the pull request** with `contracts/VotedUnrig.sol`.
3. **Gas:** about 0.001 ETH on Arbitrum One in your owner wallet (the one that controls the timelock).

## Part 1 — Compile in Remix

1. remix.ethereum.org → **File explorer** → in your `fairround` folder upload
   `contracts/VotedUnrig.sol` from the repo.
2. **Solidity compiler** tab, same settings as last time: compiler **0.8.34**; **Advanced
   Configurations**: EVM version **cancun**, **Enable optimization** ticked, runs **200**,
   `"viaIR": true`.
3. Select `VotedUnrig.sol` → **Compile**. No red errors.

## Part 2 — Deploy (1 transaction)

**Deploy & run** → Environment **Injected Provider - MetaMask**, network **Arbitrum One**.
**Contract:** choose **VotedUnrig** (not ERC20, not an interface).

Constructor inputs, in this order:

| Field | Value |
|---|---|
| `_unrig` | `0xbc780aeB45FdDA0258aB163a99fE92f97209E2c0` (InvestToken) |
| `_treasury` | `0xD2107dEE7EA2E8038F7778f63Cf6Eee659dB1F29` (CompanyTreasuryV9) |
| `_roundAuction` | `0xb08631827d87C69Ff44d692EEFF32E1b22E4c503` (RoundAuctionV9) |
| `_minListingUnits` | `9` |

Click **transact** → confirm in MetaMask. If MetaMask shows a gas error, one of the addresses is
wrong: the constructor refuses a treasury or auction that doesn't belong to this InvestToken.

**Read back** in Deployed Contracts → VotedUnrig:
- **name** = `Voted UNRIG`, **symbol** = `vUNRIG`
- **unrig**, **treasury**, **roundAuction** = the three addresses above
- **minListingUnits** = your number
- **totalSupply** = `0`

Write down the **vUNRIG address**: ____________________

## Part 3 — Verify on Arbiscan

Remix **Contract Verification** plugin → Arbiscan → contract **VotedUnrig**, the vUNRIG address,
same compiler settings as Part 1, and the same four constructor inputs. (Last time the error was
picking the wrong contract name: choose **VotedUnrig**.)

## Part 4 — Timelock: make vUNRIG an authorized sink (48 hours)

InvestToken is owned by the timelock, so this goes through **schedule → wait 48 hours → execute**.

**4.1 Get the call data.** Two ways, either works:
- **Easiest:** send Claude the vUNRIG address; you get back the exact hex to paste.
- **In Remix:** Deployed Contracts → **InvestToken** (At Address `0xbc78…E2c0`) → expand
  **setAuthorizedSink** → `account` = vUNRIG address, `allowed` = `true` → click the small
  **copy calldata** icon (don't click transact: it would fail, the timelock is the owner).

**4.2 Schedule.** Deployed Contracts → **FairRoundTimelock** (At Address
`0x15FC689FD5ba86D3FC052E6E1E7b48623c17732A`) → **schedule**:

| Field | Value |
|---|---|
| `target` | `0xbc780aeB45FdDA0258aB163a99fE92f97209E2c0` |
| `value` | `0` |
| `data` | the hex from 4.1 (starts with `0x…`) |
| `predecessor` | `0x0000000000000000000000000000000000000000000000000000000000000000` |
| `salt` | `0x0000000000000000000000000000000000000000000000000000000000000001` |
| `delay` | `172800` |

Confirm in MetaMask. This is public: anyone watching the timelock sees it for 48 hours.

**4.3 Wait 48 hours.** Executing earlier fails (tested).

**4.4 Execute.** FairRoundTimelock → **execute** with the **same five values** (target, value,
data, predecessor, salt; no delay). Confirm.

**Read back:** InvestToken → **authorizedSink**(vUNRIG address) = `true`.

## After it's live

- vUNRIG exists only once a listing of 9+ units votes a payment or a sale and the recipient
  converts. The first one is the founder's Fellowship demo: about 3–4 weeks (buy, election,
  treasury vote, 5-day delay).
- The site can then get a "Convert to vUNRIG" button next to executed payments and won sales,
  using `convertible(id)`.
- **Decision (29 Oct 2026):** the free claim stays open during the public test, so its weak
  points are tested in the open; the pool is capped at about $20 and announced in advance.
  The levers remain available if the data calls for them: pause new verifications or cap
  `maxCitizens`.

**Do NOT touch:** InvestToken **setRoundAuctionForTradability**, **setAuctionHouse**, and never
**renounceOwnership**.
