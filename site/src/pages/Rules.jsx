import { Link } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { getPublicStats, getRoundAuctionRules, ACTIVE_NETWORK } from "../web3.js";
import { int, useChain } from "../components/liveUtils.js";
import { LINKS } from "../components/Layout.jsx";
import { usePageTitle } from "../meta.js";

// Every number here is the deployed contracts' own (v8, October 2026).
// Where the contract can report it, it's read live.
export default function Rules() {
  const { t } = useT();
  usePageTitle(t("Rules"), t("How Sakartvelo Exchange works: citizens, share auctions, elections, the treasury and dividends, as the contracts on Arbitrum One enforce them."));
  const [stats] = useChain(getPublicStats, []);
  const [rules] = useChain(getRoundAuctionRules, []);
  const maxCit = stats ? int(stats.maxCitizens) : "300,000";
  const perRound = rules ? int(rules.maxSharesPerRound) : "300";
  const maxBids = rules ? int(rules.maxActiveBids) : "100";

  return (
    <div className="page" style={{ paddingTop: 48 }}>
      <article className="prose">
        <h1 className="h1">{t("Rules")}</h1>
        <p className="lede">{t("These are the rules the contracts enforce today, in plain words. If this page and the contracts ever disagree, the contracts win; their source is public and verified.")}</p>

        <h2 className="h2">{t("What is real")}</h2>
        <p>{t("The process is real. Every claim, bid, vote and payment is a transaction on {network} that anyone can check. The companies are fictional, named after real Georgian places and industries, and INVEST is not money or an investment: it has no value outside this simulation.", { network: ACTIVE_NETWORK.label })}</p>
        <p>{t("One owner wallet can still list companies, decide which tokens are accepted as payment, change the citizen limit and switch self-verification on or off. It cannot move anyone's INVEST or shares.")}</p>

        <h2 className="h2">{t("The life of a company")}</h2>
        <ol>
          <li>{t("It is listed with a fixed number of shares and a round length.")}</li>
          <li>{t("Its shares are sold in rounds to the highest bidders, until all are sold.")}</li>
          <li>{t("Once half the shares are sold, shareholders elect a governor.")}</li>
          <li>{t("The governor runs the company for 30 days, then a new election starts.")}</li>
          <li>{t("After every term, shareholders vote on paying a dividend.")}</li>
        </ol>

        <h2 className="h2">{t("Citizens and INVEST")}</h2>
        <p>{t("A wallet becomes a citizen by verifying itself: the contract checks that it holds at least 0.0083 ETH on {network}. The ETH is not taken. Each citizen then claims 1,000 INVEST, once. There are {max} citizen places.", { network: ACTIVE_NETWORK.label, max: maxCit })}</p>
        <p>{t("The balance check makes it cost something to create wallets, but one person can still verify several. Telling people apart needs real identity checks, which this simulation doesn't have.")}</p>
        <p>{t("INVEST was designed to stay in the system — usable only for bidding — until the first company had sold 51% of its shares; after that, it can move freely between wallets. That point was reached early, on 9 October 2026, through a one-share test company. The project treats this as an experiment and published its plan in advance.")} <a href={LINKS.experiment} target="_blank" rel="noreferrer">{t("Read the plan")}</a></p>

        <h2 className="h2">{t("Share auctions")}</h2>
        <p>{t("Each company sells its shares in rounds. A round lasts the company's round length (usually an hour), and up to {perRound} shares are sold in each. Anyone with INVEST can bid; each wallet has one bid per company, of at least 1 INVEST, and a company holds at most {maxBids} bids at a time.", { perRound, maxBids })}</p>
        <p>{t("When a round ends, anyone can settle it:")}</p>
        <ul>
          <li>{t("The lowest bid buys one share, so its amount becomes the price of a share for that round.")}</li>
          <li>{t("Every other bid is worth its amount divided by that price, rounded up.")}</li>
          <li>{t("Bids are filled from the highest down, each in full or not at all. A bid that doesn't fit waits for the next round; bids can't be withdrawn.")}</li>
          <li>{t("A winning bid is spent in full: 99% becomes the company's capital and 1% goes to the host.")}</li>
          <li>{t("When the last share is sold, every bid still waiting is refunded.")}</li>
        </ul>
        <p>{t("Shares are tokens (NFTs) in the holder's wallet. For 7 days after a company's first share is issued none of its shares can move; after that they can be sent, or offered for sale for INVEST through the auction contract.")}</p>

        <h2 className="h2">{t("Elections")}</h2>
        <p>{t("Once half of a company's shares are sold, any shareholder with at least 0.1% of the shares issued so far can stand for governor, with a written program of up to about 700 words. A company can have at most 20 candidates.")}</p>
        <p>{t("Anyone can open voting, which closes the list of candidates. Voting lasts 3 days, and each wallet votes with the shares it held one second before voting opened, so moving shares during a vote changes nothing.")}</p>
        <ul>
          <li>{t("A candidate with 51% of the votes cast wins.")}</li>
          <li>{t("If only two candidates are left, the one with more votes wins.")}</li>
          <li>{t("Otherwise the top two go to a 3-day runoff.")}</li>
          <li>{t("If nobody votes, voting reopens for another 3 days.")}</li>
        </ul>

        <h2 className="h2">{t("The governor")}</h2>
        <p>{t("A governor serves one 30-day term. They act through an operating key: a separate wallet they register for that term only, which stops working when the term ends. When a term is over, anyone can start the next election.")}</p>
        <p>{t("With the operating key, a governor can:")}</p>
        <ul>
          <li>{t("move up to 5% of each token the company holds per term, without a vote;")}</li>
          <li>{t("sell company tokens at a sealed-bid auction (2 days of sealed bids, 1 day to reveal, highest bid wins);")}</li>
          <li>{t("propose a larger payment, which shareholders vote on for 3 days: it needs 20% of the shares to vote and 51% of the votes to approve;")}</li>
          <li>{t("bid in another company's auction with the company's income (never its capital) and receive 1% of the shares won, locked for two terms;")}</li>
          <li>{t("vote the company's shares in other companies, and offer company INVEST on the INVEST market.")}</li>
        </ul>

        <h2 className="h2">{t("Dividends")}</h2>
        <p>{t("After each term, anyone can open a 3-day vote: pay 1% of the company's capital to shareholders as a dividend, or keep it. The dividend is paid only if more shares vote for it than against. Voting and payout both use the shares held at the moment the term ended.")}</p>

        <h2 className="h2">{t("Known problems")}</h2>
        <p>{t("A review of these contracts in October 2026 found weaknesses that matter once real money is involved. The most serious:")}</p>
        <ul>
          <li>{t("A governor can sell the company's INVEST capital on the market, at any price, without a vote.")}</li>
          <li>{t("A governor holding about 20% of the shares can approve their own payment.")}</li>
          <li>{t("A candidate can close the list of candidates by opening voting straight after declaring.")}</li>
          <li>{t("One very small bid can set a very low price for a whole round.")}</li>
        </ul>
        <p>
          {t("A new version that fixes these has been written and reviewed, and will go live alongside this one; nobody's INVEST or shares are moved or switched off.")}{" "}
          <a href={LINKS.security} target="_blank" rel="noreferrer">{t("Read the security review")}</a>
        </p>

        <p style={{ marginTop: 48 }}><Link to="/" className="btn btn-secondary">{t("Back to the register")}</Link></p>
      </article>
    </div>
  );
}
