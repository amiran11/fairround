import { NavLink, Link, Outlet } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import { ACTIVE_NETWORK, CONTRACT_ADDRESSES, getMetaMaskDeepLink } from "../web3.js";
import { Button, Notice } from "./ui.jsx";
import { fmt, short } from "./liveUtils.js";
import Mark from "./Mark.jsx";
import ConsentBanner from "./ConsentBanner.jsx";

const REPO = "https://github.com/amiran11/fairround";
export const LINKS = {
  repo: REPO,
  security: `${REPO}/blob/main/SECURITY_REVIEW.md`,
  experiment: `${REPO}/blob/main/EXPERIMENT_EARLY_TRADABILITY.md`,
  v9: `${REPO}/blob/main/V9_DESIGN.md`,
  paper: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7419018",
};

// Official community accounts. Shown in the footer so visitors can tell
// the real ones from impostors.
export const SOCIAL = [
  ["X", "https://x.com/investtoken1"],
  ["Reddit", "https://www.reddit.com/r/sakartveloexchange/"],
  ["Telegram channel", "https://t.me/sakartvelo_exchange"],
  ["Telegram group", "https://t.me/sakartveloexchange"],
];

function Account() {
  const { t } = useT();
  const { connected, address, account, connect, connecting } = useSession();
  if (!connected) {
    return <Button kind="secondary" small busy={connecting} onClick={connect}>{t("Connect wallet")}</Button>;
  }
  return (
    <Link to={account && !account.alreadyClaimed ? "/invest" : "/portfolio"} className="btn btn-secondary btn-small" title={address}>
      <span className="addr">{short(address)}</span>
      {account && <span className="num muted">{fmt(account.invest, 18, 0)} UNRIG</span>}
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
    ["/", t("Listings")],
    ["/portfolio", t("Portfolio")],
    ["/invest", t("Invest")],
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
            FairRound
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
              {t("FairRound is an on-chain IPO exchange for crypto projects, live as a demo. The process is real: every round, vote and payment is a transaction on {network} that anyone can check. The demo listings are fictional. UNRIG is a free test credit with no value, and it can't be traded between wallets.", { network: ACTIVE_NETWORK.label })}
            </p>
            <p className="row">
              <a href={LINKS.repo} target="_blank" rel="noreferrer">{t("Source code")}</a>
              <a href={LINKS.security} target="_blank" rel="noreferrer">{t("Security review")}</a>
              <a href={LINKS.paper} target="_blank" rel="noreferrer">{t("Research paper (SSRN)")}</a>
            </p>
            <p className="row" aria-label={t("Official community")}>
              <span className="strong" style={{ color: "var(--ink)" }}>{t("Official community")}:</span>
              {SOCIAL.map(([label, href]) => (
                <a key={href} href={href} target="_blank" rel="noreferrer me">{t(label)}</a>
              ))}
            </p>
            <p>{t("These are our only official accounts. Nobody from the project will ever ask for your secret phrase or message you first about money.")}</p>
          </div>
          <div>
            {[
              [t("FairRound contracts on {network}", { network: ACTIVE_NETWORK.label }), ["InvestToken", "RoundAuctionV9", "GovernanceV9", "CompanyTreasuryV9", "CompanyDividendsV9", "OpenVerifierV2", "FairRoundTimelock"]],
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
