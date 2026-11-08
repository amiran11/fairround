# Observation log

Field notes recorded as they happen, before analysis. Each entry says what was seen, where, when,
and what it can and cannot show. Screenshots are kept in [observations/](observations/).

**Anonymity:** third parties are not identified. Accounts are labelled A, B, C…; names, handles,
avatars, wallet addresses and transaction hashes are removed from text and screenshots. The
founder's own accounts and the public contracts are named.

Times are Tbilisi time (UTC+4). Times read from X are approximate: X shows "20h", "3h" and rounds
down, so each reply was posted at or before the time given.

---

## 2026-10-25 — First invited tester could not find the next step alone

*Recorded retroactively on 5 Nov 2026 from the founder's account of the session.*

**Setting:** one tester, onboarded in person by the founder in Singapore and asked for honest
feedback. The tester's wallet verified, placed a bid and settled two rounds (~24–25 Oct on
Arbiscan).

**Observation:** the tester completed the flow only with the founder telling him explicitly what to
do next at each step. Without that, he could not tell which action came after verifying, bidding or
waiting for a round to end.

**Response:** a step-by-step guide was added to the site: a guide bar that names the next action
for the visitor's current state, round timeline and safety cues on the auction page, and holding
cards on the portfolio page (PR #24, merged 31 Oct 2026).

**What this can and cannot show:** one tester, guided in person, so it says nothing about how often
the problem occurs. It shows that the flow was not self-explanatory for a first-time user, which is a
barrier to the organic participation the experiment depends on. Whether the guide removes the
barrier can only be seen once unassisted visitors arrive.

---

## 2026-11-05 — Promotion accounts arrive under the FairRound X post

**Source:** replies under a FairRound post on X, screenshot taken 5 Nov 2026 17:27
([observations/2026-11-05-x-replies.png](observations/2026-11-05-x-replies.png)).

| Account | Posted (approx.) | Reply | X label |
|---|---|---|---|
| A | 4 Nov ~21:27 | "Would love to explore collaboration with your team 🚀" | — |
| B | 5 Nov ~01:27 | "Let's take this shared drive and build something memorable 💎" | — |
| C | 5 Nov ~12:27 | "Let's pump it 💪 Can we talk privately? Dm me now" | Probable spam |
| D | 5 Nov ~13:27 | "Let's Grow 🤝 Followme Back?" | Probable spam |
| E | 5 Nov ~14:27 | "FREE collab 🚀 Let's work on the project, I CAN support." | — |

All five accounts carry a paid verification badge. None of the replies mentions anything specific
to FairRound (auctions, the vote, the free credits): each would fit under any token post. Earlier,
on 24 Oct, a self-described KOL manager opened with "Hey team, asked a question in DM", the same
pattern.

**Response:** no public replies; no links or shared files opened. One DM answered (account E, below)
to let a pitch run to the end.

**Follow-up, 5 Nov 23:09:** three of the five reply accounts moved to direct messages: A opened with "Hey 👋", D with
"Check 👆" and B with "Yo"
([observations/2026-11-05-x-dms.png](observations/2026-11-05-x-dms.png)). Every one of the DMs
pitched paid promotion services. Another account (F) had opened a DM four days earlier.
Pattern: a generic public reply, then a private sales pitch. None of the accounts verified a wallet
or placed a bid.

**Follow-up, 6 Nov: the first full pitch.** Account E (a large, years-old account) wrote
at 02:12: "your work stood out to me, would love to jump in and contribute, NO CHARGE." The founder
replied at 10:26, open to support and feedback, to let the pitch run. At 16:12 the pitch arrived:
"We can help successfully launch on pumpfun"
([observations/2026-11-06-account-e-pitch.png](observations/2026-11-06-account-e-pitch.png)). Three
things stand out: "I" became "we" (a service, not a person); "no charge" turned into a launch
service within one exchange; and the offer is a launch on pump.fun, a first-come memecoin launchpad,
which is the model FairRound was built to replace. Nothing in the pitch shows the project was read.

**Follow-up, 6 Nov 18:14: the playbook.** Asked what exactly they would do and what it costs, account
E proposed a call and sent a launch script
([observations/2026-11-06-account-e-playbook.png](observations/2026-11-06-account-e-playbook.png)):

1. Create the token on pump.fun from a "dev wallet" with 1 SOL.
2. The dev wallet sells straight away "to clear the bots".
3. A second, undisclosed "supply wallet" buys 25 SOL.
4. The dev wallet rebuys 1 SOL.
5. The dev wallet's tokens are locked.
6. The service posts in "alpha channels" and on X so trading monitors pick the launch up "before
   bonding".

In plain terms: the creator buys most of the early supply through a wallet the public cannot link
to them, locks only the small, visible dev wallet so the launch looks safe, and pays for coordinated
promotion to bring buyers in afterwards. The public then buys from a position the insider already
holds. No price was given; the next step offered was a call.

This is the launch pattern FairRound's rules are designed to rule out: in a FairRound listing every
filled bidder pays the same round price, so a hidden early wallet gains nothing from being first,
and the capital raised goes to a treasury that holders must vote on before anything is paid out.

### Comparison with site and on-chain activity

Read from Arbiscan on 5 Nov 2026 at 17:34–17:36 (OpenVerifierV2 and RoundAuctionV9 transaction lists;
screenshot: [observations/2026-11-05-arbiscan-verifier.png](observations/2026-11-05-arbiscan-verifier.png))
for the window of the replies, 4 Nov 21:00 to 5 Nov 18:00:

| Measure | In the window | Since deployment (23 Oct) |
|---|---|---|
| New wallet verifications (OpenVerifierV2) | 0 | 4 (1 on ~24–25 Oct, 3 on ~1 Nov) |
| Bids placed (RoundAuctionV9), any wallet | 0 | 4 (1 invited tester on ~24–25 Oct, 3 founder wallets on 1 Nov) |
| Site visits referred from X (analytics) | _to fill_ | — |

The one wallet outside the founder's three belongs to a tester the founder onboarded
in person in Singapore on 25 October. It placed a bid and settled two rounds. It is an invited
participant, not an organic arrival, so organic participation to date is zero.

The contract's last transaction before the read was the Fellowship settlement on ~2 Nov. Nothing
happened on chain while the five promotion replies arrived.

### What this can and cannot show

- **Can show:** whether the accounts that offered "collaboration" tried the product at all. If
  verifications and outside bids stay at zero while promotion replies keep arriving, the replies are
  sales outreach, not interest in the system.
- **Cannot show:** that a given account is automated. X handles cannot be linked to wallets, and a
  human running a promotion service behaves the same way. The finding is about behaviour (generic,
  fast, aimed at a private channel), not about who is typing.
- **Relevance to the pre-registration:** the research question on human versus bot arrival patterns.
  Promotion accounts arrived within hours of a post that mentions a token; outside participants in
  the protocol did not arrive in the same window.

---

## 2026-11-05 — Site funnel, first 28 days (Google Analytics)

**Source:** Google Analytics, Events report, 8 Oct to 4 Nov 2026, read 5 Nov
([observations/2026-11-05-ga-events-28d.png](observations/2026-11-05-ga-events-28d.png)). Counts
only visitors who accepted analytics cookies; "users" are browsers, not people or wallets.

| Step | Users (browsers) | Events |
|---|---|---|
| Visited (session_start) | 38 | 123 sessions |
| First visit | 35 | 35 |
| Used the step guide (guide_click) | 2 | 19 |
| Connected a wallet (wallet_connect) | 3 | 16 |
| Claimed free credits (claim_unrig) | 1 | 3 |
| Placed a bid (place_bid) | 1 | 3 |

**Reading:** the three claims and three bids from one browser match the founder's three wallets
bidding on The Fellowship on 1 Nov. The wallet connections and guide use fit the founder and the
invited tester. So, of 38 browsers that reached the site, about 35 left without connecting a wallet.
Traffic peaked around 9 Oct, 23–24 Oct and 1 Nov, in line with announcements and the Singapore
session.

**What this can and cannot show:** the drop-off for strangers happens at the very first step,
connecting a wallet. The step guide shows "Connect wallet" as its first action, so they saw the
guide's first step but did not take it; everything after it went unseen.
It cannot show why they left (no wallet, no interest, distrust, or just looking), and visitors who
declined cookies are missing entirely.

**Follow-up, same day: were the strangers searching for a currency exchange?** The old project name
("Sakartvelo Exchange") could attract people looking for a Georgian currency exchange. Google Search
Console, 4 Aug to 3 Nov 2026
([chart](observations/2026-11-05-search-console-3m.png),
[queries](observations/2026-11-05-search-console-queries.png)): 37 impressions and 7 clicks from
Google search in three months, about 3 of them between 8 Oct and 4 Nov. The only query Google shows
is "valuta saqartvelo" (1 impression, 0 clicks); the rest are hidden as too rare. So search, of any
kind, explains at most a few of the ~35 first visits in the funnel window. The currency-exchange
explanation is ruled out for most of them: the strangers came by direct links or social posts, and
still did not connect a wallet.

---

## 2026-11-07 — First on-topic contact: a question about the mechanism

**Source:** X, a reply thread and a DM to the FairRound account under the X thread of 6 Nov
([observations/2026-11-07-account-g-question.png](observations/2026-11-07-account-g-question.png)).

Account G (a smaller account, about a thousand followers) liked the thread and replied publicly:
"People tend to think being first actually means getting it right early whereas they might have
some worst haha". Its DM, sent 07:13: "I like the one-clearing-price auction and holder-voted
treasury proposals. What will determine when demo listings move to real-money launches?"

**Difference from accounts A–F:** the message names two specific FairRound mechanisms and asks a
question about the project's path, so the sender has read the project. It does not offer a service.

**What this can and cannot show:** one message cannot show intent; outreach accounts can also open
with a specific question. It is the first contact that engaged with the mechanism itself. Whether
it leads to a wallet verification will show on chain.

**Prediction recorded before the outcome (founder, 7 Nov 23:42):** account G will reply by 8 Nov,
at the latest within 3 days (by 10 Nov), and the reply will include some kind of proposal. The
furthest step G takes in the protocol will be claiming the free credits, possibly none: no bid.
To be checked against the chain and the DMs, and the result recorded here whether it holds or not.

**Follow-up, 8 Nov 17:19 (first part of the prediction checked):** G replied within a day. The
reply praised the project's transparency, in particular that the founder logged the credit
(Sybil) weakness himself, then made an offer: to "drive that first wave of users, get them
claiming credits, and actually coordinate that first vote". G said they would test the settlement
flow now. Timing and "includes a proposal": **held.** The protocol part (claim at most, no bid) is
still open and will be checked on chain.

The offer would undermine the test it claims to help: a group recruited and coordinated by one
person measures that person's coordination, not how independent users behave. The founder
declined recruitment and coordinated voting and kept the invitation to test individually.
