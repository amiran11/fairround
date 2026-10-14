import { useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import { parseAmount, V9_LIVE } from "../web3.js";
import { getListings, getMyShares, listShare, cancelListing, buyShare } from "../v9/chain.js";
import { useCompanies, useCompanyName } from "../v9/companies.jsx";
import { fmt, fmtDate, same, useChain, useTx } from "../components/liveUtils.js";
import { Act, Address, AmountInput, Button, ConnectToAct, ErrorLine, Field, Loading, Muted, Select } from "../components/ui.jsx";
import { usePageTitle } from "../meta.js";

function CompanyName({ id, companies }) {
  const name = useCompanyName();
  const c = companies?.find((x) => x.id === id);
  if (!c) return <>#{id}</>;
  const n = name(c);
  return <Link to={`/company/${c.id}`} lang={n.mainLang} className="strong">{n.main}</Link>;
}

function ListingRow({ l, companies }) {
  const { t } = useT();
  const { signer, address } = useSession();
  const tx = useTx();
  const mine = same(l.seller, address);
  return (
    <tr>
      <td><CompanyName id={l.companyId} companies={companies} /></td>
      <td className="num-cell">#{l.tokenId.toString()}</td>
      <td className="num-cell">{fmt(l.price)}</td>
      <td><Address value={l.seller} /></td>
      <td>
        {signer && (mine
          ? <Button small kind="secondary" busy={tx.busy} onClick={() => tx.run(() => cancelListing(signer, l.tokenId))}>{t("Withdraw")}</Button>
          : <Button small busy={tx.busy} onClick={() => tx.run(() => buyShare(signer, l.tokenId, l.price))}>{t("Buy")}</Button>)}
        <ErrorLine error={tx.error} />
      </td>
    </tr>
  );
}

function SellForm({ companies }) {
  const { t, lang } = useT();
  const { signer, me } = useSession();
  const [mine, err] = useChain((p) => getMyShares(me, p), [me]);
  const [tokenId, setTokenId] = useState("");
  const [price, setPrice] = useState("");
  const tx = useTx();
  const now = Math.floor(Date.now() / 1000);
  if (!mine) return err ? <ErrorLine error={err} /> : <Loading />;
  const free = mine.filter((s) => s.lockedUntil <= now && s.listedAt === null);
  const locked = mine.filter((s) => s.lockedUntil > now);
  const name = (id) => companies?.find((c) => c.id === id)?.name ?? `#${id}`;

  const submit = async () => {
    if (!tokenId) return tx.setError("Choose a share.");
    let raw;
    try { raw = await parseAmount(price, 18); } catch { return tx.setError("Enter a price in INVEST."); }
    await tx.run(() => listShare(signer, BigInt(tokenId), raw), () => { setPrice(""); setTokenId(""); });
  };

  return (
    <Act title={t("Sell a share")}>
      {mine.length === 0 ? <p className="small">{t("This wallet holds no shares.")}</p> : (
        <>
          <p className="small">{t("You set the price in INVEST. The share stays in your wallet until someone buys it; if you move it, the offer ends.")}</p>
          {free.length === 0 ? <p className="small muted">{t("None of your shares can be sold yet.")}</p> : (
            <>
              <Field label={t("Share")}>
                <Select value={tokenId} onChange={(e) => setTokenId(e.target.value)}>
                  <option value="">{t("Choose…")}</option>
                  {free.map((s) => <option key={s.tokenId.toString()} value={s.tokenId.toString()}>{name(s.companyId)}, #{s.tokenId.toString()}</option>)}
                </Select>
              </Field>
              <Field label={t("Price")}><AmountInput unit="INVEST" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
              <Button busy={tx.busy} onClick={submit}>{t("Offer for sale")}</Button>
            </>
          )}
          {locked.length > 0 && (
            <p className="small muted">{t("{n} of your shares are still locked; the first can be sold from {date}.", { n: locked.length, date: fmtDate(Math.min(...locked.map((s) => s.lockedUntil)), lang) })}</p>
          )}
        </>
      )}
      <ErrorLine error={tx.error} />
    </Act>
  );
}

export default function Market() {
  const { t } = useT();
  usePageTitle(t("Share market"), t("Shares offered for sale by their holders, priced in INVEST, read live from Arbitrum One."));
  const { signer } = useSession();
  const [companies] = useCompanies();
  const [listings, err] = useChain((p) => (V9_LIVE ? getListings(p) : Promise.resolve([])), []);

  return (
    <div className="page" style={{ paddingTop: 48 }}>
      <div className="prose stack">
        <h1 className="h1">{t("Share market")}</h1>
        <p className="lede">{t("Shares that holders offer for sale, at a price in INVEST they set. Buying one moves it straight to your wallet.")}</p>
        <p className="muted">{t("A share can be sold 7 days after it was issued. Shares a company holds in another company can't be sold here.")}</p>
      </div>

      <section className="section" style={{ marginTop: 40 }} aria-labelledby="offers">
        <div className="section-head"><h2 id="offers" className="h2">{t("Shares for sale")}</h2></div>
        <ErrorLine error={err} />
        {!listings ? !err && <Loading /> : listings.length === 0 ? <Muted>{t("No shares are offered right now.")}</Muted> : (
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">{t("Company")}</th>
                <th scope="col" className="num-cell">{t("Share")}</th>
                <th scope="col" className="num-cell">{t("Price, INVEST")}</th>
                <th scope="col">{t("Seller")}</th>
                <th scope="col"><span className="visually-hidden">{t("Action")}</span></th>
              </tr>
            </thead>
            <tbody>{listings.map((l) => <ListingRow key={l.tokenId.toString()} l={l} companies={companies} />)}</tbody>
          </table>
        )}
      </section>

      <section className="section" style={{ marginTop: 40, maxWidth: 560 }} aria-label={t("Sell a share")}>
        {signer ? <SellForm companies={companies} /> : <ConnectToAct what={t("Connect a wallet to buy or sell shares.")} />}
      </section>
    </div>
  );
}
