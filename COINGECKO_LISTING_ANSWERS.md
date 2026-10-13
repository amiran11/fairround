# CoinGecko listing form — ready answers for INVEST

Copy-paste these into the CoinGecko listing request form (not the paid "advertise" page).

## Basic token info
- Name: Invest
- Symbol: INVEST
- Chain: Arbitrum One
- Contract address: 0x99ED3761F8416342D814ad4CCAe81993c2Ab7e4a
- Decimals: 18
- Website: https://www.sakartvelo-exchange.com
- White paper: https://www.sakartvelo-exchange.com/whitepaper
- Research paper: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7419018

## 6. Coin Holders & Distribution Schedule
- Top Holder List URL: https://arbiscan.io/token/0x99ED3761F8416342D814ad4CCAe81993c2Ab7e4a#balances
- Distribution Schedule:
  https://www.sakartvelo-exchange.com/whitepaper
  https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7419018

## 7. Supply Information
- Token Generation Date (TGE): Oct 08, 2026
- Emission type: claim-based (each verified citizen claims 1,000 INVEST once; no pre-mine, no team allocation)
- Max supply: 300,000,000 INVEST (300,000 citizens x 1,000) — currently capped, cap is admin-adjustable

## 8. Total Supply
- Total Supply Amount: copy "Max Total Supply" from the Arbiscan token page on the day you submit
- Burned Wallet #1:
  - Wallet Description: No burns: gap to max supply is unclaimed (mint-on-claim)
  - Chain: Arbitrum One
  - Wallet Address: 0x000000000000000000000000000000000000dEaD
  - Wallet Balance: 0
  - Own by: None (standard burn address)

## 9. Circulating Supply
- Circulating = Total − RoundAuction balance − CompanyTreasury balance − your own wallets
- Vested/Locked wallets:
  - RoundAuction (bid funds and company capital): 0x9739e5dCcc76BD424BcD12e7f1ce56143e77b796
  - CompanyTreasury (company treasuries): 0xaD50c4726E78a8e8a18a1A188bd60E7ef0A501e8
- Supply API fields: leave empty

## 10. Initial Token Allocation
- Allocation Name: Citizen Claim (Airdrop)
- Percentage of Allocation: 100
- TGE Percentage: 0
- Cliff Period (Months): 0
- Vesting Period (Months): 0
- Release Schedule:
  No pre-mine. Tokens are minted only when a verified citizen claims: 1,000 INVEST per citizen, once, on demand. Supply grows with each claim up to the cap of 300,000 citizens (300,000,000 INVEST); the cap is admin-adjustable. No team, investor or treasury allocation.

## 12. Community
- Subreddit: https://www.reddit.com/r/SakartveloExchange (once created)

## Categories
Category 1: Governance
Reason 1:
INVEST is the governance and participation token of Sakartvelo Exchange, an on-chain simulation of state-asset privatization. Holders use INVEST to bid for company shares in round auctions; shareholders then elect company governors (51% majority with runoff, candidates publish programs before voting) and approve treasury payments and dividends by weighted vote. Governance contract: https://arbiscan.io/address/0x5668F72F3dB11c4DA6aF682604d1184763bB971d#code  White paper: https://www.sakartvelo-exchange.com/whitepaper

Category 2: Stock market-themed
Reason 2:
Sakartvelo Exchange is themed as a national stock exchange for privatized state companies. INVEST is used to buy company shares (minted as NFTs) in proportional round auctions; each listed company has a fixed share count, shareholder voting rights, an elected governor, a treasury, and end-of-term dividends. All companies are simulated. Live exchange: https://www.sakartvelo-exchange.com/live  Auction contract: https://arbiscan.io/address/0x9739e5dCcc76BD424BcD12e7f1ce56143e77b796#code

Category 3: Arbitrum Ecosystem
Reason 3:
All Sakartvelo Exchange contracts are deployed and verified on Arbitrum One (chain ID 42161): InvestToken, RoundAuction, Governance, CompanyTreasury and OpenVerifier. Token contract: https://arbiscan.io/token/0x99ED3761F8416342D814ad4CCAe81993c2Ab7e4a  Research paper: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7419018

## Before submitting
- CoinGecko usually requires the token to already trade in a pool (e.g. Uniswap) with real volume.
- Decide first: traded token, or locked pilot (TradabilityLock). Don't list if locking.
