# FairRound: mechanism and field results

**Short version.** FairRound is a token launch mechanism on Arbitrum One that ties a fair start
(sealed rounds, one clearing price) to rules for after the launch: a treasury that can spend at most
5% per 30-day term, only by holder vote, only after a 5-day wait, with a lead the holders can
recall. We ran one listing through its whole life on-chain (Oct–Nov 2026). The contract rules
held. Distribution failed: almost nobody outside the founder used it. This note sets out both,
with the evidence, for anyone building launch or treasury mechanisms.

Status: live test with free test credits (UNRIG) that have no value. Contracts are source-verified
but **not audited**. Not an offer of anything. Pre-registration:
[DOI 10.5281/zenodo.23844124](https://doi.org/10.5281/zenodo.23844124).

## The mechanism

| Stage | Rule | What it's for |
|---|---|---|
| Entry | One verified wallet = 1,000 free UNRIG. Ordinary wallets only, 0.0083 ETH balance at verification, at most 50 a hour. | Friction against bot farms (weak, see below). |
| Round | Sealed bids, each with a budget and a price limit. One uniform clearing price that sells the most units. At most 150 units a round, no issuer reserve. | No sniping, no first-block advantage, no front-running. |
| Units | ERC-721, minted only at settlement; the total is fixed at listing. | Ownership is countable and visible. |
| Lead | Elected once 50% is sold: 5-day candidacy, 3-day vote, 20% turnout and 51% of votes to win. The lead acts only through a separate operating key. | Accountable management. |
| Treasury | Payments, investments and sales together capped at **5% per 30-day term**. Holder vote (20% quorum, lead excluded), then a **5-day delay** before anyone can execute. | Slow, visible, bounded spending. |
| Recall | 1% of units can open a recall of the lead, including during the 5-day delay. | Holders can stop a payment by removing its author. |
| vUNRIG | A voted payment in UNRIG can be burned 1:1 into vUNRIG by its recipient only. | Only voted money becomes "real". |

Contracts (Arbitrum One, verified): RoundAuctionV9
[`0xb086…c503`](https://arbiscan.io/address/0xb08631827d87C69Ff44d692EEFF32E1b22E4c503),
CompanyTreasuryV9 [`0xD210…1F29`](https://arbiscan.io/address/0xD2107dEE7EA2E8038F7778f63Cf6Eee659dB1F29),
GovernanceV9 [`0x2fd9…613b`](https://arbiscan.io/address/0x2fd99a2328866E458Cbc38266c9ff49319A7613b),
vUNRIG [`0xe945…9684`](https://arbiscan.io/address/0xe945B87f8B506B05Eb50c5d19ffe954398E49684).

## What we tested, and what held

The founder captured one small listing (9 units) with four of his own wallets: bought every unit,
elected himself, proposed a payment to his own third wallet, voted it through and converted it.
This is exactly what an attacker would do, and we published every step with transaction hashes:
[Fellowship playbook](FELLOWSHIP_PLAYBOOK.md).

| Check | Result |
|---|---|
| Full cycle, bid to vUNRIG | Worked: 1 Nov bid, 10 Nov lead elected, 13 Nov vote 3–0, 18 Nov executed and converted. 148 vUNRIG minted. |
| Overspend through the site | Blocked by the site. |
| Overspend straight to the contract | **Reverted by the contract:** `CT: over 5% of the bucket this term`. |
| Paying the lead's own wallet | Blocked. |
| Pace | 17 days from purchase to first vUNRIG. The waiting periods, not gas, set the speed. |

## What failed or stayed untested

- **Wallet friction is weak.** The 0.0083 ETH check is a balance check, not a deposit: we verified
  several wallets with one balance passed along. 50 per hour still allows about 1,200 wallets a day.
- **Rules can't protect a listing one person owns.** With no independent holders, every check
  passed. Fairness needs diverse, active holders, which the mechanism cannot create on its own.
- **Distribution.** In a 28-day window: 38 browsers, 3 wallet connections, 1 claim, 1 bid, all
  from the founder and invited testers. Most inbound contact on X was people selling reach
  (paid promotion, "community growth", engagement pods), not users. Details in the
  [observation log](OBSERVATIONS.md).
- **Market.** An open Uniswap pool (148 vUNRIG at about 0.01 ETH, sell-only, opened 22 Nov):
  0 swaps so far.
- **No attack was ever attempted on-chain**, so swarm resistance is unproven, not demonstrated.
  The likely reason: nothing of value to extract.
- **Wallet scanners.** MetaMask flagged vUNRIG "Malicious" because the burn-by-transfer looks
  like a drainer. Reported; Blockaid marked it benign two days later.

## Open questions

1. Is a sealed, per-round uniform price better than a continuous clearing auction for small
   communities, or only different?
2. Can treasury caps plus recall substitute for futarchy or legal wrappers as investor protection?
3. What is the cheapest real cost per wallet (stake, deposit, proof of personhood) that stops
   farming without turning people away?
4. How does an honest solo builder carry audit and licensing costs that a rug-puller simply skips?

Critique is welcome, especially on swarm resistance and on the treasury rules. Contact: X
[@fairround](https://x.com/fairround) or an issue on this repository.
