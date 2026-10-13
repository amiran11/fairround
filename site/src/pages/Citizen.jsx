import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import { ACTIVE_NETWORK, getClaimEligibility, getVerifySelfEligibility, verifySelfReal, claimReal, getPublicStats } from "../web3.js";
import { fmt, int, useChain, useTx } from "../components/liveUtils.js";
import { Button, ErrorLine, Muted, Notice } from "../components/ui.jsx";
import { usePageTitle } from "../meta.js";

const eth = (wei) => (Number(wei) / 1e18).toFixed(4);

export default function Citizen() {
  const { t } = useT();
  usePageTitle(t("Become a citizen"), t("Verify a wallet and claim your 1,000 INVEST to bid for shares in Sakartvelo Exchange."));
  const { connected, signer, address, connect, connecting, account } = useSession();
  const [stats] = useChain(getPublicStats, []);
  const [elig] = useChain((p) => (connected ? getClaimEligibility(address, p) : Promise.resolve(null)), [address, connected]);
  const [ethCheck] = useChain((p) => (connected ? getVerifySelfEligibility(address, p) : Promise.resolve(null)), [address, connected]);
  const verify = useTx();
  const claim = useTx();
  const [claimTx, setClaimTx] = useState(null);

  const verified = !!elig?.isVerified;
  const claimed = !!elig?.alreadyClaimed;
  const full = stats && stats.citizenCount >= stats.maxCitizens;
  const stepClass = (done, current) => (done ? "done" : current ? "current" : "");
  const explorer = ACTIVE_NETWORK.blockExplorerUrls[0];

  return (
    <div className="page" style={{ paddingTop: 48 }}>
      <div className="prose stack">
        <h1 className="h1">{t("Become a citizen")}</h1>
        <p className="lede">{t("Citizens each claim 1,000 INVEST, once. INVEST is what you bid with for shares. It takes two transactions; each costs a fraction of a cent in gas on {network}.", { network: ACTIVE_NETWORK.label })}</p>
        {stats && <p className="muted num">{t("{n} citizens have joined, of {max} places.", { n: int(stats.citizenCount), max: int(stats.maxCitizens) })}</p>}
      </div>

      <ol className="steps" style={{ maxWidth: 720, marginTop: 40 }}>
        <li className={stepClass(connected, !connected)}>
          <div className="stack-sm">
            <h2 className="h3">{t("Connect a wallet")}</h2>
            {connected ? (
              <p className="small">{t("Connected:")} <span className="addr">{address}</span></p>
            ) : (
              <>
                <p className="small">{t("You need MetaMask (or a compatible wallet) set to {network}. On a phone, open this page inside the MetaMask app's browser.", { network: ACTIVE_NETWORK.label })}</p>
                <div><Button busy={connecting} onClick={connect}>{t("Connect wallet")}</Button></div>
              </>
            )}
          </div>
        </li>

        <li className={stepClass(verified, connected && !verified)}>
          <div className="stack-sm">
            <h2 className="h3">{t("Verify the wallet")}</h2>
            <p className="small">
              {t("Verification checks that the wallet holds at least {min} ETH on {network}. Nothing is taken: the ETH stays in your wallet, and you only pay gas.", { min: ethCheck ? eth(ethCheck.minBalance) : "0.0083", network: ACTIVE_NETWORK.label })}
            </p>
            <Muted small>{t("This is a balance check, not proof that you are one person: someone can verify several wallets. A real privatization would need real identity checks; this simulation says so openly.")}</Muted>
            {connected && !verified && stats && !stats.verifyOpen && (
              <Notice tone="plain">{t("Self-verification is switched off at the moment, so new wallets can't verify.")}</Notice>
            )}
            {connected && !verified && ethCheck && !ethCheck.eligible && (
              <Notice tone="danger">{t("This wallet holds {have} ETH; it needs at least {min}. Add some ETH on {network}, then come back.", { have: eth(ethCheck.currentBalance), min: eth(ethCheck.minBalance), network: ACTIVE_NETWORK.label })}</Notice>
            )}
            {connected && !verified && ethCheck?.eligible && (stats?.verifyOpen ?? true) && (
              <div><Button busy={verify.busy} onClick={() => verify.run(() => verifySelfReal(signer))}>{t("Verify this wallet")}</Button></div>
            )}
            <ErrorLine error={verify.error} />
            {verified && <p className="small">{t("Verified.")}</p>}
          </div>
        </li>

        <li className={stepClass(claimed, verified && !claimed)}>
          <div className="stack-sm">
            <h2 className="h3">{t("Claim 1,000 INVEST")}</h2>
            <p className="small">{t("One claim per wallet, ever. The INVEST goes straight to your wallet.")}</p>
            {verified && !claimed && full && <Notice tone="plain">{t("All citizen places are taken.")}</Notice>}
            {verified && !claimed && !full && (
              <div><Button busy={claim.busy} onClick={() => claim.run(() => claimReal(signer), (r) => setClaimTx(r?.hash))}>{t("Claim 1,000 INVEST")}</Button></div>
            )}
            <ErrorLine error={claim.error} />
            {claimed && (
              <p className="small">
                {t("Claimed. This wallet holds {n} INVEST.", { n: account ? fmt(account.invest) : "…" })}{" "}
                {claimTx && explorer && <a href={`${explorer}/tx/${claimTx}`} target="_blank" rel="noreferrer">{t("See the transaction")} <ExternalLink size={12} aria-hidden="true" /></a>}
              </p>
            )}
          </div>
        </li>

        <li className={stepClass(false, claimed)}>
          <div className="stack-sm">
            <h2 className="h3">{t("Bid for shares")}</h2>
            <p className="small">{t("Choose a company in the register and place a bid. Shares are sold in rounds; the rules page explains how a round is priced.")}</p>
            <div className="row">
              <Link to="/" className={claimed ? "btn" : "btn btn-secondary"}>{t("Open the register")}</Link>
              <Link to="/rules" className="btn btn-plain">{t("Read the rules")}</Link>
            </div>
          </div>
        </li>
      </ol>
    </div>
  );
}
