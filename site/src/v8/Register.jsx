import { Link, useNavigate } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { useCompanies, useCompanyName, stageOf, StageStamp } from "./companies.jsx";
import { getPublicStats } from "../web3.js";
import { fmt, int, useChain, useCountdown } from "../components/liveUtils.js";
import { ErrorLine, Loading } from "../components/ui.jsx";
import { usePageTitle } from "../meta.js";

function Next({ company }) {
  const { t } = useT();
  const s = stageOf(company);
  // Auctions keep running after elections open, until the company sells out.
  const auctionUntil = company.finalized ? 0 : company.roundEnd;
  const round = useCountdown(auctionUntil);
  const stage = useCountdown(s.until || 0);
  const lines = [];
  if (!company.finalized) {
    lines.push(round.passed
      ? t("Round {n} ready to settle", { n: company.currentRound.toString() })
      : t("Round {n} closes in {time}", { n: company.currentRound.toString(), time: round.label }));
  }
  if (s.key === "voting") lines.push(stage.passed ? t("Voting closed") : t("Voting closes in {time}", { time: stage.label }));
  if (s.key === "governed") lines.push(t("Term ends in {time}", { time: stage.label }));
  if (s.key === "candidacy") lines.push(t("Shareholders can stand for governor"));
  if (s.key === "count") lines.push(t("Anyone can count the votes"));
  if (s.key === "termEnded") lines.push(t("Anyone can start the next election"));
  if (!lines.length) lines.push(t("Sold out"));
  return <>{lines.map((l, i) => <span key={i} className={i ? "co-sub" : undefined}>{l}</span>)}</>;
}

function Issued({ c }) {
  const { t } = useT();
  const share = c.totalShares > 0n ? Number((c.sharesIssued * 10000n) / c.totalShares) / 100 : 0;
  return (
    <div className="issued">
      <span className="num">{t("{a} of {b}", { a: int(c.sharesIssued), b: int(c.totalShares) })}</span>
      <div className="issued-bar" title={t("The mark is the halfway point, where elections open")}>
        <i style={{ width: `${Math.min(100, share)}%` }} />
        <b />
      </div>
    </div>
  );
}

export default function Register() {
  const { t } = useT();
  usePageTitle(t("Version 8 register"), t("A simulation of privatization on Arbitrum One: citizens get equal INVEST, bid for shares in state companies in open rounds, and elect governors."));
  const navigate = useNavigate();
  const [companies, error] = useCompanies();
  const [stats] = useChain(getPublicStats, []);
  const name = useCompanyName();

  return (
    <div className="page">
      <section style={{ padding: "40px 0 32px" }} className="stack-sm">
        <h1 className="h2">{t("Version 8 register")}</h1>
        <p className="muted prose">{t("Companies listed on the first version of the contracts, from 8 October 2026. Their auctions, elections and treasuries keep working as before.")}</p>
      </section>

      <section aria-labelledby="register-title">
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2 id="register-title" className="h3">{t("Companies")}</h2>
          {stats && (
            <p className="small muted num">
              {t("{n} citizens have joined, of {max} places", { n: int(stats.citizenCount), max: int(stats.maxCitizens) })}
            </p>
          )}
        </div>
        <ErrorLine error={error} />
        {!companies ? (
          !error && <Loading />
        ) : companies.length === 0 ? (
          <p className="muted">{t("No companies are listed yet.")}</p>
        ) : (
          <table className="register">
            <caption className="visually-hidden">{t("Listed companies, their stage, shares sold and capital")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("Company")}</th>
                <th scope="col">{t("Stage")}</th>
                <th scope="col">{t("Shares sold")}</th>
                <th scope="col" className="num-cell">{t("Capital, INVEST")}</th>
                <th scope="col">{t("Next")}</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const n = name(c);
                return (
                  <tr key={c.id} onClick={() => navigate(`/v8/company/${c.id}`)}>
                    <td>
                      <Link className="co-name" to={`/v8/company/${c.id}`} lang={n.mainLang} onClick={(e) => e.stopPropagation()}>{n.main}</Link>
                      {n.sub && <span className="co-sub" lang={n.subLang}>{n.sub}</span>}
                    </td>
                    <td className="cell-stage"><StageStamp company={c} /></td>
                    <td className="cell-issued"><Issued c={c} /></td>
                    <td className="num-cell" data-label={t("Capital, INVEST")}>{fmt(c.capital, 18, 0)}</td>
                    <td className="cell-next small"><Next company={c} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
