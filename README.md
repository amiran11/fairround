# FairRound

**Launch without the rug.** Fair token launches on Arbitrum: one clearing
price per round, equal access for small buyers, and a raise held in a
treasury only holders can spend.

Live at **[fairround.xyz](https://fairround.xyz)** as a working demo on
Arbitrum One mainnet since 14 October 2026. Bids use INVEST, a free test
credit with no value; the demo launches are fictional.

## How it works

1. **Equal access.** Each verified wallet gets the same starting
   allocation; at most 150 units sell per round, and oversubscribed rounds
   fill every bid pro rata, so small buyers are filled instead of crowded
   out.
2. **One price.** Bids collect for an hour; everyone filled in a round pays
   the same clearing price. Speed and gas give no edge.
3. **The raise stays with holders.** 99% of what buyers pay goes into the
   project treasury; 1% is the FairRound fee.
4. **Holders control spending.** Every payment is a holder proposal with a
   5-day delay, capped at 20% of a bucket per term.
5. **Holders can remove the lead.** Once half is sold, holders confirm a
   project lead for 30 days and can vote them out.

Bought units lock for 7 days. Every admin change goes through a public
48-hour timelock; the two instant powers are disclosed on the site.

## Contracts (Arbitrum One, verified on Arbiscan)

| Contract | Address |
|---|---|
| InvestToken (test credits) | `0x99ED3761F8416342D814ad4CCAe81993c2Ab7e4a` |
| RoundAuctionV9 | `0x65D37C51ec85584222aBA16e6B60B3Cd4BD6090f` |
| GovernanceV9 | `0x044213A8c8b7C83E6A00cac1BbC8962B4b0Ebe85` |
| CompanyTreasuryV9 | `0x70ffEeAabAaE49cB969ADC8137A3DeD94c8F1B75` |
| CompanyDividendsV9 | `0x641f3864F7dcbD6630D21247e8DA123A2A138023` |
| OpenVerifierV2 | `0xB055dB6E1291Ac08f581D3ce0a48791b4633AD5A` |
| SakartveloTimelock (owner, 48h) | `0xBD357971d9935c68c39a2B7e4Fbf33ffC23adF6f` |

Contract names come from the project's first version, Sakartvelo Exchange,
a privatization simulation; the code is product-neutral.

## In this repository

- `contracts/` — Solidity sources (0.8.34, optimizer 200, viaIR).
- `site/` — the website (Vite + React), English and Georgian.
- `test/` — contract tests, deploy rehearsals and browser tests, all on a
  local chain with Arbitrum's limits (`test/README.md`).
- `SECURITY_REVIEW.md` — every finding and fix, linked to commits. Reviewed
  by the author with AI assistance; not yet externally audited.
- `DEPLOY_V9.md` — the Arbitrum One deploy; `DEPLOY_ROBINHOOD.md` — the
  Robinhood Chain deploy checklist.
- `MARKETING_KIT.md`, `brand/` — words and images.
- `docs/archive/` — Sakartvelo Exchange material.

## Not solved yet

Test credits, not real money; no trading pool after a sale; verification
checks a wallet balance, not a person; one admin key behind the timelock;
no external audit. Real-money launches (ETH/USDG bids, ERC-20 tokens, pool
seeding, a factory) come after an external audit.

## Research

The mechanism grew out of research on 1990s voucher privatization:
"Monetization, Privatization, Capitalization" (SSRN, 2026).
