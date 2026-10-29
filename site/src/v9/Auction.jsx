import { useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import { parseAmount } from "../web3.js";
import { getBids, getRules, getLastPrice, placeBid, withdrawBid, settleRound, auctionPhase } from "./chain.js";
import { fmt, int, same, useChain, useCountdown, useTx } from "../components/liveUtils.js";
import { Scale, ShieldCheck, Undo2, Clock, Lock } from "lucide-react";
import { Act, Address, AmountInput, Button, ConnectToAct, ErrorLine, Field, Loading, Muted } from "../components/ui.jsx";

function BidForm({ company, full, rules, lowestEff }) {
  const { t } = useT();
  const { signer, account } = useSession();
  const [budget, setBudget] = useState("");
  const [cap, setCap] = useState("");
  const { busy, error, setError, run } = useTx();

  if (account && account.invest === 0n) {
    return (
      <Act title={t("Bid for units")}>
        <p className="small">{t("This wallet holds no UNRIG. Investors claim 1,000 UNRIG once.")}</p>
        <Link to="/invest" className="btn btn-secondary btn-small">{t("Become an investor")}</Link>
      </Act>
    );
  }

  const submit = async () => {
    let b, m;
    try { b = await parseAmount(budget, 18); } catch { return setError("Enter how much UNRIG to bid, for example 25."); }
    try { m = cap.trim() ? await parseAmount(cap, 18) : b; } catch { return setError("Enter the highest price per unit as a number, or leave it empty."); }
    if (m > b) m = b;
    if (account && b > account.invest) return setError(t("You have {n} UNRIG.", { n: fmt(account.invest) }));
    if (full && lowestEff !== null && (b < m ? b : m) <= lowestEff) {
      return setError(t("The book is full. To get in, your bid and your price per unit must both be above {n} UNRIG.", { n: fmt(lowestEff) }));
    }
    await run(() => placeBid(signer, company.id, b, m), () => { setBudget(""); setCap(""); });
  };

  return (
    <Act title={t("Bid for units")}>
      <Field label={t("How much UNRIG to commit")} hint={account ? t("You have {n} UNRIG. Whatever isn't spent on units comes back to you.", { n: fmt(account.invest) }) : undefined}>
        <AmountInput unit="UNRIG" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="100" />
      </Field>
      <Field label={t("Highest price you'll pay per unit (optional)")} hint={t("If the round's price ends up higher, your bid buys nothing this round and stays for the next. Leave empty for no limit.")}>
        <AmountInput unit="UNRIG" value={cap} onChange={(e) => setCap(e.target.value)} placeholder={t("no limit")} />
      </Field>
      {full && <p className="small">{t("The book is full ({n} bids). A new bid replaces the lowest one if it offers a higher price per unit.", { n: int(rules.maxBids) })}</p>}
      <p className="small muted">{t("One bid per wallet. You can withdraw it in the hour between rounds. The first time, MetaMask asks you to allow the auction to use your UNRIG.")}</p>
      <Button busy={busy} onClick={submit}>{t("Place bid")}</Button>
      <ErrorLine error={error} />
    </Act>
  );
}

// The three moments of a round, the current one lit, so a bidder always
// knows what happens next and what they can do now.
function RoundTimeline({ phase, label, n }) {
  const { t } = useT();
  const parts = [
    { key: "bidding", name: t("Bidding"), note: t("Place or raise your bid") },
    { key: "settle", name: t("Settle"), note: t("Anyone settles; units are issued") },
    { key: "cooldown", name: t("Hour between rounds"), note: t("Withdraw if you want") },
  ];
  return (
    <ol className="round-line" aria-label={t("Round {n}", { n })}>
      {parts.map((x) => (
        <li key={x.key} className={x.key === phase ? "is-now" : ""} aria-current={x.key === phase ? "step" : undefined}>
          <strong>{x.name}</strong>
          <span className="small">{x.key === phase && label ? (x.key === "settle" ? t("Now") : t("Now · {time} left", { time: label })) : x.note}</span>
        </li>
      ))}
    </ol>
  );
}

function SafetyStrip() {
  const { t } = useT();
  const items = [
    [Scale, t("Everyone filled in a round pays the same price per unit.")],
    [ShieldCheck, t("You never pay more per unit than your limit.")],
    [Undo2, t("UNRIG not spent on units stays in your bid or comes back to you.")],
    [Clock, t("You can withdraw your bid in the hour between rounds.")],
    [Lock, t("Units go straight to your wallet. Nobody, FairRound included, can move them.")],
  ];
  return (
    <ul className="safety-strip" aria-label={t("What protects your bid")}>
      {items.map(([Icon, text], i) => <li key={i}><Icon size={16} aria-hidden="true" /><span>{text}</span></li>)}
    </ul>
  );
}

export default function Auction({ company }) {
  const { t, tn } = useT();
  const { signer, address } = useSession();
  const [bids, bidsError] = useChain((p) => getBids(company.id, p), [company.id]);
  const [rules] = useChain(getRules, []);
  const [last] = useChain((p) => getLastPrice(company.id, p), [company.id]);
  const phase = auctionPhase(company);
  const closes = useCountdown(phase === "cooldown" ? company.roundStart : company.roundEnd);
  const settle = useTx();
  const wd = useTx();

  if (company.finalized) {
    return <Muted>{t("Sold out. All {n} units are issued, and every bid still waiting was refunded.", { n: int(company.totalShares) })}</Muted>;
  }

  const eff = (b) => (b.amount < b.maxPrice ? b.amount : b.maxPrice);
  const sorted = bids ? [...bids].sort((a, b) => (eff(b) > eff(a) ? 1 : eff(b) < eff(a) ? -1 : Number(a.seq - b.seq))) : null;
  const lowestEff = sorted && sorted.length ? eff(sorted[sorted.length - 1]) : null;
  const mine = bids?.find((b) => same(b.bidder, address));
  const rank = mine && sorted ? sorted.findIndex((b) => same(b.bidder, address)) + 1 : 0;
  const full = rules && bids && BigInt(bids.length) >= rules.maxBids;
  const left = company.totalShares - company.sharesIssued;
  const n = company.currentRound.toString();

  return (
    <div className="stack">
      <RoundTimeline phase={phase} label={phase === "settle" ? "" : closes.label} n={n} />
      <p>
        {phase === "bidding" && t("Round {n} is open for bids and closes in {time}.", { n, time: closes.label })}
        {phase === "cooldown" && t("Round {n} opens in {time}. Until then nobody can bid, and anyone can withdraw their bid.", { n, time: closes.label })}
        {phase === "settle" && t("Round {n} has closed. Anyone can settle it: units are issued and the next round opens an hour later.", { n })}{" "}
        {rules && t("{left} units are left; up to {max} are sold per round.", { left: int(left), max: int(rules.perRound) })}
      </p>
      {last && <p className="small muted num">{t("Last price: {price} UNRIG a unit, in round {round} ({shares} sold).", { price: fmt(last.price), round: last.round.toString(), shares: int(last.shares) })}</p>}

      {phase === "settle" && (signer ? (
        <div>
          <Button busy={settle.busy} onClick={() => settle.run(() => settleRound(signer, company.id))}>{t("Settle round {n}", { n })}</Button>
          <ErrorLine error={settle.error} />
        </div>
      ) : <ConnectToAct what={t("Connect a wallet to settle this round. It costs only gas.")} />)}

      <ErrorLine error={bidsError} />
      {!sorted ? !bidsError && <Loading /> : sorted.length === 0 ? (
        <Muted>{t("No bids yet this round. If yours is the only bid, your price per unit sets the round's price.")}</Muted>
      ) : (
        <table className="ledger">
          <caption>{tn("{n} active bid", "{n} active bids", sorted.length)}{rules ? ` ${t("(at most {max})", { max: int(rules.maxBids) })}` : ""}</caption>
          <thead>
            <tr>
              <th scope="col">{t("Bidder")}</th>
              <th scope="col" className="num-cell">{t("Committed, UNRIG")}</th>
              <th scope="col" className="num-cell">{t("Up to, per unit")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.bidder} className={same(b.bidder, address) ? "is-mine" : undefined}>
                <td><Address value={b.bidder} /></td>
                <td className="num-cell">{fmt(b.amount)}</td>
                <td className="num-cell">{b.maxPrice >= b.amount ? t("no limit") : fmt(b.maxPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Muted small>
        {t("How a round is priced: if every bid fits, the lowest bid's price buys one unit and sets the price. If more units are wanted than offered, the price rises to the highest level at which the bids still want every unit on offer, and the units are shared out in proportion. Each bid pays only for the units it gets; the rest stays in the bid or comes back. 99% of what is paid becomes the project's capital and 1% goes to the host.")}
      </Muted>

      {!signer ? (phase !== "settle" && <ConnectToAct what={t("Connect a wallet to bid for units.")} />)
        : mine ? (
          <div className="notice">
            <strong>{t("Your bid: {n} UNRIG", { n: fmt(mine.amount) })}</strong>
            {mine.maxPrice < mine.amount ? t("At most {p} UNRIG a unit.", { p: fmt(mine.maxPrice) }) : t("No price limit.")}{" "}
            {phase === "cooldown" ? (
              <span className="row-tight" style={{ marginTop: 8 }}>
                <Button kind="secondary" small busy={wd.busy} onClick={() => wd.run(() => withdrawBid(signer, company.id))}>{t("Withdraw my bid")}</Button>
              </span>
            ) : t("You can withdraw it in the hour between rounds.")}
            {rank > 0 && <span className="small" style={{ display: "block", marginTop: 6 }}>
              {t("By price per unit it is number {rank} of {total} bids.", { rank, total: sorted.length })}{" "}
              {full && rank === sorted.length ? t("The book is full and yours is the lowest: a higher new bid would replace it, and your UNRIG would come back.") : null}
            </span>}
            <ErrorLine error={wd.error} />
          </div>
        ) : phase === "bidding" ? <BidForm company={company} full={full} rules={rules} lowestEff={lowestEff} />
        : phase === "cooldown" ? (
          <div className="notice">
            <strong>{t("Bidding opens in {time}", { time: closes.label })}</strong>
            {t("Come back then to bid in round {n}. Meanwhile you can read the bids above and the last price.", { n })}
          </div>
        ) : null}
      <SafetyStrip />
    </div>
  );
}
