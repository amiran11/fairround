// Listed companies with their governance state, and how each one's stage
// is named. The chain stores only an English name, so Georgian names for
// the known companies live here.
import { useEffect, useRef, useState } from "react";
import { getListedRoundCompanies, getCompanyGovernance } from "./web3.js";
import { useChain, ZERO } from "./components/liveUtils.js";
import { useT } from "./i18n.jsx";
import { Stamp } from "./components/ui.jsx";

const KA_NAMES = {
  "Sakartvelo Land Fund": "საქართველოს მიწის ფონდი",
  "Bolnisi Gold Mines": "ბოლნისის ოქროს მაღაროები",
  "Tkibuli Coal Basin": "ტყიბულის ქვანახშირის აუზი",
  "Racha Marble Works": "რაჭის მარმარილოს კომბინატი",
  "National Forest Fund": "ეროვნული ტყის ფონდი",
  "Georgian Railway": "საქართველოს რკინიგზა",
  "Chiatura Manganese Concern": "ჭიათურის მანგანუმის კონცერნი",
  "Zestafoni Ferroalloys Plant": "ზესტაფონის ფეროშენადნობთა ქარხანა",
  "Enguri Hydropower Plant": "ენგურის ჰესი",
  "Batumi Sea Port": "ბათუმის საზღვაო პორტი",
  "Anaklia Deep Sea Port": "ანაკლიის ღრმაწყლოვანი პორტი",
  "Georgian Stock Exchange": "საქართველოს საფონდო ბირჟა",
};

export function kaName(name) {
  return KA_NAMES[name] || null;
}

// Name in the reader's language first, the other one underneath.
export function useCompanyName() {
  const { lang } = useT();
  return (c) => {
    const ka = kaName(c.name);
    if (lang === "ka" && ka) return { main: ka, sub: c.name, mainLang: "ka", subLang: "en" };
    return { main: c.name, sub: ka, mainLang: "en", subLang: "ka" };
  };
}

export async function loadCompanies(provider) {
  const list = await getListedRoundCompanies(provider);
  const govs = await Promise.all(list.map((c) =>
    c.sharesIssued * 2n >= c.totalShares ? getCompanyGovernance(c.id, provider) : Promise.resolve(null)
  ));
  return list.map((c, i) => ({ ...c, gov: govs[i] }));
}

export function useCompanies() {
  return useChain(loadCompanies, []);
}

// Where a company is in its life. `until` is the next deadline, if any.
export function stageOf(c, now = Math.floor(Date.now() / 1000)) {
  const g = c.gov;
  const eligible = c.sharesIssued * 2n >= c.totalShares;
  if (!eligible) return { key: "auction", until: c.roundEnd };
  if (g && g.governor !== ZERO) {
    if (Number(g.termEnd) > now) return { key: "governed", term: g.termNum, until: g.termEnd };
    return { key: "termEnded", term: g.termNum };
  }
  if (!g || g.round === 0n) return { key: "candidacy" };
  if (Number(g.voteEnd) > now) return { key: "voting", until: g.voteEnd };
  return { key: "count" };
}

// The stamp "lands" when the stage changes while someone is looking at it
// (for example right after their transaction settles a round).
export function StageStamp({ company }) {
  const { t } = useT();
  const s = stageOf(company);
  const prev = useRef(s.key);
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (prev.current !== s.key) { prev.current = s.key; setLanded(true); }
  }, [s.key]);
  const text = {
    auction: t("Auction open"),
    governed: t("Governed, term {n}", { n: s.term?.toString() }),
    termEnded: t("Term over"),
    candidacy: t("Open for candidates"),
    voting: t("Election"),
    count: t("Votes to count"),
  }[s.key];
  // The ordinary stage is a quiet outline, so the ink stamps stand out.
  const tone = s.key === "auction" || s.key === "termEnded" || s.key === "count" ? "quiet" : s.key === "governed" ? "done" : undefined;
  return <Stamp key={s.key} tone={tone} landed={landed}>{text}</Stamp>;
}
