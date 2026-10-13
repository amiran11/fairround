# v9 design note

Started 12 October 2026; updated the same day after an independent audit of
all five v8 contracts (Findings 23–40 in `SECURITY_REVIEW.md`). Contracts
written and audited three times on 13 October 2026; the final rules are in
"v9 rules in one place" below. v9 will be
deployed **alongside** v8 (see the continuity commitment in
`EXPERIMENT_EARLY_TRADABILITY.md`), not instead of it.

## Process: audit → redesign → audit again → deploy

1. **Done:** value-exit review and independent audit of v8 (Findings 23–40).
2. **Done (13 Oct):** decisions below, then the v9 specification.
3. **Done (13 Oct):** v9 written; every finding has a test that plays the
   attack and must fail (`test/v9.test.mjs`, 134 tests passing).
4. **Done (13 Oct):** three rounds of independent audit of the v9 code;
   every confirmed finding fixed and tested (see `SECURITY_REVIEW.md`,
   "Independent audits of v9").
5. **Next:** full rehearsal deploy on a local chain, then on a testnet
   (`DEPLOY_V9.md`); site support for v9.
6. Mainnet deploy after the experiment window closes (8 November 2026).

## What gets redeployed

| Contract | v9 | Why |
|---|---|---|
| RoundAuction | new | Findings 30, 31, 38–40; set-once wiring; tradability rule |
| Governance | new | Findings 27–29, 34; bound to one RoundAuction |
| CompanyTreasury | new | Findings 23–26, 33, 35 and the treasury rules below |
| CompanyDividends | new | End-of-term dividend/reinvest vote, split out of the treasury to stay under the size limit |
| SakartveloTimelock | new | 48-hour delay on every owner power (Finding 36) |
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

### v9 rules in one place (final, after three audit rounds)

**Share auctions (RoundAuctionV9)**
- A bid is a budget of INVEST plus a **max price per share**. Its
  effective price is the smaller of the two.
- Price of a share in a round: if every bid fits at the lowest effective
  price, that is the price (the paper's rule: the lowest bid buys a
  share). If the round is oversubscribed, the price is the **clearing
  price** — the highest price at which demand still covers the shares on
  offer. A tiny bid can never pin the price.
- Shares are rounded **down** and a bid pays exactly shares × price.
  Oversubscribed rounds are filled **pro rata**; a partly filled bid stays
  active for the next round.
- At most **150 shares per round** and 100 active bids (worst-case
  settlement 20.7M gas of Arbitrum's 32M). When the book is full, a new
  bid must have a higher effective price than the lowest, which is
  refunded and evicted.
- After each settlement a **1-hour cooldown**: no bidding; any active bid
  can be withdrawn.
- Each share is locked for 7 days from its own mint. One listing per
  share, deleted whenever it moves. No share can be sent to a company.
- **Company bids** come only from the treasury after a shareholder vote.
  The governor at that moment earns 1% of what the bid fills, counted
  cumulatively, locked 60 days.
- 1% host fee on every share sale.

**Elections and recall (GovernanceV9)**
- Vote weight everywhere = the **smaller** of shares held at the snapshot
  (one day before the vote opened) and shares held now.
- Anyone opens a 5-day candidacy period once 50% of shares are issued.
  Holders of 0.1% declare with a program; every holder **nominates** one
  candidate; the ballot is the 20 with the most nomination weight.
  Candidates others have nominated can't withdraw. Where companies hold
  shares, anyone may stand without a stake.
- Voting opens after the candidacy period; voters may vote **against
  all**. A winner needs 20% of the voting base and 51% of votes cast (or,
  with two or fewer left, strictly more than the runner-up and than
  "against all"). Otherwise a runoff (if turnout reached 20%) or a failed
  round; two failed rounds close the election.
- Company-held shares vote through their governor, never for that
  governor, and count in the base only when they vote.
- 30-day terms; the end of each term is recorded once. Operating keys are
  two-step (named by the governor, accepted by the key).
- **Recall**: opened by a 1% holder or a holding company; passes with 51%
  of votes and 33% turnout; only a recall that reached turnout starts a
  7-day cooldown.

**Treasury (CompanyTreasuryV9)**
- No free withdrawal, no fixed-price sales, no INVEST market.
- Two buckets per company and token: **capital** and **income**. Sale
  proceeds keep the bucket of what was sold.
- Every exit is a proposal by the governor, decided by shareholders:
  **payment**, **sale** (sealed-bid auction with a reserve; deposit 10% of
  the reserve; 1% host fee from the winning bid), or **investment** in
  another company (with a max price per share).
- The governor, the operating key and the recipient can't vote; their
  shares are out of the quorum base. Yes votes must reach 20% of the base
  (40% once the term's total passes 5% of the bucket) and 51% of votes
  cast.
- Payments, sales and investments together: at most **20% of a bucket per
  term**; sale proceeds can't be paid out in the same term.
- After the vote, a **5-day delay** before execution; an earlier-opened
  recall holds it back; a recall or the end of the term voids it.
  Proposals must leave room for all of this before the term ends.
- A failed transfer returns the money. Withdrawing a token's approval
  stops new deposits but never freezes balances.

**End-of-term vote (CompanyDividendsV9)**
- After each term, shareholders at the term's end vote **dividend** (1%
  of INVEST capital paid pro rata) or **reinvest** (1% moves to income).
  The winning side needs 20%; that term's governor can't vote.

**Verification and owner powers**
- OpenVerifierV2: ordinary wallets only, 0.0083 ETH balance check, at most
  50 new citizens per hour (10 in the audited draft, raised 13 Oct for launch); a guardian can only pause.
- InvestToken and every v9 contract are owned by a **48-hour timelock**.
  INVEST stays tradable: InvestToken keeps pointing at v8's RoundAuction.

## Decisions needed from Amiran (DECIDE) — answered above (kept for the record)

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
