import { Link, useNavigate } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import { useCompanies, useCompanyName, stageOf, StageStamp } from "../v9/companies.jsx";
import { auctionPhase } from "../v9/chain.js";
import { getPublicStats, ACTIVE_NETWORK, V9_LIVE } from "../web3.js";
import { fmt, int, useChain, useCountdown } from "../components/liveUtils.js";
import { ErrorLine, Loading } from "../components/ui.jsx";
import { usePageTitle } from "../meta.js";

function Next({ c }) {
  const { t } = useT();
  const s = stageOf(c);
  const a = auctionPhase(c);
  const g = c.gov;
  const round = useCountdown(a === "cooldown" ? c.roundStart : c.roundEnd);
  const until = s === "governed" ? g.termEnd : s === "voting" || s === "count" ? g.election.voteEnd : s === "candidacy" ? g.election.candidacyEnd : s === "recall" ? g.recall?.voteEnd : 0;
  const stage = useCountdown(until || 0);
  const lines = [];
  const n = c.currentRound.toString();
  if (a === "bidding") lines.push(t("Round {n} closes in {time}", { n, time: round.label }));
  if (a === "cooldown") lines.push(t("Round {n} opens in {time}", { n, time: round.label }));
  if (a === "settle") lines.push(t("Round {n} ready to settle", { n }));
  const govLine = {
    canOpen: t("Anyone can open the election"),
    candidacy: t("Candidacy closes in {time}", { time: stage.label }),
    readyToVote: t("Anyone can open voting"),
    voting: t("Voting closes in {time}", { time: stage.label }),
    count: t("Anyone can count the votes"),
    governed: t("Term ends in {time}", { time: stage.label }),
    termOver: t("Anyone can open the next election"),
    recall: t("Recall vote closes in {time}", { time: stage.label }),
  }[s];
  if (govLine) lines.push(govLine);
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
  usePageTitle(null, t("A simulation of privatization on Arbitrum One: citizens get equal INVEST, bid for shares in state companies in open rounds, and elect governors."));
  const navigate = useNavigate();
  const { signer, account } = useSession();
  const [companies, error] = useCompanies();
  const [stats] = useChain(getPublicStats, []);
  const name = useCompanyName();
  const needsCitizenship = !signer || (account && !account.alreadyClaimed);

  return (
    <div className="page">
      <section style={{ padding: "56px 0 40px" }} className="stack">
        <h1 className="h1" style={{ maxWidth: "15ch" }}>{t("State companies, sold share by share to citizens.")}</h1>
        <p className="lede">
          {t("Every citizen receives the same 1,000 INVEST and bids it for shares in open rounds. Once half of a company is sold, its shareholders elect a governor for 30 days at a time, and nothing leaves the company without their vote.")}
        </p>
        <p className="lede muted">
          {t("The process is real: the contracts run on {network} and every bid, vote and payment is public. The companies are fictional.", { network: ACTIVE_NETWORK.label })}
        </p>
        <div className="row" style={{ paddingTop: 8 }}>
          {needsCitizenship && <Link to="/citizen" className="btn">{t("Become a citizen")}</Link>}
          <Link to="/rules" className="btn btn-secondary">{t("Read the rules")}</Link>
        </div>
      </section>

      <section aria-labelledby="register-title">
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2 id="register-title" className="h2">{t("The register")}</h2>
          {stats && (
            <p className="small muted num">
              {t("{n} citizens have joined, of {max} places", { n: int(stats.citizenCount), max: int(stats.maxCitizens) })}
            </p>
          )}
        </div>
        {!V9_LIVE ? (
          <p className="notice">{t("Version 9 is being deployed. Until it's live, the companies are in the version 8 register.")} <Link to="/v8">{t("Open the version 8 register")}</Link></p>
        ) : (
          <>
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
                      <tr key={c.id} onClick={() => navigate(`/company/${c.id}`)}>
                        <td>
                          <Link className="co-name" to={`/company/${c.id}`} lang={n.mainLang} onClick={(e) => e.stopPropagation()}>{n.main}</Link>
                          {n.sub && <span className="co-sub" lang={n.subLang}>{n.sub}</span>}
                        </td>
                        <td className="cell-stage"><StageStamp company={c} /></td>
                        <td className="cell-issued"><Issued c={c} /></td>
                        <td className="num-cell" data-label={t("Capital, INVEST")}>{fmt(c.capital, 18, 0)}</td>
                        <td className="cell-next small"><Next c={c} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
        <p className="small muted" style={{ marginTop: 24 }}>
          {t("Companies from the first version of the contracts keep running.")} <Link to="/v8">{t("Open the version 8 register")}</Link>
        </p>
      </section>
    </div>
  );
}
