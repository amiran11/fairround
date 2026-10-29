# vUNRIG — Voted UNRIG

**Status:** built and tested on a local chain (50 of 50 checks pass), including the
48-hour timelock step exactly as on mainnet. **Deploy guide:** `DEPLOY_VUNRIG.md`.

## The problem it solves

UNRIG is closed-loop: a wallet can only send it into FairRound's own contracts. That keeps
farmers out (1,000 free UNRIG per verified wallet is worth nothing if it can't leave), but it
also means UNRIG released by a holder vote can never trade either.

InvestToken's rule checks **who is at each end of a transfer**, not where coins came from.
So the two existing levers are both wrong:

- whitelisting a pool as an "authorized sink" opens a door for **every** wallet, including
  farmed free claims;
- the global tradability switch unlocks **all** UNRIG at once.

What's needed is a **stamp**: "these coins left a treasury because holders voted for it".

## How it works

`contracts/VotedUnrig.sol` is a separate ERC-20, **Voted UNRIG (vUNRIG)**. It is created by
**burning** UNRIG: one UNRIG goes to the dead address `0x…dEaD`, one vUNRIG is minted. The
conversion is **one-way**; there is no unwrap.

| Action | Who | Rule |
|---|---|---|
| `convertPayment(id, amount)` | the recipient of a treasury payment | payment executed (status Paid), token is UNRIG, caller is the recipient, at most the payment's amount in total |
| `convertSale(id, amount)` | the winner of a treasury sale | sale settled, caller is the winner and has claimed, at most the amount sold |
| `burnStray()` | anyone | burns UNRIG someone sent to the contract outside a conversion; mints nothing |
| transfer, approve, pools | anyone | vUNRIG is a normal ERC-20 |

The stamp is the **treasury proposal id**: every executed payment or settled sale can be
converted once, up to its amount, only by the wallet it paid. UNRIG from the faucet, bid
refunds, dividends or anything else can never be converted.

**Only listings of at least `minListingUnits` units count.** One person can buy a small
listing outright and vote payments to their own other wallets; big listings need many holders.

**Only UNRIG is ever burned.** A treasury can also pay out or sell other approved tokens
(USDC, WETH). Those proposals can't be converted, and the contract never calls any token but
UNRIG, so it can't move or burn anyone's USDC or WETH. Other tokens sent to it by mistake stay
untouched (and, with no admin, can't be recovered).

The contract **never keeps UNRIG**, has **no owner, no admin, no upgrade**: every rule is
fixed at deployment.

## Tested (test/voted-unrig.test.mjs)

Against the real v9 contracts on anvil with Arbitrum's limits, UNRIG closed-loop, InvestToken
owned by FairRoundTimelock:

- the mainnet step: before the timelock makes vUNRIG a sink nothing converts; the deployer can't
  shortcut it; execute fails before 48 hours and works after;
- a voted payment and a won sale convert correctly; partial conversions add up; the UNRIG
  lands at the dead address; the contract holds none; vUNRIG moves wallet to wallet while
  plain UNRIG still can't; supply always equals UNRIG burned;
- every attempt to mint vUNRIG without a vote fails: another wallet's payment, a made-up id,
  a rejected payment, a payment still in its vote, an unsettled or unclaimed sale, the losing
  bidder, a sale converted as a payment and vice versa, converting twice or one wei too much,
  a listing below the minimum, sending free claims straight to the contract (mints nothing,
  and `burnStray` clears it);
- other treasury tokens are never converted or burned: a voted USDC payment to a wallet that
  also holds faucet UNRIG can't be used to convert, a sale of USDC paid for in UNRIG can't be
  converted by its winner, `convertible()` reports nothing for both, and USDC sent to the
  contract is ignored by `burnStray` (none reaches the dead address).

Result: **50 passed, 0 failed**. Runtime size 6,145 bytes (limit 24,576).

## What it does not fix: the free claim

A determined farmer still has a slow, indirect route:

1. verify many wallets (OpenVerifierV2 lets 50 new wallets in per hour) and claim 1,000 UNRIG each;
2. use them to win a majority of a big listing;
3. elect themselves, propose payments to a wallet they control, vote them through;
4. convert and sell.

The treasury rules slow this to **at most 5% of the listing's capital per 30-day term**, after a
3-day vote and a 5-day delay that a recall can interrupt, and the capital is the farmer's own
UNRIG. **Before vUNRIG gets a market price (a pool), close the free entry** with a lever that
already exists:

- **pause new verifications** (OpenVerifierV2 guardian, `setPaused(true)`: instant, reversible); or
- **cap the faucet**: `InvestToken.setMaxCitizens(citizenCount)` through the timelock.

## Wording

vUNRIG is a demo token created from test credits. It is not backed and not redeemable; the
contract's `DISCLAIMER` says so. A token with a market price looks much more like an investment
than free test credits do, so check the legal side before any pool exists, and never market it
with price or profit.
