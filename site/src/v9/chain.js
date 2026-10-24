// The v9 contracts, as the site uses them. Reads take a provider; writes
// take a signer and wait for the transaction to be mined.
//
// RoundAuctionV9   share auctions in rounds, share NFTs, company capital
// GovernanceV9     elections, terms, operating keys, recall
// CompanyTreasuryV9 payments, sales and investments, all by shareholder vote
// CompanyDividendsV9 the end-of-term dividend / reinvest vote
// OpenVerifierV2   self-verification (InvestToken is shared with v8)
import {
  CONTRACT_ADDRESSES, getContract, getTokenInfo, sendTx, queryFilterChunked, ensureAllowance, getEthers, ACTIVE_NETWORK,
} from "../web3.js";

export const ZERO = "0x0000000000000000000000000000000000000000";
export const CAPITAL = 0;
export const INCOME = 1;
const now = () => Math.floor(Date.now() / 1000);

const ra = (r) => getContract("RoundAuctionV9", r);
const gov = (r) => getContract("GovernanceV9", r);
const ct = (r) => getContract("CompanyTreasuryV9", r);
const dv = (r) => getContract("CompanyDividendsV9", r);
const ov = (r) => getContract("OpenVerifierV2", r);

// ------------------------------------------------------------------ rules

let rulesCache = null;
export async function getRules(provider) {
  if (rulesCache) return rulesCache;
  const [r, g, t] = await Promise.all([ra(provider), gov(provider), ct(provider)]);
  const [maxBids, perRound, cooldown, lock, candidacy, voteWindow, term, delay] = await Promise.all([
    r.MAX_ACTIVE_BIDS(), r.MAX_SHARES_PER_ROUND(), r.ROUND_COOLDOWN(), r.LOCK_PERIOD(),
    g.CANDIDACY_PERIOD(), g.VOTE_WINDOW(), g.TERM_LENGTH(), t.EXECUTION_DELAY(),
  ]);
  rulesCache = { maxBids, perRound, cooldown, lock, candidacy, voteWindow, term, delay };
  return rulesCache;
}

// ------------------------------------------------------------------ companies

const PROBE = 32; // listing ids 0..31; listings are by id, not by event index

export async function getCompanies(provider) {
  const [r, g] = await Promise.all([ra(provider), gov(provider)]);
  const ids = Array.from({ length: PROBE }, (_, i) => i);
  const rows = await Promise.all(ids.map(async (id) => {
    const c = await r.companies(id);
    if (c.totalShares === 0n) return null;
    return {
      id, name: c.name, totalShares: c.totalShares, sharesIssued: c.sharesIssued, currentRound: c.currentRound,
      roundEnd: c.roundEnd, roundDuration: c.roundDuration, finalized: c.finalized, firstMintedAt: c.firstMintedAt, capital: c.capital,
    };
  }));
  const list = rows.filter(Boolean);
  await Promise.all(list.map(async (c) => {
    const [roundStart, income, gv] = await Promise.all([r.roundStart(c.id), r.reinvestableIncome(c.id), govState(g, c.id)]);
    c.roundStart = roundStart;
    c.income = income;
    c.gov = gv;
  }));
  return list;
}

async function govState(g, id) {
  const [governor, termEnd, opKey, pendingKey, termNum, e, lastRecall] = await Promise.all([
    g.companyGovernor(id), g.governorTermEnd(id), g.governorOperatingKey(id), g.pendingOperatingKey(id),
    g.termNumber(id), g.election(id), g.lastRecallId(id),
  ]);
  const election = { id: e.id, snapshot: e.snapshot, candidacyEnd: e.candidacyEnd, round: e.round, voteEnd: e.voteEnd, failedRounds: e.failedRounds };
  let recall = null;
  if (lastRecall > 0n) {
    const r = await g.recalls(id, lastRecall);
    recall = { id: lastRecall, term: r.term, snapshot: r.snapshot, voteEnd: r.voteEnd, yes: r.yes, no: r.no, resolved: r.resolved };
  }
  return { governor, termEnd, opKey, pendingKey, termNum, election, recall, active: governor !== ZERO && Number(termEnd) > now() };
}

// Where a company is: auction phase and governance phase, separately.
export function auctionPhase(c, t = now()) {
  if (c.finalized) return "soldOut";
  if (t < Number(c.roundStart)) return "cooldown";
  if (t < Number(c.roundEnd)) return "bidding";
  return "settle";
}

export function governancePhase(c, t = now()) {
  const g = c.gov;
  if (g.active) return "governed";
  const e = g.election;
  if (e.id === 0n) {
    if (g.governor !== ZERO) return "termOver";
    return c.sharesIssued * 2n >= c.totalShares ? "canOpen" : "notYet";
  }
  if (e.round === 0n) return t < Number(e.candidacyEnd) ? "candidacy" : "readyToVote";
  return t < Number(e.voteEnd) ? "voting" : "count";
}

// ------------------------------------------------------------------ auction

export async function getBids(companyId, provider) {
  const list = await (await ra(provider)).getActiveBids(companyId);
  return list.map((b) => ({ bidder: b.bidder, amount: b.amount, maxPrice: b.maxPrice, seq: b.seq }));
}

export async function getInvestAllowanceFor(owner, spender, provider) {
  const { Contract } = await getEthers();
  const it = new Contract(CONTRACT_ADDRESSES.InvestToken, ["function allowance(address,address) view returns (uint256)"], provider);
  return it.allowance(owner, spender);
}

export async function placeBid(signer, companyId, amount, maxPrice) {
  const r = await ra(signer);
  await ensureAllowance(signer, CONTRACT_ADDRESSES.InvestToken, await r.getAddress(), amount);
  return sendTx(r, "placeBid", companyId, amount, maxPrice);
}
export const withdrawBid = async (signer, companyId) => sendTx(await ra(signer), "withdrawBid", companyId);
export const settleRound = async (signer, companyId) => sendTx(await ra(signer), "settleRound", companyId);

// The last settled round's price, from the RoundSettled event.
export async function getLastPrice(companyId, provider) {
  const r = await ra(provider);
  const ev = await queryFilterChunked(r, r.filters.RoundSettled(companyId));
  const sold = ev.filter((e) => e.args[2] > 0n);
  if (!sold.length) return null;
  const last = sold[sold.length - 1];
  return { round: last.args[1], shares: last.args[2], price: last.args[3] };
}

// ------------------------------------------------------------------ elections

export async function getElection(companyId, me, provider) {
  const [g, r] = await Promise.all([gov(provider), ra(provider)]);
  const e = await g.election(companyId);
  if (e.id === 0n) return null;
  const declared = await queryFilterChunked(g, g.filters.CandidateDeclared(companyId, e.id));
  const addrs = [...new Set(declared.map((x) => x.args[2]))];
  const [electorate, ballot] = await Promise.all([g.electorate(companyId, e.snapshot), g.getCandidates(companyId)]);
  const candidates = await Promise.all(addrs.map(async (address) => {
    const [c, votes] = await Promise.all([
      g.candidates(companyId, e.id, address),
      e.round > 0n ? g.roundVotes(companyId, e.round, address) : 0n,
    ]);
    return { address, program: c.program, stake: c.stake, support: c.support, seq: c.seq, registered: c.registered, onBallot: c.onBallot, eliminated: c.eliminated, votes };
  }));
  const [myWeight, nominated, voted, against, cast] = await Promise.all([
    r.votingWeight(companyId, me, e.snapshot),
    g.hasNominated(companyId, e.id, me),
    e.round > 0n ? g.roundHasVoted(companyId, e.round, me) : false,
    e.round > 0n ? g.roundVotes(companyId, e.round, ZERO) : 0n,
    e.round > 0n ? g.roundTotalVotesCast(companyId, e.round) : 0n,
  ]);
  return {
    id: e.id, snapshot: e.snapshot, candidacyEnd: e.candidacyEnd, round: e.round, voteEnd: e.voteEnd, failedRounds: e.failedRounds,
    electorate, ballotSize: ballot.length,
    candidates: candidates.filter((c) => c.registered).sort((a, b) => (b.support > a.support ? 1 : b.support < a.support ? -1 : Number(a.seq - b.seq))),
    myWeight, nominated, voted, against, cast,
  };
}

export async function getMyWeightNow(companyId, me, provider) {
  // Weight a holder would have in something opened now (snapshot one day ago).
  const r = await ra(provider);
  return r.votingWeight(companyId, me, now() - 86400);
}

const g = async (signer, m, ...a) => sendTx(await gov(signer), m, ...a);
export const openCandidacy = (s, id) => g(s, "openCandidacy", id);
export const declareCandidacy = (s, id, program) => g(s, "declareCandidacy", id, program);
export const nominate = (s, id, cand) => g(s, "nominate", id, cand);
export const withdrawCandidacy = (s, id) => g(s, "withdrawCandidacy", id);
export const openVoting = (s, id) => g(s, "openVoting", id);
export const vote = (s, id, cand) => g(s, "vote", id, cand); // ZERO = against all
export const tallyRound = (s, id) => g(s, "tallyRound", id);
export const setOperatingKey = (s, id, key) => g(s, "setOperatingKey", id, key);
export const acceptOperatingKey = (s, id) => g(s, "acceptOperatingKey", id);
export const closeTerm = (s, id) => g(s, "closeTerm", id);
export const openRecall = (s, id) => g(s, "openRecall", id);
export const voteRecall = (s, id, remove) => g(s, "voteRecall", id, remove);
export const resolveRecall = (s, id) => g(s, "resolveRecall", id);
export const voteAsCorporation = (s, from, to, cand) => g(s, "voteAsCorporation", from, to, cand);
export const nominateAsCorporation = (s, from, to, cand) => g(s, "nominateAsCorporation", from, to, cand);

export async function getRecall(companyId, me, provider) {
  const [gg, r] = await Promise.all([gov(provider), ra(provider)]);
  const id = await gg.lastRecallId(companyId);
  const termNum = await gg.termNumber(companyId);
  const out = { canOpenWeight: await r.votingWeight(companyId, me, now() - 86400), electorateNow: await gg.electorate(companyId, now() - 86400) };
  if (id === 0n) return out;
  const x = await gg.recalls(companyId, id);
  if (x.term !== termNum) return out;
  const [passes, voted, myWeight] = await Promise.all([
    gg.recallPasses(companyId, id), gg.recallHasVoted(companyId, id, me), r.votingWeight(companyId, me, x.snapshot),
  ]);
  const electorate = await gg.electorate(companyId, x.snapshot);
  return { ...out, id, voteEnd: x.voteEnd, yes: x.yes, no: x.no, resolved: x.resolved, passes, voted, myWeight, electorate, corpCast: x.corpCast };
}

// ------------------------------------------------------------------ treasury

export async function getTokens(provider) {
  const t = await ct(provider);
  const ev = await queryFilterChunked(t, t.filters.TokenApprovalSet());
  const seen = new Map();
  for (const e of ev) seen.set(e.args[0], e.args[1]);
  const list = await Promise.all([...seen].map(async ([a, approved]) => ({ ...(await getTokenInfo(a, provider)), approved })));
  const invest = { ...(await getTokenInfo(CONTRACT_ADDRESSES.InvestToken, provider)), approved: true, isInvest: true };
  return [invest, ...list];
}

export async function getHoldings(companyId, provider) {
  const [t, tokens] = await Promise.all([ct(provider), getTokens(provider)]);
  const rows = await Promise.all(tokens.map(async (tk) => {
    const [capital, income] = await Promise.all([t.balanceOf(companyId, tk.address, CAPITAL), t.balanceOf(companyId, tk.address, INCOME)]);
    return { ...tk, capital, income };
  }));
  return rows.filter((r) => r.isInvest || r.capital > 0n || r.income > 0n || r.approved);
}

export const STATUS = ["Voting", "Rejected", "Paid", "PaymentFailed", "Auction", "Settled", "Invested"];
export const KIND = ["Payment", "Sale", "Invest"];

export async function getProposals(companyId, me, provider) {
  const [t, r] = await Promise.all([ct(provider), ra(provider)]);
  const [pay, sale, inv] = await Promise.all([
    queryFilterChunked(t, t.filters.PaymentProposed(null, companyId)),
    queryFilterChunked(t, t.filters.SaleProposed(null, companyId)),
    queryFilterChunked(t, t.filters.InvestProposed(null, companyId)),
  ]);
  const ids = [...pay, ...sale, ...inv].map((e) => e.args[0]);
  const list = await Promise.all(ids.map(async (id) => {
    const p = await t.proposals(id);
    const [passes, eligible, voted, myWeight, token, payToken] = await Promise.all([
      t.passes(id), t.eligibleShares(id), t.hasVoted(id, me), r.votingWeight(companyId, me, p.snapshot),
      getTokenInfo(p.token, provider), p.payToken !== ZERO ? getTokenInfo(p.payToken, provider) : null,
    ]);
    const out = {
      id, kind: KIND[Number(p.kind)], status: STATUS[Number(p.status)], bucket: Number(p.bucket), token, amount: p.amount, to: p.to,
      payToken, reserve: p.reserve, target: p.target, term: p.term, snapshot: p.snapshot, voteEnd: p.voteEnd, quorumBps: p.quorumBps,
      governor: p.governor, opKey: p.opKey, yes: p.yes, no: p.no, passes, eligible, voted, myWeight,
    };
    if (out.kind === "Sale" && (out.status === "Auction" || out.status === "Settled")) {
      const [a, b] = await Promise.all([t.auctions(id), t.sealedBids(id, me)]);
      out.auction = { commitEnd: a.commitEnd, revealEnd: a.revealEnd, deposit: a.deposit, committed: a.committed, revealed: a.revealed, leader: a.leader, leadingAmount: a.leadingAmount };
      out.mine = { committed: b.commitHash !== "0x" + "0".repeat(64), revealed: b.revealed, revealedAmount: b.revealedAmount, claimed: b.claimed };
    }
    return out;
  }));
  return list.sort((a, b) => Number(b.id - a.id));
}

const t = async (signer, m, ...a) => sendTx(await ct(signer), m, ...a);
export async function depositToken(signer, companyId, token, amount) {
  const c = await ct(signer);
  await ensureAllowance(signer, token, await c.getAddress(), amount);
  return sendTx(c, "depositToken", companyId, token, amount);
}
export const proposePayment = (s, id, token, bucket, to, amount) => t(s, "proposePayment", id, token, bucket, to, amount);
export const proposeSale = (s, id, token, bucket, amount, payToken, reserve) => t(s, "proposeSale", id, token, bucket, amount, payToken, reserve);
export const proposeInvest = (s, id, target, amount, maxPrice) => t(s, "proposeInvest", id, target, amount, maxPrice);
export const voteProposal = (s, id, approve) => t(s, "vote", id, approve);
export const voteProposalAsCorporation = (s, from, id, approve) => t(s, "voteAsCorporation", from, id, approve);
export const executePayment = (s, id) => t(s, "executePayment", id);
export const executeInvest = (s, id) => t(s, "executeInvest", id);
export const startAuction = (s, id) => t(s, "startAuction", id);
export const settleAuction = (s, id) => t(s, "settleAuction", id);
export const claimAuction = (s, id) => t(s, "claimAuction", id);

// Sealed bids: the secret is saved in this browser BEFORE the commit is
// sent, and also shown as a reveal code to keep.
function bidKey(id, bidder) {
  return `sx9-sealed-bid:${ACTIVE_NETWORK.chainIdHex}:${(CONTRACT_ADDRESSES.CompanyTreasuryV9 || "").toLowerCase()}:${id}:${bidder.toLowerCase()}`;
}
export function getSavedBid(id, bidder) {
  try { const raw = localStorage.getItem(bidKey(id, bidder)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export const revealCode = (amount, salt) => `${amount.toString()}-${salt}`;
export function parseRevealCode(code) {
  const m = String(code).trim().match(/^(\d+)-(0x[0-9a-fA-F]{64})$/);
  return m ? { amount: BigInt(m[1]), salt: m[2] } : null;
}

export async function commitBid(signer, p, amount) {
  const { hexlify, randomBytes, keccak256, AbiCoder } = await getEthers();
  const bidder = await signer.getAddress();
  const salt = hexlify(randomBytes(32));
  try { localStorage.setItem(bidKey(p.id, bidder), JSON.stringify({ amount: amount.toString(), salt })); } catch { /* storage blocked: the code is shown */ }
  const c = await ct(signer);
  await ensureAllowance(signer, p.payToken.address, await c.getAddress(), p.auction.deposit);
  const hash = keccak256(AbiCoder.defaultAbiCoder().encode(["uint256", "uint256", "bytes32", "address"], [p.id, amount, salt, bidder]));
  await sendTx(c, "commitBid", p.id, hash);
  return revealCode(amount, salt);
}

export async function revealBid(signer, p, amount, salt) {
  const c = await ct(signer);
  await ensureAllowance(signer, p.payToken.address, await c.getAddress(), amount);
  return sendTx(c, "revealBid", p.id, amount, salt);
}

// ------------------------------------------------------------------ dividends

export async function getDividendTerms(companyId, me, provider) {
  const [d, gg, r] = await Promise.all([dv(provider), gov(provider), ra(provider)]);
  const termNum = Number(await gg.termNumber(companyId));
  const out = [];
  for (let n = termNum; n >= 1 && out.length < 6; n--) {
    const endTime = await d.termEndTime(companyId, n);
    if (endTime === 0n) continue;
    const [voteEnd, resolved, divW, reinvW, hasVoted, perShare, claimed, base, termGov] = await Promise.all([
      d.policyVoteEnd(companyId, n), d.policyResolved(companyId, n), d.policyDividendWeight(companyId, n),
      d.policyReinvestWeight(companyId, n), d.policyHasVoted(companyId, n, me), d.dividendPerShare(companyId, n),
      d.claimedDividend(companyId, n, me), d.policyBase(companyId, n).catch(() => 0n), gg.termGovernor(companyId, n),
    ]);
    const myWeight = await r.votingWeight(companyId, me, endTime);
    const owed = resolved && perShare > 0n ? await d.dividendOwed(companyId, n, me) : 0n;
    out.push({ term: n, endTime, voteEnd, resolved, dividendWeight: divW, reinvestWeight: reinvW, hasVoted, perShare, claimed, base, termGov, myWeight, owed });
  }
  return out;
}

const d = async (signer, m, ...a) => sendTx(await dv(signer), m, ...a);
export const openPolicyVote = (s, id, term) => d(s, "openPolicyVote", id, term);
export const votePolicy = (s, id, term, dividend) => d(s, "votePolicy", id, term, dividend);
export const resolvePolicyVote = (s, id, term) => d(s, "resolvePolicyVote", id, term);
export const claimDividend = (s, id, term) => d(s, "claimDividend", id, term);
export const claimDividendAsCorporation = (s, from, id, term) => d(s, "claimDividendAsCorporation", from, id, term);

// ------------------------------------------------------------------ shares and the share market

// Share NFTs an address holds (from Transfer events, confirmed by ownerOf).
export async function getMyShares(me, provider) {
  const r = await ra(provider);
  const ev = await queryFilterChunked(r, r.filters.Transfer(null, me));
  const ids = [...new Set(ev.map((e) => e.args[2]))];
  const rows = await Promise.all(ids.map(async (tokenId) => {
    const owner = await r.ownerOf(tokenId).catch(() => ZERO);
    if (owner.toLowerCase() !== me.toLowerCase()) return null;
    const [companyId, unlocksAt, compUnlock, listing] = await Promise.all([
      r.shareCompany(tokenId), r.shareUnlocksAt(tokenId), r.compensationUnlockTime(tokenId), r.listings(tokenId),
    ]);
    const lockedUntil = Number(compUnlock > unlocksAt ? compUnlock : unlocksAt);
    return { tokenId, companyId: Number(companyId), lockedUntil, listedAt: listing.seller !== ZERO ? listing.price : null };
  }));
  return rows.filter(Boolean).sort((a, b) => Number(a.tokenId - b.tokenId));
}

export async function getListings(provider, companyId = null) {
  const r = await ra(provider);
  const ev = await queryFilterChunked(r, r.filters.ShareListed());
  const ids = [...new Set(ev.map((e) => e.args[0]))];
  const rows = await Promise.all(ids.map(async (tokenId) => {
    const l = await r.listings(tokenId);
    if (l.seller === ZERO) return null;
    const [owner, cid] = await Promise.all([r.ownerOf(tokenId), r.shareCompany(tokenId)]);
    if (owner.toLowerCase() !== l.seller.toLowerCase()) return null;
    return { tokenId, seller: l.seller, price: l.price, companyId: Number(cid) };
  }));
  return rows.filter(Boolean).filter((x) => companyId === null || x.companyId === companyId).sort((a, b) => (a.price > b.price ? 1 : a.price < b.price ? -1 : 0));
}

export const listShare = async (s, tokenId, price) => sendTx(await ra(s), "listShare", tokenId, price);
export const cancelListing = async (s, tokenId) => sendTx(await ra(s), "cancelListing", tokenId);
export async function buyShare(signer, tokenId, price) {
  const r = await ra(signer);
  await ensureAllowance(signer, CONTRACT_ADDRESSES.InvestToken, await r.getAddress(), price);
  return sendTx(r, "buyShare", tokenId, price);
}

export async function getCorporateHoldings(companyId, companies, provider) {
  const r = await ra(provider);
  const corp = await r.corporateHolder(companyId);
  const counts = await Promise.all(companies.map((c) => r.companyShareCount(c.id, corp)));
  return companies.map((c, i) => ({ company: c, shares: counts[i] })).filter((h) => h.shares > 0n);
}

export async function getShareCount(companyId, holder, provider) {
  return (await ra(provider)).companyShareCount(companyId, holder);
}

// ------------------------------------------------------------------ verification

export async function getVerifier(provider) {
  const v = await ov(provider);
  const [paused, left, minBalance] = await Promise.all([v.paused(), v.remainingThisHour(), v.MIN_BALANCE()]);
  return { paused, left, minBalance };
}
export const verifySelf = async (signer) => sendTx(await ov(signer), "verifySelf");

// Where a wallet stands on the path "bid, then hold units", for the
// next-step guide: its open bids and holdings per listing, and the listing
// to suggest for a first bid (a small one with a round open now).
export async function getMyProgress(address, provider) {
  const r = await ra(provider);
  const ids = Array.from({ length: PROBE }, (_, i) => i);
  const rows = (await Promise.all(ids.map(async (id) => {
    const c = await r.companies(id);
    if (c.totalShares === 0n) return null;
    const [roundStart, slot, units] = await Promise.all([
      r.roundStart(id),
      address ? r.activeBidSlot(id, address) : 0n,
      address ? r.companyShareCount(id, address) : 0n,
    ]);
    return { id, name: c.name, totalShares: c.totalShares, sharesIssued: c.sharesIssued, currentRound: c.currentRound, finalized: c.finalized, roundEnd: c.roundEnd, roundStart, hasBid: slot !== 0n, units };
  }))).filter(Boolean);
  const prefer = [3, 4, 2, 5, 1, 6, 0, 7, 8, 9];
  const open = rows.filter((c) => !c.finalized);
  const byPref = (a, b) => (prefer.indexOf(a.id) + 1 || 99) - (prefer.indexOf(b.id) + 1 || 99);
  const suggest = [...open].sort(byPref).find((c) => auctionPhase(c) === "bidding") || [...open].sort(byPref)[0] || null;
  return { bid: rows.find((c) => c.hasBid) || null, held: rows.find((c) => c.units > 0n) || null, suggest };
}
