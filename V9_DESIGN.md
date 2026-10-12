# v9 design note

Started 12 October 2026; updated the same day after an independent audit of
all five v8 contracts (Findings 23–40 in `SECURITY_REVIEW.md`). v9 will be
deployed **alongside** v8 (see the continuity commitment in
`EXPERIMENT_EARLY_TRADABILITY.md`), not instead of it.

## Process: audit → redesign → audit again → deploy

1. **Done:** value-exit review and independent audit of v8 (Findings 23–40).
2. **Next:** decisions below (marked **DECIDE**), then the v9 specification.
3. Write v9; every finding gets a test that plays the attack and must fail.
4. Independent audit of the v9 code by reviewers who did not write it.
5. Full rehearsal deploy on a local chain, then on a testnet.
6. Mainnet deploy after the experiment window closes (8 November 2026).

## What gets redeployed

| Contract | v9 | Why |
|---|---|---|
| RoundAuction | new | Findings 30, 31, 38–40; set-once wiring; tradability rule |
| Governance | new | Findings 27–29, 34; bound to one RoundAuction |
| CompanyTreasury | new | Findings 23–26, 33, 35 and the treasury rules below |
| InvestToken | **kept** (DECIDE) | same address and balances; but its owner powers (Finding 36) can only be limited, not removed, without a new token |
| OpenVerifier | **replaced** | Finding 32 |

## Design principle

**No single actor can move value out of a company, or take control of it
alone.** Every exit goes through competitive bidding with a reserve price,
or a shareholder vote the proposer cannot pass alone; every election gives
other holders a real chance to run and to vote. Tested as an invariant: for
every exit path and every election path, a test plays the attacker with
extra wallets and must fail.

## Treasury (CompanyTreasury)

Decided 12 Oct 2026:
- **Removed:** the free 5%-per-term withdrawal to any address.
- **Removed:** fixed-price corporate sales — `governorOfferInvest`
  (Finding 23) and `governorListShare` (Finding 24).
- **Selling any company asset** (deposited tokens, INVEST capital, shares in
  other companies): **only by sealed-bid auction**.
- **Paying anyone:** only by shareholder vote.
- **Governor compensation:** unchanged — 1% in kind, locked two terms.

Required by the audit:

| Problem | v9 rule |
|---|---|
| No reserve price (25) | Every auction has a reserve; unsold assets return to the treasury |
| Bids only in INVEST; capital can't be auctioned | Bids in an approved payment token; auctions can draw on INVEST capital |
| "Last look" reveals (35) | Bid deposit is a percentage of the reserve, not a fixed 10 INVEST |
| Capital turned into income (33) | Proceeds from selling capital return to **capital**, never income |
| Proposer meets quorum alone (26) | Proposer's votes don't count towards quorum; higher quorum for large payments; payments to the governor's own addresses forbidden |
| Rented quorum (34) | Vote weight taken from a snapshot well before the proposal (e.g. 1 day) |
| Payments outlive the term (low) | Pending proposals expire at term end; successor can cancel |
| Blocked recipient locks funds (low) | Failed transfer returns the amount to the company |
| Hook/rebasing/NFT "tokens" (low) | Approved list for custody tokens; reentrancy guard on every external function |
| Company-held shares can't vote (low) | Corporate voting on payments and dividends, or excluded from quorum |

## Elections (Governance)

| Problem | v9 rule |
|---|---|
| Sole-candidate capture (27) | Fixed **candidacy period** (DECIDE: e.g. 5 days) that must pass before voting can open |
| Winner with almost no votes (27) | **Winner quorum** (DECIDE: e.g. votes ≥ 20% of issued shares), else back to candidacy |
| One stake fills 20 slots (28) | Candidacy stake measured at a snapshot before the candidacy period; candidates can withdraw |
| Election blocked forever (28) | After two empty rounds, clear the slate and reopen candidacy |
| Dividend vote lost at re-election (29) | Term end recorded once and never overwritten; test covers re-election |
| No way to remove a governor (low) | Share-weighted recall vote with a quorum |
| Compensation to the wrong governor (low) | Record governor and term when `invest()` is called |

## Share sales (RoundAuction)

The proportional round auction is kept. Required changes:

| Problem | v9 rule |
|---|---|
| Bids locked indefinitely (30) | DECIDE: bidder may withdraw a bid that stayed unfilled through a settlement, **or** partial fills (give what fits, refund the rest) |
| Slot squatting (31) | Real no-bidding cooldown after settlement so slots reopen to everyone at once; refund bids that can't fit; limit the ratio between highest and lowest bid |
| Rounding up doubles shares (40) | Charge entitlement × lowest bid; refund the remainder |
| Self-reinvestment (38) | `invest` requires source ≠ target |
| Stale listings revive (39) | One listing per share, cleared whenever the share moves |
| Lock only from first mint (low) | Lock counted per share from its own issue |
| Company IDs ≥ 2^128 (low) | Reject at listing |
| Tradability trigger (1-share company) | DECIDE thresholds: minimum company size and minimum distinct shareholders |

## Token, verification and owner powers

| Problem | v9 rule |
|---|---|
| Reusable ETH-balance check (32) | Replace OpenVerifier. DECIDE method; until then, cap new citizens low for the pilot |
| Owner can freeze, re-lock, mint (36) | Move InvestToken ownership to a timelock (and ideally a multisig); disclose every owner power in the docs |
| Re-locking traps pool liquidity and breaks the continuity promise (37) | DECIDE: keep INVEST tradable in v9, or re-lock with advance public notice |
| `auctionHouse` trap at rewiring (low) | Leave `auctionHouse` unset; written into the deploy checklist |
| v8 contracts must stay authorized | v8 RoundAuction and CompanyTreasury stay sinks permanently |

## Decisions taken (13 October 2026)

| Question | Decision |
|---|---|
| Reserve price | **Shareholder vote**: every sale is proposed with a reserve, approved by vote, then auctioned |
| Stuck bids | **Partial fills**: each round gives a bid the shares that fit; nothing is ever stuck |
| Tradability in v9 | **INVEST stays tradable**: InvestToken keeps pointing at v8 RoundAuction (unlocked); no re-lock |
| Owner powers | **Timelock**: ownership of InvestToken and every v9 contract moves to a 48-hour timelock |
| Candidacy period / winner quorum | default: **5 days / 20%** of shares issued at the candidacy snapshot |
| Small expenses | default: **none** — every payment by shareholder vote |
| Verification | default (interim): OpenVerifier v2 — normal wallets only (no contract factories), plus a daily cap on new citizens |
| Tradability thresholds | not needed: INVEST is already tradable and stays so |

### v9 rules in one place

**Share auctions (RoundAuction v9)**
- Lowest bid sets the price of one share; each bid is entitled to
  floor(bid / lowest) shares (rounded **down**, Finding 40) and pays exactly
  shares × lowest; the remainder is refunded.
- **Partial fills**: highest bids first, each gets min(entitlement, shares
  left); an unfilled remainder stays as a smaller bid for the next round.
- **Full book**: when all 100 slots are taken, a new bid must be larger than
  the current lowest, which is refunded and evicted (ends slot squatting,
  Finding 31).
- Share lock counted per share from its own issue time.
- One listing per share, cleared whenever the share moves (Finding 39).
- No fixed-price corporate share sales; company-held shares stay held and
  earn dividends and votes (Finding 24).
- `invest` requires source ≠ target (38); the governor and term are recorded
  at `invest` time for the 1% compensation.
- No tradability flag (not needed); company IDs limited to < 2^64.

**Elections (Governance v9)**
- Anyone opens a 5-day **candidacy period**; its snapshot (1 second before
  it opened) fixes both candidacy stakes and all vote weights for that
  election (Findings 27, 28, 34). Candidates can withdraw.
- Voting opens only after the candidacy period. A winner needs 51% of votes
  cast **and** votes ≥ 20% of shares issued at the snapshot; otherwise the
  round fails. Two failed rounds reset to a fresh candidacy period.
- Term end is recorded once and never overwritten (Finding 29).
- **Recall**: shareholders can end a term early (vote ≥ 51% of cast and
  turnout ≥ 33% of issued).

**Treasury (CompanyTreasury v9)**
- No free withdrawal, no fixed-price sales, no INVEST market (v8's market
  stays available).
- **Sales**: governor proposes (asset, amount, payment token, reserve) →
  shareholder vote → sealed-bid auction in the payment token, with a deposit
  of 10% of the reserve. Highest bid ≥ reserve wins; otherwise the asset
  returns.
- **Two buckets** per company and token — capital and income. Proceeds keep
  the bucket of what was sold; only income can ever be reinvested
  (Finding 33).
- **Payments**: by vote only; the governor and their key cannot vote on
  their own proposal and cannot be paid by it; quorum 20% (40% for large
  payments); vote weights from a snapshot one day before the proposal;
  proposals must finish within the term; a failed transfer returns the money.
- Company-held shares vote on payments, sales and dividends through their
  own governor.
- Custody only for approved tokens; reentrancy guard on every external
  function.

## Decisions needed from Amiran (DECIDE) — answered above

1. **Reserve price:** set by shareholder vote per auction, or a fixed rule
   (e.g. at least the price the company was bought at)?
2. **Locked bids:** withdraw-after-a-round, or partial fills?
3. **Candidacy period and winner quorum:** proposed defaults 5 days and 20%.
4. **Tradability in v9:** keep INVEST tradable, or re-lock with notice?
5. **Tradability thresholds:** minimum company size and shareholder count.
6. **Verification method** for real citizens.
7. **Owner powers:** put InvestToken behind a timelock/multisig?
8. **Small expenses:** a small allowance payable only to shareholder-approved
   addresses, or none?
