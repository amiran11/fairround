// The guide under the header: always the one next thing to do, from
// connecting a wallet to holding units, with a single button that goes there.
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import { V9_LIVE } from "../web3.js";
import { getMyProgress, auctionPhase } from "../v9/chain.js";
import { useChain, useCountdown } from "./liveUtils.js";
import { useCompanyName } from "../v9/companies.jsx";
import { LockIcon } from "./Icons.jsx";
import { Button } from "./ui.jsx";
import { track } from "../analytics.js";
import { loadPortfolio } from "../v9/portfolio.js";
import { WHERE, useTodoText, useTodoTitle } from "../v9/todo.jsx";

const STEPS = 4;

export default function NextStep() {
  const { t } = useT();
  const { pathname } = useLocation();
  const { connected, address, account, connect, connecting } = useSession();
  const [p] = useChain((prov) => (V9_LIVE ? getMyProgress(address, prov) : Promise.resolve(null)), [address]);
  const name = useCompanyName();
  const bidRound = useCountdown(p?.bid ? (auctionPhase(p.bid) === "cooldown" ? p.bid.roundStart : p.bid.roundEnd) : 0);
  // Once a wallet holds units, the guide follows its listings: elections,
  // votes and approved proposals waiting for it (same list as the portfolio).
  const holds = !!p?.held;
  const [todo] = useChain((prov) => (V9_LIVE && holds && address ? loadPortfolio(address, prov).then((d) => d.todo) : Promise.resolve(null)), [address, holds]);
  const first = todo && todo[0];
  const todoClose = useCountdown(first?.until ? first.until : 0);
  const todoText = useTodoText();
  const todoTitle = useTodoTitle();
  if (!V9_LIVE) return null;

  const label = (c) => (c ? name(c).main : "");
  let step, title, body, action;
  let holderTask = false;
  if (!connected) {
    step = 1; title = t("Connect your wallet");
    body = t("MetaMask on Arbitrum One. Connecting only shows your address; nothing moves without your OK.");
    action = <Button small busy={connecting} onClick={connect} className="btn-wallet"><LockIcon open />{t("Connect wallet")}</Button>;
  } else if (!account) {
    return null; // reading the wallet's state
  } else if (!account.isVerified) {
    step = 2; title = t("Verify your wallet");
    body = t("One transaction checks that the wallet holds 0.0083 ETH. Nothing is taken.");
    action = { to: "/invest", text: t("Verify now") };
  } else if (!account.alreadyClaimed) {
    step = 3; title = t("Claim your 1,000 UNRIG");
    body = t("Free commitment credits, once per wallet. You bid with them.");
    action = { to: "/invest", text: t("Claim now") };
  } else if (!p) {
    return null;
  } else if (p.held && first) {
    step = 5; holderTask = true;
    title = todoTitle(first, label(first.company));
    const more = todo.length - 1;
    body = [todoText(first), first.until && !todoClose.passed ? t("Closes in {time}.", { time: todoClose.label }) : null,
      more > 0 ? t("{n} more in your portfolio.", { n: more }) : null].filter(Boolean).join(" ");
    action = { to: `/company/${first.company.id}${WHERE[first.kind]}`, text: t("Go there") };
  } else if (p.held) {
    step = 5; title = t("You hold units in {name}", { name: label(p.held) });
    body = t("They're yours on-chain. When half a listing is sold, holders elect its project lead: watch for your vote.");
    action = { to: "/portfolio", text: t("Open your portfolio") };
  } else if (p.bid) {
    step = 5; title = t("Your bid on {name} is in", { name: label(p.bid) });
    body = auctionPhase(p.bid) === "settle"
      ? t("The round has closed. Settle it to see the price and your units.")
      : t("The round closes in {time}. Everyone filled pays the same price.", { time: bidRound.label });
    action = { to: `/company/${p.bid.id}`, text: auctionPhase(p.bid) === "settle" ? t("Settle the round") : t("Watch the round") };
  } else {
    step = 4; title = t("Place your first bid");
    body = p.suggest ? t("{name} has a round open now. Choose how much UNRIG to commit and the most you'll pay per unit.", { name: label(p.suggest) }) : t("Choose a listing and bid in its next round.");
    action = p.suggest ? { to: `/company/${p.suggest.id}`, text: t("Bid on {name}", { name: label(p.suggest) }) } : { to: "/", text: t("See the listings") };
  }
  const here = action?.to && pathname === action.to.split(/[?#]/)[0] && !action.to.includes("#");
  const done = step > STEPS;

  return (
    <div className={`nextstep${done ? (holderTask ? " is-task" : " is-done") : ""}`} role="region" aria-label={t("Your next step")}>
      <div className="page nextstep-inner">
        <ol className="nextstep-dots" aria-label={done ? t("All steps done") : t("Step {n} of {total}", { n: step, total: STEPS })}>
          {Array.from({ length: STEPS }, (_, i) => (
            <li key={i} className={i + 1 < step ? "done" : i + 1 === step ? "current" : ""}>{i + 1 < step ? <Check size={12} strokeWidth={3} /> : i + 1}</li>
          ))}
        </ol>
        <div className="nextstep-text">
          <strong>{done ? (holderTask ? `${t("Your turn")} · ${title}` : title) : `${t("Step {n} of {total}", { n: step, total: STEPS })} · ${title}`}</strong>
          <span className="small">{body}</span>
        </div>
        <div className="nextstep-action">
          {action && !action.to ? action : here
            ? <span className="small nextstep-here">{t("You're on the right page ↓")}</span>
            : <Link to={action.to} className="btn btn-small" onClick={() => track("guide_click", { step })}>{action.text} <ArrowRight size={16} /></Link>}
        </div>
      </div>
    </div>
  );
}
