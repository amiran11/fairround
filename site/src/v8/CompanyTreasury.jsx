import { useState } from "react";
import { Copy } from "lucide-react";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import {
  CONTRACT_ADDRESSES, getCompanyGovernance, getCompanyTreasury, getTokenInfo, normalizeAddress, parseAmount,
  depositTokenReal, getFreeAllowanceLeft, withdrawTokenReal,
  getTreasuryAuctions, openTreasuryAuctionReal, commitTreasuryBidReal, revealTreasuryBidReal,
  settleTreasuryAuctionReal, claimTreasuryAuctionReal, getSavedBid, makeRevealCode, parseRevealCode,
  getVendorPayments, proposeVendorPaymentReal, voteVendorPaymentReal, executeVendorPaymentReal,
  getDividendTerms, openPolicyVoteReal, votePolicyReal, resolvePolicyVoteReal, claimDividendReal,
  claimDividendAsCorporationReal, getCorporateHoldings, investReal, voteAsCorporationReal,
  getApprovedPaymentTokens, governorOfferInvestReal,
} from "../web3.js";
import { ZERO, same, fmt, int, fmtDate, useChain, useCountdown, useTx } from "../components/liveUtils.js";
import {
  Act, Address, AmountInput, Button, ConnectToAct, ErrorLine, Field, Input, Loading, Muted, Notice, Select, Tabs,
} from "../components/ui.jsx";

function Remaining({ to, label }) {
  const { t } = useT();
  const { passed, label: time } = useCountdown(to);
  return <>{passed ? t("ended") : t(label, { time })}</>;
}

function TokenPicker({ tokens, value, onChange, allowCustom, id }) {
  const { t } = useT();
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("Choose a token…")}</option>
      {tokens.map((tk) => (
        <option key={tk.address} value={tk.address}>
          {tk.symbol}{tk.balance !== undefined ? ` — ${t("company holds {n}", { n: fmt(tk.balance, tk.decimals) })}` : ""}
        </option>
      ))}
      {allowCustom && <option value="custom">{t("Another token (paste its address)")}</option>}
    </Select>
  );
}

// ------------------------------------------------------------ holdings

function Holdings({ company, data }) {
  const { t } = useT();
  const { signer, provider } = useSession();
  const [tokenSel, setTokenSel] = useState("");
  const [custom, setCustom] = useState("");
  const [amount, setAmount] = useState("");
  const [giving, setGiving] = useState(false);
  const { busy, error, setError, run } = useTx();
  const known = [...data.tokens, ...data.payTokens.filter((p) => !data.tokens.some((x) => same(x.address, p.address)))];

  const deposit = async () => {
    const addr = await normalizeAddress((tokenSel === "custom" ? custom : tokenSel) || "");
    if (!addr) return setError("Choose a token, or paste a valid token address.");
    if (same(addr, CONTRACT_ADDRESSES.InvestToken)) return setError("INVEST reaches companies through bidding, not deposits.");
    let info, raw;
    try { info = await getTokenInfo(addr, provider); raw = await parseAmount(amount, info.decimals); } catch { return setError("Enter a valid amount."); }
    await run(() => depositTokenReal(signer, company.id, addr, raw), () => setAmount(""));
  };

  return (
    <div className="stack">
      <dl className="facts">
        <div><dt>{t("Capital, from selling shares")}</dt><dd>{fmt(data.capital)} INVEST</dd></div>
        <div><dt>{t("Income it can reinvest")}</dt><dd>{fmt(data.reinvestableIncome)} INVEST</dd></div>
        {data.tokens.map((tk) => <div key={tk.address}><dt>{tk.symbol}</dt><dd>{fmt(tk.balance, tk.decimals, 4)}</dd></div>)}
      </dl>
      <Muted small>
        {t("Capital can't be reinvested in other companies; income can. In these contracts the governor may move up to 5% of each token per term on their own. Anything larger goes through a sealed-bid auction or a payment shareholders vote on.")}
      </Muted>
      {signer && !giving && (
        <div><Button kind="secondary" small onClick={() => setGiving(true)}>{t("Give tokens to this company")}</Button></div>
      )}
      {signer && giving ? (
        <Act title={t("Give tokens to this company")}>
          <p className="small">{t("Anyone can add tokens to a company's treasury. A deposit is a gift and can't be taken back.")}</p>
          <Field label={t("Token")}>
            <TokenPicker tokens={known} value={tokenSel} allowCustom onChange={setTokenSel} />
          </Field>
          {tokenSel === "custom" && (
            <Field label={t("Token contract address")}><Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="0x…" spellCheck={false} /></Field>
          )}
          <Field label={t("Amount")}><Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <div className="row-tight">
            <Button busy={busy} onClick={deposit}>{t("Deposit")}</Button>
            <Button kind="plain" onClick={() => setGiving(false)}>{t("Cancel")}</Button>
          </div>
          <ErrorLine error={error} />
        </Act>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------ sealed-bid auctions

function AuctionItem({ a }) {
  const { t } = useT();
  const { signer, address } = useSession();
  const { busy, error, setError, run } = useTx();
  const [bid, setBid] = useState("");
  const [code, setCode] = useState("");
  const [newCode, setNewCode] = useState(null);
  const commitOver = useCountdown(a.commitEnd).passed;
  const revealOver = useCountdown(a.revealEnd).passed;
  const phase = !commitOver ? "commit" : !revealOver ? "reveal" : a.settled ? "done" : "settle";
  const saved = address ? getSavedBid(a.id, address) : null;
  const iWon = a.settled && same(a.leader, address);

  const commit = async () => {
    let raw;
    try { raw = await parseAmount(bid, 18); } catch { return setError("Enter your bid in INVEST."); }
    await run(() => commitTreasuryBidReal(signer, a.id, raw, a.deposit), (rc) => { setNewCode(rc); setBid(""); });
  };
  const reveal = async () => {
    const p = saved ? { amount: BigInt(saved.amount), salt: saved.salt } : parseRevealCode(code);
    if (!p) return setError("That reveal code isn't valid.");
    await run(() => revealTreasuryBidReal(signer, a.id, p.amount, p.salt));
  };
  const copy = (text) => { try { navigator.clipboard.writeText(text); } catch { /* blocked */ } };

  const status = {
    commit: <Remaining to={a.commitEnd} label="Sealed bids close in {time}" />,
    reveal: <Remaining to={a.revealEnd} label="Reveals close in {time}" />,
    settle: t("Waiting to be settled"),
    done: a.leader === ZERO ? t("No valid bids; the tokens went back to the company.") : t("Sold for {n} INVEST", { n: fmt(a.leadingAmount) }),
  }[phase];

  return (
    <li className="stack-sm">
      <div className="spread">
        <span className="strong">{t("{amount} {symbol} for sale", { amount: fmt(a.amount, a.token.decimals, 4), symbol: a.token.symbol })}</span>
        <span className="small muted">{t("Auction {id}", { id: a.id.toString() })}</span>
      </div>
      <p className="small muted">
        {status}. {t("{c} sealed, {r} revealed.", { c: int(a.committed), r: int(a.revealed) })}
        {phase === "done" && a.leader !== ZERO && <> {t("Winner:")} <Address value={a.leader} /></>}
      </p>

      {newCode && (
        <Notice title={t("Save your reveal code")}>
          <p>{t("You need it to reveal your bid after bidding closes. It's saved in this browser too, but without it on another device you can't reveal and you lose the {n} INVEST deposit.", { n: fmt(a.deposit) })}</p>
          <p className="row-tight" style={{ marginTop: 8 }}>
            <code className="code">{newCode}</code>
            <Button kind="secondary" small onClick={() => copy(newCode)}><Copy size={14} aria-hidden="true" /> {t("Copy")}</Button>
          </p>
        </Notice>
      )}

      {signer && phase === "commit" && !a.mine.committed && (
        <Act title={t("Place a sealed bid")}>
          <Field label={t("Your bid")} hint={t("Nobody sees the amount until you reveal it. Bidding locks a {n} INVEST deposit, returned when you reveal; the bid itself is paid only at reveal and refunded if you lose.", { n: fmt(a.deposit) })}>
            <AmountInput unit="INVEST" value={bid} onChange={(e) => setBid(e.target.value)} />
          </Field>
          <Button busy={busy} onClick={commit}>{t("Place sealed bid")}</Button>
        </Act>
      )}
      {signer && phase === "commit" && a.mine.committed && !newCode && (
        <Muted small>
          {t("You've placed a sealed bid. Come back after bidding closes to reveal it.")}
          {saved && <> {t("Reveal code:")} <code className="code">{makeRevealCode(BigInt(saved.amount), saved.salt)}</code></>}
        </Muted>
      )}
      {signer && phase === "reveal" && a.mine.committed && !a.mine.revealed && (
        <Act title={t("Reveal your bid")}>
          {saved ? (
            <Button busy={busy} onClick={reveal}>{t("Reveal my bid of {n} INVEST", { n: fmt(BigInt(saved.amount)) })}</Button>
          ) : (
            <>
              <Field label={t("Reveal code")} hint={t("This browser doesn't have your bid saved. Paste the code you copied when you bid.")}>
                <Input value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} />
              </Field>
              <Button busy={busy} onClick={reveal}>{t("Reveal")}</Button>
            </>
          )}
        </Act>
      )}
      {phase === "reveal" && a.mine.revealed && <Muted small>{t("Your bid of {n} INVEST is revealed.", { n: fmt(a.mine.revealedAmount) })}</Muted>}
      {phase === "settle" && (signer
        ? <div><Button kind="secondary" busy={busy} onClick={() => run(() => settleTreasuryAuctionReal(signer, a.id))}>{t("Settle the auction")}</Button></div>
        : <ConnectToAct what={t("Connect a wallet to settle this auction. The highest revealed bid wins.")} />)}
      {signer && phase === "done" && a.mine.revealed && !a.mine.claimed && (
        <div>
          <Button busy={busy} onClick={() => run(() => claimTreasuryAuctionReal(signer, a.id))}>
            {iWon ? t("Claim {amount} {symbol} and your deposit", { amount: fmt(a.amount, a.token.decimals, 4), symbol: a.token.symbol }) : t("Claim back {n} INVEST", { n: fmt(a.deposit + a.mine.revealedAmount) })}
          </Button>
        </div>
      )}
      {signer && phase === "done" && a.mine.claimed && <Muted small>{t("Claimed.")}</Muted>}
      {signer && (phase === "done" || phase === "settle") && a.mine.committed && !a.mine.revealed && (
        <Muted small>{t("Your bid wasn't revealed in time, so its {n} INVEST deposit went to the company.", { n: fmt(a.deposit) })}</Muted>
      )}
      <ErrorLine error={error} />
    </li>
  );
}

function Auctions({ company }) {
  const { t } = useT();
  const { me } = useSession();
  const [list, err] = useChain((p) => getTreasuryAuctions(company.id, me, p), [company.id, me]);
  return (
    <div className="stack">
      <Muted small>{t("The governor can put company tokens up for sale here. Bids are sealed for 2 days, then revealed over 1 day; the highest revealed bid wins. Proceeds become income the company can reinvest.")}</Muted>
      <ErrorLine error={err} />
      {!list ? !err && <Loading /> : list.length === 0 ? <Muted>{t("No auctions yet.")}</Muted> : (
        <ul className="list">{list.map((a) => <AuctionItem key={a.id.toString()} a={a} />)}</ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------ payments

function PaymentItem({ p }) {
  const { t, tn } = useT();
  const { signer } = useSession();
  const { busy, error, run } = useTx();
  const open = !useCountdown(p.voteEnd).passed;
  const turnout = p.yesWeight + p.noWeight;
  return (
    <li className="stack-sm">
      <div className="spread">
        <span className="strong">{t("Pay {amount} {symbol} to", { amount: fmt(p.amount, p.token.decimals, 4), symbol: p.token.symbol })} <Address value={p.to} /></span>
        <span className="small muted">{t("Payment {id}", { id: p.id.toString() })}</span>
      </div>
      <p className="small muted num">
        {p.executed ? (p.passes ? t("Approved and paid.") : t("Rejected; the money went back to the company."))
          : open ? <Remaining to={p.voteEnd} label="Voting closes in {time}" /> : t("Voting has closed; anyone can carry out the result.")}
        {" "}{t("Yes {y}, no {n}. {turnout} of the {q} shares needed have voted (20% of {issued}).", { y: int(p.yesWeight), n: int(p.noWeight), turnout: int(turnout), q: int(p.quorumNeeded), issued: int(p.issued) })}
        {!p.executed && <> <span style={{ color: p.passes ? "var(--ok)" : "var(--danger)" }}>{p.passes ? t("It would pass now.") : t("It would fail now.")}</span></>}
      </p>
      {signer && open && !p.voted && p.myWeight > 0n && (
        <div className="row-tight">
          <Button small busy={busy} onClick={() => run(() => voteVendorPaymentReal(signer, p.id, true))}>{tn("Approve with {n} share", "Approve with {n} shares", p.myWeight)}</Button>
          <Button small kind="secondary" busy={busy} onClick={() => run(() => voteVendorPaymentReal(signer, p.id, false))}>{t("Reject")}</Button>
        </div>
      )}
      {signer && open && p.voted && <Muted small>{t("You've voted on this payment.")}</Muted>}
      {signer && open && !p.voted && p.myWeight === 0n && <Muted small>{t("Only wallets that held shares when this was proposed can vote.")}</Muted>}
      {signer && !open && !p.executed && (
        <div><Button kind="secondary" busy={busy} onClick={() => run(() => executeVendorPaymentReal(signer, p.id))}>{p.passes ? t("Carry out the payment") : t("Close it and return the money")}</Button></div>
      )}
      <ErrorLine error={error} />
    </li>
  );
}

function Payments({ company }) {
  const { t } = useT();
  const { me } = useSession();
  const [list, err] = useChain((p) => getVendorPayments(company.id, me, p), [company.id, me]);
  return (
    <div className="stack">
      <Muted small>{t("Payments the governor proposes to a named address. Shareholders vote for 3 days; a payment goes through only if at least 20% of the shares vote and 51% of the votes say yes. Otherwise the money stays with the company.")}</Muted>
      <ErrorLine error={err} />
      {!list ? !err && <Loading /> : list.length === 0 ? <Muted>{t("No payments proposed yet.")}</Muted> : (
        <ul className="list">{list.map((p) => <PaymentItem key={p.id.toString()} p={p} />)}</ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------ dividends

function TermItem({ company, tm }) {
  const { t, tn, lang } = useT();
  const { signer } = useSession();
  const { busy, error, run } = useTx();
  const over = useCountdown(tm.voteEnd).passed;
  const voting = tm.voteEnd > 0n && !over;
  const toCount = tm.voteEnd > 0n && !voting && !tm.resolved;
  return (
    <li className="stack-sm">
      <span className="strong">{t("Term {n}, ended {date}", { n: tm.term, date: fmtDate(tm.endTime, lang) })}</span>
      {tm.voteEnd === 0n && (
        <>
          <Muted small>{t("Shareholders decide whether 1% of the company's capital is paid out as a dividend or kept. Anyone can open the vote.")}</Muted>
          {signer && <div><Button kind="secondary" busy={busy} onClick={() => run(() => openPolicyVoteReal(signer, company.id, tm.term))}>{t("Open the dividend vote")}</Button></div>}
        </>
      )}
      {(voting || toCount) && (
        <p className="small muted num">
          {t("Dividend {d}, keep it {r}.", { d: int(tm.dividendWeight), r: int(tm.reinvestWeight) })}{" "}
          {voting ? <Remaining to={tm.voteEnd} label="Voting closes in {time}" /> : t("Voting has closed.")}
        </p>
      )}
      {signer && voting && !tm.hasVoted && tm.myWeight > 0n && (
        <div className="row-tight">
          <Button small busy={busy} onClick={() => run(() => votePolicyReal(signer, company.id, tm.term, true))}>{t("Pay the dividend")}</Button>
          <Button small kind="secondary" busy={busy} onClick={() => run(() => votePolicyReal(signer, company.id, tm.term, false))}>{t("Keep it in the company")}</Button>
          <span className="small muted">{tn("with {n} share", "with {n} shares", tm.myWeight)}</span>
        </div>
      )}
      {signer && voting && tm.hasVoted && <Muted small>{t("You've voted.")}</Muted>}
      {signer && voting && !tm.hasVoted && tm.myWeight === 0n && <Muted small>{t("Only wallets that held shares when the term ended can vote.")}</Muted>}
      {signer && toCount && <div><Button kind="secondary" busy={busy} onClick={() => run(() => resolvePolicyVoteReal(signer, company.id, tm.term))}>{t("Count the vote")}</Button></div>}
      {tm.resolved && (tm.perShare > 0n ? (
        <>
          <p className="small">{t("Dividend paid: {n} INVEST per share held when the term ended.", { n: fmt(tm.perShare / 10n ** 18n, 18, 6) })}</p>
          {signer && tm.owed > 0n && <div><Button busy={busy} onClick={() => run(() => claimDividendReal(signer, company.id, tm.term))}>{t("Claim {n} INVEST", { n: fmt(tm.owed, 18, 4) })}</Button></div>}
          {signer && tm.claimed && <Muted small>{t("You've claimed your dividend.")}</Muted>}
        </>
      ) : <Muted small>{t("Shareholders kept the money in the company.")}</Muted>)}
      <ErrorLine error={error} />
    </li>
  );
}

function Dividends({ company }) {
  const { t } = useT();
  const { me } = useSession();
  const [terms, err] = useChain((p) => getDividendTerms(company.id, me, p), [company.id, me]);
  return (
    <div className="stack">
      <Muted small>{t("After every term, shareholders vote on paying 1% of the company's capital as a dividend. The vote and the payout use the shares each wallet held when the term ended, so moving shares afterwards changes nothing.")}</Muted>
      <ErrorLine error={err} />
      {!terms ? !err && <Loading /> : terms.length === 0 ? <Muted>{t("No term has ended yet.")}</Muted> : (
        <ul className="list">{terms.map((tm) => <TermItem key={tm.term} company={company} tm={tm} />)}</ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------ governor tools

function TokenForm({ data, title, explain, needTo, submitLabel, onSubmit, extra }) {
  const { t } = useT();
  const [token, setToken] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const { busy, error, setError, run } = useTx();
  const submit = async () => {
    const info = data.tokens.find((x) => same(x.address, token));
    if (!info) return setError("Choose a token the company holds.");
    let toAddr = null;
    if (needTo) { toAddr = await normalizeAddress(to); if (!toAddr) return setError("Enter a valid recipient address."); }
    let raw;
    try { raw = await parseAmount(amount, info.decimals); } catch { return setError("Enter a valid amount."); }
    await run(() => onSubmit(info.address, raw, toAddr), () => { setAmount(""); setTo(""); });
  };
  return (
    <Act title={title}>
      <p className="small">{explain}</p>
      {data.tokens.length === 0 ? <Muted small>{t("The company holds no tokens to use for this.")}</Muted> : (
        <>
          <Field label={t("Token")}><TokenPicker tokens={data.tokens} value={token} onChange={setToken} /></Field>
          {extra && extra(token)}
          {needTo && <Field label={t("Recipient address")}><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" spellCheck={false} /></Field>}
          <Field label={t("Amount")}><Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Button busy={busy} onClick={submit}>{submitLabel}</Button>
        </>
      )}
      <ErrorLine error={error} />
    </Act>
  );
}

function FreeAllowance({ companyId, token, data }) {
  const { t } = useT();
  const [left] = useChain((p) => (token ? getFreeAllowanceLeft(companyId, token, p) : Promise.resolve(null)), [companyId, token]);
  const info = data.tokens.find((x) => same(x.address, token));
  if (!info || left === null) return null;
  return <Muted small>{t("You can still move {n} {symbol} on your own this term.", { n: fmt(left, info.decimals, 4), symbol: info.symbol })}</Muted>;
}

function GovernorTools({ company, companies, data }) {
  const { t, tn } = useT();
  const { signer } = useSession();
  const others = companies.filter((c) => c.id !== company.id);
  const [holdings] = useChain((p) => getCorporateHoldings(company.id, others, p), [company.id, others.length]);
  const inv = useTx();
  const corp = useTx();
  const sell = useTx();
  const [target, setTarget] = useState("");
  const [investAmt, setInvestAmt] = useState("");
  const [corpTarget, setCorpTarget] = useState("");
  const [corpTerm, setCorpTerm] = useState("");
  const [corpCandidate, setCorpCandidate] = useState("");
  const [sellAmt, setSellAmt] = useState("");
  const [sellToken, setSellToken] = useState("");
  const [sellPrice, setSellPrice] = useState("");

  const doInvest = async () => {
    if (target === "") return inv.setError("Choose a company to invest in.");
    let raw;
    try { raw = await parseAmount(investAmt, 18); } catch { return inv.setError("Enter an amount of INVEST."); }
    await inv.run(() => investReal(signer, company.id, Number(target), raw), () => setInvestAmt(""));
  };
  const doSell = async () => {
    const tok = data.payTokens.find((x) => same(x.address, sellToken));
    if (!tok) return sell.setError("Choose what buyers pay with.");
    let amt, price;
    try { amt = await parseAmount(sellAmt, 18); price = await parseAmount(sellPrice, tok.decimals); } catch { return sell.setError("Enter both amounts."); }
    await sell.run(() => governorOfferInvestReal(signer, company.id, amt, tok.address, price), () => { setSellAmt(""); setSellPrice(""); });
  };

  return (
    <div className="stack">
      <Notice tone="ok">{t("You're signed in with {name}'s operating key. Everything here acts for the company and is public.", { name: company.name })}</Notice>

      <TokenForm data={data} needTo title={t("Move tokens (up to 5% a term)")}
        explain={t("Sends a token from the treasury to any address, without a vote, up to 5% of each token's balance per term.")}
        submitLabel={t("Send")}
        extra={(token) => <FreeAllowance companyId={company.id} token={token} data={data} />}
        onSubmit={(token, raw, to) => withdrawTokenReal(signer, company.id, token, to, raw)} />

      <TokenForm data={data} title={t("Sell at a sealed-bid auction")}
        explain={t("2 days of sealed bids, 1 day to reveal, the highest bid wins. What it earns becomes income the company can reinvest.")}
        submitLabel={t("Start the auction")}
        onSubmit={(token, raw) => openTreasuryAuctionReal(signer, company.id, token, raw)} />

      <TokenForm data={data} needTo title={t("Propose a payment")}
        explain={t("For amounts above 5%. The money is set aside and shareholders vote for 3 days; it's paid only if 20% of the shares vote and 51% approve.")}
        submitLabel={t("Propose the payment")}
        onSubmit={(token, raw, to) => proposeVendorPaymentReal(signer, company.id, token, to, raw)} />

      <Act title={t("Bid in another company's auction")}>
        <p className="small">{t("Uses the company's income ({n} INVEST available), never its capital. If the bid wins, you personally receive 1% of the shares it buys, locked until two more terms have passed.", { n: fmt(data.reinvestableIncome) })}</p>
        <Field label={t("Company")}>
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{t("Choose…")}</option>
            {others.filter((c) => !c.finalized).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t("Bid")}><AmountInput unit="INVEST" value={investAmt} onChange={(e) => setInvestAmt(e.target.value)} /></Field>
        <Button busy={inv.busy} disabled={data.reinvestableIncome === 0n} onClick={doInvest}>{t("Place the company's bid")}</Button>
        <ErrorLine error={inv.error} />
      </Act>

      <Act title={t("Shares this company holds elsewhere")}>
        {!holdings ? <Loading /> : holdings.length === 0 ? <Muted small>{t("None yet. Bidding in other companies builds them.")}</Muted> : (
          <>
            <ul className="small" style={{ listStyle: "none", padding: 0 }}>
              {holdings.map((h) => <li key={h.companyId}>{h.name}: {tn("{n} share", "{n} shares", h.shares)}</li>)}
            </ul>
            <Field label={t("Company")}>
              <Select value={corpTarget} onChange={(e) => setCorpTarget(e.target.value)}>
                <option value="">{t("Choose…")}</option>
                {holdings.map((h) => <option key={h.companyId} value={h.companyId}>{h.name}</option>)}
              </Select>
            </Field>
            <div className="input-row">
              <Input aria-label={t("Term number")} type="number" min="1" value={corpTerm} onChange={(e) => setCorpTerm(e.target.value)} placeholder={t("Term number")} />
              <Button small kind="secondary" busy={corp.busy} disabled={corpTarget === "" || !corpTerm}
                onClick={() => corp.run(() => claimDividendAsCorporationReal(signer, company.id, Number(corpTarget), Number(corpTerm)))}>{t("Claim its dividend")}</Button>
            </div>
            <div className="input-row">
              <Input aria-label={t("Candidate address")} value={corpCandidate} onChange={(e) => setCorpCandidate(e.target.value)} placeholder={t("Candidate address")} spellCheck={false} />
              <Button small kind="secondary" busy={corp.busy} disabled={corpTarget === "" || !corpCandidate} onClick={async () => {
                const cand = await normalizeAddress(corpCandidate);
                if (!cand) return corp.setError("Enter a valid candidate address.");
                await corp.run(() => voteAsCorporationReal(signer, company.id, Number(corpTarget), cand));
              }}>{t("Vote these shares")}</Button>
            </div>
            <Muted small>{t("Dividends claimed this way become this company's income.")}</Muted>
          </>
        )}
        <ErrorLine error={corp.error} />
      </Act>

      <Act title={t("Offer company INVEST on the market")}>
        <p className="small">{t("Offers some of the company's capital ({n} INVEST) for an accepted token. The payment goes to the treasury.", { n: fmt(data.capital) })}</p>
        {data.payTokens.length === 0 ? <Muted small>{t("No payment token is accepted on the market at the moment.")}</Muted> : (
          <>
            <Field label={t("INVEST to sell")}><AmountInput unit="INVEST" value={sellAmt} onChange={(e) => setSellAmt(e.target.value)} /></Field>
            <Field label={t("Paid in")}><TokenPicker tokens={data.payTokens} value={sellToken} onChange={setSellToken} /></Field>
            <Field label={t("Total price")}><Input type="number" min="0" step="any" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} /></Field>
            <Button busy={sell.busy} onClick={doSell}>{t("Post the offer")}</Button>
          </>
        )}
        <ErrorLine error={sell.error} />
      </Act>
    </div>
  );
}

// ------------------------------------------------------------ section

export default function CompanyTreasury({ company, companies }) {
  const { t } = useT();
  const { address } = useSession();
  const [tab, setTab] = useState(() => {
    const asked = new URLSearchParams(window.location.search).get("tab");
    return ["holdings", "auctions", "payments", "dividends", "governor"].includes(asked) ? asked : "holdings";
  });
  const [data, err] = useChain(async (p) => {
    const [tr, g, payTokens] = await Promise.all([getCompanyTreasury(company.id, p), getCompanyGovernance(company.id, p), getApprovedPaymentTokens(p)]);
    return { ...tr, payTokens, gov: g };
  }, [company.id]);

  if (!data) return err ? <ErrorLine error={err} /> : <Loading />;
  const now = Math.floor(Date.now() / 1000);
  const iAmKey = data.gov.operatingKey !== ZERO && same(data.gov.operatingKey, address) && now < Number(data.gov.termEnd);
  const tabs = [
    { id: "holdings", label: t("Holdings") },
    { id: "auctions", label: t("Sales") },
    { id: "payments", label: t("Payments") },
    { id: "dividends", label: t("Dividends") },
    ...(iAmKey ? [{ id: "governor", label: t("Governor tools") }] : []),
  ];
  return (
    <div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} label={t("Treasury")} />
      {tab === "holdings" && <Holdings company={company} data={data} />}
      {tab === "auctions" && <Auctions company={company} />}
      {tab === "payments" && <Payments company={company} />}
      {tab === "dividends" && <Dividends company={company} />}
      {tab === "governor" && iAmKey && <GovernorTools company={company} companies={companies} data={data} />}
    </div>
  );
}
