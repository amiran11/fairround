import { Link } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { LINKS } from "../components/Layout.jsx";
import { usePageTitle } from "../meta.js";

// The protocol in brief, matching the version 9 contracts (October 2026).
const SECTIONS = [
  ["Abstract", "Token launches fail buyers in familiar ways: insiders buy cheap in presales, bots win the first blocks of public sales, whales take oversubscribed sales, and the money raised sits in a wallet the team controls. FairRound is a mechanism-design response to all four at once: equal access, one clearing price per round, a raise held in a treasury that holders control, and a project lead that holders can remove."],
  ["The problem", "Call it the trust gap. Buyers have learned that a launch usually ends with insiders selling into them, so they flip early, and honest teams pay for that distrust with a weaker raise and a thinner holder base. Fair-price auctions fix price discovery but leave the money and the control with the team; protected raises fix the money but let the biggest bids take most of the sale. FairRound combines both protections and keeps small buyers in. The design began as research on 1990s voucher privatization, where the same failure played out thirty years earlier."],
  ["Equal access", "Every verified wallet receives one equal, one-time allocation of INVEST test credits, which it bids with. The number of investor places is capped, independently of who gets verified. Nobody arrives with a bigger bag bought cheap in a presale, because there is no presale. In real-money launches the same role is played by a per-wallet cap in each round."],
  ["The round", "Each listed project sells a fixed number of units in rounds. A bid is an amount of INVEST and, if the bidder wants, a limit on the price per unit. If every bid fits, the lowest bid's price per unit sets the price; if more units are wanted than offered, the price rises to the highest level at which the bids still want every unit on offer, and the units are shared out in proportion. Each bid pays only for the units it gets. There is no bureaucrat-set floor: the bidders themselves set the price. A unit can't be moved for a week after it is issued, so ownership has to mean something before it becomes tradable."],
  ["Holder governance", "Once a project is at least half-assigned to real owners, an election can open. Holders above a small threshold stand with a written program, and every holder backs one candidate with their units; the most-backed make the ballot, so a majority can always field its candidate. Voters choose a candidate or vote against all. Winning takes the votes of a fifth of all units and a real majority of votes cast, not just a plurality; if nobody clears that bar, the field narrows to the top two. The winner holds office for a 30-day term and can be recalled earlier. And the elected wallet never operates the project directly: the winner names a separate operating key for that term, which must accept, and which stops working the moment the term ends."],
  ["The treasury and the raise", "An elected project lead proposes; holders decide. Nothing leaves a project without their vote: a payment to a named party, a sale through a sealed-bid auction with a minimum price, or an investment of the project's income in another project's auction. No more than a fifth of any balance can go out in one term, and every approved proposal waits five days before it is carried out, long enough for holders to recall the project lead first. Capital raised from holders stays capital; at the end of every term holders decide, independent of what the outgoing project lead did, whether a small part is paid out as a dividend or moved to income for reinvesting."],
  ["After the sale", "Holders can offer their units for sale at their own price once the lock has passed. Investor places are limited; anyone arriving after they're taken can only get INVEST from someone who has it. There is no fiat on-ramp in the demo, deliberately. Which payment assets a project may hold is a governance decision. Real-money launches will add a trading pool seeded from the raise when the sale closes."],
  ["What isn't solved yet", "Worth stating plainly. Today's rounds use free test credits, not real money, and there is no trading pool after a sale. A protocol can't verify that two wallets belong to different people: verification makes throwaway wallets slower and costlier, not impossible. Whoever genuinely holds a majority of a project's units, in however many wallets, controls it; the design limits how fast value can leave, not who can win a fair vote. An owner key, behind a 48-hour delay, still decides which launches get listed. The contracts were reviewed by the author with AI assistance, including three rounds of AI audits and adversarial tests on a local chain that copies Arbitrum's limits, but not by a paid external auditor. No real money goes in before one."],
];

export default function WhitePaper() {
  const { t } = useT();
  usePageTitle(t("White paper"), t("How FairRound works: equal access, the round, holder governance, the treasury, and what isn't solved yet."));
  return (
    <div className="page" style={{ paddingTop: 48 }}>
      <article className="prose">
        <h1 className="h1">{t("White paper")}</h1>
        <p className="lede">{t("Equal access, one clearing price per round, and a raise that holders control: how FairRound makes the fair outcome the default for a token launch.")}</p>
        {SECTIONS.map(([title, body]) => (
          <section key={title}>
            <h2 className="h2">{t(title)}</h2>
            <p style={{ marginTop: 12 }}>{t(body)}</p>
          </section>
        ))}
        <p className="muted" style={{ marginTop: 48 }}>
          {t("The mechanism runs as six contracts: InvestToken, OpenVerifierV2, RoundAuctionV9, GovernanceV9, CompanyTreasuryV9 and CompanyDividendsV9, owned by a 48-hour timelock. They are split apart because the whole mechanism doesn't fit in one contract.")}
        </p>
        <p className="row" style={{ marginTop: 24 }}>
          <a className="btn" href={LINKS.paper} target="_blank" rel="noreferrer">{t("Read the full paper on SSRN")}</a>
          <Link className="btn btn-secondary" to="/rules">{t("Read the rules")}</Link>
        </p>
      </article>
    </div>
  );
}
