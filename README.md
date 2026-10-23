# FairRound

**Launch without the rug.** The on-chain IPO exchange for crypto projects,
on Arbitrum: projects list through fair rounds (one clearing price per
round, equal access for small buyers, the raise held in a treasury only
holders can spend), then their units trade on the market.

Live at **[fairround.xyz](https://fairround.xyz)** as a working demo on
Arbitrum One mainnet since 23 October 2026. Bids use UNRIG, a free test
credit with no value; the demo listings are fictional.

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
| InvestToken (UNRIG test credits) | `0xbc780aeB45FdDA0258aB163a99fE92f97209E2c0` |
| RoundAuctionV9 | `0xb08631827d87C69Ff44d692EEFF32E1b22E4c503` |
| GovernanceV9 | `0x2fd99a2328866E458Cbc38266c9ff49319A7613b` |
| CompanyTreasuryV9 | `0xD2107dEE7EA2E8038F7778f63Cf6Eee659dB1F29` |
| CompanyDividendsV9 | `0x91B05614ae7c6cA516820317aDf3D03cCa056C73` |
| OpenVerifierV2 | `0x0d07CB79b17229d6301E96dBfEDf09e76c9d68C7` |
| FairRoundTimelock (owner, 48h) | `0x15FC689FD5ba86D3FC052E6E1E7b48623c17732A` |

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
