// Everything one address has in version 9 and what is waiting for it.
// Works for any address: the chain is public.
import { getInvestBalance, getClaimEligibility } from "../web3.js";
import { ORDER } from "./todo.jsx";
import {
  ZERO, getCompanies, getBids, getShareCount, getMyShares, getElection, getProposals, getDividendTerms, getRecall,
  governancePhase,
} from "./chain.js";

const EXECUTION_DELAY = 5 * 86400; // CompanyTreasuryV9.EXECUTION_DELAY
const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export async function loadPortfolio(address, provider) {
  const t = Math.floor(Date.now() / 1000);
  const [companies, invest, elig, tokens] = await Promise.all([
    getCompanies(provider), getInvestBalance(address, provider), getClaimEligibility(address, provider), getMyShares(address, provider),
  ]);
  const holdings = [];
  const bids = [];
  const roles = [];
  const todo = [];
  const listed = tokens.filter((x) => x.listedAt !== null);

  await Promise.all(companies.map(async (c) => {
    const [shares, book] = await Promise.all([getShareCount(c.id, address, provider), getBids(c.id, provider)]);
    if (shares > 0n) {
      const mineTokens = tokens.filter((x) => x.companyId === c.id);
      const free = mineTokens.filter((x) => x.lockedUntil <= t).length;
      const nextUnlock = mineTokens.filter((x) => x.lockedUntil > t).reduce((m, x) => Math.min(m, x.lockedUntil), Infinity);
      holdings.push({ company: c, shares, free, nextUnlock: Number.isFinite(nextUnlock) ? nextUnlock : 0 });
    }
    const b = book.find((x) => same(x.bidder, address));
    if (b) bids.push({ company: c, amount: b.amount, maxPrice: b.maxPrice, roundEnd: c.roundEnd, roundStart: c.roundStart });

    const g = c.gov;
    if (g.active && same(g.governor, address)) roles.push({ company: c, role: "governor", term: g.termNum, hasKey: g.opKey !== ZERO });
    if (g.active && same(g.opKey, address)) roles.push({ company: c, role: "key", term: g.termNum });
    if (g.active && same(g.pendingKey, address)) todo.push({ kind: "acceptKey", company: c });

    const phase = governancePhase(c, t);
    // Steps anyone can take to move a listing along; shown to its holders.
    if (shares > 0n) {
      if (phase === "canOpen") todo.push({ kind: "startElection", company: c });
      if (phase === "readyToVote") todo.push({ kind: "openVoting", company: c });
      if (phase === "count") todo.push({ kind: "countVotes", company: c });
    }
    if (phase === "candidacy" || phase === "voting") {
      const e = await getElection(c.id, address, provider);
      if (e) {
        if (e.candidates.some((x) => same(x.address, address))) roles.push({ company: c, role: "candidate" });
        if (phase === "candidacy" && e.myWeight > 0n && !e.nominated) todo.push({ kind: "nominate", company: c, weight: e.myWeight, until: e.candidacyEnd });
        if (phase === "voting" && e.myWeight > 0n && !e.voted) todo.push({ kind: "elect", company: c, weight: e.myWeight, until: e.voteEnd });
      }
    }
    if (g.active && g.recall && !g.recall.resolved && Number(g.recall.voteEnd) > t) {
      const r = await getRecall(c.id, address, provider);
      if (r.id && !r.voted && r.myWeight > 0n) todo.push({ kind: "recall", company: c, weight: r.myWeight, until: r.voteEnd });
    }

    const [proposals, terms] = await Promise.all([
      getProposals(c.id, address, provider).catch(() => []),
      getDividendTerms(c.id, address, provider).catch(() => []),
    ]);
    for (const p of proposals) {
      const proposer = same(p.governor, address) || same(p.opKey, address);
      if (p.status === "Voting" && Number(p.voteEnd) > t && !p.voted && p.myWeight > 0n && !proposer && !same(p.to, address)) {
        todo.push({ kind: "proposal", company: c, proposal: p.id, weight: p.myWeight, until: p.voteEnd });
      }
      // Approved, waiting period over, not yet carried out (payments and sales).
      if (p.status === "Voting" && p.passes && g.active && Number(p.voteEnd) + EXECUTION_DELAY <= t && (p.kind === "Payment" || p.kind === "Sale")
        && (shares > 0n || proposer || same(p.to, address))) {
        todo.push({ kind: "carryOut", company: c, proposal: p.id });
      }
      if (p.auction && p.mine) {
        const revealing = Number(p.auction.commitEnd) <= t && Number(p.auction.revealEnd) > t;
        if (p.status === "Auction" && revealing && p.mine.committed && !p.mine.revealed) todo.push({ kind: "reveal", company: c, proposal: p.id, until: p.auction.revealEnd });
        if (p.status === "Settled" && p.mine.revealed && !p.mine.claimed) todo.push({ kind: "auctionClaim", company: c, proposal: p.id, won: same(p.auction.leader, address) });
      }
    }
    for (const tm of terms) {
      if (tm.resolved && tm.owed > 0n && !tm.claimed) todo.push({ kind: "dividend", company: c, term: tm.term, amount: tm.owed });
      if (tm.voteEnd > 0n && Number(tm.voteEnd) > t && !tm.hasVoted && tm.myWeight > 0n && !same(tm.termGov, address)) {
        todo.push({ kind: "dividendVote", company: c, term: tm.term, weight: tm.myWeight, until: tm.voteEnd });
      }
    }
  }));

  todo.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || Number(a.until || 0) - Number(b.until || 0));
  holdings.sort((a, b) => (b.shares > a.shares ? 1 : b.shares < a.shares ? -1 : 0));
  return { address, invest, isVerified: elig.isVerified, claimed: elig.alreadyClaimed, holdings, bids, roles, todo, listed, companies };
}
