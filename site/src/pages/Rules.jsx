import { Link } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { getPublicStats, ACTIVE_NETWORK, CONTRACT_ADDRESSES } from "../web3.js";
import { int, useChain } from "../components/liveUtils.js";
import { LINKS } from "../components/Layout.jsx";
import { usePageTitle } from "../meta.js";

// Every number here is the version 9 contracts' own. If a contract can
// report a number, it is read live.
export default function Rules() {
  const { t } = useT();
  usePageTitle(t("Rules"), t("How FairRound works: investors, launch rounds, project lead elections, the treasury and dividends, as the contracts on Arbitrum One enforce them."));
  const [stats] = useChain(getPublicStats, []);
  const maxCit = stats ? int(stats.maxCitizens) : "300,000";

  return (
    <div className="page" style={{ paddingTop: 48 }}>
      <article className="prose">
        <h1 className="h1">{t("Rules")}</h1>
        <p className="lede">{t("These are the rules the contracts enforce, in plain words. If this page and the contracts ever disagree, the contracts win; their source is public and verified.")}</p>
        <p className="muted">{t("These are the version 9 contracts, deployed fresh for FairRound on 23 October 2026.")}</p>

        <h2 className="h2">{t("What is real")}</h2>
        <p>{t("The process is real. Every claim, bid, vote and payment is a transaction on {network} that anyone can check. The ten demo listings are fictional tiers, from The Chosen One (1 unit) to Xerxes' Host (300,000). UNRIG is a free test credit with no value. It only moves between your wallet and the FairRound contracts, so it can't be traded, and it is not an investment product.", { network: ACTIVE_NETWORK.label })}</p>
        <p>{t("No single person can move value out of a project, and nobody, the site administrator included, can move anyone's UNRIG or units.")}</p>

        <h2 className="h2">{t("What the site administrator can do")}</h2>
        <p>{t("The site administrator can list projects, approve tokens for project treasuries, change the investor limit, choose who may verify investors, and switch whether UNRIG can be sent between wallets, including freezing it. Because the administrator chooses the verifiers, they could also, in principle, create new investors and with them new UNRIG.")}</p>
        <p>{t("These powers go through a public timelock: a change is scheduled first, anyone can see it, and it can only take effect 48 hours later.")}</p>
        <p>{t("One power is instant: the administrator can pause new investors, which stops new wallets from verifying and touches nothing else.")}</p>
        {CONTRACT_ADDRESSES.FairRoundTimelock && (
          <p><a href={`${ACTIVE_NETWORK.blockExplorerUrls[0]}/address/${CONTRACT_ADDRESSES.FairRoundTimelock}`} target="_blank" rel="noreferrer">{t("See every scheduled change on Arbiscan")}</a></p>
        )}

        <h2 className="h2">{t("Risks, and how they are handled")}</h2>
        <dl className="stack-sm">
          <div><dt className="strong">{t("One person, many wallets.")}</dt><dd style={{ margin: 0 }}>{t("Verification checks a wallet's balance, not who owns it, so one person can verify several wallets. To slow this down, only ordinary wallets can verify, each needs 0.0083 ETH, at most 50 can verify an hour, and new verifications can be paused. Real-money launches will need proof of personhood.")}</dd></div>
          <div><dt className="strong">{t("A rich buyer taking over a project.")}</dt><dd style={{ margin: 0 }}>{t("Someone with a lot of UNRIG can buy a majority. They can't do it quickly or quietly: a round sells at most 150 units, every bid is public, and everyone in a round pays the same price. Whatever they pay becomes the project's capital, which they can't take back out without the holders' vote.")}</dd></div>
          <div><dt className="strong">{t("A project lead misusing project money.")}</dt><dd style={{ margin: 0 }}>{t("The project lead can only propose. Every payment, sale or investment is voted on by holders, the project lead can't vote on their own proposal, an approved proposal waits 5 days before it runs, at most 5% of a bucket can be spent per term, and holders can vote the project lead out.")}</dd></div>
          <div><dt className="strong">{t("Bugs in the contracts.")}</dt><dd style={{ margin: 0 }}>{t("The contracts were reviewed in several rounds by AI agents, every finding was fixed and tested, and the full record is public. There has been no paid external audit. The contracts can't be upgraded, so the code you see on Arbiscan is the code that runs.")}</dd></div>
          <div><dt className="strong">{t("Losing your wallet, or being scammed.")}</dt><dd style={{ margin: 0 }}>{t("Nobody can recover a lost wallet or reverse a transaction, the site administrator included. Keep your secret phrase offline. Nobody from this project will ever ask for it.")}</dd></div>
          <div><dt className="strong">{t("Everything you do is public.")}</dt><dd style={{ margin: 0 }}>{t("Anyone can look up any wallet on the Portfolio page and see its units, bids, votes and roles, including every project lead's and every large buyer's. That works both ways: your own holdings and votes are public too, and anyone who links your wallet to your name can see them. Use a wallet you're comfortable being seen.")}</dd></div>
        </dl>
        <p><a href={LINKS.security} target="_blank" rel="noreferrer">{t("Read the full security review")}</a></p>

        <h2 className="h2">{t("The life of a project")}</h2>
        <ol>
          <li>{t("It is listed with a fixed number of units and a round length.")}</li>
          <li>{t("Its units are sold in rounds to the bidders who pay the most per unit, until all are sold.")}</li>
          <li>{t("Once half the units are sold, holders elect a project lead.")}</li>
          <li>{t("The project lead runs the project for 30 days and proposes what it pays, sells and invests; holders vote on each proposal.")}</li>
          <li>{t("After every term, holders vote on a dividend, and a new election can start.")}</li>
        </ol>

        <h2 className="h2">{t("Investors and UNRIG test credits")}</h2>
        <p>{t("A wallet becomes a investor by verifying itself: only ordinary wallets can, the contract checks that it holds at least 0.0083 ETH on {network} (nothing is taken), and at most 50 wallets an hour can verify. Each investor then claims 1,000 UNRIG, once. There are {max} investor places.", { network: ACTIVE_NETWORK.label, max: maxCit })}</p>
        <p>{t("This makes creating wallets cost something, but one person can still verify several. Telling people apart needs real identity checks, which this demo doesn't have yet.")}</p>
        <p>{t("UNRIG can't be sent between wallets. It only moves between your wallet and the FairRound contracts: you bid with it, get refunds and dividends in it, and projects hold it.")}</p>

        <h2 className="h2">{t("Unit auctions")}</h2>
        <p>{t("Each project sells its units in rounds of a fixed length, up to 150 units a round. A bid is an amount of UNRIG plus, if you want, the most you'll pay for one unit. Each wallet has one bid per project, of at least 1 UNRIG, and a project holds at most 100 bids. When the book is full, a new bid must offer a higher price per unit than the lowest, which is refunded.")}</p>
        <p>{t("When a round ends, anyone can settle it:")}</p>
        <ul>
          <li>{t("If every bid fits, the lowest bid's price per unit is the price, and every bid buys as many whole units as it can at that price.")}</li>
          <li>{t("If more units are wanted than offered, the price is the highest at which the bids still want every unit on offer, and the units are shared out in proportion.")}</li>
          <li>{t("A bid whose price limit is below the round's price buys nothing that round.")}</li>
          <li>{t("Each bid pays only for its units. A bid that got all it could is closed and the rest refunded; a bid that got some keeps the rest for the next round.")}</li>
          <li>{t("Of what is paid, 99% becomes the project's capital and 1% goes to the host.")}</li>
          <li>{t("The next round opens an hour after settlement. During that hour nobody can bid and anyone can withdraw their bid. When the last unit is sold, every remaining bid is refunded.")}</li>
        </ul>
        <p>{t("Units are tokens (NFTs) in the holder's wallet. Each can be moved or sold 7 days after it was issued. Holders can offer units for sale at their own price on the unit market. Nobody can send units to a project.")}</p>

        <h2 className="h2">{t("Elections")}</h2>
        <p>{t("Once half of a project's units are sold, anyone can open an election. Units count as they were one day before it opened, and a wallet only counts with the units it still holds, so borrowing units for a vote gains nothing.")}</p>
        <ol>
          <li>{t("For 5 days, holders with at least 0.1% of the units stand as candidates with a written program, and every holder can back one candidate with their units. The 20 candidates with the most backing make the ballot. A candidate others have backed can't withdraw.")}</li>
          <li>{t("Then anyone opens 3 days of voting. Each holder votes for one candidate on the ballot, or against all of them.")}</li>
          <li>{t("A candidate wins with the votes of at least 20% of the units and 51% of the votes cast. With only two candidates left, more votes than the other and than “against all” is enough.")}</li>
          <li>{t("Otherwise, if more than two candidates are left and at least 20% of the units voted, the top two go to a runoff. If not, the round fails; after two failed rounds the election ends and a new one can be opened.")}</li>
        </ol>

        <h2 className="h2">{t("The project lead and recall")}</h2>
        <p>{t("A project lead serves one 30-day term. They act through an operating key: a separate wallet they name, which must accept, and which stops working when the term ends.")}</p>
        <p>{t("Holders can remove a project lead early. A holder of at least 1% of the units opens a 3-day recall vote; it passes if a third of the units vote and 51% of the votes say remove. A project lead can never vote units their project holds elsewhere for themself or on their own recall.")}</p>

        <h2 className="h2">{t("The treasury")}</h2>
        <p>{t("Each project's money is kept in two parts: capital, raised by selling units and from gifts, and income, which holders choose to reinvest at the end of a term. The project lead can't take anything out alone. Everything is a proposal holders vote on:")}</p>
        <ul>
          <li>{t("a payment to a named address, which can't be the project lead or the operating key;")}</li>
          <li>{t("a sale at a sealed-bid auction with a minimum price (2 days of sealed bids, 1 day to reveal, the highest bid wins; 1% of the winning bid goes to the host);")}</li>
          <li>{t("an investment of income in another project's unit auction, with a maximum price per unit. The project lead then receives 1% of the units it buys, locked for 60 days.")}</li>
        </ul>
        <p>{t("A proposal is voted on for 3 days. It passes with yes votes from at least 20% of the units that can vote and 51% of the votes cast. The project lead, the operating key and the recipient can't vote. No more than 5% of a balance can go out in one term.")}</p>
        <p>{t("An approved proposal waits 5 days before it can be carried out, so holders can recall the project lead first. A recall, or the end of the term, cancels anything not yet carried out.")}</p>

        <h2 className="h2">{t("Dividends")}</h2>
        <p>{t("After each term, anyone can open a 3-day vote on 1% of the project's UNRIG capital: pay it to holders as a dividend, or move it to income for reinvesting. The winning side needs 20% of the units that can vote; otherwise nothing happens. Voting and payout use the units held when the term ended, and that term's project lead can't vote.")}</p>

        <h2 className="h2">{t("How this was checked")}</h2>
        <p>{t("Version 9 was written to fix the weaknesses found in version 8 and reviewed three times by AI auditors that had not written it, with attack tests on a local chain that copies Arbitrum's limits. Every problem they confirmed was fixed and has a test. It has not been audited by a paid external firm.")} <a href={LINKS.security} target="_blank" rel="noreferrer">{t("Read the security review")}</a></p>

        <p style={{ marginTop: 48 }}><Link to="/" className="btn btn-secondary">{t("Back to the listings")}</Link></p>
      </article>
    </div>
  );
}
