import { Link, useNavigate } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import { useCompanies, useCompanyName, stageOf, StageStamp, visibleListings } from "../v9/companies.jsx";
import { auctionPhase, getMyProgress } from "../v9/chain.js";
import { getPublicStats, ACTIVE_NETWORK, CONTRACT_ADDRESSES, V9_LIVE } from "../web3.js";
import { ShieldCheckIcon, ClockIcon, VaultIcon, KeyIcon } from "../components/Icons.jsx";
import { fmt, int, useChain, useCountdown } from "../components/liveUtils.js";
import { ErrorLine, Loading } from "../components/ui.jsx";
import { usePageTitle } from "../meta.js";
import { ArrowRight, ArrowDown, HandCoins, Timer, Scale, Landmark, UserRound, Sparkles } from "lucide-react";
import Mark from "../components/Mark.jsx";

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

// Four safety facts as a slim row of badges under the headline; the
// first two link to the proof on Arbiscan.
function TrustStrip() {
  const { t } = useT();
  const explorer = ACTIVE_NETWORK.blockExplorerUrls[0];
  const scan = (name) => (explorer && CONTRACT_ADDRESSES[name] ? `${explorer}/address/${CONTRACT_ADDRESSES[name]}#code` : null);
  const items = [
    [ShieldCheckIcon, t("7 contracts, source-verified"), scan("RoundAuctionV9")],
    [ClockIcon, t("48-hour timelock"), scan("FairRoundTimelock")],
    [VaultIcon, t("The raise stays with holders"), null],
    [KeyIcon, t("Your keys never leave your wallet"), null],
  ];
  return (
    <ul className="trust-strip" aria-label={t("Why your bid is safe")}>
      {items.map(([Icon, label, href]) => (
        <li key={label}>
          {href
            ? <a href={href} target="_blank" rel="noreferrer"><Icon /> {label} ↗</a>
            : <span><Icon /> {label}</span>}
        </li>
      ))}
    </ul>
  );
}

// The welcome picture beside the headline: the FairRound mark with a ring
// of investors around it (everyone at the same table), and a live ticket
// for a round that is open now.
function HeroArt() {
  const { t } = useT();
  const { address } = useSession();
  const [p] = useChain((prov) => (V9_LIVE ? getMyProgress(address, prov) : Promise.resolve(null)), [address]);
  const name = useCompanyName();
  const c = p?.suggest;
  const phase = c ? auctionPhase(c) : null;
  const clock = useCountdown(c ? (phase === "cooldown" ? c.roundStart : c.roundEnd) : 0);
  const seats = [0, 40, 140, 180, 220, 320];
  const sold = c ? Number(c.sharesIssued) / Number(c.totalShares) : 0;
  return (
    <div className="hero-art">
      <div className="hero-orbit" aria-hidden="true">
        <div className="hero-glow" />
        {seats.map((deg, i) => (
          <span key={deg} className={`seat seat-${i % 3}`} style={{ transform: `rotate(${deg}deg) translate(var(--orbit)) rotate(${-deg}deg)` }}>
            <UserRound size={18} />
          </span>
        ))}
        <span className="hero-mark"><Mark size={150} /></span>
        <span className="hero-chip hero-chip-a"><Scale size={14} /> {t("Same price for everyone")}</span>
        <span className="hero-chip hero-chip-b"><Sparkles size={14} /> {t("Your units, your vote")}</span>
      </div>
      <div className="round-ticket">
        {c ? (
          <>
            <div className="spread">
              <span className="ticket-tag"><span className="live-dot" aria-hidden="true" /> {phase === "bidding" ? t("Round open now") : t("Next round")}</span>
              <span className="small muted num">{phase === "bidding" ? t("closes in {time}", { time: clock.label }) : t("opens in {time}", { time: clock.label })}</span>
            </div>
            <strong className="ticket-name">{name(c).main}</strong>
            <div className="ticket-bar" aria-hidden="true"><span style={{ width: `${Math.max(2, Math.round(sold * 100))}%` }} /></div>
            <p className="small muted num">{t("{sold} of {total} units sold · up to 150 a round", { sold: int(c.sharesIssued), total: int(c.totalShares) })}</p>
            <Link to={`/company/${c.id}`} className="btn btn-small ticket-btn">{t("Join this round")} <ArrowRight size={16} /></Link>
          </>
        ) : (
          <>
            <span className="ticket-tag"><span className="live-dot" aria-hidden="true" /> {t("Live on Arbitrum One")}</span>
            <strong className="ticket-name">{t("Ten listings, one fair price each round")}</strong>
          </>
        )}
      </div>
    </div>
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
        <div className="hero-main">
          <p className="eyebrow">{t("The on-chain IPO exchange for crypto projects")}</p>
          <h1 className="h1 hero-title">{t("Own the price discovery.")}</h1>
          <p className="lede">{t("Everyone pays the same price. Small buyers get filled. Holders keep the raise.")}</p>
          <div className="row hero-cta">
            {needsCitizenship
              ? <Link to="/invest" className="btn btn-large">{t("Get 1,000 free UNRIG")} <ArrowRight size={18} /></Link>
              : <a href="#listings" className="btn btn-large">{t("Pick a listing")} <ArrowDown size={18} /></a>}
            <a href="#how" className="btn btn-secondary btn-large">{t("How it works")}</a>
          </div>
          <TrustStrip />
          <p className="small muted hero-note"><span className="live-dot" aria-hidden="true" /> {t("Live demo on {network} · free test credits · fictional listings", { network: ACTIVE_NETWORK.label })}</p>
        </div>
        <HeroArt />
      </section>

      <section id="how" className="how" aria-labelledby="how-title">
        <h2 id="how-title" className="h2">{t("How a round works")}</h2>
        <ol className="how-steps">
          {[
            [HandCoins, t("Bid"), t("Commit UNRIG and the most you'll pay per unit.")],
            [Timer, t("Wait one hour"), t("Bids collect for the hour, in public. Being first gives no edge.")],
            [Scale, t("One price for all"), t("Everyone filled pays the same clearing price.")],
            [Landmark, t("Own and vote"), t("Units land in your wallet. Holders control the raise.")],
          ].map(([Icon, title, body], i) => (
            <li key={title} className="how-step">
              <span className="how-icon"><Icon size={26} /></span>
              <span className="how-num">{i + 1}</span>
              <strong>{title}</strong>
              <p className="small muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="listings" aria-labelledby="register-title">
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
