# Tests

All tests run against a local chain ([anvil](https://book.getfoundry.sh/anvil/))
configured with Arbitrum One's real limits: 32,000,000 gas per
transaction and the 24,576-byte contract size cap. Contracts are
compiled with Solidity 0.8.34, optimizer 200 runs, viaIR, OpenZeppelin 5.x
(the same settings as the mainnet deploy).

| File | What it covers | Result (Oct 2026) |
|---|---|---|
| `roundauction.test.mjs` | RoundAuction v8 on its own: allocation, bid limits, carry-forward, refunds, corporate bids, share market, balance history | 33 passed |
| `roundauction.gas.mjs` | Worst-case settlement gas | 22.1M of 32M |
| `system.test.mjs` | All three contracts together, incl. the full corporate chain (asset sale → invest → corporate shares → corporate vote → corporate dividend) | 57 passed |
| `site-i18n.test.mjs` | Every English string on the site has a Georgian translation, and no translation is left over | 490 strings, all translated |
| `rehearse-fresh-deploy.mjs` | `REDEPLOY_V8.md` performed step by step with the same read-back checks, then a new citizen verifies, claims, bids and receives shares | all checks passed |
| `relock.test.mjs` | The experiment's re-lock intervention (TradabilityLock) | 16 passed |
| `v9.test.mjs` | The v9 contracts (FairRound names since 23 Oct 2026): normal behaviour, plus one attack per v8 Finding 23–40 and per finding of the three v9 audit rounds, each of which must fail; worst-case settlement gas | 134 passed; worst case 20.7M of 32M |
| `voted-unrig.test.mjs` | VotedUnrig (vUNRIG, burn-on-convert) with the v9 contracts and FairRoundTimelock: the 48-hour sink step, converting voted payments and won sales (UNRIG to the dead address), trading, and every way to mint without a vote (other wallet, rejected or pending proposal, unsettled sale, loser, double convert, small listing, stray UNRIG) | 40 passed |
| `rehearse-v9-deploy.mjs` | `DEPLOY_V9.md` step by step with read-back checks (deploy, wiring, do-not-touch checks, timelock hand-over, a timelocked listing), then a new citizen verifies with OpenVerifierV2, claims, bids and receives a v9 share | 28 passed |
| `rehearse-fairround-deploy.mjs` | `DEPLOY_FAIRROUND.md` step by step: the fresh FairRound set (InvestToken + v9 + FairRoundTimelock), six demo listings, timelock hand-over, closed-loop test credits, then a new wallet verifies, claims, bids, receives a unit and its metadata reads FairRound | 29 passed |
| `ui/` | The built website in Chromium: a visitor with no wallet browsing the register and looking up any portfolio (desktop, phone width, Georgian), a new wallet verifying and claiming, bidding, reading programs and voting, sealed bids, payment votes, the INVEST market, the governor's 5% transfer; every action checked on chain | 33 passed |

v8 contract tests expect compiled artifacts in `art8/art_<Name>.json`; the
v9 tests expect `art9/<Name>.art.json` (with `TestHelpersV9.sol` compiled
alongside); a gas-estimate buffer of 50% is patched in at the top, as a
wallet would add; the
site tests set `ART` to a folder of `<Name>.art.json` files. `ui/run-ui.sh`
starts the chain, deploys a test scenario, builds the site in local mode
(`VITE_NETWORK=local`) and serves it; then run `ui/ui.mjs`. Paths at the
top of the scripts point at the machine they were last run on.
