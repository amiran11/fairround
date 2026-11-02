# The Fellowship playbook: how the founder captures a listing, in public

**Status:** in progress, started 1 November 2026. This file is updated as each step happens,
with the transaction on Arbiscan. Part of the FairRound field experiment
(pre-registration: [DOI 10.5281/zenodo.23844124](https://doi.org/10.5281/zenodo.23844124)).

## Why we publish this

To mint the first vUNRIG, the founder takes one small listing, **The Fellowship** (listing 2,
9 units), through its whole life with his own wallets: buy every unit, elect himself, vote a
payment to himself, wait, convert. That is exactly what an attacker with several wallets would do.

We do it openly so that:

- **attackers** get the full recipe, the same one anyone can run, and nobody has an edge from hidden knowledge;
- **defenders** (holders of other listings) see what a capture looks like on-chain, and where they can stop it;
- **the paper** records which defences held, which only slowed things down, and which did nothing.

UNRIG is a free test credit with no value. vUNRIG is not backed, not redeemable and not an
investment. Nothing here is a promise of price.

## The wallets

All four belong to the founder. That is the point: one person, four wallets.

| Role | Wallet | Units | What it does |
|---|---|---|---|
| Project lead | Account 1 `0xD9fb2141222E6395c4F8787440EBc8f7c73b2de0` (also the owner wallet) | 3 | declared candidacy, names the operating key |
| Voter | Account 2 `0x31A0…2f71` | 3 | backs and votes for the lead; votes yes on the payment |
| Recipient | Account 3 `0x4D8659c461e7b6f1420b5eC3c3898476BeF9F9f2` | 3 | receives the payment, burns it into vUNRIG |
| Operating key | Account 4 (to be created) | 0 | proposes the payment |

The treasury rules force four wallets: the lead and the operating key can't vote on a proposal,
the recipient can't vote on a payment to itself, and only the operating key can propose.

## The steps

| # | Step | Rule that applies | Defence it meets | Transaction |
|---|---|---|---|---|
| 1 | **Verify three wallets.** One balance of 0.0083 ETH was enough: verify a wallet, move the ETH on, verify the next. | Verification checks the balance only at that moment; 50 wallets an hour, ordinary wallets only. | **Weak:** the ETH check is recyclable (demonstrated here). The hourly cap only slows, it doesn't stop. | _to fill_ |
| 2 | **Claim 1,000 UNRIG per wallet.** | Once per verified wallet. | None beyond step 1. | _to fill_ |
| 3 | **Buy all 9 units in one round:** each wallet bids 999 UNRIG with a limit of 333 per unit. Settled 1 Nov 18:11; capital 2,967.03 UNRIG. The round was announced on X 40 minutes before it closed; no outside bids. | Uniform price; one bid per wallet; at most 150 units a round. | **Weak for small listings:** 9 units fit in one round, so nobody else had a chance to buy in unless they bid in the same hour. | _to fill_ |
| 4 | **Open the election (2 Nov), Account 1 declares; Accounts 2 and 3 back it.** Backing only puts a candidate on the ballot: the vote is a separate stage. | Opens at 50% sold; candidates need 0.1% of units. | None: the founder holds 100%. | _to fill_ |
| 5 | **Open the vote (after 5 days), vote, count (after 3 more).** | Winner needs votes of 20% of the electorate and 51% of votes cast. | **Slows:** 5-day candidacy can't be cut short even when every holder has backed the same candidate; then a 3-day vote. All public. | _to fill_ |
| 6 | **Lead names Account 4 as operating key; key accepts.** | The lead never operates directly; the key expires with the term. | Separation of roles: costs one extra wallet. | _to fill_ |
| 7 | **Execute the vUNRIG timelock step** (owner action, scheduled 31 Oct, executed 2 Nov). | 48-hour public delay on every owner action. | **Holds:** visible two days ahead. | scheduled `0xb3c35b75…3b3f`; executed `0xba68df561600b84fca624b6ec19a61a9cf36dd7a5cc87d6881a4514b1458cfc5` |
| 8 | **Propose a payment of about 148 UNRIG to Account 3.** | At most 5% of the capital per 30-day term; recipient can't be the lead or the key. | **Holds as a brake:** 148 of about 2,967 UNRIG. | _to fill_ |
| 9 | **Account 1 votes yes; vote ends after 3 days.** | Quorum 20% of eligible units; lead's units excluded. | None: the founder is the only other holder. | _to fill_ |
| 10 | **Wait 5 days, then carry out the payment.** | 5-day delay so holders can recall the lead first. | **Would hold** in a listing with independent holders; useless here. | _to fill_ |
| 11 | **Account 3 converts: burns the UNRIG, receives vUNRIG.** | Only the payment's recipient, only once, only up to its amount, only listings of 9+ units. | **Holds:** nobody else can convert this payment. | _to fill_ |

## What this shows (so far)

- **In a listing one person fully owns, the rules can't protect anyone, because there's nobody
  to protect.** That is hypothesis H2: fairness needs diverse, active holders.
- **The real brakes are time and size:** about 17 days from purchase to the first vUNRIG, and
  at most 5% of the capital per month.
- **The cheapest exploit is step 1:** recycling one ETH balance across many wallets.

## How to do this against a listing you don't own (and how to stop it)

- **To capture:** buy a majority of a listing's units in its rounds (many wallets help only if
  they each bring UNRIG), then repeat steps 4 to 11.
- **To stop it, as a holder:** bid in the same rounds; vote in every election and treasury
  vote; open a recall (1% of units) during the 5-day delay before a payment runs.
- **To watch for it:** many new wallets verifying within minutes; bids of identical size and
  timing; one cluster holding most of a listing.
