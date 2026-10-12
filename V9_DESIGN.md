# v9 design note

Started 12 October 2026. Collects the decisions and lessons from running
v8 on mainnet. v9 will be deployed **alongside** v8 (see the continuity
commitment in `EXPERIMENT_EARLY_TRADABILITY.md`), not instead of it.

## What gets redeployed

| Contract | v9 | Why |
|---|---|---|
| CompanyTreasury | new | Finding 23 and the treasury rules below |
| RoundAuction | new | treasury/governance addresses are set-once; tradability rule lives here |
| Governance | new | bound to one RoundAuction at deploy |
| InvestToken | **kept** | rewired with owner settings; balances unchanged |
| OpenVerifier | kept or replaced | depends on the verification decision below |

Timing: after the early-tradability experiment window closes (8 November
2026). Pointing InvestToken at the v9 RoundAuction re-locks INVEST
transfers for everyone, which ends the experiment.

## Decided

### Treasury: governors sell only through sealed-bid auctions (decided 12 Oct 2026)

- **Removed:** the free 5%-per-term withdrawal to any address.
- **Removed:** fixed-price corporate INVEST offers (`governorOfferInvest`,
  the cause of Finding 23).
- **Selling any treasury asset, including company INVEST capital:** only
  through the sealed-bid auction (commit, reveal, settle). Anyone can bid;
  the highest bid wins; proceeds go back to the treasury.
- **Paying anyone (vendors, services):** only by shareholder vote — 20%
  quorum of issued shares, 51% approval (unchanged from v8).
- **Governor compensation:** unchanged — 1% in kind on each purchased
  asset, locked for two terms.
- `buyInvest`-style purchases must re-check that the payment token is still
  approved.

### Treasury sealed-bid auction: required changes (found 12 Oct 2026)

The v8 commit-reveal mechanism works and is reused, but v8's auction cannot
yet carry the rule above:

| v8 limitation | v9 change |
|---|---|
| Only sells tokens deposited in the treasury; company INVEST capital (held in RoundAuction) cannot be auctioned | Auctions can draw on company INVEST capital |
| Bids are always paid in INVEST (selling INVEST for INVEST is meaningless) | Bids paid in an approved payment token chosen per auction |
| No minimum price — with no other bidders, the governor can win with a token bid from a second wallet (Finding 23 again, only slower) | **Reserve price**; if no bid reaches it, the asset returns to the treasury |

### RoundAuction (share sales): kept, small changes

The proportional round auction worked as designed in v8 and is kept. v9
changes: the stricter tradability rule (below), and bid-slot protection if
the squatting hypothesis is confirmed by testing.

### Carried over from v8 (unchanged)

- Governors reinvest only treasury income, never original capital.
- End-of-term dividend vote only; no mid-term discretionary dividend.

## Lessons to address

1. **Finding 23** — governor could sell all capital at any price without a
   vote. Fixed by the treasury rules above.
2. **Tradability trigger** — a 1-share company unlocked trading for the
   whole system. v9 needs a minimum company size and a minimum number of
   distinct shareholders before the phase change, and the change should be
   explicit and visible on the site.
3. **Verification** — "holds 0.0083 ETH" is not proof of personhood. v9
   needs real citizen verification.
4. **Bid-slot squatting (untested hypothesis)** — 100 active bid slots, one
   per wallet, no cancel. Test on a local chain before deciding on a fix.
5. **Test companies belong on a testnet** — single-share listings on mainnet
   change system-wide state.

## Open questions

- **Small expenses:** without the free 5%, every expense needs a 3-day
  vote. Option under consideration: a small allowance (e.g. 1% per term)
  payable **only to shareholder-approved addresses**. Not decided.
- **Reserve price:** set by shareholder vote per auction, or by a fixed rule
  (e.g. a minimum relative to recorded capital)?
- **Verification method** for real citizens (ID-based, attestation, other).
- **Exact tradability rule** (company size and shareholder-count thresholds).
