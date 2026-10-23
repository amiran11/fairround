import { useState } from "react";
import { Copy } from "lucide-react";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import { normalizeAddress, parseAmount } from "../web3.js";
import {
  ZERO, CAPITAL, INCOME, getHoldings, getTokens, getProposals, getRules, getDividendTerms, getCorporateHoldings,
  depositToken, proposePayment, proposeSale, proposeInvest, voteProposal, executePayment, executeInvest, startAuction,
  commitBid, revealBid, settleAuction, claimAuction, getSavedBid, parseRevealCode, revealCode,
  openPolicyVote, votePolicy, resolvePolicyVote, claimDividend, claimDividendAsCorporation, closeTerm, governancePhase,
} from "./chain.js";
import { fmt, fmtDate, int, pct, same, useChain, useCountdown, useTx } from "../components/liveUtils.js";
import { Act, Address, AmountInput, Button, ErrorLine, Field, Input, Loading, Muted, Notice, Select, Tabs } from "../components/ui.jsx";

const fromBucket = (t, b) => (b === CAPITAL ? t("from capital") : t("from income"));

function Left({ to, label }) {
  const { t } = useT();
  const { passed, label: time } = useCountdown(to);
  return <>{passed ? t("ended") : t(label, { time })}</>;
}

// ------------------------------------------------------------ holdings

function Holdings({ company, holdings }) {
  const { t } = useT();
  const { signer } = useSession();
  const [giving, setGiving] = useState(false);
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const { busy, error, setError, run } = useTx();
  const approved = holdings.filter((h) => h.approved);

  const deposit = async () => {
    const tk = approved.find((h) => same(h.address, token));
    if (!tk) return setError("Choose a token.");
    let raw;
    try { raw = await parseAmount(amount, tk.decimals); } catch { return setError("Enter a valid amount."); }
    await run(() => depositToken(signer, company.id, tk.address, raw), () => { setAmount(""); setGiving(false); });
  };

  return (
    <div className="stack">
      <table className="ledger">
        <thead>
          <tr><th scope="col">{t("Token")}</th><th scope="col" className="num-cell">{t("Capital")}</th><th scope="col" className="num-cell">{t("Income")}</th></tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.address}><td>{h.symbol}</td><td className="num-cell">{fmt(h.capital, h.decimals, 4)}</td><td className="num-cell">{fmt(h.income, h.decimals, 4)}</td></tr>
          ))}
        </tbody>
      </table>
      <Muted small>
        {t("Capital is what the project raised by selling units and what it is given. Income is what holders chose to reinvest at the end of a term; only income can be bid in other projects. Nothing leaves either without a holder vote, and no more than 20% of each per term.")}
      </Muted>
      {signer && !giving && <div><Button kind="secondary" small onClick={() => setGiving(true)}>{t("Give tokens to this project")}</Button></div>}
      {signer && giving && (
        <Act title={t("Give tokens to this project")}>
          <p className="small">{t("Anyone can add tokens to a project's treasury. A deposit is a gift and can't be taken back.")}</p>
          <Field label={t("Token")}>
            <Select value={token} onChange={(e) => setToken(e.target.value)}>
              <option value="">{t("Choose a token…")}</option>
              {approved.map((h) => <option key={h.address} value={h.address}>{h.symbol}</option>)}
            </Select>
          </Field>
          <Field label={t("Amount")}><Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <div className="row-tight">
            <Button busy={busy} onClick={deposit}>{t("Deposit")}</Button>
            <Button kind="plain" onClick={() => setGiving(false)}>{t("Cancel")}</Button>
          </div>
          <ErrorLine error={error} />
        </Act>
      )}
    </div>
  );
}

// ------------------------------------------------------------ proposals

function ProposalTitle({ p, companies }) {
  const { t } = useT();
  const target = companies?.find((c) => BigInt(c.id) === p.target);
  if (p.kind === "Payment") {
    return <>{t("Pay {amount} {symbol} {from} to", { amount: fmt(p.amount, p.token.decimals, 4), symbol: p.token.symbol, from: fromBucket(t, p.bucket) })} <Address value={p.to} /></>;
  }
  if (p.kind === "Sale") {
    return <>{t("Sell {amount} {symbol} {from} for {pay}, at least {reserve} {pay}", { amount: fmt(p.amount, p.token.decimals, 4), symbol: p.token.symbol, from: fromBucket(t, p.bucket), pay: p.payToken?.symbol, reserve: fmt(p.reserve, p.payToken?.decimals ?? 18, 4) })}</>;
  }
  return <>{t("Bid {amount} UNRIG of income in {company}, at most {max} UNRIG a unit", { amount: fmt(p.amount), company: target ? target.name : `#${p.target}`, max: fmt(p.reserve) })}</>;
}

function SaleAuction({ p }) {
  const { t } = useT();
  const { signer, address } = useSession();
  const tx = useTx();
  const [bid, setBid] = useState("");
  const [code, setCode] = useState("");
  const [newCode, setNewCode] = useState(null);
  const a = p.auction;
  const commitOver = useCountdown(a.commitEnd).passed;
  const revealOver = useCountdown(a.revealEnd).passed;
  const phase = p.status === "Settled" ? "done" : !commitOver ? "commit" : !revealOver ? "reveal" : "settle";
  const saved = address ? getSavedBid(p.id, address) : null;
  const won = p.status === "Settled" && same(a.leader, address);
  const pay = p.payToken;
  const copy = (text) => { try { navigator.clipboard.writeText(text); } catch { /* blocked */ } };

  const commit = async () => {
    let raw;
    try { raw = await parseAmount(bid, pay.decimals); } catch { return tx.setError("Enter your bid."); }
    if (raw < p.reserve) return tx.setError(t("The minimum bid is {n} {s}.", { n: fmt(p.reserve, pay.decimals, 4), s: pay.symbol }));
    await tx.run(() => commitBid(signer, p, raw), (rc) => { setNewCode(rc); setBid(""); });
  };
  const reveal = async () => {
    const x = saved ? { amount: BigInt(saved.amount), salt: saved.salt } : parseRevealCode(code);
    if (!x) return tx.setError("That reveal code isn't valid.");
    await tx.run(() => revealBid(signer, p, x.amount, x.salt));
  };

  return (
    <div className="stack-sm" style={{ marginTop: 8 }}>
      <p className="small muted">
        {phase === "commit" && <Left to={a.commitEnd} label="Sealed bids close in {time}" />}
        {phase === "reveal" && <Left to={a.revealEnd} label="Reveals close in {time}" />}
        {phase === "settle" && t("Waiting to be settled")}
        {phase === "done" && (a.leader === ZERO ? t("No valid bids; the asset went back to the project.") : t("Sold for {n} {s}.", { n: fmt(a.leadingAmount, pay.decimals, 4), s: pay.symbol }))}
        {" "}{t("{c} sealed, {r} revealed.", { c: int(a.committed), r: int(a.revealed) })}
      </p>
      {newCode && (
        <Notice title={t("Save your reveal code")}>
          <p>{t("You need it to reveal your bid after bidding closes. It's saved in this browser too, but without it on another device you can't reveal and you lose the deposit.")}</p>
          <p className="row-tight" style={{ marginTop: 8 }}>
            <code className="code">{newCode}</code>
            <Button kind="secondary" small onClick={() => copy(newCode)}><Copy size={14} aria-hidden="true" /> {t("Copy")}</Button>
          </p>
        </Notice>
      )}
      {signer && phase === "commit" && !p.mine.committed && (
        <Act title={t("Place a sealed bid")}>
          <Field label={t("Your bid")} hint={t("At least {r} {s}. Nobody sees it until you reveal. Bidding takes a {d} {s} deposit now, returned after the auction if you reveal; the bid itself is paid when you reveal and refunded if you lose. The winner gets the asset; 1% of the winning bid goes to the host.", { r: fmt(p.reserve, pay.decimals, 4), s: pay.symbol, d: fmt(a.deposit, pay.decimals, 4) })}>
            <AmountInput unit={pay.symbol} value={bid} onChange={(e) => setBid(e.target.value)} />
          </Field>
          <Button busy={tx.busy} onClick={commit}>{t("Place sealed bid")}</Button>
        </Act>
      )}
      {signer && phase === "commit" && p.mine.committed && !newCode && (
        <Muted small>{t("You've placed a sealed bid. Come back after bidding closes to reveal it.")}{saved && <> {t("Reveal code:")} <code className="code">{revealCode(BigInt(saved.amount), saved.salt)}</code></>}</Muted>
      )}
      {signer && phase === "reveal" && p.mine.committed && !p.mine.revealed && (
        <Act title={t("Reveal your bid")}>
          {saved ? <Button busy={tx.busy} onClick={reveal}>{t("Reveal my bid of {n} {s}", { n: fmt(BigInt(saved.amount), pay.decimals, 4), s: pay.symbol })}</Button> : (
            <>
              <Field label={t("Reveal code")} hint={t("This browser doesn't have your bid saved. Paste the code you copied when you bid.")}>
                <Input value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} />
              </Field>
              <Button busy={tx.busy} onClick={reveal}>{t("Reveal")}</Button>
            </>
          )}
        </Act>
      )}
      {signer && phase === "settle" && <div><Button kind="secondary" busy={tx.busy} onClick={() => tx.run(() => settleAuction(signer, p.id))}>{t("Settle the auction")}</Button></div>}
      {signer && phase === "done" && p.mine.revealed && !p.mine.claimed && (
        <div><Button busy={tx.busy} onClick={() => tx.run(() => claimAuction(signer, p.id))}>{won ? t("Claim {amount} {symbol} and your deposit", { amount: fmt(p.amount, p.token.decimals, 4), symbol: p.token.symbol }) : t("Claim back your bid and deposit")}</Button></div>
      )}
      {signer && phase === "done" && p.mine.claimed && <Muted small>{t("Claimed.")}</Muted>}
      {signer && (phase === "done" || phase === "settle") && p.mine.committed && !p.mine.revealed && <Muted small>{t("Your bid wasn't revealed in time, so its deposit went to the project.")}</Muted>}
      <ErrorLine error={tx.error} />
    </div>
  );
}

function ProposalItem({ p, companies, gov, delay }) {
  const { t, tn, lang } = useT();
  const { signer, address } = useSession();
  const tx = useTx();
  const voting = !useCountdown(p.voteEnd).passed;
  const dueAt = Number(p.voteEnd) + Number(delay);
  const due = useCountdown(dueAt).passed;
  const needed = (p.eligible * p.quorumBps + 9999n) / 10000n;
  const proposer = same(address, p.governor) || same(address, p.opKey);
  const isKey = same(address, gov.opKey);
  const termLive = gov.active && gov.termNum === p.term;
  const statusText = {
    Rejected: t("Rejected or void; the asset stayed with the project."),
    Paid: t("Approved and paid."),
    PaymentFailed: t("Approved, but the transfer failed; the money went back to the project."),
    Invested: t("Approved; the project's bid was placed."),
  }[p.status];

  return (
    <li className="stack-sm">
      <div className="spread">
        <span className="strong"><ProposalTitle p={p} companies={companies} /></span>
        <span className="small muted">{t("Proposal {id}, term {term}", { id: p.id.toString(), term: p.term.toString() })}</span>
      </div>
      {p.status === "Voting" && (
        <>
          <p className="small muted num">
            {voting ? <><Left to={p.voteEnd} label="Voting closes in {time}" />.</> : !termLive ? t("The term ended before this was carried out, so it is void.") : due ? t("Voting has closed.") : t("Voting has closed. It can be carried out from {date}, after the 5-day wait.", { date: fmtDate(dueAt, lang) })}
            {" "}{t("Yes {y}, no {n}. Yes votes needed: {q} ({pct} of {eligible} units).", { y: int(p.yes), n: int(p.no), q: int(needed), pct: `${Number(p.quorumBps) / 100}%`, eligible: int(p.eligible) })}
            {" "}<span style={{ color: p.passes ? "var(--ok)" : "var(--danger)" }}>{p.passes ? t("It would pass now.") : t("It would fail now.")}</span>
          </p>
          {signer && voting && !p.voted && p.myWeight > 0n && !proposer && !same(address, p.to) && (
            <div className="row-tight">
              <Button small busy={tx.busy} onClick={() => tx.run(() => voteProposal(signer, p.id, true))}>{tn("Approve with {n} unit", "Approve with {n} units", p.myWeight)}</Button>
              <Button small kind="secondary" busy={tx.busy} onClick={() => tx.run(() => voteProposal(signer, p.id, false))}>{t("Reject")}</Button>
            </div>
          )}
          {signer && voting && p.voted && <Muted small>{t("You've voted on this proposal.")}</Muted>}
          {signer && voting && !p.voted && proposer && <Muted small>{t("The project lead and operating key can't vote on their own proposal.")}</Muted>}
          {signer && voting && !p.voted && !proposer && p.myWeight === 0n && <Muted small>{t("Only wallets that held units a day before this was proposed can vote.")}</Muted>}
          {signer && !voting && (due || !termLive) && (
            p.kind === "Payment" ? <div><Button kind="secondary" busy={tx.busy} onClick={() => tx.run(() => executePayment(signer, p.id))}>{p.passes && termLive ? t("Carry out the payment") : t("Close it and return the money")}</Button></div>
              : p.kind === "Sale" ? <div><Button kind="secondary" busy={tx.busy} onClick={() => tx.run(() => startAuction(signer, p.id))}>{p.passes && termLive ? t("Start the auction") : t("Close it and return the asset")}</Button></div>
                : (p.passes && termLive ? (isKey ? <div><Button busy={tx.busy} onClick={() => tx.run(() => executeInvest(signer, p.id))}>{t("Place the project's bid")}</Button></div> : <Muted small>{t("Approved. The project lead's operating key places the bid while the target's round is open.")}</Muted>)
                  : <div><Button kind="secondary" busy={tx.busy} onClick={() => tx.run(() => executeInvest(signer, p.id))}>{t("Close it and return the income")}</Button></div>)
          )}
        </>
      )}
      {p.kind === "Sale" && (p.status === "Auction" || p.status === "Settled") && p.auction && <SaleAuction p={p} />}
      {statusText && <p className="small muted">{statusText}</p>}
      <ErrorLine error={tx.error} />
    </li>
  );
}

function Proposals({ company, companies, gov }) {
  const { t } = useT();
  const { me } = useSession();
  const [list, err] = useChain((p) => getProposals(company.id, me, p), [company.id, me]);
  const [rules] = useChain(getRules, []);
  return (
    <div className="stack">
      <Muted small>{t("Everything the project pays, sells or invests is proposed by the project lead and decided by holders in a 3-day vote. It passes with yes votes from at least 20% of the units that can vote (40% once this term's total passes 5% of the balance) and 51% of the votes cast. Then it waits 5 days, so holders can recall the project lead first.")}</Muted>
      <ErrorLine error={err} />
      {!list || !rules ? !err && <Loading /> : list.length === 0 ? <Muted>{t("No proposals yet.")}</Muted> : (
        <ul className="list">{list.map((p) => <ProposalItem key={p.id.toString()} p={p} companies={companies} gov={gov} delay={rules.delay} />)}</ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------ governor tools

function BucketTokenFields({ holdings, token, setToken, bucket, setBucket, onlyInvestIncome }) {
  const { t } = useT();
  const options = onlyInvestIncome ? holdings.filter((h) => h.isInvest) : holdings;
  const tk = holdings.find((h) => same(h.address, token));
  return (
    <>
      <Field label={t("Token")}>
        <Select value={token} onChange={(e) => setToken(e.target.value)}>
          <option value="">{t("Choose a token…")}</option>
          {options.map((h) => <option key={h.address} value={h.address}>{h.symbol}</option>)}
        </Select>
      </Field>
      <Field label={t("From")} hint={tk ? t("Capital: {c}. Income: {i}.", { c: fmt(tk.capital, tk.decimals, 4), i: fmt(tk.income, tk.decimals, 4) }) : undefined}>
        <Select value={String(bucket)} onChange={(e) => setBucket(Number(e.target.value))}>
          <option value={String(CAPITAL)}>{t("Capital")}</option>
          <option value={String(INCOME)}>{t("Income")}</option>
        </Select>
      </Field>
    </>
  );
}

function GovernorTools({ company, companies, holdings, gov }) {
  const { t } = useT();
  const { signer } = useSession();
  const pay = useTx(); const sale = useTx(); const inv = useTx(); const corp = useTx();
  const [pToken, setPToken] = useState(""); const [pBucket, setPBucket] = useState(CAPITAL); const [pTo, setPTo] = useState(""); const [pAmt, setPAmt] = useState("");
  const [sToken, setSToken] = useState(""); const [sBucket, setSBucket] = useState(CAPITAL); const [sAmt, setSAmt] = useState(""); const [sPay, setSPay] = useState(""); const [sReserve, setSReserve] = useState("");
  const [iTarget, setITarget] = useState(""); const [iAmt, setIAmt] = useState(""); const [iMax, setIMax] = useState("");
  const [cTarget, setCTarget] = useState(""); const [cTerm, setCTerm] = useState("");
  const others = companies.filter((c) => c.id !== company.id);
  const [corpHoldings] = useChain((p) => getCorporateHoldings(company.id, others, p), [company.id, others.length]);
  const lastDay = Number(gov.termEnd) - 11 * 86400;
  const late = Math.floor(Date.now() / 1000) >= lastDay;
  const invest = holdings.find((h) => h.isInvest);

  const doPay = async () => {
    const tk = holdings.find((h) => same(h.address, pToken));
    if (!tk) return pay.setError("Choose a token the project holds.");
    const to = await normalizeAddress(pTo);
    if (!to) return pay.setError("Enter a valid recipient address.");
    let raw;
    try { raw = await parseAmount(pAmt, tk.decimals); } catch { return pay.setError("Enter a valid amount."); }
    await pay.run(() => proposePayment(signer, company.id, tk.address, pBucket, to, raw), () => { setPAmt(""); setPTo(""); });
  };
  const doSale = async () => {
    const tk = holdings.find((h) => same(h.address, sToken));
    const pt = holdings.find((h) => same(h.address, sPay));
    if (!tk) return sale.setError("Choose a token the project holds.");
    if (!pt || same(pt.address, tk.address)) return sale.setError("Choose what buyers pay with (a different token).");
    let amt, reserve;
    try { amt = await parseAmount(sAmt, tk.decimals); reserve = await parseAmount(sReserve, pt.decimals); } catch { return sale.setError("Enter both amounts."); }
    await sale.run(() => proposeSale(signer, company.id, tk.address, sBucket, amt, pt.address, reserve), () => { setSAmt(""); setSReserve(""); });
  };
  const doInvest = async () => {
    if (iTarget === "") return inv.setError("Choose a project to invest in.");
    let amt, max;
    try { amt = await parseAmount(iAmt, 18); max = await parseAmount(iMax, 18); } catch { return inv.setError("Enter the amount and the highest price per unit."); }
    await inv.run(() => proposeInvest(signer, company.id, Number(iTarget), amt, max), () => { setIAmt(""); setIMax(""); });
  };

  return (
    <div className="stack">
      <Notice tone="ok">{t("You're signed in with {name}'s operating key. Proposals go to a holder vote; nothing moves until they approve it.", { name: company.name })}</Notice>
      {late && <Notice tone="plain">{t("It's too late in this term for new proposals: each needs 3 days of voting, 5 days of waiting and room for a recall before the term ends.")}</Notice>}

      <Act title={t("Propose a payment")}>
        <p className="small">{t("Pays a named address. The recipient can't be you or the project lead, and can't vote on it.")}</p>
        <BucketTokenFields holdings={holdings} token={pToken} setToken={setPToken} bucket={pBucket} setBucket={setPBucket} />
        <Field label={t("Recipient address")}><Input value={pTo} onChange={(e) => setPTo(e.target.value)} placeholder="0x…" spellCheck={false} /></Field>
        <Field label={t("Amount")}><Input type="number" min="0" step="any" value={pAmt} onChange={(e) => setPAmt(e.target.value)} /></Field>
        <Button busy={pay.busy} disabled={late} onClick={doPay}>{t("Propose the payment")}</Button>
        <ErrorLine error={pay.error} />
      </Act>

      <Act title={t("Propose a sale")}>
        <p className="small">{t("If approved, the asset is sold at a sealed-bid auction: 2 days of sealed bids, 1 day to reveal, the highest bid at or above the reserve wins. The proceeds stay in the same bucket.")}</p>
        <BucketTokenFields holdings={holdings} token={sToken} setToken={setSToken} bucket={sBucket} setBucket={setSBucket} />
        <Field label={t("Amount to sell")}><Input type="number" min="0" step="any" value={sAmt} onChange={(e) => setSAmt(e.target.value)} /></Field>
        <Field label={t("Buyers pay in")}>
          <Select value={sPay} onChange={(e) => setSPay(e.target.value)}>
            <option value="">{t("Choose a token…")}</option>
            {holdings.filter((h) => h.approved).map((h) => <option key={h.address} value={h.address}>{h.symbol}</option>)}
          </Select>
        </Field>
        <Field label={t("Reserve: the lowest acceptable winning bid")} hint={t("Bidders put down 10% of the reserve as a deposit.")}><Input type="number" min="0" step="any" value={sReserve} onChange={(e) => setSReserve(e.target.value)} /></Field>
        <Button busy={sale.busy} disabled={late} onClick={doSale}>{t("Propose the sale")}</Button>
        <ErrorLine error={sale.error} />
      </Act>

      <Act title={t("Propose an investment in another project")}>
        <p className="small">{t("Bids the project's UNRIG income ({n} available) in another project's unit auction, never its capital. If it wins, you personally receive 1% of the units it buys, locked for 60 days.", { n: fmt(invest?.income ?? 0n) })}</p>
        <Field label={t("Listing")}>
          <Select value={iTarget} onChange={(e) => setITarget(e.target.value)}>
            <option value="">{t("Choose…")}</option>
            {others.filter((c) => !c.finalized).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t("UNRIG to bid")}><AmountInput unit="UNRIG" value={iAmt} onChange={(e) => setIAmt(e.target.value)} /></Field>
        <Field label={t("Highest price per unit")}><AmountInput unit="UNRIG" value={iMax} onChange={(e) => setIMax(e.target.value)} /></Field>
        <Button busy={inv.busy} disabled={late} onClick={doInvest}>{t("Propose the investment")}</Button>
        <ErrorLine error={inv.error} />
      </Act>

      <Act title={t("Units this project holds elsewhere")}>
        {!corpHoldings ? <Loading /> : corpHoldings.length === 0 ? <Muted small>{t("None yet. Approved investments build them.")}</Muted> : (
          <>
            <ul className="small" style={{ listStyle: "none", padding: 0 }}>
              {corpHoldings.map((h) => <li key={h.company.id}>{h.company.name}: {int(h.shares)}</li>)}
            </ul>
            <div className="input-row">
              <Select aria-label={t("Listing")} value={cTarget} onChange={(e) => setCTarget(e.target.value)}>
                <option value="">{t("Choose…")}</option>
                {corpHoldings.map((h) => <option key={h.company.id} value={h.company.id}>{h.company.name}</option>)}
              </Select>
              <Input aria-label={t("Term number")} type="number" min="1" value={cTerm} onChange={(e) => setCTerm(e.target.value)} placeholder={t("Term number")} />
              <Button small kind="secondary" busy={corp.busy} disabled={cTarget === "" || !cTerm} onClick={() => corp.run(() => claimDividendAsCorporation(signer, company.id, Number(cTarget), Number(cTerm)))}>{t("Claim its dividend")}</Button>
            </div>
            <Muted small>{t("Dividends claimed this way become this project's income.")}</Muted>
          </>
        )}
        <ErrorLine error={corp.error} />
      </Act>
    </div>
  );
}

// ------------------------------------------------------------ dividends

function TermItem({ company, tm }) {
  const { t, tn, lang } = useT();
  const { signer, address } = useSession();
  const tx = useTx();
  const over = useCountdown(tm.voteEnd).passed;
  const voting = tm.voteEnd > 0n && !over;
  const toCount = tm.voteEnd > 0n && !voting && !tm.resolved;
  const needed = (tm.base * 2000n + 9999n) / 10000n;
  const isTermGov = same(address, tm.termGov);
  return (
    <li className="stack-sm">
      <span className="strong">{t("Term {n}, ended {date}", { n: tm.term, date: fmtDate(tm.endTime, lang) })}</span>
      {tm.voteEnd === 0n && (
        <>
          <Muted small>{t("Holders decide what happens to 1% of the UNRIG capital: paid out as a dividend, or moved to income for reinvesting. Anyone can open the 3-day vote.")}</Muted>
          {signer && <div><Button kind="secondary" busy={tx.busy} onClick={() => tx.run(() => openPolicyVote(signer, company.id, tm.term))}>{t("Open the vote")}</Button></div>}
        </>
      )}
      {(voting || toCount) && (
        <p className="small muted num">
          {t("Dividend {d}, reinvest {r}. The winning side needs {q} units (20%).", { d: int(tm.dividendWeight), r: int(tm.reinvestWeight), q: int(needed) })}{" "}
          {voting ? <><Left to={tm.voteEnd} label="Voting closes in {time}" />.</> : t("Voting has closed.")}
        </p>
      )}
      {signer && voting && !tm.hasVoted && tm.myWeight > 0n && !isTermGov && (
        <div className="row-tight">
          <Button small busy={tx.busy} onClick={() => tx.run(() => votePolicy(signer, company.id, tm.term, true))}>{t("Pay a dividend")}</Button>
          <Button small kind="secondary" busy={tx.busy} onClick={() => tx.run(() => votePolicy(signer, company.id, tm.term, false))}>{t("Reinvest it")}</Button>
          <span className="small muted">{tn("with {n} unit", "with {n} units", tm.myWeight)}</span>
        </div>
      )}
      {signer && voting && isTermGov && <Muted small>{t("That term's project lead can't vote on it.")}</Muted>}
      {signer && voting && tm.hasVoted && <Muted small>{t("You've voted.")}</Muted>}
      {signer && toCount && <div><Button kind="secondary" busy={tx.busy} onClick={() => tx.run(() => resolvePolicyVote(signer, company.id, tm.term))}>{t("Count the vote")}</Button></div>}
      {tm.resolved && (tm.perShare > 0n ? (
        <>
          <p className="small">{t("Dividend paid: {n} UNRIG per unit held when the term ended.", { n: fmt(tm.perShare / 10n ** 18n, 18, 6) })}</p>
          {signer && tm.owed > 0n && !tm.claimed && <div><Button busy={tx.busy} onClick={() => tx.run(() => claimDividend(signer, company.id, tm.term))}>{t("Claim {n} UNRIG", { n: fmt(tm.owed, 18, 4) })}</Button></div>}
          {signer && tm.claimed && <Muted small>{t("You've claimed your dividend.")}</Muted>}
        </>
      ) : <Muted small>{t("No dividend this term: either reinvesting won, or neither side reached 20%.")}</Muted>)}
      <ErrorLine error={tx.error} />
    </li>
  );
}

function Dividends({ company }) {
  const { t } = useT();
  const { signer, me } = useSession();
  const [terms, err] = useChain((p) => getDividendTerms(company.id, me, p), [company.id, me]);
  const tx = useTx();
  const termOver = governancePhase(company) === "termOver";
  return (
    <div className="stack">
      <Muted small>{t("After every term, holders vote on 1% of the project's UNRIG capital: pay it out as a dividend, or move it to income for reinvesting. The vote and the payout use the units held when the term ended, and that term's project lead can't vote.")}</Muted>
      {termOver && signer && (
        <Act title={t("Record the end of term {n}", { n: company.gov.termNum.toString() })}>
          <p className="small">{t("The term is over but hasn't been recorded yet. Recording it lets the dividend vote open. Opening the next election records it too.")}</p>
          <Button kind="secondary" busy={tx.busy} onClick={() => tx.run(() => closeTerm(signer, company.id))}>{t("Record the end of the term")}</Button>
          <ErrorLine error={tx.error} />
        </Act>
      )}
      <ErrorLine error={err} />
      {!terms ? !err && <Loading /> : terms.length === 0 ? <Muted>{t("No term has ended yet.")}</Muted> : (
        <ul className="list">{terms.map((tm) => <TermItem key={tm.term} company={company} tm={tm} />)}</ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------ section

export default function Treasury({ company, companies }) {
  const { t } = useT();
  const { address } = useSession();
  const [holdings, err] = useChain((p) => getHoldings(company.id, p), [company.id]);
  const [tab, setTab] = useState(() => {
    const asked = new URLSearchParams(window.location.search).get("tab");
    return ["holdings", "proposals", "dividends", "governor"].includes(asked) ? asked : "holdings";
  });
  const g = company.gov;
  const iAmKey = g.active && g.opKey !== ZERO && same(g.opKey, address);
  const tabs = [
    { id: "holdings", label: t("Holdings") },
    { id: "proposals", label: t("Proposals") },
    { id: "dividends", label: t("Dividends") },
    ...(iAmKey ? [{ id: "governor", label: t("Project lead tools") }] : []),
  ];
  void pct; void getTokens;
  if (!holdings) return err ? <ErrorLine error={err} /> : <Loading />;
  return (
    <div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} label={t("Treasury")} />
      {tab === "holdings" && <Holdings company={company} holdings={holdings} />}
      {tab === "proposals" && <Proposals company={company} companies={companies} gov={g} />}
      {tab === "dividends" && <Dividends company={company} />}
      {tab === "governor" && iAmKey && <GovernorTools company={company} companies={companies} holdings={holdings} gov={g} />}
    </div>
  );
}
