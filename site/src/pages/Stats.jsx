// On-chain activity: the funnel (verified → claimed → bid → holding units),
// activity per day, clearing prices per listing and the latest events, all
// read from the contracts' event logs. Every row links to Arbiscan.
import { Link } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { ACTIVE_NETWORK, CONTRACT_ADDRESSES, V9_LIVE } from "../web3.js";
import { getActivity } from "../v9/stats.js";
import { useCompanies, useCompanyName } from "../v9/companies.jsx";
import { fmt, fmtDate, int, useChain } from "../components/liveUtils.js";
import { Address, ErrorLine, Loading, Muted } from "../components/ui.jsx";
import { usePageTitle } from "../meta.js";

const explorer = ACTIVE_NETWORK.blockExplorerUrls[0];

function pct(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}

function Funnel({ f }) {
  const { t } = useT();
  const steps = [
    [f.verified, t("Verified wallets"), null],
    [f.claimed, t("Claimed 1,000 UNRIG"), pct(f.claimed, f.verified)],
    [f.bidders, t("Placed a bid"), pct(f.bidders, f.claimed)],
    [f.holders, t("Hold units"), pct(f.holders, f.bidders)],
  ];
  return (
    <ol className="funnel" aria-label={t("From verified wallet to holding units")}>
      {steps.map(([n, label, p], i) => (
        <li key={label} className="funnel-step">
          <span className="funnel-n">{int(n)}</span>
          <span className="funnel-label">{label}</span>
          {i > 0 && <span className="funnel-pct">{p === null ? "–" : t("{p}% of the step before", { p })}</span>}
        </li>
      ))}
    </ol>
  );
}

function DailyChart({ daily, lang }) {
  const { t } = useT();
  const rows = daily.slice(-30);
  if (rows.length === 0) return <Muted>{t("No activity yet.")}</Muted>;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.verified, r.bids)));
  const W = Math.max(360, Math.min(720, rows.length * 48)), H = 220, pad = 28, gap = 4;
  const slot = (W - pad) / rows.length;
  const bw = Math.max(3, Math.min(22, (slot - gap * 2) / 2));
  const y = (v) => H - 24 - (v / max) * (H - 48);
  const day = (d) => new Date(d * 1000).toLocaleDateString(lang === "ka" ? "ka-GE" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const every = Math.ceil(rows.length / 8);
  return (
    <figure className="daily">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W * 1.25 }} role="img" aria-label={t("Verified wallets and bids per day")}>
        <line x1={pad} x2={W} y1={H - 24} y2={H - 24} className="daily-axis" />
        {rows.map((r, i) => {
          const x = pad + i * slot + (slot - bw * 2 - 2) / 2;
          return (
            <g key={r.day}>
              <title>{`${day(r.day)}: ${t("{n} verified", { n: r.verified })}, ${t("{n} bids", { n: r.bids })}`}</title>
              <rect x={x} y={y(r.verified)} width={bw} height={H - 24 - y(r.verified)} rx="2" className="bar-verified" />
              <rect x={x + bw + 2} y={y(r.bids)} width={bw} height={H - 24 - y(r.bids)} rx="2" className="bar-bids" />
              {rows.length <= 14 && r.verified > 0 && <text x={x + bw / 2} y={y(r.verified) - 5} className="daily-val">{r.verified}</text>}
              {rows.length <= 14 && r.bids > 0 && <text x={x + bw * 1.5 + 2} y={y(r.bids) - 5} className="daily-val">{r.bids}</text>}
              {i % every === 0 && <text x={x + bw} y={H - 6} className="daily-day">{day(r.day)}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="daily-legend">
        <span><i className="sw sw-verified" aria-hidden="true" />{t("Verified wallets")}</span>
        <span><i className="sw sw-bids" aria-hidden="true" />{t("Bids placed")}</span>
        <span className="muted">{t("Per day, UTC")}</span>
      </figcaption>
    </figure>
  );
}

function ListingName({ id, companies }) {
  const name = useCompanyName();
  const c = companies?.find((x) => x.id === id);
  if (!c) return <>#{id}</>;
  const n = name(c);
  return <Link to={`/company/${c.id}`} lang={n.mainLang} className="strong">{n.main}</Link>;
}

function FeedItem({ e, companies }) {
  const { t, lang } = useT();
  const L = e.companyId !== undefined ? <ListingName id={e.companyId} companies={companies} /> : null;
  let what;
  if (e.kind === "verified") what = <>{t("verified a wallet")}</>;
  else if (e.kind === "claimed") what = <>{t("claimed {n} UNRIG", { n: fmt(e.amount, 18, 0) })}</>;
  else if (e.kind === "bid") what = <>{t("bid {n} UNRIG on", { n: fmt(e.amount, 18, 2) })} {L}</>;
  else if (e.kind === "filled") what = <>{e.shares === 1n ? t("received 1 unit of") : t("received {n} units of", { n: e.shares.toString() })} {L}</>;
  else if (e.shares === 1n) what = <>{L} {t("round {r} settled: 1 unit at {p} UNRIG", { r: e.round, p: fmt(e.price, 18, 2) })}</>;
  else what = <>{L} {t("round {r} settled: {n} units at {p} UNRIG each", { r: e.round, n: e.shares.toString(), p: fmt(e.price, 18, 2) })}</>;
  return (
    <li className="feed-item">
      <span className="feed-time muted">{e.t ? fmtDate(e.t, lang) : ""}</span>
      <span className="feed-what">{e.who && <><Address value={e.who} /> </>}{what}</span>
      {explorer && e.tx && <a className="feed-tx small" href={`${explorer}/tx/${e.tx}`} target="_blank" rel="noreferrer">{t("Arbiscan")}</a>}
    </li>
  );
}

export default function Stats() {
  const { t, lang } = useT();
  usePageTitle(t("On-chain activity"), t("Verified wallets, bids, clearing prices and units issued on FairRound, read live from the contracts on Arbitrum One."));
  const [companies] = useCompanies();
  const [a, err] = useChain((p) => (V9_LIVE ? getActivity(p) : Promise.resolve(null)), []);

  return (
    <div className="page" style={{ paddingTop: 48 }}>
      <div className="prose stack">
        <h1 className="h1">{t("On-chain activity")}</h1>
        <p className="lede">{t("Every number here is read live from the FairRound contracts on {network}. None of it comes from analytics, so anyone can check it on Arbiscan.", { network: ACTIVE_NETWORK.label })}</p>
      </div>

      <ErrorLine error={err} />
      {!a ? !err && <div style={{ marginTop: 32 }}><Loading>{t("Reading the event log…")}</Loading></div> : (
        <>
          <section className="section" style={{ marginTop: 40 }} aria-labelledby="funnel">
            <div className="section-head"><h2 id="funnel" className="h2">{t("From wallet to holder")}</h2></div>
            <Funnel f={a.funnel} />
            <p className="small muted" style={{ marginTop: 12 }}>
              {t("{bids} bids worth {volume} UNRIG · {rounds} rounds settled · {units} units issued", { bids: int(a.totals.bids), volume: fmt(a.totals.bidVolume, 18, 0), rounds: int(a.totals.rounds), units: a.totals.unitsIssued.toString() })}
            </p>
          </section>

          <section className="section" style={{ marginTop: 40 }} aria-labelledby="daily">
            <div className="section-head"><h2 id="daily" className="h2">{t("Activity per day")}</h2></div>
            <DailyChart daily={a.daily} lang={lang} />
          </section>

          <section className="section" style={{ marginTop: 40 }} aria-labelledby="prices">
            <div className="section-head"><h2 id="prices" className="h2">{t("Clearing prices")}</h2></div>
            {a.listings.length === 0 ? <Muted>{t("No round has been settled yet.")}</Muted> : (
              <div className="table-scroll">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th scope="col">{t("Listing")}</th>
                      <th scope="col" className="num-cell">{t("Rounds settled")}</th>
                      <th scope="col" className="num-cell">{t("Units issued")}</th>
                      <th scope="col" className="num-cell">{t("Last price, UNRIG")}</th>
                      <th scope="col">{t("Last round")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.listings.map((l) => (
                      <tr key={l.companyId}>
                        <td><ListingName id={l.companyId} companies={companies} /></td>
                        <td className="num-cell">{l.rounds}</td>
                        <td className="num-cell">{l.units.toString()}</td>
                        <td className="num-cell">{l.lastPrice > 0n ? fmt(l.lastPrice, 18, 2) : "–"}</td>
                        <td className="muted">{fmtDate(l.lastAt, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="section" style={{ marginTop: 40 }} aria-labelledby="feed">
            <div className="section-head"><h2 id="feed" className="h2">{t("Latest on-chain events")}</h2></div>
            {a.feed.length === 0 ? <Muted>{t("No activity yet.")}</Muted> : (
              <ol className="feed">{a.feed.map((e) => <FeedItem key={`${e.tx}-${e.kind}-${e.who || ""}-${e.companyId ?? ""}`} e={e} companies={companies} />)}</ol>
            )}
          </section>

          <section className="section prose" style={{ marginTop: 40 }}>
            <p className="small muted">
              {t("Counts include the project's own test wallets. Sources: the Claimed and CitizenVerified events of InvestToken, and the BidPlaced, BidFilled and RoundSettled events of RoundAuctionV9.")}{" "}
              {explorer && <a href={`${explorer}/address/${CONTRACT_ADDRESSES.RoundAuctionV9}#events`} target="_blank" rel="noreferrer">{t("See the raw events on Arbiscan")}</a>}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
