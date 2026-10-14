import { useEffect } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import { useCompanies, useCompanyName, StageStamp } from "./companies.jsx";
import { getMyShareCount } from "../web3.js";
import { fmt, int, pct, useChain } from "../components/liveUtils.js";
import { Address, ErrorLine, Loading } from "../components/ui.jsx";
import Auction from "./Auction.jsx";
import CompanyGovernance from "./CompanyGovernance.jsx";
import CompanyTreasury from "./CompanyTreasury.jsx";
import { usePageTitle } from "../meta.js";

function YourPosition({ company }) {
  const { t, tn } = useT();
  const { connected, me, account } = useSession();
  const [shares] = useChain((p) => (connected ? getMyShareCount(company.id, me, p) : Promise.resolve(null)), [company.id, me, connected]);
  if (!connected) return null;
  return (
    <div className="stack-sm">
      <h2 className="h3">{t("You")}</h2>
      <dl className="facts-list">
        <dt>{t("Your shares")}</dt>
        <dd>{shares === null ? "…" : `${tn("{n} share", "{n} shares", shares)}${shares > 0n ? ` (${pct(shares, company.sharesIssued)})` : ""}`}</dd>
        <dt>{t("Your INVEST")}</dt>
        <dd>{account ? fmt(account.invest) : "…"}</dd>
      </dl>
    </div>
  );
}

export default function Company() {
  const { id } = useParams();
  const { t } = useT();
  const [companies, error] = useCompanies();
  const name = useCompanyName();
  const company = companies?.find((c) => String(c.id) === id);
  usePageTitle(company ? company.name : null, company ? t("{name}: auction, election and treasury, read live from Arbitrum One.", { name: company.name }) : undefined);

  if (!companies) return <div className="page" style={{ paddingTop: 48 }}>{error ? <ErrorLine error={error} /> : <Loading />}</div>;
  if (!company) {
    return (
      <div className="page stack" style={{ paddingTop: 48 }}>
        <h1 className="h2">{t("No company with this number")}</h1>
        <p><Link to="/v8">{t("Back to the register")}</Link></p>
      </div>
    );
  }
  return <CompanyView company={company} companies={companies} n={name(company)} />;
}

function CompanyView({ company, companies, n }) {
  const { t } = useT();
  const { hash } = useLocation();
  // Arriving from a link to a section (for example from the portfolio).
  useEffect(() => {
    if (!hash) return;
    const id = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" }), 300);
    return () => clearTimeout(id);
  }, [hash, company.id]);
  const g = company.gov;

  return (
    <div className="page">
      <p style={{ paddingTop: 24 }} className="small"><Link to="/v8">{t("Register")}</Link> <span className="muted">/ {t("Company {id}", { id: company.id })}</span></p>
      <header className="stack-sm" style={{ padding: "16px 0 40px" }}>
        <div className="row" style={{ alignItems: "center" }}>
          <h1 className="h1" lang={n.mainLang} style={{ fontSize: "var(--t-3xl)" }}>{n.main}</h1>
          <StageStamp company={company} />
        </div>
        {n.sub && <p className="muted" lang={n.subLang}>{n.sub}</p>}
      </header>

      <div className="with-rail">
        <div>
          <section className="section" id="s-auction" aria-labelledby="s-auction-h">
            <div className="section-head"><h2 id="s-auction-h" className="h2">{t("Share auction")}</h2></div>
            <Auction company={company} />
          </section>
          <section className="section" id="s-election" aria-labelledby="s-election-h">
            <div className="section-head"><h2 id="s-election-h" className="h2">{t("Election and governor")}</h2></div>
            <CompanyGovernance company={company} />
          </section>
          <section className="section" id="s-treasury" aria-labelledby="s-treasury-h">
            <div className="section-head"><h2 id="s-treasury-h" className="h2">{t("Treasury")}</h2></div>
            <CompanyTreasury company={company} companies={companies} />
          </section>
        </div>

        <aside className="rail stack-lg" aria-label={t("Summary")}>
          <div className="stack-sm">
            <h2 className="h3">{t("At a glance")}</h2>
            <dl className="facts-list">
              <dt>{t("Shares sold")}</dt>
              <dd>{t("{a} of {b}", { a: int(company.sharesIssued), b: int(company.totalShares) })} ({pct(company.sharesIssued, company.totalShares)})</dd>
              <dt>{t("Capital")}</dt>
              <dd>{fmt(company.capital)} INVEST</dd>
              <dt>{t("Governor")}</dt>
              <dd>{g && g.governor !== "0x0000000000000000000000000000000000000000" ? <Address value={g.governor} /> : t("None yet")}</dd>
              <dt>{t("Round length")}</dt>
              <dd>{t("{n} min", { n: int(company.roundDuration / 60n) })}</dd>
            </dl>
          </div>
          <YourPosition company={company} />
        </aside>
      </div>
    </div>
  );
}
