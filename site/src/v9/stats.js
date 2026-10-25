// On-chain activity: everything the Stats page shows, read straight from the
// contracts' event logs on Arbitrum. Nothing here comes from analytics or a
// server, so anyone can check every number on Arbiscan.
import { getContract, queryFilterChunked, getBlockTimes } from "../web3.js";

const DAY = 86400;

export async function getActivity(provider) {
  const [it, ra] = await Promise.all([getContract("InvestToken", provider), getContract("RoundAuctionV9", provider)]);
  const [verified, claimed, bids, fills, settled] = await Promise.all([
    queryFilterChunked(it, it.filters.CitizenVerified()),
    queryFilterChunked(it, it.filters.Claimed()),
    queryFilterChunked(ra, ra.filters.BidPlaced()),
    queryFilterChunked(ra, ra.filters.BidFilled()),
    queryFilterChunked(ra, ra.filters.RoundSettled()),
  ]);
  const all = [...verified, ...claimed, ...bids, ...fills, ...settled];
  const times = await getBlockTimes(provider, all.map((e) => e.blockNumber));
  const at = (e) => times[e.blockNumber] || 0;

  const verifiedWallets = new Set(verified.filter((e) => e.args.verified).map((e) => e.args.citizen.toLowerCase()));
  const claimedWallets = new Set(claimed.map((e) => e.args.citizen.toLowerCase()));
  const bidders = new Set(bids.map((e) => e.args.bidder.toLowerCase()));
  const holders = new Set(fills.map((e) => e.args.bidder.toLowerCase()));

  // One feed of everything, newest first.
  const feed = [
    ...verified.filter((e) => e.args.verified).map((e) => ({ kind: "verified", who: e.args.citizen, t: at(e), tx: e.tx, block: e.blockNumber })),
    ...claimed.map((e) => ({ kind: "claimed", who: e.args.citizen, amount: e.args.amount, t: at(e), tx: e.tx, block: e.blockNumber })),
    ...bids.map((e) => ({ kind: "bid", who: e.args.bidder, companyId: Number(e.args.companyId), amount: e.args.amount, t: at(e), tx: e.tx, block: e.blockNumber })),
    ...fills.map((e) => ({ kind: "filled", who: e.args.bidder, companyId: Number(e.args.companyId), shares: e.args.shares, paid: e.args.paid, t: at(e), tx: e.tx, block: e.blockNumber })),
    ...settled.map((e) => ({ kind: "settled", companyId: Number(e.args.companyId), round: Number(e.args.round), shares: e.args.sharesIssuedThisRound, price: e.args.price, t: at(e), tx: e.tx, block: e.blockNumber })),
  ].sort((a, b) => b.block - a.block);

  // Per day (UTC): new verified wallets, bids placed, units issued.
  const days = new Map();
  const bump = (t, key, n = 1) => {
    if (!t) return;
    const d = Math.floor(t / DAY) * DAY;
    const row = days.get(d) || { day: d, verified: 0, bids: 0, units: 0 };
    row[key] += n;
    days.set(d, row);
  };
  feed.forEach((e) => {
    if (e.kind === "verified") bump(e.t, "verified");
    if (e.kind === "bid") bump(e.t, "bids");
    if (e.kind === "filled") bump(e.t, "units", Number(e.shares));
  });
  const daily = [];
  if (days.size) {
    const first = Math.min(...days.keys());
    const last = Math.max(...days.keys());
    for (let d = first; d <= last; d += DAY) daily.push(days.get(d) || { day: d, verified: 0, bids: 0, units: 0 });
  }

  // Per listing: rounds settled, units issued, last clearing price.
  const perListing = new Map();
  [...settled].sort((a, b) => a.blockNumber - b.blockNumber).forEach((e) => {
    const id = Number(e.args.companyId);
    const row = perListing.get(id) || { companyId: id, rounds: 0, units: 0n, lastPrice: 0n, lastAt: 0 };
    row.rounds += 1;
    row.units += e.args.sharesIssuedThisRound;
    if (e.args.sharesIssuedThisRound > 0n) row.lastPrice = e.args.price;
    row.lastAt = at(e);
    perListing.set(id, row);
  });
  const bidVolume = bids.reduce((s, e) => s + e.args.amount, 0n);
  const raised = fills.reduce((s, e) => s + e.args.paid, 0n);

  return {
    funnel: { verified: verifiedWallets.size, claimed: claimedWallets.size, bidders: bidders.size, holders: holders.size },
    totals: { bids: bids.length, bidVolume, raised, rounds: settled.length, unitsIssued: fills.reduce((s, e) => s + e.args.shares, 0n) },
    daily,
    listings: [...perListing.values()].sort((a, b) => a.companyId - b.companyId),
    feed: feed.slice(0, 25),
  };
}
