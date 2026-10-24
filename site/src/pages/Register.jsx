import { Link, useNavigate } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import { useCompanies, useCompanyName, stageOf, StageStamp, visibleListings } from "../v9/companies.jsx";
import { auctionPhase } from "../v9/chain.js";
import { getPublicStats, ACTIVE_NETWORK, CONTRACT_ADDRESSES, V9_LIVE } from "../web3.js";
import { LockIcon, ShieldCheckIcon, ClockIcon, VaultIcon, KeyIcon } from "../components/Icons.jsx";
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

// The "why your bid is safe" panel beside the headline: each line is a
// fact the contracts enforce, with a link to check it.
function TrustPanel() {
  const { t } = useT();
  const explorer = ACTIVE_NETWORK.blockExplorerUrls[0];
  const scan = (name) => (explorer && CONTRACT_ADDRESSES[name] ? `${explorer}/address/${CONTRACT_ADDRESSES[name]}#code` : null);
  const items = [
    [ShieldCheckIcon, t("7 contracts, source-verified"), t("Anyone can read the exact code that runs every round."), scan("RoundAuctionV9"), t("Check on Arbiscan")],
    [ClockIcon, t("48-hour timelock"), t("Every admin change is public two days before it can happen."), scan("FairRoundTimelock"), t("See scheduled changes")],
    [VaultIcon, t("The raise stays with holders"), t("99% goes to a treasury only holders can spend, at most 5% a term."), "/rules", t("Read the rules")],
    [KeyIcon, t("Your keys never leave your wallet"), t("You confirm every step in MetaMask. Nobody can move your UNRIG or units."), null, null],
  ];
  return (
    <aside className="trust" aria-labelledby="trust-title">
      <h2 id="trust-title" className="trust-title"><LockIcon /> {t("Why your bid is safe")}</h2>
      <ul className="trust-list">
        {items.map(([Icon, title, body, href, linkText]) => (
          <li key={title}>
            <span className="trust-icon"><Icon /></span>
            <div>
              <strong>{title}</strong>
              <p className="small muted">{body}</p>
              {href && (href.startsWith("/")
                ? <Link className="small" to={href}>{linkText}</Link>
                : <a className="small" href={href} target="_blank" rel="noreferrer">{linkText} ↗</a>)}
            </div>
          </li>
        ))}
      </ul>
      <p className="trust-foot small">{t("Nobody from FairRound will ever ask for your secret phrase.")}</p>
    </aside>
  );
}

export default function Register() {
  const { t } = useT();
  usePageTitle(null, t("The on-chain IPO exchange for crypto projects, on Arbitrum One: every listing round clears at one price, small buyers get filled, and the raise sits in a treasury only holders can spend."));
  const navigate = useNavigate();
  const { signer, account } = useSession();
  const [allCompanies, error] = useCompanies();
  const companies = visibleListings(allCompanies);
  const [stats] = useChain(getPublicStats, []);
  const name = useCompanyName();
  const needsCitizenship = !signer || (account && !account.alreadyClaimed);

  return (
    <div className="page">
      <section className="hero">
        <div className="stack">
        <h1 className="h1" style={{ maxWidth: "15ch" }}>{t("Own the price discovery.")}</h1>
        <p className="lede">
          {t("The on-chain IPO exchange for crypto projects. Projects list through fair rounds: everyone pays the same clearing price, small buyers get filled, and the raise sits in a treasury holders control. Then units trade on the market.")}
        </p>
        <p className="lede muted">
          {t("The process is real: the contracts run on {network} and every bid, vote and payment is public. The demo listings are fictional, and bids use free test credits.", { network: ACTIVE_NETWORK.label })}
        </p>
        <div className="row" style={{ paddingTop: 8 }}>
          {needsCitizenship && <Link to="/invest" className="btn">{t("Become an investor")}</Link>}
          <Link to="/rules" className="btn btn-secondary">{t("Read the rules")}</Link>
        </div>
        </div>
        <TrustPanel />
      </section>

      <section aria-labelledby="register-title">
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2 id="register-title" className="h2">{t("Listings")}</h2>
          {stats && (
            <p className="small muted num">
              {t("{n} investors have joined, of {max} places", { n: int(stats.citizenCount), max: int(stats.maxCitizens) })}
            </p>
          )}
        </div>
        {!V9_LIVE ? (
          <p className="notice">{t("Version 9 is being deployed. The listings appear here once it's live.")}</p>
        ) : (
          <>
            <ErrorLine error={error} />
            {!companies ? (
              !error && <Loading />
            ) : companies.length === 0 ? (
              <p className="muted">{t("No projects are listed yet.")}</p>
            ) : (
              <table className="register">
                <caption className="visually-hidden">{t("Listed projects, their stage, units sold and the raise")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("Listing")}</th>
                    <th scope="col">{t("Stage")}</th>
                    <th scope="col">{t("Units sold")}</th>
                    <th scope="col" className="num-cell">{t("Raised, UNRIG")}</th>
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
                        <td className="num-cell" data-label={t("Raised, UNRIG")}>{fmt(c.capital, 18, 0)}</td>
                        <td className="cell-next small"><Next c={c} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </div>
  );
}
