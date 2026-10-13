import { useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import {
  getInvestOffers, getApprovedPaymentTokens, getCompanyGovernance, getPublicStats,
  offerInvestReal, buyInvestReal, cancelInvestOfferReal, parseAmount,
} from "../web3.js";
import { useCompanies } from "../companies.jsx";
import { ZERO, same, fmt, useChain, useTx } from "../components/liveUtils.js";
import { Act, Address, AmountInput, Button, ConnectToAct, ErrorLine, Field, Input, Loading, Muted, Select } from "../components/ui.jsx";
import { LINKS } from "../components/Layout.jsx";
import { usePageTitle } from "../meta.js";

function unitPrice(o) {
  if (o.investAmount === 0n) return "";
  return fmt((o.paymentAmount * 10n ** 18n) / o.investAmount, o.token.decimals, 4);
}

async function loadMarket(provider) {
  const [offers, payTokens] = await Promise.all([getInvestOffers(provider), getApprovedPaymentTokens(provider)]);
  const ids = [...new Set(offers.filter((x) => x.isCorporateOffer).map((x) => x.creditCompanyId.toString()))];
  const keys = {};
  await Promise.all(ids.map(async (id) => {
    const g = await getCompanyGovernance(Number(id), provider);
    if (g.operatingKey !== ZERO) keys[id] = g.operatingKey;
  }));
  return { offers, payTokens, keys };
}

function OfferRow({ o, companies, keys }) {
  const { t } = useT();
  const { signer, address } = useSession();
  const { busy, error, run } = useTx();
  const company = o.isCorporateOffer ? companies?.find((c) => BigInt(c.id) === o.creditCompanyId) : null;
  const mine = !o.isCorporateOffer && same(o.seller, address);
  const iRunSeller = o.isCorporateOffer && same(keys[o.creditCompanyId.toString()], address);
  return (
    <tr>
      <td className="num-cell" data-label="">{fmt(o.investAmount)} INVEST</td>
      <td className="num-cell" data-label={t("Price")}>{fmt(o.paymentAmount, o.token.decimals, 4)} {o.token.symbol}</td>
      <td className="num-cell" data-label={t("Per INVEST")}>{unitPrice(o)} {o.token.symbol}</td>
      <td data-label={t("Seller")}>{company ? t("{name} (company)", { name: company.name }) : <Address value={o.seller} />}</td>
      <td>
        {signer && (mine || iRunSeller
          ? <Button small kind="secondary" busy={busy} onClick={() => run(() => cancelInvestOfferReal(signer, o.id))}>{t("Withdraw offer")}</Button>
          : <Button small busy={busy} onClick={() => run(() => buyInvestReal(signer, o))}>{t("Buy")}</Button>)}
        <ErrorLine error={error} />
      </td>
    </tr>
  );
}

function SellForm({ payTokens }) {
  const { t } = useT();
  const { signer, account } = useSession();
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState("");
  const [price, setPrice] = useState("");
  const { busy, error, setError, run } = useTx();
  const post = async () => {
    const tok = payTokens.find((x) => same(x.address, token));
    if (!tok) return setError("Choose what you want to be paid in.");
    let amt, pr;
    try { amt = await parseAmount(amount, 18); pr = await parseAmount(price, tok.decimals); } catch { return setError("Enter how much INVEST to sell and your total price."); }
    if (account && amt > account.invest) return setError(t("You have {n} INVEST.", { n: fmt(account.invest) }));
    await run(() => offerInvestReal(signer, amt, tok.address, pr), () => { setAmount(""); setPrice(""); });
  };
  return (
    <Act title={t("Sell INVEST")}>
      <p className="small">{t("You set a total price. Your INVEST is held by the treasury contract until someone buys it or you withdraw the offer.")}</p>
      <Field label={t("INVEST to sell")} hint={account ? t("You have {n} INVEST.", { n: fmt(account.invest) }) : undefined}>
        <AmountInput unit="INVEST" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label={t("Paid in")}>
        <Select value={token} onChange={(e) => setToken(e.target.value)}>
          <option value="">{t("Choose…")}</option>
          {payTokens.map((x) => <option key={x.address} value={x.address}>{x.symbol}</option>)}
        </Select>
      </Field>
      <Field label={t("Total price")}><Input type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
      <Button busy={busy} onClick={post}>{t("Post the offer")}</Button>
      <ErrorLine error={error} />
    </Act>
  );
}

export default function Market() {
  const { t } = useT();
  usePageTitle(t("INVEST market"), t("Offers to buy and sell INVEST for other tokens, read live from Arbitrum One."));
  const { signer } = useSession();
  const [data, err] = useChain(loadMarket, []);
  const [stats] = useChain(getPublicStats, []);
  const [companies] = useCompanies();

  return (
    <div className="page" style={{ paddingTop: 48 }}>
      <div className="prose stack">
        <h1 className="h1">{t("INVEST market")}</h1>
        <p className="lede">{t("Offers to sell INVEST for other tokens. Anyone can buy here, including people who aren't citizens.")}</p>
        {stats?.tradable && (
          <p className="muted">
            {t("INVEST can also be sent between wallets. That was unlocked early, on 9 October 2026, when a one-share test company sold out; the project is watching what happens and has published the plan.")}{" "}
            <a href={LINKS.experiment} target="_blank" rel="noreferrer">{t("Read about the experiment")}</a>
          </p>
        )}
      </div>

      <section className="section" style={{ marginTop: 40 }} aria-labelledby="offers">
        <div className="section-head"><h2 id="offers" className="h2">{t("Open offers")}</h2></div>
        <ErrorLine error={err} />
        {!data ? !err && <Loading /> : data.offers.length === 0 ? <Muted>{t("No open offers right now.")}</Muted> : (
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col" className="num-cell">{t("Amount")}</th>
                <th scope="col" className="num-cell">{t("Price")}</th>
                <th scope="col" className="num-cell">{t("Per INVEST")}</th>
                <th scope="col">{t("Seller")}</th>
                <th scope="col"><span className="visually-hidden">{t("Action")}</span></th>
              </tr>
            </thead>
            <tbody>{data.offers.map((o) => <OfferRow key={o.id.toString()} o={o} companies={companies} keys={data.keys} />)}</tbody>
          </table>
        )}
      </section>

      <section className="section" style={{ marginTop: 40, maxWidth: 520 }} aria-label={t("Sell INVEST")}>
        {!data ? null : data.payTokens.length === 0 ? (
          <Muted>{t("No token is accepted as payment at the moment, so new offers can't be posted.")}</Muted>
        ) : signer ? <SellForm payTokens={data.payTokens} /> : <ConnectToAct what={t("Connect a wallet to buy or sell INVEST.")} />}
        {!signer && <p className="small muted" style={{ marginTop: 12 }}>{t("Don't have INVEST yet?")} <Link to="/citizen">{t("Become a citizen")}</Link></p>}
      </section>
    </div>
  );
}
