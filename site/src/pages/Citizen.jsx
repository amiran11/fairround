import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import { ACTIVE_NETWORK, getClaimEligibility, claimReal, getPublicStats, V9_LIVE, getVerifySelfEligibility, verifySelfReal } from "../web3.js";
import { getVerifier, verifySelf } from "../v9/chain.js";
import { fmt, int, useChain, useTx } from "../components/liveUtils.js";
import { Button, ErrorLine, Muted, Notice } from "../components/ui.jsx";
import { usePageTitle } from "../meta.js";

const eth = (wei) => (Number(wei) / 1e18).toFixed(4);

export default function Citizen() {
  const { t } = useT();
  usePageTitle(t("Become an investor"), t("Verify a wallet and claim 1,000 UNRIG test credits to bid in FairRound's demo listings."));
  const { connected, signer, address, connect, connecting, account } = useSession();
  const [stats] = useChain(getPublicStats, []);
  const [elig] = useChain((p) => (connected ? getClaimEligibility(address, p) : Promise.resolve(null)), [address, connected]);
  const [ethCheck] = useChain((p) => (connected ? getVerifySelfEligibility(address, p) : Promise.resolve(null)), [address, connected]);
  // Version 9 verifies through OpenVerifierV2: at most 50 new citizens an
  // hour, and a guardian can pause it.
  const [v2] = useChain((p) => (V9_LIVE ? getVerifier(p) : Promise.resolve(null)), []);
  const verifyTx = (s) => (V9_LIVE ? verifySelf(s) : verifySelfReal(s));
  const verifyOpen = v2 ? !v2.paused : (stats?.verifyOpen ?? true);
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
        <h1 className="h1">{t("Become an investor")}</h1>
        <p className="lede">{t("Investors each claim 1,000 UNRIG, once. UNRIG is what you bid with for units. It takes two transactions; each costs a fraction of a cent in gas on {network}.", { network: ACTIVE_NETWORK.label })}</p>
        {stats && <p className="muted num">{t("{n} investors have joined, of {max} places.", { n: int(stats.citizenCount), max: int(stats.maxCitizens) })}</p>}
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
            <Muted small>{t("This is a balance check, not proof that you are one person: someone can verify several wallets. To slow that down, only ordinary wallets can verify and at most 50 an hour. Real-money launches will need proof of personhood; this demo says so openly.")}</Muted>
            {connected && !verified && !verifyOpen && (
              <Notice tone="plain">{t("Self-verification is switched off at the moment, so new wallets can't verify.")}</Notice>
            )}
            {connected && !verified && verifyOpen && v2 && v2.left === 0n && (
              <Notice tone="plain">{t("The 10 verifications for this hour are used up. Try again at the start of the next hour.")}</Notice>
            )}
            {connected && !verified && ethCheck && !ethCheck.eligible && (
              <Notice tone="danger">{t("This wallet holds {have} ETH; it needs at least {min}. Add some ETH on {network}, then come back.", { have: eth(ethCheck.currentBalance), min: eth(ethCheck.minBalance), network: ACTIVE_NETWORK.label })}</Notice>
            )}
            {connected && !verified && ethCheck?.eligible && verifyOpen && !(v2 && v2.left === 0n) && (
              <div><Button busy={verify.busy} onClick={() => verify.run(() => verifyTx(signer))}>{t("Verify this wallet")}</Button></div>
            )}
            <ErrorLine error={verify.error} />
            {verified && <p className="small">{t("Verified.")}</p>}
          </div>
        </li>

        <li className={stepClass(claimed, verified && !claimed)}>
          <div className="stack-sm">
            <h2 className="h3">{t("Claim 1,000 UNRIG")}</h2>
            <p className="small">{t("One claim per wallet, ever. The UNRIG goes straight to your wallet.")}</p>
            {verified && !claimed && full && <Notice tone="plain">{t("All investor places are taken.")}</Notice>}
            {verified && !claimed && !full && (
              <div><Button busy={claim.busy} onClick={() => claim.run(() => claimReal(signer), (r) => setClaimTx(r?.hash))}>{t("Claim 1,000 UNRIG")}</Button></div>
            )}
            <ErrorLine error={claim.error} />
            {claimed && (
              <p className="small">
                {t("Claimed. This wallet holds {n} UNRIG.", { n: account ? fmt(account.invest) : "…" })}{" "}
                {claimTx && explorer && <a href={`${explorer}/tx/${claimTx}`} target="_blank" rel="noreferrer">{t("See the transaction")} <ExternalLink size={12} aria-hidden="true" /></a>}
              </p>
            )}
          </div>
        </li>

        <li className={stepClass(false, claimed)}>
          <div className="stack-sm">
            <h2 className="h3">{t("Bid for units")}</h2>
            <p className="small">{t("Choose a listing on the Listings page and place a bid. Units are sold in rounds; the rules page explains how a round is priced.")}</p>
            <div className="row">
              <Link to="/" className={claimed ? "btn" : "btn btn-secondary"}>{t("See the listings")}</Link>
              <Link to="/rules" className="btn btn-plain">{t("Read the rules")}</Link>
            </div>
          </div>
        </li>
      </ol>
    </div>
  );
}
