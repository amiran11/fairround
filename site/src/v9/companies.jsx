// v9 companies: the list with each one's auction and governance state, the
// name in the reader's language, and the stage stamp.
import { useEffect, useRef, useState } from "react";
import { getCompanies, auctionPhase, governancePhase } from "./chain.js";
import { useChain } from "../components/liveUtils.js";
import { useT } from "../i18n.jsx";
import { Stamp } from "../components/ui.jsx";
import { kaName } from "../names.js";
import { ACTIVE_NETWORK } from "../web3.js";

export function useCompanies() {
  return useChain(getCompanies, []);
}

// The listings to show on the Listings page: the first experiment's
// listings are hidden as soon as any newer listing exists.
export function visibleListings(list) {
  const legacy = new Set(ACTIVE_NETWORK.legacyListingIds || []);
  if (!list || !list.some((c) => !legacy.has(c.id))) return list;
  return list.filter((c) => !legacy.has(c.id));
}

export function useCompanyName() {
  const { lang } = useT();
  return (c) => {
    const ka = kaName(c.name);
    if (lang === "ka" && ka) return { main: ka, sub: c.name, mainLang: "ka", subLang: "en" };
    return { main: c.name, sub: ka, mainLang: "en", subLang: "ka" };
  };
}

// One stage per company: governance once it has started, else the auction.
export function stageOf(c) {
  const g = governancePhase(c);
  const recallOpen = c.gov.recall && !c.gov.recall.resolved && c.gov.active && Number(c.gov.recall.voteEnd) > Date.now() / 1000;
  if (recallOpen) return "recall";
  if (g === "notYet") return c.finalized ? "soldOut" : auctionPhase(c) === "cooldown" ? "cooldown" : "auction";
  return g;
}

export function StageStamp({ company }) {
  const { t } = useT();
  const s = stageOf(company);
  const prev = useRef(s);
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (prev.current !== s) { prev.current = s; setLanded(true); }
  }, [s]);
  const text = {
    auction: t("Auction open"),
    cooldown: t("Between rounds"),
    soldOut: t("Sold out"),
    canOpen: t("Election can open"),
    candidacy: t("Candidates declaring"),
    readyToVote: t("Voting can open"),
    voting: t("Election"),
    count: t("Votes to count"),
    governed: t("Governed, term {n}", { n: company.gov.termNum.toString() }),
    termOver: t("Term over"),
    recall: t("Recall vote"),
  }[s];
  const quiet = ["auction", "cooldown", "soldOut", "termOver", "count", "readyToVote", "canOpen"].includes(s);
  return <Stamp key={s} tone={quiet ? "quiet" : s === "governed" ? "done" : undefined} landed={landed}>{text}</Stamp>;
}
