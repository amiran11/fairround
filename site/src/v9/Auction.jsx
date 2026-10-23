import { useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import { parseAmount } from "../web3.js";
import { getBids, getRules, getLastPrice, placeBid, withdrawBid, settleRound, auctionPhase } from "./chain.js";
import { fmt, int, same, useChain, useCountdown, useTx } from "../components/liveUtils.js";
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
        <p className="small">{t("This wallet holds no INVEST. Members claim 1,000 INVEST once.")}</p>
        <Link to="/citizen" className="btn btn-secondary btn-small">{t("Join and get test credits")}</Link>
      </Act>
    );
  }

  const submit = async () => {
    let b, m;
    try { b = await parseAmount(budget, 18); } catch { return setError("Enter how much INVEST to bid, for example 25."); }
    try { m = cap.trim() ? await parseAmount(cap, 18) : b; } catch { return setError("Enter the highest price per unit as a number, or leave it empty."); }
    if (m > b) m = b;
    if (account && b > account.invest) return setError(t("You have {n} INVEST.", { n: fmt(account.invest) }));
    if (full && lowestEff !== null && (b < m ? b : m) <= lowestEff) {
      return setError(t("The book is full. To get in, your bid and your price per unit must both be above {n} INVEST.", { n: fmt(lowestEff) }));
    }
    await run(() => placeBid(signer, company.id, b, m), () => { setBudget(""); setCap(""); });
  };

  return (
    <Act title={t("Bid for units")}>
      <Field label={t("How much INVEST to commit")} hint={account ? t("You have {n} INVEST. Whatever isn't spent on units comes back to you.", { n: fmt(account.invest) }) : undefined}>
        <AmountInput unit="INVEST" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="100" />
      </Field>
      <Field label={t("Highest price you'll pay per unit (optional)")} hint={t("If the round's price ends up higher, your bid buys nothing this round and stays for the next. Leave empty for no limit.")}>
        <AmountInput unit="INVEST" value={cap} onChange={(e) => setCap(e.target.value)} placeholder={t("no limit")} />
      </Field>
      {full && <p className="small">{t("The book is full ({n} bids). A new bid replaces the lowest one if it offers a higher price per unit.", { n: int(rules.maxBids) })}</p>}
      <p className="small muted">{t("One bid per wallet. You can withdraw it in the hour between rounds. The first time, MetaMask asks you to allow the auction to use your INVEST.")}</p>
      <Button busy={busy} onClick={submit}>{t("Place bid")}</Button>
      <ErrorLine error={error} />
    </Act>
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
  const full = rules && bids && BigInt(bids.length) >= rules.maxBids;
  const left = company.totalShares - company.sharesIssued;
  const n = company.currentRound.toString();

  return (
    <div className="stack">
      <p>
        {phase === "bidding" && t("Round {n} is open for bids and closes in {time}.", { n, time: closes.label })}
        {phase === "cooldown" && t("Round {n} opens in {time}. Until then nobody can bid, and anyone can withdraw their bid.", { n, time: closes.label })}
        {phase === "settle" && t("Round {n} has closed. Anyone can settle it: units are issued and the next round opens an hour later.", { n })}{" "}
        {rules && t("{left} units are left; up to {max} are sold per round.", { left: int(left), max: int(rules.perRound) })}
      </p>
      {last && <p className="small muted num">{t("Last price: {price} INVEST a unit, in round {round} ({shares} sold).", { price: fmt(last.price), round: last.round.toString(), shares: int(last.shares) })}</p>}

      {phase === "settle" && (signer ? (
        <div>
          <Button busy={settle.busy} onClick={() => settle.run(() => settleRound(signer, company.id))}>{t("Settle round {n}", { n })}</Button>
          <ErrorLine error={settle.error} />
        </div>
      ) : <ConnectToAct what={t("Connect a wallet to settle this round. It costs only gas.")} />)}

      <ErrorLine error={bidsError} />
      {!sorted ? !bidsError && <Loading /> : sorted.length === 0 ? (
        <Muted>{t("No bids yet.")}</Muted>
      ) : (
        <table className="ledger">
          <caption>{tn("{n} active bid", "{n} active bids", sorted.length)}{rules ? ` ${t("(at most {max})", { max: int(rules.maxBids) })}` : ""}</caption>
          <thead>
            <tr>
              <th scope="col">{t("Bidder")}</th>
              <th scope="col" className="num-cell">{t("Committed, INVEST")}</th>
              <th scope="col" className="num-cell">{t("Up to, per unit")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.bidder}>
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
            <strong>{t("Your bid: {n} INVEST", { n: fmt(mine.amount) })}</strong>
            {mine.maxPrice < mine.amount ? t("At most {p} INVEST a unit.", { p: fmt(mine.maxPrice) }) : t("No price limit.")}{" "}
            {phase === "cooldown" ? (
              <span className="row-tight" style={{ marginTop: 8 }}>
                <Button kind="secondary" small busy={wd.busy} onClick={() => wd.run(() => withdrawBid(signer, company.id))}>{t("Withdraw my bid")}</Button>
              </span>
            ) : t("You can withdraw it in the hour between rounds.")}
            <ErrorLine error={wd.error} />
          </div>
        ) : phase === "bidding" ? <BidForm company={company} full={full} rules={rules} lowestEff={lowestEff} /> : null}
    </div>
  );
}
