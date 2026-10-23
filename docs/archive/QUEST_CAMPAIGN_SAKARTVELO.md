# Quest campaign: "Become a Founding Citizen of Sakartvelo Exchange"

Ready-to-paste content for a Galxe (preferred) or Zealy quest.
Network: **Arbitrum One**. All on-chain tasks below can be checked automatically
by reading the contracts — no manual review needed.

---

## Campaign title
Become a Founding Citizen of Sakartvelo Exchange

## Short description (one line)
Claim your INVEST, buy shares in a privatized company, and vote for its governor — fully on-chain.

## Long description
Sakartvelo Exchange is a simulation of the privatization process on Arbitrum.
The process is real — tokens, auctions, elections and treasuries all run on
public smart contracts. Only the state assets are simulated.

Complete the steps below to become a Founding Citizen: claim 1,000 INVEST,
bid for shares in a company, and take part in its first governor election.
Your choices are also part of a live research experiment on how ownership
spreads or concentrates during privatization.

Site: https://www.sakartvelo-exchange.com/live
Research: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7419018

This is a research simulation, not financial advice. You pay only gas.
Never share your secret recovery phrase.

## Reward
A free **"Founding Citizen" badge** (Galxe OAT / Zealy role). No token reward —
participation itself is the point. Use the icon `brand/sakartvelo-icon-256.png`
as the badge image.

---

## Tasks

Social tasks need no setup beyond pasting the links. On-chain tasks use the
platform's **contract query** check: it calls a read-only function on the
contract with the participant's wallet and checks the result.

| # | Task (what the participant sees) | Type | How it is checked |
|---|---|---|---|
| 1 | Follow Sakartvelo Exchange on X | Social | Platform's built-in X follow check — paste your X profile link |
| 2 | Join r/SakartveloExchange | Social / link visit | Link visit (Reddit has no automatic check): `https://www.reddit.com/r/SakartveloExchange` |
| 3 | **Become a citizen and claim 1,000 INVEST** | On-chain | Contract `0x99ED3761F8416342D814ad4CCAe81993c2Ab7e4a` (InvestToken), function `claimed(address)` → must return `true` |
| 4 | **Own at least one company share** | On-chain | Contract `0x9739e5dCcc76BD424BcD12e7f1ce56143e77b796` (RoundAuction), function `balanceOf(address)` → must be greater than `0` |
| 5 | Read the white paper | Link visit | `https://www.sakartvelo-exchange.com/whitepaper` |
| 6 *(bonus, later)* | **Vote in a governor election** | On-chain | Contract `0x5668F72F3dB11c4DA6aF682604d1184763bB971d` (Governance), function `roundHasVoted(companyId, round, address)` → `true`. Fill in companyId and round when an election is open; add this task only then. |

### Task texts to paste

**Task 3 — Claim your INVEST**
> Open sakartvelo-exchange.com/live, connect MetaMask on Arbitrum (your wallet
> must hold at least 0.0083 ETH — it is checked, not spent), click **Verify**,
> then **Claim**. You receive 1,000 INVEST. Then come back and click Verify here.

**Task 4 — Buy your first share**
> On the same page, choose a company and place a bid with INVEST. When the
> round settles, your share is minted to your wallet as an NFT. Shares are
> split in proportion to bids, so even a small bid can win a share.
> Note: rounds take about an hour — come back after the round has settled.

**Task 6 — Vote for a governor (bonus)**
> When a company opens its governor election, read the candidates' programs on
> the company card and vote. Your vote weight equals your shares.

---

## Settings checklist

- Chain: **Arbitrum One**
- Campaign window: from launch until **8 November 2026** (end of the experiment window)
- Participant limit: none (or 300 to start, if the platform requires one)
- Sybil protection: turn on whatever free protection the platform offers
  (e.g. Galxe Passport or a minimum account age). Note in the experiment log
  which protection was used — it affects the results.

## Before launching

1. Make sure a **small company** is listed so task 4 can actually be completed
   quickly — big companies need many rounds before most people get a share.
2. Check that the site's Verify button works (OpenVerifier is switched **on**).
3. Add the launch date and quest link to the experiment log
   (`EXPERIMENT_EARLY_TRADABILITY.md`, section 7) — the quest is an
   intervention that changes who joins.
