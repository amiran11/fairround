# FairRound brand

Plain paper, near-black type, and one ink: the violet-blue of an official
stamp. The mark is a ring cut into eight equal slices (everyone gets the same
share of the round) around balanced scales (one fair price for all).

## Colours

| Name | Light | Dark | Use |
|---|---|---|---|
| Paper | `#F4F4F1` | `#15161A` | Background |
| Ink | `#1B1D21` | `#E9E9EC` | Text |
| Graphite | `#5B6068` | `#A0A3AB` | Secondary text |
| Rule | `#D3D4D6` | `#30323A` | Lines |
| Stamp | `#3B3A9F` | `#ABA8F2` | The mark, stamps, actions |
| Stamp wash | `#E7E6F5` | `#25244A` | Tinted panels |
| On stamp | `#FBFBF9` | `#15161A` | Text and mark on a stamp-coloured fill |

## Type

Archivo (variable; the `wdth` axis wide for headlines). Noto Sans Georgian
for Georgian text. Both SIL Open Font License.

## Words

- Name: **FairRound** (one word, capital F and R). Domain: fairround.xyz.
- Tagline: **Launch without the rug.**
- Slogan: **Diversified ownership defines the price.**

## Files

| File | Size | Where |
|---|---|---|
| `fairround-icon-512.png` | 512×512 | App icon, profile pictures with rounded corners (same as the favicon) |
| `fairround-mark-512.png` | 512×512, transparent | The mark alone, for light backgrounds |
| `fairround-banner-1920x384.png` | 1920×384 | Reddit, LinkedIn, YouTube, Telegram banner |
| `x/x-profile-400.png` | 400×400 | X profile picture (full-bleed for the circle crop) |
| `x/x-header-1500x500.png` | 1500×500 | X header; text sits clear of the profile picture |
| `x/x-post-how-it-works-1600x900.png` | 1600×900 | Pinned post: the three rules |
| `x/x-post-call-for-testers-1600x900.png` | 1600×900 | Call for testers (Open House) |
| `../site/public/og-image.png` | 1200×630 | Link preview for the site |
| `../site/public/favicon.svg` | vector | Browser tab icon |
| `unrig-token-logo.svg`, `-512.png`, `-256.png`, `-32.png` | round, transparent corners | UNRIG token logo for Arbiscan/Blockscout token info, CoinGecko, wallets (made by `make-token-logo.mjs`) |

Sakartvelo Exchange images are kept in `archive/`. Token logo
`invest-logo-200.png` stays: it is the logo of the INVEST test-credit token
on-chain.

## Regenerating

`make.mjs` renders every image with Playwright from `mark-lib.mjs` (the
mark). Put `a.woff2` (Archivo) and `g.woff2` (Noto Sans Georgian) in a
folder, then run `BRAND_TMP=<that folder> REPO=<repo root> node brand/make.mjs`.
