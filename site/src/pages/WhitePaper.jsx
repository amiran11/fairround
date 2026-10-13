import { Link } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { LINKS } from "../components/Layout.jsx";
import { usePageTitle } from "../meta.js";

// The protocol in brief. Corrected in October 2026 to match the deployed
// contracts (v8): proportional rounds instead of sealed one-share bids,
// INVEST that becomes transferable at the 51% threshold, and the actual
// state of review and auditing.
const SECTIONS = [
  ["Abstract", "Most privatization designs fail in one of two familiar ways: sold for cash, ownership concentrates immediately among whoever already had money; given away as freely tradable vouchers, it concentrates almost as fast, as recipients sell under financial pressure for a fraction of value. Sakartvelo Exchange is a mechanism-design response to both failure modes at once: an allocation that can't be sold for cash while the privatization is under way, a price set by competitive bidding rather than a bureaucrat's estimate, and a governance layer that is elected and term-limited rather than inherited or appointed."],
  ["The problem this is modeling", "Call it the purchasing-power gap: when state assets are sold at market price, the people with the least capital are structurally excluded before the auction even opens. Historical voucher privatizations tried to fix this by giving equity away for free, but freely tradable vouchers just moved the same problem a few months downstream, as recipients facing real financial pressure sold them cheaply to whoever already had cash. Neither method actually distributes ownership; the second one just adds a delay. Sakartvelo Exchange tests a third structure: an equal allocation of a currency that can only be spent on bidding for shares until the privatization has made real progress."],
  ["Phase one: monetization", "Every verified citizen receives one equal, one-time allocation of INVEST. At first INVEST is closed-loop: it can be spent bidding at auction and nowhere else, so there is no way to cash out early under pressure. Once the first company has sold 51% of its shares, INVEST becomes freely transferable. The number of citizen places is capped, independently of who gets verified."],
  ["Phase two: the auction", "Each listed company sells a fixed number of shares in rounds. In every round the lowest active bid buys one share, which sets the price; every other bid is worth its amount divided by that price, rounded up. Bids are filled from the highest down, each in full or not at all, and a bid that doesn't fit carries into the next round. There is no bureaucrat-set floor: the bidders themselves set the price. For a week after a company's first share is issued its shares can't move, so ownership has to mean something before it becomes tradable."],
  ["Phase three: governance", "Once a company is at least half-assigned to real owners, candidacy opens: any shareholder above a small threshold can put themselves forward with a written program. Shareholders vote, weighted by their shares in that specific company. Winning takes a real majority, 51% of votes cast, not just a plurality; if nobody clears that bar, the field narrows to the top two and voting runs again. The winner holds office for a 30-day term, then the cycle reopens. And the elected wallet never operates the company directly: the winner registers a separate operating key for that term, which stops working the moment the term ends."],
  ["Phase four: treasury and capital", "An elected governor can move a small, fixed share of each asset a company holds without anyone's approval: enough for ordinary operations, not enough to matter if that key is compromised. Anything larger goes one of two ways: sold through a sealed-bid auction, where nobody's bid is visible until bidding closes and settlement needs no one's signature, or paid to a named party only after a shareholder vote approves it. Separately, every term ends with its own vote: shareholders decide, independent of what the outgoing governor did, whether to pay out a small dividend or leave the capital invested."],
  ["Phase five: secondary markets", "Two markets exist beyond the primary auction. Shareholders can list and sell shares once the lock has passed, and companies can do the same with stakes they've built up in each other. Citizen places are limited; anyone arriving after they're taken has no free path to INVEST and can only buy it from someone who has it, paid in another crypto asset. There is no fiat on-ramp anywhere in the design, deliberately. Which payment assets are acceptable is a governance decision, not something the protocol can verify on its own."],
  ["What isn't solved", "Worth stating plainly. A protocol can't verify that two wallets belong to different people: the citizen-verification layer stops trivial throwaway-wallet farming, not one person controlling several verified wallets. A single administrative key still controls which assets get listed and which tokens are accepted, a real concentration of power this design hasn't distributed. The contracts have been reviewed by the author with AI assistance, including adversarial tests on a local chain that copies Arbitrum's limits, but not by a paid external auditor. That review found real weaknesses in the live version, listed on the rules page; the next version fixes them. The interesting part is the mechanism design, not a claim that every risk has been closed."],
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
          {t("The mechanism runs as five contracts: InvestToken, OpenVerifier, RoundAuction, Governance and CompanyTreasury. They are split apart because the whole mechanism doesn't fit in one contract.")}
        </p>
        <p className="row" style={{ marginTop: 24 }}>
          <a className="btn" href={LINKS.paper} target="_blank" rel="noreferrer">{t("Read the full paper on SSRN")}</a>
          <Link className="btn btn-secondary" to="/rules">{t("Read the rules")}</Link>
        </p>
      </article>
    </div>
  );
}
