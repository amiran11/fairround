import { NavLink, Link, Outlet } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import { ACTIVE_NETWORK, CONTRACT_ADDRESSES, getMetaMaskDeepLink } from "../web3.js";
import { Button, Notice } from "./ui.jsx";
import { fmt, short } from "./liveUtils.js";
import Mark from "./Mark.jsx";
import ConsentBanner from "./ConsentBanner.jsx";

const REPO = "https://github.com/amiran11/sakartvelo-exchange";
export const LINKS = {
  repo: REPO,
  security: `${REPO}/blob/main/SECURITY_REVIEW.md`,
  experiment: `${REPO}/blob/main/EXPERIMENT_EARLY_TRADABILITY.md`,
  v9: `${REPO}/blob/main/V9_DESIGN.md`,
  paper: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7419018",
};

function Account() {
  const { t } = useT();
  const { connected, address, account, connect, connecting } = useSession();
  if (!connected) {
    return <Button kind="secondary" small busy={connecting} onClick={connect}>{t("Connect wallet")}</Button>;
  }
  return (
    <Link to={account && !account.alreadyClaimed ? "/citizen" : "/portfolio"} className="btn btn-secondary btn-small" title={address}>
      <span className="addr">{short(address)}</span>
      {account && <span className="num muted">{fmt(account.invest, 18, 0)} INVEST</span>}
    </Link>
  );
}

function ConnectProblem() {
  const { t } = useT();
  const { connectError } = useSession();
  if (!connectError) return null;
  return (
    <div className="page" style={{ marginTop: 16 }}>
      <Notice tone="danger" title={t("The wallet didn't connect")}>
        <p>{t(connectError.message)}</p>
        {connectError.mobileNoWallet && (
          <p style={{ marginTop: 8 }}>
            <a className="btn btn-small" href={getMetaMaskDeepLink()}>{t("Open this page in the MetaMask app")}</a>
          </p>
        )}
      </Notice>
    </div>
  );
}

export default function Layout() {
  const { t, lang, setLang } = useT();
  const nav = [
    ["/", t("Register")],
    ["/portfolio", t("Portfolio")],
    ["/citizen", t("Citizenship")],
    ["/market", t("Market")],
    ["/rules", t("Rules")],
    ["/whitepaper", t("White paper")],
  ];
  const explorer = ACTIVE_NETWORK.blockExplorerUrls[0];
  return (
    <>
      <a href="#main" className="visually-hidden">{t("Skip to content")}</a>
      <header className="masthead">
        <div className="page masthead-inner">
          <Link to="/" className="brand">
            <Mark size={30} />
            Sakartvelo Exchange
          </Link>
          <nav className="nav" aria-label={t("Main")}>
            {nav.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === "/"}>{label}</NavLink>
            ))}
          </nav>
          <div className="masthead-end">
            <button
              type="button"
              className="btn btn-plain btn-small"
              onClick={() => setLang(lang === "en" ? "ka" : "en")}
              lang={lang === "en" ? "ka" : "en"}
            >
              {lang === "en" ? "ქართული" : "English"}
            </button>
            <Account />
          </div>
        </div>
      </header>
      <ConnectProblem />

      <main id="main">
        <Outlet />
      </main>

      <footer className="colophon">
        <div className="page colophon-grid">
          <div className="stack-sm prose">
            <p>
              {t("Sakartvelo Exchange simulates a privatization. The process is real: every auction, vote and payment is a transaction on {network} that anyone can check. The companies are fictional. INVEST is given free and has no value when issued; if it becomes freely tradable, any price it gets comes from demand alone, and nobody guarantees one.", { network: ACTIVE_NETWORK.label })}
            </p>
            <p className="row">
              <a href={LINKS.repo} target="_blank" rel="noreferrer">{t("Source code")}</a>
              <a href={LINKS.security} target="_blank" rel="noreferrer">{t("Security review")}</a>
              <a href={LINKS.paper} target="_blank" rel="noreferrer">{t("Research paper (SSRN)")}</a>
            </p>
          </div>
          <div>
            {[
              [t("Version 9 contracts on {network}", { network: ACTIVE_NETWORK.label }), ["InvestToken", "RoundAuctionV9", "GovernanceV9", "CompanyTreasuryV9", "CompanyDividendsV9", "OpenVerifierV2", "SakartveloTimelock"]],
            ].map(([title, names]) => (
              <div key={title} style={{ marginBottom: 16 }}>
                <p className="strong" style={{ color: "var(--ink)", marginBottom: 8 }}>{title}</p>
                <ul className="contracts">
                  {names.filter((n) => CONTRACT_ADDRESSES[n]).map((name) => (
                    <li key={name}>
                      <span>{name}</span>
                      {explorer ? (
                        <a className="addr" href={`${explorer}/address/${CONTRACT_ADDRESSES[name]}#code`} target="_blank" rel="noreferrer">{short(CONTRACT_ADDRESSES[name])}</a>
                      ) : <span className="addr">{short(CONTRACT_ADDRESSES[name])}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </footer>
      <ConsentBanner />
    </>
  );
}
