import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import { ACTIVE_NETWORK, normalizeAddress } from "../web3.js";
import { loadPortfolio } from "../v9/portfolio.js";
import { useCompanyName, StageStamp } from "../v9/companies.jsx";
import { fmt, fmtDate, int, pct, same, short, useChain, useCountdown } from "../components/liveUtils.js";
import { Button, ErrorLine, Input, Loading, Muted } from "../components/ui.jsx";
import { usePageTitle } from "../meta.js";

// `to` deep-links into the company page: a section, and a treasury tab.
function CompanyLink({ company, to = "" }) {
  const name = useCompanyName()(company);
  return <Link to={`/company/${company.id}${to}`} lang={name.mainLang} className="strong">{name.main}</Link>;
}

const WHERE = {
  acceptKey: "#s-election",
  reveal: "?tab=proposals#s-treasury",
  recall: "#s-election",
  elect: "#s-election",
  nominate: "#s-election",
  proposal: "?tab=proposals#s-treasury",
  dividendVote: "?tab=dividends#s-treasury",
  dividend: "?tab=dividends#s-treasury",
  auctionClaim: "?tab=proposals#s-treasury",
};

function Closes({ until }) {
  const { t } = useT();
  const { passed, label } = useCountdown(until);
  return <span className="muted">{passed ? t("Closed.") : t("Closes in {time}.", { time: label })}</span>;
}

function TodoItem({ item }) {
  const { t, tn } = useT();
  const n = item.weight ?? 0n;
  const text = {
    acceptKey: t("The project lead named this wallet as the operating key. Accept it to act for the project."),
    reveal: t("Reveal your sealed bid on proposal {id}. An unrevealed bid loses its deposit.", { id: item.proposal?.toString() }),
    recall: tn("Vote on recalling the project lead with {n} unit.", "Vote on recalling the project lead with {n} units.", n),
    elect: tn("Vote in the election with {n} unit.", "Vote in the election with {n} units.", n),
    nominate: tn("Back a candidate in the election with {n} unit.", "Back a candidate in the election with {n} units.", n),
    proposal: tn("Vote on proposal {id} with {n} unit.", "Vote on proposal {id} with {n} units.", n, { id: item.proposal?.toString() }),
    dividendVote: tn("Vote on the dividend for term {term} with {n} unit.", "Vote on the dividend for term {term} with {n} units.", n, { term: item.term }),
    dividend: t("Claim a {amount} INVEST dividend for term {term}.", { amount: fmt(item.amount ?? 0n, 18, 4), term: item.term }),
    auctionClaim: item.won ? t("Claim what you won on proposal {id}.", { id: item.proposal?.toString() }) : t("Claim back your bid and deposit from proposal {id}.", { id: item.proposal?.toString() }),
  }[item.kind];
  return (
    <li className="stack-sm">
      <div className="spread"><CompanyLink company={item.company} to={WHERE[item.kind]} />{item.until ? <Closes until={item.until} /> : null}</div>
      <p>{text}</p>
    </li>
  );
}

function Lookup() {
  const { t } = useT();
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState("");
  const go = async (e) => {
    e.preventDefault();
    const addr = await normalizeAddress(value);
    if (!addr) return setProblem(t("That isn't a wallet address."));
    setProblem("");
    navigate(`/portfolio/${addr}`);
  };
  return (
    <form onSubmit={go} className="stack-sm" style={{ maxWidth: 520 }}>
      <label htmlFor="lookup" className="field-label">{t("Look up any address")}</label>
      <div className="input-row">
        <Input id="lookup" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0x…" spellCheck={false} autoComplete="off" />
        <button type="submit" className="btn btn-secondary">{t("Look up")}</button>
      </div>
      {problem && <p className="error-line">{problem}</p>}
    </form>
  );
}

function CopyLink({ path }) {
  const { t } = useT();
  const [done, setDone] = useState(false);
  const copy = () => {
    try { navigator.clipboard.writeText(window.location.origin + path); setDone(true); } catch { /* clipboard blocked */ }
  };
  return (
    <p className="row-tight small">
      <span className="muted">{t("Anyone can see this page; it's all public on the chain.")}</span>
      <button type="button" className="btn btn-plain btn-small" onClick={copy}>{done ? t("Link copied") : t("Copy a link to it")}</button>
    </p>
  );
}

function Lock({ free, next }) {
  const { t, lang } = useT();
  if (!next) return <span>{t("All of them")}</span>;
  return <span className="muted">{free > 0 ? t("{n} now, more from {date}", { n: free, date: fmtDate(next, lang) }) : t("From {date}", { date: fmtDate(next, lang) })}</span>;
}


function BidRow({ b }) {
  const { t } = useT();
  const cool = Date.now() / 1000 < Number(b.roundStart);
  const { passed, label } = useCountdown(cool ? b.roundStart : b.roundEnd);
  return (
    <tr>
      <td><CompanyLink company={b.company} to="#s-auction" /></td>
      <td className="num-cell">{fmt(b.amount)}</td>
      <td className="num-cell">{b.maxPrice >= b.amount ? t("no limit") : fmt(b.maxPrice)}</td>
      <td className="muted">{cool ? t("Next round in {time}; you can withdraw now", { time: label }) : passed ? t("Ready to settle") : label}</td>
    </tr>
  );
}

export default function Portfolio() {
  const { t, tn } = useT();
  const params = useParams();
  const { address: me, connect, connecting } = useSession();
  const target = params.address || me;
  const own = !!me && same(target, me);
  usePageTitle(own || !target ? t("Your portfolio") : t("Portfolio"), t("Units, bids and open votes of an address on FairRound, read live from the chain."));

  // Reject a malformed address in the URL before reading anything.
  const valid = !params.address || /^0x[0-9a-fA-F]{40}$/.test(params.address);
  const [data, error] = useChain((p) => (target && valid ? loadPortfolio(target, p) : Promise.resolve(null)), [target, valid]);
  const explorer = ACTIVE_NETWORK.blockExplorerUrls[0];

  if (!target) {
    return (
      <div className="page stack" style={{ paddingTop: 48 }}>
        <h1 className="h1">{t("Your portfolio")}</h1>
        <p className="lede">{t("Your units, open bids and anything waiting for your vote or claim, in one place. Connect a wallet to see yours. Everything on FairRound is public, so you can also look up any address.")}</p>
        <div><Button busy={connecting} onClick={connect}>{t("Connect wallet")}</Button></div>
        <div style={{ paddingTop: 24 }}><Lookup /></div>
      </div>
    );
  }
  if (!valid) {
    return (
      <div className="page stack" style={{ paddingTop: 48 }}>
        <h1 className="h2">{t("That isn't a wallet address.")}</h1>
        <Lookup />
      </div>
    );
  }

  const shareTotal = data ? data.holdings.reduce((s, h) => s + h.shares, 0n) : 0n;

  return (
    <div className="page" style={{ paddingTop: 48 }}>
      <header className="stack-sm">
        <h1 className="h1">{own ? t("Your portfolio") : t("Portfolio")}</h1>
        <p className="addr">
          {explorer ? <a href={`${explorer}/address/${target}`} target="_blank" rel="noreferrer"><span className="hide-sm">{target}</span><span className="only-sm">{short(target)}</span></a>
            : <><span className="hide-sm">{target}</span><span className="only-sm">{short(target)}</span></>}
        </p>
        {own && <CopyLink path={`/portfolio/${target}`} />}
      </header>

      <ErrorLine error={error} />
      {!data ? !error && <div style={{ paddingTop: 32 }}><Loading /></div> : (
        <>
          <dl className="facts" style={{ margin: "40px 0 8px" }}>
            <div><dt>INVEST</dt><dd>{fmt(data.invest)}</dd></div>
            <div><dt>{t("Units")}</dt><dd>{tn("{n} unit", "{n} units", shareTotal)} {t("in {n} projects", { n: data.holdings.length })}</dd></div>
            <div><dt>{t("Open bids")}</dt><dd>{int(data.bids.length)}</dd></div>
            <div><dt>{t("Member")}</dt><dd>{data.claimed ? t("Yes, claimed") : data.isVerified ? t("Verified, not claimed yet") : t("No")}</dd></div>
          </dl>
          {own && !data.claimed && <p className="small"><Link to="/citizen">{t("Join and get test credits")}</Link></p>}

          <section className="section" style={{ marginTop: 40 }} aria-labelledby="p-todo">
            <div className="section-head"><h2 id="p-todo" className="h2">{own ? t("Waiting for you") : t("Waiting for this address")}</h2></div>
            {data.todo.length === 0 ? <Muted>{own ? t("Nothing right now: no votes open to you, nothing to claim or reveal.") : t("Nothing right now.")}</Muted> : (
              <ul className="list">{data.todo.map((it, i) => <TodoItem key={i} item={it} />)}</ul>
            )}
          </section>

          <section className="section" aria-labelledby="p-shares">
            <div className="section-head"><h2 id="p-shares" className="h2">{t("Units")}</h2></div>
            {data.holdings.length === 0 ? (
              <Muted>{own ? <>{t("No units yet.")} <Link to="/">{t("Choose a launch on the Launches page")}</Link></> : t("No units.")}</Muted>
            ) : (
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">{t("Launch")}</th>
                    <th scope="col" className="num-cell">{t("Units")}</th>
                    <th scope="col" className="num-cell">{t("Of the project")}</th>
                    <th scope="col" className="hide-sm">{t("Stage")}</th>
                    <th scope="col">{t("Can be sold or moved")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.holdings.map((h) => (
                    <tr key={h.company.id}>
                      <td><CompanyLink company={h.company} /></td>
                      <td className="num-cell">{int(h.shares)}</td>
                      <td className="num-cell">{pct(h.shares, h.company.sharesIssued)}</td>
                      <td className="hide-sm"><StageStamp company={h.company} /></td>
                      <td><Lock free={h.free} next={h.nextUnlock} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="section" aria-labelledby="p-bids">
            <div className="section-head"><h2 id="p-bids" className="h2">{t("Open bids")}</h2></div>
            {data.bids.length === 0 ? <Muted>{t("No open bids.")}</Muted> : (
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">{t("Launch")}</th>
                    <th scope="col" className="num-cell">{t("Committed, INVEST")}</th>
                    <th scope="col" className="num-cell">{t("Up to, per unit")}</th>
                    <th scope="col">{t("Round closes")}</th>
                  </tr>
                </thead>
                <tbody>{data.bids.map((b) => <BidRow key={b.company.id} b={b} />)}</tbody>
              </table>
            )}
            {data.bids.length > 0 && <Muted small>{t("A bid stays in each round until it has bought what it can; you can withdraw it in the hour between rounds.")}</Muted>}
          </section>

          {(data.roles.length > 0 || data.listed.length > 0) && (
            <section className="section" aria-labelledby="p-roles">
              <div className="section-head"><h2 id="p-roles" className="h2">{t("Roles and units for sale")}</h2></div>
              <ul className="list">
                {data.roles.map((r, i) => (
                  <li key={`r${i}`} className="spread">
                    <CompanyLink company={r.company} />
                    <span>
                      {r.role === "governor" && t("Project lead, term {n}.", { n: r.term.toString() })}
                      {r.role === "key" && t("Operating key, term {n}.", { n: r.term.toString() })}
                      {r.role === "candidate" && t("Candidate for project lead.")}
                      {r.role === "governor" && !r.hasKey && own && <span className="error-line" style={{ display: "block" }}>{t("No operating key registered yet.")}</span>}
                    </span>
                  </li>
                ))}
                {data.listed.map((x) => (
                  <li key={`l${x.tokenId}`} className="spread">
                    <CompanyLink company={data.companies.find((c) => c.id === x.companyId) ?? { id: x.companyId, name: `#${x.companyId}` }} />
                    <span>{t("Unit #{id} offered for {price} INVEST.", { id: x.tokenId.toString(), price: fmt(x.listedAt) })} <Link to="/market">{t("Unit market")}</Link></span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="section" aria-label={t("Look up any address")}>
            <Lookup />
          </section>
        </>
      )}
    </div>
  );
}
