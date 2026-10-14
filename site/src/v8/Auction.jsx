import { useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import {
  getRoundBids, getRoundAuctionRules, getRoundInvestAllowance,
  approveInvestForRound, placeRoundBid, settleRoundReal, parseAmount,
} from "../web3.js";
import { fmt, int, same, useChain, useCountdown, useTx } from "../components/liveUtils.js";
import { Act, Address, AmountInput, Button, ConnectToAct, ErrorLine, Field, Loading, Muted } from "../components/ui.jsx";

// Shares a bid would get if the round settled now: the lowest bid is one
// share, every other bid is its amount divided by that, rounded up.
const sharesFor = (amount, lowest) => (lowest ? (amount + lowest - 1n) / lowest : 0n);

function BidForm({ company, full, rules }) {
  const { t } = useT();
  const { signer, address, account } = useSession();
  const [amount, setAmount] = useState("");
  const { busy, error, setError, run } = useTx();

  if (account && account.invest === 0n) {
    return (
      <Act title={t("Bid for shares")}>
        <p className="small">{t("This wallet holds no INVEST. Citizens claim 1,000 INVEST once.")}</p>
        <Link to="/citizen" className="btn btn-secondary btn-small">{t("Become a citizen")}</Link>
      </Act>
    );
  }
  if (full) {
    return (
      <Act title={t("Bid for shares")}>
        <p className="small">{t("This company already has {n} active bids, the most it can hold. New bids open after the next settlement, when filled bids leave the book.", { n: int(rules.maxActiveBids) })}</p>
      </Act>
    );
  }

  const submit = async () => {
    let raw;
    try { raw = await parseAmount(amount, 18); } catch { return setError("Enter how much INVEST to bid, for example 25."); }
    if (account && raw > account.invest) return setError(t("You have {n} INVEST.", { n: fmt(account.invest) }));
    await run(async () => {
      const allowance = await getRoundInvestAllowance(address, signer.provider);
      if (allowance < raw) {
        const { MaxUint256 } = await import("ethers");
        await approveInvestForRound(signer, MaxUint256);
      }
      await placeRoundBid(signer, company.id, raw);
    }, () => setAmount(""));
  };

  return (
    <Act title={t("Bid for shares")}>
      <Field label={t("Your bid")} hint={account ? t("You have {n} INVEST. The whole bid is spent if it wins; the minimum is 1 INVEST.", { n: fmt(account.invest) }) : undefined}>
        <AmountInput unit="INVEST" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25" />
      </Field>
      <p className="small muted">{t("One bid per wallet. A bid can't be withdrawn: it stays in each round until it wins, or is refunded if the company sells out first. The first time, MetaMask asks you to allow the auction to use your INVEST.")}</p>
      <Button busy={busy} onClick={submit}>{t("Place bid")}</Button>
      <ErrorLine error={error} />
    </Act>
  );
}

export default function Auction({ company }) {
  const { t, tn } = useT();
  const { signer, address } = useSession();
  const [bids, bidsError] = useChain((p) => getRoundBids(company.id, p), [company.id]);
  const [rules] = useChain(getRoundAuctionRules, []);
  const { passed: closed, label } = useCountdown(company.roundEnd);
  const settle = useTx();

  if (company.finalized) {
    return (
      <Muted>{t("Sold out. All {n} shares are issued, and every bid still waiting was refunded.", { n: int(company.totalShares) })}</Muted>
    );
  }

  const sorted = bids ? [...bids].sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : Number(a.seq - b.seq))) : null;
  const lowest = sorted && sorted.length ? sorted[sorted.length - 1].amount : null;
  const mine = bids?.find((b) => same(b.bidder, address));
  const full = rules && bids && BigInt(bids.length) >= rules.maxActiveBids;
  const left = company.totalShares - company.sharesIssued;

  return (
    <div className="stack">
      <p>
        {closed
          ? t("Round {n} has closed. Anyone can settle it: shares are issued and the next round opens.", { n: company.currentRound.toString() })
          : t("Round {n} closes in {time}.", { n: company.currentRound.toString(), time: label })}{" "}
        {rules && t("{left} shares are left; up to {max} are sold per round.", { left: int(left), max: int(rules.maxSharesPerRound) })}
      </p>

      {closed && (
        signer ? (
          <div>
            <Button busy={settle.busy} onClick={() => settle.run(() => settleRoundReal(signer, company.id))}>
              {t("Settle round {n}", { n: company.currentRound.toString() })}
            </Button>
            <ErrorLine error={settle.error} />
          </div>
        ) : <ConnectToAct what={t("Connect a wallet to settle this round. It costs only gas.")} />
      )}

      <ErrorLine error={bidsError} />
      {!sorted ? !bidsError && <Loading /> : sorted.length === 0 ? (
        <Muted>{t("No bids in this round yet. The lowest bid in a round sets the price of one share.")}</Muted>
      ) : (
        <table className="ledger">
          <caption>{tn("{n} active bid", "{n} active bids", sorted.length)}{rules ? ` ${t("(at most {max})", { max: int(rules.maxActiveBids) })}` : ""}</caption>
          <thead>
            <tr>
              <th scope="col">{t("Bidder")}</th>
              <th scope="col" className="num-cell">{t("Bid, INVEST")}</th>
              <th scope="col" className="num-cell">{t("Shares if settled now")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.bidder}>
                <td><Address value={b.bidder} /></td>
                <td className="num-cell" data-label={t("Bid, INVEST")}>{fmt(b.amount)}</td>
                <td className="num-cell" data-label={t("Shares if settled now")}>{int(sharesFor(b.amount, lowest))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Muted small>
        {t("How a round is settled: the lowest bid buys one share, so its amount is the price. Every other bid gets its amount divided by that price, rounded up. Bids are filled from the highest down, each in full or not at all; a bid that doesn't fit waits for the next round. 99% of every winning bid becomes the company's capital and 1% goes to the host.")}
      </Muted>

      {!closed && (
        !signer ? <ConnectToAct what={t("Connect a wallet to bid for shares.")} />
          : mine ? (
            <div className="notice">
              <strong>{t("Your bid: {n} INVEST", { n: fmt(mine.amount) })}</strong>
              {tn("If the round settled now it would be worth {n} share.", "If the round settled now it would be worth {n} shares.", sharesFor(mine.amount, lowest))}{" "}
              {t("It stays in until it wins.")}
            </div>
          ) : <BidForm company={company} full={full} rules={rules} />
      )}
    </div>
  );
}
