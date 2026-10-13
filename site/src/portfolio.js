// Everything one address has on the exchange, read from the chain: INVEST,
// shares, open bids, governor roles, market offers, and the things that are
// waiting for it (votes it can cast, dividends and auction money to claim,
// sealed bids to reveal). Works for any address: the chain is public.
import {
  getInvestBalance, getClaimEligibility, getRoundBids, getMyShareCount, getRoundAuctionRules,
  getCandidates, getMyVoteWeight, hasVotedThisRound, getDividendTerms, getTreasuryAuctions,
  getVendorPayments, getInvestOffers,
} from "./web3.js";
import { loadCompanies } from "./companies.jsx";

const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const ZERO = "0x0000000000000000000000000000000000000000";

export async function loadPortfolio(address, provider) {
  const now = Math.floor(Date.now() / 1000);
  const [companies, invest, elig, rules, offers] = await Promise.all([
    loadCompanies(provider),
    getInvestBalance(address, provider),
    getClaimEligibility(address, provider),
    getRoundAuctionRules(provider),
    getInvestOffers(provider),
  ]);

  const perCompany = await Promise.all(companies.map(async (c) => {
    const [shares, bids] = await Promise.all([getMyShareCount(c.id, address, provider), getRoundBids(c.id, provider)]);
    return { c, shares, bids };
  }));

  const holdings = [];
  const bids = [];
  const roles = [];
  const todo = [];

  for (const { c, shares, bids: book } of perCompany) {
    if (shares > 0n) {
      const unlockAt = Number(c.firstMintedAt) + Number(rules.lockPeriod);
      holdings.push({ company: c, shares, lockedUntil: unlockAt > now ? unlockAt : 0 });
    }
    const mine = book.find((b) => same(b.bidder, address));
    if (mine) {
      const lowest = book.reduce((m, b) => (b.amount < m ? b.amount : m), book[0].amount);
      bids.push({ company: c, amount: mine.amount, worth: (mine.amount + lowest - 1n) / lowest, roundEnd: c.roundEnd });
    }
    const g = c.gov;
    if (g && g.governor !== ZERO && Number(g.termEnd) > now) {
      if (same(g.governor, address)) roles.push({ company: c, role: "governor", term: g.termNum, termEnd: g.termEnd, hasKey: g.operatingKey !== ZERO });
      if (same(g.operatingKey, address)) roles.push({ company: c, role: "key", term: g.termNum, termEnd: g.termEnd });
    }
  }

  // Elections this address can vote in now.
  await Promise.all(companies.map(async (c) => {
    const g = c.gov;
    if (!g || g.governor !== ZERO || g.round === 0n || Number(g.voteEnd) <= now) return;
    const [weight, voted] = await Promise.all([getMyVoteWeight(c.id, address, g, provider), hasVotedThisRound(c.id, g.round, address, provider)]);
    if (weight > 0n && !voted) todo.push({ kind: "elect", company: c, weight, until: g.voteEnd });
  }));

  // Treasury items, for every company (sealed bids don't need shares).
  await Promise.all(companies.map(async (c) => {
    const [terms, auctions, payments] = await Promise.all([
      getDividendTerms(c.id, address, provider).catch(() => []),
      getTreasuryAuctions(c.id, address, provider).catch(() => []),
      getVendorPayments(c.id, address, provider).catch(() => []),
    ]);
    for (const tm of terms) {
      if (tm.resolved && tm.owed > 0n && !tm.claimed) todo.push({ kind: "dividend", company: c, term: tm.term, amount: tm.owed });
      if (tm.voteEnd > 0n && Number(tm.voteEnd) > now && !tm.hasVoted && tm.myWeight > 0n) todo.push({ kind: "dividendVote", company: c, term: tm.term, weight: tm.myWeight, until: tm.voteEnd });
    }
    for (const a of auctions) {
      const revealing = Number(a.commitEnd) <= now && Number(a.revealEnd) > now;
      if (revealing && a.mine.committed && !a.mine.revealed) todo.push({ kind: "reveal", company: c, auction: a.id, until: a.revealEnd });
      if (a.settled && a.mine.revealed && !a.mine.claimed) todo.push({ kind: "auctionClaim", company: c, auction: a.id, won: same(a.leader, address) });
    }
    for (const p of payments) {
      if (!p.executed && Number(p.voteEnd) > now && !p.voted && p.myWeight > 0n) todo.push({ kind: "payment", company: c, payment: p.id, weight: p.myWeight, until: p.voteEnd });
    }
  }));

  // Candidacy: companies where this address is standing.
  await Promise.all(companies.map(async (c) => {
    if (!c.gov || c.gov.governor !== ZERO) return;
    const list = await getCandidates(c.id, provider);
    if (list.some((x) => same(x.address, address) && !x.eliminated)) roles.push({ company: c, role: "candidate" });
  }));

  const myOffers = offers.filter((o) => !o.isCorporateOffer && same(o.seller, address));
  const order = { reveal: 0, elect: 1, payment: 2, dividendVote: 3, dividend: 4, auctionClaim: 5 };
  todo.sort((a, b) => order[a.kind] - order[b.kind] || Number(a.until || 0) - Number(b.until || 0));
  holdings.sort((a, b) => (b.shares > a.shares ? 1 : b.shares < a.shares ? -1 : 0));

  return { address, invest, isVerified: elig.isVerified, claimed: elig.alreadyClaimed, holdings, bids, roles, todo, offers: myOffers };
}
