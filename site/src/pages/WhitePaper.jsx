import { Link } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { LINKS } from "../components/Layout.jsx";
import { usePageTitle } from "../meta.js";

// The protocol in brief, matching the version 9 contracts (October 2026).
const SECTIONS = [
  ["Abstract", "Most privatization designs fail in one of two familiar ways: sold for cash, ownership concentrates immediately among whoever already had money; given away as freely tradable vouchers, it concentrates almost as fast, as recipients sell under financial pressure for a fraction of value. Sakartvelo Exchange is a mechanism-design response to both failure modes at once: an allocation that can't be sold for cash while the privatization is under way, a price set by competitive bidding rather than a bureaucrat's estimate, and a governance layer that is elected and term-limited rather than inherited or appointed."],
  ["The problem this is modeling", "Call it the purchasing-power gap: when state assets are sold at market price, the people with the least capital are structurally excluded before the auction even opens. Historical voucher privatizations tried to fix this by giving equity away for free, but freely tradable vouchers just moved the same problem a few months downstream, as recipients facing real financial pressure sold them cheaply to whoever already had cash. Neither method actually distributes ownership; the second one just adds a delay. Sakartvelo Exchange tests a third structure: an equal allocation of a currency that can only be spent on bidding for shares until the privatization has made real progress."],
  ["Phase one: monetization", "Every verified citizen receives one equal, one-time allocation of INVEST. At first INVEST is closed-loop: it can be spent bidding at auction and nowhere else, so there is no way to cash out early under pressure. Once the first company has sold 51% of its shares, INVEST becomes freely transferable. The number of citizen places is capped, independently of who gets verified."],
  ["Phase two: the auction", "Each listed company sells a fixed number of shares in rounds. A bid is an amount of INVEST and, if the bidder wants, a limit on the price per share. If every bid fits, the lowest bid's price per share sets the price; if more shares are wanted than offered, the price rises to the highest level at which the bids still want every share on offer, and the shares are shared out in proportion. Each bid pays only for the shares it gets. There is no bureaucrat-set floor: the bidders themselves set the price. A share can't be moved for a week after it is issued, so ownership has to mean something before it becomes tradable."],
  ["Phase three: governance", "Once a company is at least half-assigned to real owners, an election can open. Shareholders above a small threshold stand with a written program, and every shareholder backs one candidate with their shares; the most-backed make the ballot, so a majority can always field its candidate. Voters choose a candidate or vote against all. Winning takes the votes of a fifth of all shares and a real majority of votes cast, not just a plurality; if nobody clears that bar, the field narrows to the top two. The winner holds office for a 30-day term and can be recalled earlier. And the elected wallet never operates the company directly: the winner names a separate operating key for that term, which must accept, and which stops working the moment the term ends."],
  ["Phase four: treasury and capital", "An elected governor proposes; shareholders decide. Nothing leaves a company without their vote: a payment to a named party, a sale through a sealed-bid auction with a minimum price, or an investment of the company's income in another company's auction. No more than a fifth of any balance can go out in one term, and every approved proposal waits five days before it is carried out, long enough for shareholders to recall the governor first. Capital raised from shareholders stays capital; at the end of every term shareholders decide, independent of what the outgoing governor did, whether a small part is paid out as a dividend or moved to income for reinvesting."],
  ["Phase five: secondary markets", "Shareholders can offer their shares for sale at their own price once the lock has passed. Citizen places are limited; anyone arriving after they're taken has no free path to INVEST and can only get it from someone who has it. There is no fiat on-ramp anywhere in the design, deliberately. Which payment assets a company may hold is a governance decision, not something the protocol can verify on its own."],
  ["What isn't solved", "Worth stating plainly. A protocol can't verify that two wallets belong to different people: the citizen-verification layer makes throwaway wallets slower and costlier, not impossible, and one person can control several verified wallets. Whoever genuinely holds a majority of a company's shares, in however many wallets, controls it; the design limits how fast value can leave, not who can win a fair vote. An owner key, behind a 48-hour delay, still decides which companies get listed and which tokens are accepted. The contracts were reviewed by the author with AI assistance, including three rounds of AI audits and adversarial tests on a local chain that copies Arbitrum's limits, but not by a paid external auditor. The interesting part is the mechanism design, not a claim that every risk has been closed."],
];

export default function WhitePaper() {
  const { t } = useT();
  usePageTitle(t("White paper"), t("The protocol behind Sakartvelo Exchange: monetization, the auction, governance, the treasury and secondary markets, and what isn't solved."));
  return (
    <div className="page" style={{ paddingTop: 48 }}>
      <article className="prose">
        <h1 className="h1">{t("White paper")}</h1>
        <p className="lede">{t("An equal allocation, a competitive auction and elected, term-limited governance: a simulation of how a state's holdings could pass into citizens' ownership without simply selling them to whoever already has capital.")}</p>
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
