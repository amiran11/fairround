# vUNRIG — Voted UNRIG

**Status:** designed and tested on a local chain (35 of 35 checks pass). **Not deployed.**
Deploying it is a founder decision: it needs one 48-hour timelock proposal and can't be undone cleanly.

## The problem it solves

UNRIG is closed-loop: a wallet can only send it into FairRound's own contracts. That keeps
farmers out (1,000 free UNRIG per verified wallet is worth nothing if it can't leave), but it
also means UNRIG released by a holder vote can never trade either.

InvestToken's rule checks **who is at each end of a transfer**, not where coins came from.
So the only two existing levers are both wrong:

- whitelisting a pool as an "authorized sink" opens a door for **every** wallet, including
  farmed free claims;
- the global tradability switch unlocks **all** UNRIG at once.

What's needed is a **stamp**: "these coins left a treasury because holders voted for it".

## How it works

`contracts/VotedUnrig.sol` is a separate ERC-20, **Voted UNRIG (vUNRIG)**, backed 1:1 by UNRIG.

| Action | Who | Rule |
|---|---|---|
| `wrapPayment(id, amount)` | the recipient of a treasury payment | payment executed (status Paid), token is UNRIG, caller is the recipient, at most the payment's amount in total |
| `wrapSale(id, amount)` | the winner of a treasury sale | sale settled, caller is the winner and has claimed, at most the amount sold |
| `unwrap(amount)` | anyone holding vUNRIG | burns vUNRIG, pays the same UNRIG back (closed-loop again) |
| transfer, approve, pools | anyone | vUNRIG is a normal ERC-20 |

The stamp is the **treasury proposal id**: every executed payment or settled sale can be wrapped
once, up to its amount, only by the wallet it paid. UNRIG from the faucet, bid refunds,
dividends or an earlier unwrap can never be wrapped.

**Only listings of at least `minListingUnits` units count.** One person can buy a small
listing outright and vote payments to their own other wallets; big listings need many holders.

No owner, no admin, no upgrade: every rule is fixed at deployment.

## Tested (test/voted-unrig.test.mjs)

Against the real v9 contracts on anvil with Arbitrum's limits, UNRIG closed-loop:

- a voted payment and a won sale wrap correctly; partial wraps add up; vUNRIG moves wallet to
  wallet; unwrap gives UNRIG back, which is closed-loop again;
- every attempt to mint vUNRIG without a vote fails: another wallet's payment, a made-up id,
  a rejected payment, a payment still in its vote, an unsettled or unclaimed sale, the losing
  bidder, a sale wrapped as a payment and vice versa, wrapping twice or one wei too much,
  a listing below the minimum, sending free claims straight to the wrapper (mints nothing);
- vUNRIG supply never exceeds the UNRIG the wrapper holds; the listing's capital falls by
  exactly what holders voted out.

Result: **35 passed, 0 failed**. Runtime size 5,785 bytes (limit 24,576).

## What it does not fix: the free claim

vUNRIG closes the direct exit, but a determined farmer still has a slow, indirect one:

1. verify many wallets (OpenVerifierV2 lets 50 new wallets in per hour) and claim 1,000 UNRIG each;
2. use them to win a majority of a big listing;
3. elect themselves, propose payments to a wallet they control, vote them through;
4. wrap and sell.

The treasury rules slow this to **at most 5% of the listing's capital per 30-day term**, after a
3-day vote and a 5-day delay that a recall can interrupt, and the capital is the farmer's own
UNRIG. Slow and visible, but not impossible. **Before vUNRIG gets a market price, close the
free entry** with one of the levers that already exist:

- **pause new verifications** (OpenVerifierV2 guardian, `setPaused(true)`: instant, reversible); or
- **cap the faucet**: `InvestToken.setMaxCitizens(citizenCount)` through the timelock, so no new
  wallet can claim.

A cleaner long-term answer (UNRIG earned or bought, not given) needs a new InvestToken and a
full redeploy.

## Deploying it later (not done)

1. Choose `minListingUnits`; **1,000** suggested (The Thousand and up).
2. Deploy `VotedUnrig(InvestToken, CompanyTreasuryV9, RoundAuctionV9, minListingUnits)` with the
   same compiler settings as the rest (0.8.34, optimizer 200, viaIR). The constructor refuses a
   treasury that doesn't use this InvestToken and RoundAuction.
3. Verify it on Arbiscan.
4. Timelock: schedule `InvestToken.setAuthorizedSink(vUNRIG, true)`, wait 48 hours, execute.
   Until then nothing can be wrapped (tested).
5. Site: a "Wrap to vUNRIG" button next to executed payments and won sales, using
   `wrappable(id)`.
6. Only then, and only with the free entry closed, think about a pool.

## Wording

vUNRIG is still a demo token backed by test credits. The contract's `DISCLAIMER` says so. A
token with a market price looks much more like an investment than free test credits do, so
check the legal side before any pool exists, and never market it with price or profit.
