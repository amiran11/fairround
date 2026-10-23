// v9 test suite: normal behaviour + one attack test per audit finding
// (v8 Findings 23-40, and the independent v9 audit RA/GOV/CT findings).
// Runs against anvil with Arbitrum's limits (32M gas/tx, 24,576-byte code).
// INVEST runs CLOSED-LOOP here (no tradability), the strictest setting: v9
// must work whether or not INVEST is freely tradable.
import { ethers } from "ethers";
import fs from "fs";
const art = (n) => JSON.parse(fs.readFileSync(`./art9/${n}.art.json`));
const P = new ethers.JsonRpcProvider("http://127.0.0.1:8545", undefined, { cacheTimeout: -1 });
const E = (n) => ethers.parseEther(String(n));
// Wallet-style 50% gas buffer: balance-history writes cost more when the
// transaction lands in a later second than the block it was estimated on.
{ const est = P.estimateGas.bind(P); P.estimateGas = async (tx) => ((await est(tx)) * 15n) / 10n; }
const DAY = 86400, HOUR = 3600;
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "  PASS " : "  FAIL ") + m); c ? pass++ : fail++; };
const warp = async (s) => { await P.send("evm_increaseTime", [s]); await P.send("evm_mine", []); };
const now = async () => (await P.getBlock("latest")).timestamp;
const w = async (p) => (await p).wait();
async function reverts(fn, text) {
  try { await (await fn()).wait(); console.log("     (did not revert)"); return false; }
  catch (e) { const m = `${e.shortMessage} ${e.info?.error?.message || ""} ${e.reason || ""}`; if (m.includes(text)) return true; console.log("     got:", m.slice(0, 200)); return false; }
}
const S = await Promise.all((await P.listAccounts()).map((a) => P.getSigner(a.address)));
const owner = S[0];
const deploy = async (n, ...a) => { const c = await new ethers.ContractFactory(art(n).abi, art(n).bytecode, owner).deploy(...a); await c.waitForDeployment(); return c; };
const has = (c, fn) => c.interface.fragments.some((f) => f.name === fn);
const MAX = ethers.MaxUint256;
const setKey = async (GOV, id, gov, key) => { await w(GOV.connect(gov).setOperatingKey(id, key.address)); await w(GOV.connect(key).acceptOperatingKey(id)); };
const EXEC = 8 * DAY + 1; // 3-day vote + 5-day execution delay

async function system(nCitizens = 40) {
  const IT = await deploy("InvestToken", 1000);
  const RA = await deploy("RoundAuctionV9", await IT.getAddress());
  const GOV = await deploy("GovernanceV9", await RA.getAddress());
  const CT = await deploy("CompanyTreasuryV9", await IT.getAddress(), await RA.getAddress(), await GOV.getAddress());
  const DV = await deploy("CompanyDividendsV9", await IT.getAddress(), await RA.getAddress(), await GOV.getAddress());
  const [ra, ct, dv] = [await RA.getAddress(), await CT.getAddress(), await DV.getAddress()];
  await w(IT.setAuthorizedSink(ra, true)); await w(IT.setAuthorizedSink(ct, true)); await w(IT.setAuthorizedSink(dv, true));
  await w(RA.setGovernance(await GOV.getAddress())); await w(RA.setTreasury(ct)); await w(RA.setDividends(dv));
  const cits = S.slice(1, 1 + nCitizens);
  await w(IT.setVerifiedCitizens(cits.map((s) => s.address), true));
  for (const s of cits) { await w(IT.connect(s).claim()); await w(IT.connect(s).approve(ra, ethers.MaxUint256)); await w(IT.connect(s).approve(ct, ethers.MaxUint256)); }
  return { IT, RA, GOV, CT, DV, ra, ct, cits };
}
// one round: bids, wait, settle; then wait out the cooldown
async function round(RA, id, bids, { skipCooldown = true } = {}) {
  { const t = await now(); const st = await RA.roundStart(id); if (Number(st) > t) await warp(Number(st) - t + 1); }
  { const c0 = await RA.companies(id); if (BigInt(await now()) >= c0.roundEnd) await w(RA.settleRound(id, { gasLimit: 32_000_000 })); const st = await RA.roundStart(id); const t = await now(); if (Number(st) > t) await warp(Number(st) - t + 1); }
  for (const [s, amt, mp] of bids) await w(RA.connect(s).placeBid(id, E(amt), mp ?? MAX));
  const c = await RA.companies(id); const t = await now(); if (Number(c.roundEnd) > t) await warp(Number(c.roundEnd) - t + 1);
  const r = await w(RA.settleRound(id, { gasLimit: 32_000_000 }));
  if (skipCooldown) { const st = await RA.roundStart(id); const t2 = await now(); if (Number(st) > t2) await warp(Number(st) - t2 + 1); }
  return r;
}
async function elect(GOV, id, winner, voters = [winner]) {
  await w(GOV.openCandidacy(id));
  await w(GOV.connect(winner).declareCandidacy(id, "program"));
  await warp(5 * DAY + 1); await w(GOV.openVoting(id));
  for (const v of voters) await w(GOV.connect(v).vote(id, winner.address));
  await warp(3 * DAY + 1); await w(GOV.tallyRound(id));
}
// RA must hold at least: capital + income + host fees + active bids, per company list
async function raInvariant(IT, RA, ids) {
  let owed = await RA.hostFeeAccrued();
  for (const id of ids) {
    const c = await RA.companies(id); owed += c.capital + (await RA.reinvestableIncome(id));
    for (const b of await RA.getActiveBids(id)) owed += b.amount;
  }
  return (await IT.balanceOf(await RA.getAddress())) === owed;
}
// a company with `n` shares sold to the given holders (equal bids -> 1 share each per bid unit)
async function soldCompany(RA, id, holders, perHolder = 1, total = null) {
  const tot = total ?? holders.length;
  await w(RA.listCompany(id, `Co${id}`, tot, HOUR));
  await round(RA, id, holders.map((h) => [h, perHolder]));
}

// =================================================================
console.log("Sizes (Arbitrum limit 24,576 bytes)");
for (const n of ["RoundAuctionV9", "GovernanceV9", "CompanyTreasuryV9", "CompanyDividendsV9", "OpenVerifierV2", "FairRoundTimelock"]) {
  const len = (JSON.parse(fs.readFileSync(`./art9/${n}.art.json`)).bytecode.length - 2) / 2;
  const code = await P.getCode(await (await deploy(...(n === "RoundAuctionV9" ? [n, owner.address] : n === "GovernanceV9" ? [n, owner.address] : (n === "CompanyTreasuryV9" || n === "CompanyDividendsV9") ? [n, owner.address, owner.address, owner.address] : n === "OpenVerifierV2" ? [n, owner.address, owner.address] : [n, owner.address]))).getAddress());
  ok((code.length - 2) / 2 <= 24576, `${n}: ${(code.length - 2) / 2} bytes deployed`);
}

// =================================================================
console.log("\nRoundAuction v9: pricing, partial fills, rounding (F30, F40)");
{
  const { IT, RA, cits } = await system(10);
  const [a, b, c] = cits;
  await w(RA.listCompany(0, "Co", 1000, HOUR));
  // F40: lowest bid 10 = price. 19 -> floor 1 share (v8 ceil gave 2), pays 10, refund 9.
  const before = await IT.balanceOf(b.address);
  await round(RA, 0, [[a, 10], [b, 19]]);
  ok((await RA.companyShareCount(0, b.address)) === 1n, "F40: bid of 1.9x the price gets 1 share, not 2");
  ok(before - (await IT.balanceOf(b.address)) === E(10), "F40: pays exactly shares x price (10), remainder 9 refunded");
  ok((await RA.activeBidCount(0)) === 0n, "fully filled bids close");
  // F30: entitlements exceed shares offered -> pro rata, nothing stuck.
  await w(RA.listCompany(1, "Small", 10, HOUR));
  await round(RA, 1, [[a, 1], [b, 30], [c, 9]]); // price 1: ents 1,30,9 = 40 > 10 offered
  const got = [await RA.companyShareCount(1, a.address), await RA.companyShareCount(1, b.address), await RA.companyShareCount(1, c.address)];
  ok(got[0] + got[1] + got[2] === 10n && (await RA.companies(1)).finalized, `F30: pro-rata fill ${got.join("/")} of 10, company sold out`);
  ok(got[1] >= 7n && got[2] >= 2n, "F30: shares proportional to bids (30:9:1)");
  ok((await RA.activeBidCount(1)) === 0n && await raInvariant(IT, RA, [0, 1]), "sell-out refunds every remainder; INVEST accounting exact");
}

console.log("\nRoundAuction v9: clearing price, carry-over and cooldown withdrawal (F30, RA-1)");
{
  const { IT, RA, cits } = await system(5);
  const [a, b, c] = cits;
  await w(RA.listCompany(0, "Big", 1000, HOUR));
  // offer 150; a bids 1, b bids 500, c bids 50 but accepts at most 1 INVEST/share
  await round(RA, 0, [[a, 1], [b, 500], [c, 50, E(1)]], { skipCooldown: false });
  ok((await RA.companyShareCount(0, b.address)) === 150n, "oversubscribed: clearing price, the big bid takes the 150 shares on offer");
  ok((await RA.activeBidSlot(0, a.address)) !== 0n && (await RA.companyShareCount(0, a.address)) === 0n, "RA-1: the 1-INVEST bid didn't set the price; it waits, unfilled");
  ok((await RA.activeBidSlot(0, c.address)) !== 0n && (await RA.companyShareCount(0, c.address)) === 0n, "RA-2: a bid whose max price is below the clearing price waits, unfilled");
  ok(await reverts(async () => RA.connect(cits[3]).placeBid(0, E(5), MAX), "cooldown"), "F31: no bidding during the cooldown");
  const bal = await IT.balanceOf(c.address);
  await w(RA.connect(c).withdrawBid(0));
  ok((await IT.balanceOf(c.address)) - bal === E(50), "F30: an unfilled bid can be withdrawn in full during the cooldown");
  ok(await reverts(async () => RA.connect(cits[3]).withdrawBid(0), "no active bid"), "nothing to withdraw without a bid");
  await warp(HOUR + 1);
  await w(RA.connect(cits[3]).placeBid(0, E(5), MAX));
  ok(await reverts(async () => RA.connect(cits[3]).withdrawBid(0), "only during cooldown"), "no withdrawal while a round is open (no last-second price games)");
  ok(await raInvariant(IT, RA, [0]), "INVEST accounting exact");
}

console.log("\nRoundAuction v9: full book eviction (F31)");
{
  const { IT, RA, cits } = await system(102);
  await w(RA.listCompany(0, "Co", 100000, HOUR));
  for (let i = 0; i < 100; i++) await w(RA.connect(cits[i]).placeBid(0, E(2), MAX));
  ok(await reverts(async () => RA.connect(cits[100]).placeBid(0, E(2), MAX), "must beat the lowest"), "F31: full book, equal bid can't enter");
  const victim = cits[99];
  const vb = await IT.balanceOf(victim.address);
  await w(RA.connect(cits[100]).placeBid(0, E(3), MAX));
  ok((await RA.activeBidSlot(0, victim.address)) === 0n && (await IT.balanceOf(victim.address)) - vb === E(2), "F31: higher bid evicts the lowest (latest on ties), refunded in full");
  ok((await RA.activeBidCount(0)) === 100n && await raInvariant(IT, RA, [0]), "book stays at 100; accounting exact");
  // gas, worst case: 100 bidders, entitlements over the offer, pro rata to all 100
  await w(RA.listCompany(1, "Gas", 100000, HOUR));
  for (let i = 0; i < 99; i++) await w(RA.connect(cits[i]).placeBid(1, E(20 + i), MAX));
  await w(RA.connect(cits[99]).placeBid(1, E(2), MAX));
  const c = await RA.companies(1); await warp(Number(c.roundEnd) - (await now()) + 1);
  const r = await w(RA.settleRound(1, { gasLimit: 32_000_000 }));
  ok(r.gasUsed * 13n / 10n < 32_000_000n, `worst-case settlement, 100 bids and 150 shares: ${r.gasUsed} gas (< 32M with a 30% wallet buffer)`);
  ok((await RA.companies(1)).sharesIssued === 150n, "150 shares issued in the round, spread pro rata");
  ok(await raInvariant(IT, RA, [0, 1]), "accounting exact after the big settlement");
  // worst case 2: sell-out — 150 shares to 100 new holders, then 100 refunds
  await w(RA.listCompany(2, "Sellout", 150, HOUR));
  for (let i = 0; i < 99; i++) await w(RA.connect(cits[i]).placeBid(2, E(5 + i), MAX));
  await w(RA.connect(cits[101]).placeBid(2, E(2), MAX));
  const c2 = await RA.companies(2); await warp(Number(c2.roundEnd) - (await now()) + 1);
  const r2 = await w(RA.settleRound(2, { gasLimit: 32_000_000 }));
  ok((await RA.companies(2)).finalized && r2.gasUsed * 13n / 10n < 32_000_000n, `worst-case sell-out with 100 refunds: ${r2.gasUsed} gas (< 32M with a 30% wallet buffer)`);
  ok(await raInvariant(IT, RA, [0, 1, 2]), "accounting exact after sell-out");
}

console.log("\nRoundAuction v9: invest, listings, locks (F24, F38, F39, per-share lock)");
{
  const { IT, RA, GOV, CT, cits } = await system(12);
  const [g, k, x, y] = cits;
  ok(!has(RA, "governorListShare"), "F24: no fixed-price corporate share sales");
  await soldCompany(RA, 0, cits.slice(0, 10), 5);
  { const o = await RA.ownerOf(0n); const holder = cits.find((s) => s.address === o);
    ok(await reverts(async () => RA.connect(holder).listShare(0n, E(5)), "still locked"), "share locked for 7 days from its own mint");
    ok((await RA.shareUnlocksAt(0n)) === (await RA.shareMintedAt(0n)) + 7n * 86400n, "unlock time = own mint time + 7 days"); }
  await warp(DAY + 1);
  await elect(GOV, 0, g, cits.slice(0, 10));
  await setKey(GOV, 0, g, k);
  ok(!has(RA, "invest"), "CT-1: no governor-alone investment (only the treasury after a vote)");
  ok(await reverts(async () => CT.connect(k).proposeInvest(0, 0, E(1), E(1)), "invest in itself"), "F38: a company can't reinvest in itself");
  // per-share lock: shares minted now are locked 7 days from their own mint
  const tid = 0n;
  await warp(7 * DAY + 1);
  const t0 = (await RA.shareCompany(tid), tid);
  const ownerOf0 = await RA.ownerOf(t0); const seller = cits.find((s) => s.address === ownerOf0);
  await w(RA.connect(seller).listShare(t0, E(5)));
  await w(RA.connect(seller).transferFrom(seller.address, x.address, t0));
  ok((await RA.listings(t0)).seller === ethers.ZeroAddress, "F39: listing deleted when the share moves");
  await w(RA.connect(x).transferFrom(x.address, seller.address, t0));
  ok(await reverts(async () => RA.connect(y).buyShare(t0, E(5)), "not listed"), "F39: moving it back does not revive the old listing");
  await w(RA.connect(seller).listShare(t0, E(5)));
  ok(await reverts(async () => RA.connect(y).buyShare(t0, E(4)), "price above max"), "buyer protected by maxPrice");
  const sb = await IT.balanceOf(seller.address);
  await w(RA.connect(y).buyShare(t0, E(5)));
  ok((await RA.ownerOf(t0)) === y.address && (await IT.balanceOf(seller.address)) - sb === E(5), "listed share sells; seller paid");
  ok(await reverts(async () => RA.listCompany(2n ** 64n, "X", 10, HOUR), "id too large"), "company ids limited to 64 bits");
  ok(await reverts(async () => RA.connect(y).transferFrom(y.address, await RA.corporateHolder(0), t0), "send shares to a company"), "RA-3: nobody can gift shares to a company (own-share voting, quorum griefing)");
}

// =================================================================
console.log("\nGovernance v9: candidacy period and winner quorum (F27)");
{
  const { RA, GOV, cits } = await system(12);
  await soldCompany(RA, 0, cits.slice(0, 10), 1);
  ok(await reverts(async () => GOV.openCandidacy(0), "50% issued at snapshot"), "F34: shares minted less than a day ago don't count for the snapshot");
  await warp(DAY + 1);
  await w(GOV.openCandidacy(0));
  await w(GOV.connect(cits[0]).declareCandidacy(0, "solo"));
  ok(await reverts(async () => GOV.openVoting(0), "not over"), "F27: voting can't open before the 5-day candidacy period ends");
  await warp(5 * DAY + 1); await w(GOV.openVoting(0));
  await w(GOV.connect(cits[0]).vote(0, cits[0].address)); // 1 of 10 shares = 10% < 20%
  await warp(3 * DAY + 1); await w(GOV.tallyRound(0));
  ok((await GOV.companyGovernor(0)) === ethers.ZeroAddress, "F27: sole candidate with 10% of shares voting does NOT win");
  await w(GOV.connect(cits[0]).vote(0, cits[0].address)); // new round id, vote again
  await w(GOV.connect(cits[1]).vote(0, cits[0].address));
  await warp(3 * DAY + 1); await w(GOV.tallyRound(0));
  ok((await GOV.companyGovernor(0)) === cits[0].address, "with 20% of issued shares voting, the candidate wins");
}

console.log("\nGovernance v9: two failed rounds reset; stake snapshot (F28, F34)");
{
  const { RA, GOV, cits } = await system(30);
  await soldCompany(RA, 0, cits.slice(0, 20), 1);
  await warp(DAY + 1);
  await w(GOV.openCandidacy(0));
  // F28/F34: a wallet that received shares after the snapshot has no stake
  ok(await reverts(async () => GOV.connect(cits[25]).declareCandidacy(0, "p"), "no shares at snapshot"), "F28: no stake at the snapshot, no candidacy");
  for (let i = 0; i < 20; i++) await w(GOV.connect(cits[i]).declareCandidacy(0, "p"));
  ok((await GOV.candidateCount(0)) === 20n, "20 candidates on the ballot");
  await w(GOV.connect(cits[5]).withdrawCandidacy(0));
  ok((await GOV.candidateCount(0)) === 19n, "candidates can withdraw");
  await warp(5 * DAY + 1); await w(GOV.openVoting(0));
  await warp(3 * DAY + 1); await w(GOV.tallyRound(0)); // no votes: failed 1
  await warp(3 * DAY + 1); await w(GOV.tallyRound(0)); // failed 2 -> reset
  ok((await GOV.election(0)).id === 0n, "F28: after two failed rounds the election closes");
  await w(GOV.openCandidacy(0));
  ok((await GOV.candidateCount(0)) === 0n, "a fresh candidacy period starts with an empty slate");
}

console.log("\nGovernance v9: term end never overwritten; recall (F29)");
{
  const { RA, GOV, cits } = await system(12);
  await soldCompany(RA, 0, cits.slice(0, 10), 1);
  await warp(DAY + 1);
  await elect(GOV, 0, cits[0], cits.slice(0, 5));
  const end1 = await GOV.governorTermEnd(0);
  await warp(30 * DAY + 1);
  await elect(GOV, 0, cits[1], cits.slice(0, 5)); // openCandidacy closes term 1
  ok((await GOV.termEndedAt(0, 1)) === end1 && (await GOV.termNumber(0)) === 2n, "F29: term 1 end survives re-election");
  // recall term 2
  await w(GOV.connect(cits[2]).openRecall(0));
  for (let i = 2; i < 6; i++) await w(GOV.connect(cits[i]).voteRecall(0, true)); // 4/10 = 40% turnout
  await warp(3 * DAY + 1); await w(GOV.resolveRecall(0));
  ok(!(await GOV.governorActive(0)) && (await GOV.termEndedAt(0, 2)) > 0n, "recall with 40% turnout and majority ends the term");
  const ended = await GOV.termEndedAt(0, 2);
  await warp(DAY); await elect(GOV, 0, cits[3], cits.slice(0, 5));
  ok((await GOV.termEndedAt(0, 2)) === ended, "F29: recalled term's end stays recorded after the next election");
}

// =================================================================
console.log("\nTreasury v9: no free exits (F23, F26)");
{
  const { IT, RA, GOV, CT, ct, cits } = await system(12);
  ok(!has(CT, "withdrawToken") && !has(CT, "governorOfferInvest") && !has(CT, "buyInvest"), "F23: no free withdrawal, no fixed-price INVEST sale, no market");
  // company 11 replay: one shareholder who is also governor
  await w(RA.listCompany(11, "One", 1, HOUR)); await round(RA, 11, [[cits[0], 1000]]);
  await warp(DAY + 1);
  await elect(GOV, 11, cits[0]);
  await setKey(GOV, 11, cits[0], cits[1]);
  const cap = (await RA.companies(11)).capital;
  ok(await reverts(async () => CT.connect(cits[1]).proposePayment(11, await IT.getAddress(), 0, cits[2].address, cap), "over 5%"), "CT-3: no proposal can take more than 5% of a bucket per term");
  const pid = await CT.nextProposalId();
  await w(CT.connect(cits[1]).proposePayment(11, await IT.getAddress(), 0, cits[2].address, cap / 25n));
  ok(await reverts(async () => CT.connect(cits[0]).vote(pid, true), "proposer can't vote"), "F26: governor can't vote on own proposal");
  ok(await reverts(async () => CT.connect(cits[1]).vote(pid, true), "proposer can't vote"), "F26: operating key can't vote");
  ok((await CT.eligibleShares(pid)) === 0n, "F23 replay: sole shareholder-governor's shares don't count toward quorum");
  await warp(EXEC); await w(CT.executePayment(pid));
  ok((await RA.companies(11)).capital === cap && (await IT.balanceOf(cits[2].address)) === E(1000), "F23 replay: capital stays, nothing paid out");
  ok(await reverts(async () => CT.connect(cits[1]).proposePayment(11, await IT.getAddress(), 0, cits[0].address, 1), "not allowed"), "F26: governor can't be the recipient");
}

console.log("\nTreasury v9: payment by vote, snapshot, quorum, failed transfer (F26, F34)");
{
  const { IT, RA, GOV, CT, ct, cits } = await system(14);
  const usdc = await deploy("BlockingToken"); const u = await usdc.getAddress();
  await w(CT.setApprovedToken(u, true));
  await soldCompany(RA, 0, cits.slice(0, 10), 1);
  await warp(DAY + 1);
  await elect(GOV, 0, cits[0], cits.slice(0, 5));
  await setKey(GOV, 0, cits[0], cits[10]);
  await w(usdc.mint(owner.address, 1000n)); await w(usdc.approve(ct, 1000n)); await w(CT.depositToken(0, u, 1000n));
  ok((await CT.balanceOf(0, u, 0)) === 1000n, "deposit credited to capital");
  // small payment (3%): yes votes must reach 20% of eligible (9 shares) -> 2 yes
  let pid = await CT.nextProposalId();
  await w(CT.connect(cits[10]).proposePayment(0, u, 0, cits[11].address, 30n));
  ok((await CT.proposals(pid)).quorumBps === 2000n, "3% payment needs 20% quorum");
  await w(CT.connect(cits[1]).vote(pid, true)); await w(CT.connect(cits[2]).vote(pid, true));
  await warp(3 * DAY + 1);
  ok(await reverts(async () => CT.executePayment(pid), "execution delay"), "approved payment waits 5 days (longer than a recall vote)");
  await warp(5 * DAY);
  await w(CT.executePayment(pid));
  ok((await usdc.balanceOf(cits[11].address)) === 30n, "approved payment executed after the delay");
  // second payment: cumulative 3% + 2% = 5% of the term's base, the cap; then a blocked recipient
  pid = await CT.nextProposalId();
  await w(CT.connect(cits[10]).proposePayment(0, u, 0, cits[12].address, 20n));
  ok((await CT.proposals(pid)).quorumBps === 2000n, "with the 5% cap every proposal needs the 20% quorum");
  ok(await reverts(async () => CT.connect(cits[10]).proposePayment(0, u, 0, cits[13].address, 1n), "over 5%"), "CT-3: per-term cap of 5% of the bucket, counted cumulatively (splitting doesn't help)");
  for (let i = 1; i < 5; i++) await w(CT.connect(cits[i]).vote(pid, true));
  await w(usdc.setBlocked(cits[12].address));
  await warp(EXEC); await w(CT.executePayment(pid));
  ok((await CT.proposals(pid)).status === 3n && (await CT.balanceOf(0, u, 0)) === 970n, "blocked recipient: transfer fails, money returns to the company");
}

console.log("\nTreasury v9: snapshot one day before the proposal (F34)");
{
  const { IT, RA, GOV, CT, cits } = await system(14);
  await soldCompany(RA, 0, cits.slice(0, 10), 1);
  await warp(DAY + 1);
  await elect(GOV, 0, cits[0], cits.slice(0, 5));
  await setKey(GOV, 0, cits[0], cits[10]);
  await warp(7 * DAY);
  // a renter buys a share and votes right away
  const tid = 3n;
  const ownerAddr = await RA.ownerOf(tid); const seller = cits.find((s) => s.address === ownerAddr);
  await w(RA.connect(seller).transferFrom(seller.address, cits[13].address, tid));
  const pid = await CT.nextProposalId();
  await w(CT.connect(cits[10]).proposePayment(0, await IT.getAddress(), 0, cits[11].address, E(1) / 4n));
  ok(await reverts(async () => CT.connect(cits[13]).vote(pid, true), "no shares at snapshot"), "F34: shares bought minutes before the proposal can't vote");
  ok(await reverts(async () => CT.connect(seller).vote(pid, true), "no shares at snapshot"), "and the seller who no longer holds them can't vote either");
}

console.log("\nTreasury v9: sales by vote + sealed-bid auction with reserve (F25, F33, F35)");
{
  const { IT, RA, GOV, CT, ct, cits } = await system(14);
  const usdc = await deploy("BlockingToken"); const u = await usdc.getAddress(); const inv = await IT.getAddress();
  await w(CT.setApprovedToken(u, true));
  await soldCompany(RA, 0, cits.slice(0, 10), 10);
  await warp(DAY + 1);
  await elect(GOV, 0, cits[0], cits.slice(0, 5));
  await setKey(GOV, 0, cits[0], cits[10]);
  const cap0 = (await RA.companies(0)).capital;
  // sell 2 INVEST of capital (~99) for USDC, reserve 1000
  let pid = await CT.nextProposalId();
  await w(CT.connect(cits[10]).proposeSale(0, inv, 0, E(2), u, 1000n));
  ok((await RA.companies(0)).capital === cap0 - E(2), "asset reserved while the vote runs");
  const pidB = pid + 1n, pidC = pid + 2n;   // proposed now: one will go unsold, one rejected
  await w(CT.connect(cits[10]).proposeSale(0, inv, 0, E(1), u, 100n));
  await w(CT.connect(cits[10]).proposeSale(0, inv, 0, E(1), u, 100n));
  ok(await reverts(async () => CT.connect(cits[10]).proposeSale(0, inv, 0, E(1), u, 100n), "over 5%"), "CT-M2: sales count toward the 5%-per-term cap");
  ok((await CT.proposals(pidB)).quorumBps === 2000n, "sales need the 20% quorum");
  for (let i = 1; i < 5; i++) { await w(CT.connect(cits[i]).vote(pid, true)); await w(CT.connect(cits[i]).vote(pidB, true)); }
  await warp(EXEC); await w(CT.startAuction(pid));
  const a = await CT.auctions(pid);
  ok(a.deposit === 100n, "F35: bid deposit is 10% of the reserve");
  for (const s of [cits[11], cits[12], cits[13]]) { await w(usdc.mint(s.address, 10000n)); await w(usdc.connect(s).approve(ct, 10000n)); }
  const salt = ethers.id("s");
  await w(CT.connect(cits[11]).commitBid(pid, await CT.commitHashFor(pid, 1500n, salt, cits[11].address)));
  await w(CT.connect(cits[12]).commitBid(pid, await CT.commitHashFor(pid, 900n, salt, cits[12].address)));
  await w(CT.connect(cits[13]).commitBid(pid, await CT.commitHashFor(pid, 4000n, salt, cits[13].address)));
  await warp(2 * DAY + 1);
  await w(CT.connect(cits[11]).revealBid(pid, 1500n, salt));
  ok(await reverts(async () => CT.connect(cits[12]).revealBid(pid, 900n, salt), "below reserve"), "F25: bids below the reserve can't win");
  // cits[13] takes the "last look" and doesn't reveal: loses deposit
  await warp(DAY + 1); await w(CT.settleAuction(pid));
  ok((await CT.hostFeeAccrued(u)) === 15n, "1% host fee taken from the winning bid (15 of 1,500)");
  ok((await CT.balanceOf(0, u, 0)) === 1485n + 200n, "F33: proceeds after fee (1,485) + forfeited deposits (2x100) go to CAPITAL");
  ok((await CT.balanceOf(0, u, 1)) === 0n && (await RA.reinvestableIncome(0)) === 0n, "F33: capital never becomes reinvestable income");
  const ib = await IT.balanceOf(cits[11].address);
  await w(CT.connect(cits[11]).claimAuction(pid));
  ok((await IT.balanceOf(cits[11].address)) - ib === E(2) && (await usdc.balanceOf(cits[11].address)) === 10000n - 1500n, "winner gets the asset and the deposit back");
  ok(await reverts(async () => CT.connect(cits[1]).withdrawHostFees(u), "not host"), "only the host collects the fee");
  await w(CT.withdrawHostFees(u));
  ok((await usdc.balanceOf(owner.address)) === 15n, "host collected the 15");
  // unsold: no valid bid -> asset returns
  await w(CT.startAuction(pidB));
  await warp(3 * DAY + 1); await w(CT.settleAuction(pidB));
  ok((await RA.companies(0)).capital === cap0 - E(2) - E(1), "F25: unsold asset returns to the company");
  // rejected sale returns too
  await w(CT.startAuction(pidC));
  ok((await CT.proposals(pidC)).status === 1n && (await RA.companies(0)).capital === cap0 - E(2), "rejected sale: asset returns");
}

console.log("\nTreasury v9: proposals die with the term; corporate voting");
{
  const { IT, RA, GOV, CT, cits } = await system(14);
  await soldCompany(RA, 0, cits.slice(0, 10), 1);
  await warp(DAY + 1);
  await elect(GOV, 0, cits[0], cits.slice(0, 5));
  await setKey(GOV, 0, cits[0], cits[10]);
  await warp(25 * DAY);
  ok(await reverts(async () => CT.connect(cits[10]).proposePayment(0, await IT.getAddress(), 0, cits[11].address, E(1) / 4n), "outlast the term"), "a vote must finish inside the term");
  // recall kills a pending payment
  const { RA: RA2, GOV: GOV2, CT: CT2, IT: IT2, cits: c2 } = await system(14);
  await soldCompany(RA2, 0, c2.slice(0, 10), 1);
  await warp(DAY + 1);
  await elect(GOV2, 0, c2[0], c2.slice(0, 5));
  await setKey(GOV2, 0, c2[0], c2[10]);
  const pid = await CT2.nextProposalId();
  await w(CT2.connect(c2[10]).proposePayment(0, await IT2.getAddress(), 0, c2[11].address, E(1) / 4n));
  for (let i = 1; i < 5; i++) await w(CT2.connect(c2[i]).vote(pid, true));
  await w(GOV2.connect(c2[1]).openRecall(0));
  for (let i = 1; i < 6; i++) await w(GOV2.connect(c2[i]).voteRecall(0, true));
  await warp(3 * DAY + 1); await w(GOV2.resolveRecall(0));
  await w(CT2.executePayment(pid));
  ok((await CT2.proposals(pid)).status === 1n && (await IT2.balanceOf(c2[11].address)) === E(1000), "recall voids a pending approved payment");
}


console.log("\nCorporate path: reinvest vote -> invest vote -> compensation -> corporate votes; dividends");
{
  const { IT, RA, GOV, CT, DV, cits } = await system(40);
  const inv = await IT.getAddress();
  const holders0 = cits.slice(0, 30);
  await soldCompany(RA, 0, holders0, 1000);              // capital ~ 29,700
  await warp(DAY + 1);
  await elect(GOV, 0, cits[0], holders0.slice(0, 10));
  await warp(30 * DAY + 1);
  await w(DV.openPolicyVote(0, 1));
  ok(await reverts(async () => DV.connect(cits[0]).votePolicy(0, 1, false), "governor can't vote"), "CT-1: the term's governor can't vote on its policy");
  await w(DV.connect(cits[1]).votePolicy(0, 1, false));  // reinvest, 1 of 29
  await warp(3 * DAY + 1);
  const cap = (await RA.companies(0)).capital;
  await w(DV.resolvePolicyVote(0, 1));
  ok((await RA.reinvestableIncome(0)) === 0n && (await RA.companies(0)).capital === cap, "CT-1: one shareholder (3%) can't move capital to income — 20% quorum");
  // term 2, then a proper reinvest vote at its end
  await elect(GOV, 0, cits[2], holders0.slice(0, 10));
  await warp(30 * DAY + 1);
  await w(DV.openPolicyVote(0, 2));
  for (let i = 3; i < 10; i++) await w(DV.connect(cits[i]).votePolicy(0, 2, false));
  await warp(3 * DAY + 1);
  await w(DV.resolvePolicyVote(0, 2));
  const inc = await RA.reinvestableIncome(0);
  ok(inc === cap / 100n && (await RA.companies(0)).capital === cap - inc, "shareholders' reinvest vote (7 of 29) moves 1% of capital to income");
  // term 3: invest by vote
  await elect(GOV, 0, cits[2], holders0.slice(0, 10));
  await setKey(GOV, 0, cits[2], cits[35]);
  await w(RA.listCompany(1, "Target", 100, 10 * DAY));
  const useAmt = (inc / 20n / E(1)) * E(1); // per-term cap: 5% of the income bucket
  ok(await reverts(async () => CT.connect(cits[35]).proposeInvest(0, 1, inc, E(1)), "over 5%"), "investing is capped at 5% of income per term too");
  const pid0 = await CT.nextProposalId();
  await w(CT.connect(cits[35]).proposeInvest(0, 1, useAmt, E(1)));
  ok((await CT.proposals(pid0)).quorumBps === 2000n, "a 5%-of-income investment needs the 20% quorum");
  for (let i = 3; i < 15; i++) await w(CT.connect(cits[i]).vote(pid0, true)); // 12 of 29
  await warp(EXEC);
  ok(await reverts(async () => CT.connect(cits[3]).executeInvest(pid0), "not operating key"), "only the operating key picks when to place the approved bid");
  await w(CT.connect(cits[35]).executeInvest(pid0));
  ok((await CT.proposals(pid0)).status === 6n && (await RA.corporateBidGovernor(1, await RA.corporateHolder(0))) === cits[2].address, "approved investment placed; governor recorded with the bid");
  await w(RA.connect(cits[36]).placeBid(1, E(1), MAX));
  await round(RA, 1, []);
  const corpShares = await RA.companyShareCount(1, await RA.corporateHolder(0));
  const comp = await RA.companyShareCount(1, cits[2].address);
  ok(corpShares + comp === useAmt / E(1), `corporate bid filled: ${corpShares} shares at 1 INVEST each (+${comp} compensation)`);
  await warp(DAY);
  // company 1 election won with company 0's corporate votes (corporate shares out of the denominator)
  await w(GOV.openCandidacy(1));
  await w(GOV.connect(cits[36]).declareCandidacy(1, "p"));
  await warp(5 * DAY + 1); await w(GOV.openVoting(1));
  ok(await reverts(async () => GOV.connect(cits[35]).voteAsCorporation(0, 1, cits[35].address), "for yourself"), "GOV-N1: a governor's key can't vote company shares for itself");
  ok(await reverts(async () => GOV.connect(cits[35]).voteAsCorporation(0, 1, cits[2].address), "for yourself"), "GOV-N1: nor for the holding company's governor");
  await w(GOV.connect(cits[35]).voteAsCorporation(0, 1, cits[36].address));
  await warp(3 * DAY + 1); await w(GOV.tallyRound(1));
  ok((await GOV.companyGovernor(1)) === cits[36].address, "corporate shares vote in elections through the holder's governor");
  await setKey(GOV, 1, cits[36], cits[37]);
  const pid = await CT.nextProposalId();
  const cap1 = (await RA.companies(1)).capital;
  await w(CT.connect(cits[37]).proposePayment(1, inv, 0, cits[38].address, cap1 / 100n));
  await w(CT.connect(cits[35]).voteAsCorporation(0, pid, true));
  await warp(EXEC); await w(CT.executePayment(pid));
  ok((await CT.proposals(pid)).status === 2n, "corporate shares vote on payments through the holder's governor");
  // round 3: a holding company can field a stakeless candidate and recall a governor
  await w(GOV.connect(cits[35]).openRecallAsCorporation(0, 1));
  await w(GOV.connect(cits[35]).voteRecallAsCorporation(0, 1, true));
  await warp(3 * DAY + 1); await w(GOV.resolveRecall(1));
  ok(!(await GOV.governorActive(1)), "R3: a holding company's governor can open and carry a recall with its shares");
  await warp(DAY + 1);
  await w(GOV.openCandidacy(1));
  await w(GOV.connect(cits[39]).declareCandidacy(1, "nominee of the holding company"));
  ok((await GOV.candidates(1, 2, cits[39].address)).registered, "R3: where companies hold shares, a stakeless candidate can stand (holding companies can then nominate)");
  // dividends for company 0, term 3
  await warp(30 * DAY);
  await w(DV.openPolicyVote(0, 3));
  for (let i = 3; i < 10; i++) await w(DV.connect(cits[i]).votePolicy(0, 3, true));
  await warp(3 * DAY + 1);
  await w(DV.resolvePolicyVote(0, 3));
  const owed = await DV.dividendOwed(0, 3, cits[3].address);
  const b = await IT.balanceOf(cits[3].address);
  await w(DV.connect(cits[3]).claimDividend(0, 3));
  ok(owed > 0n && (await IT.balanceOf(cits[3].address)) - b === owed, "dividend vote pays shareholders pro rata at the record date");
  ok(await reverts(async () => DV.connect(cits[3]).claimDividend(0, 3), "already claimed"), "no double claim");
  ok(await raInvariant(IT, RA, [0, 1]), "INVEST accounting exact across the whole corporate path");
}

// =================================================================
console.log("\nGovernor compensation: cumulative 1%, time lock (RA-4, GOV-5)");
{
  const IT = await deploy("InvestToken", 1000);
  const RA = await deploy("RoundAuctionV9", await IT.getAddress());
  const GOV = await deploy("GovernanceV9", await RA.getAddress());
  await w(RA.setGovernance(await GOV.getAddress())); await w(RA.setTreasury(owner.address)); // owner plays the treasury
  await w(IT.setAuthorizedSink(await RA.getAddress(), true));
  const [g, x, y] = [S[1], S[2], S[3]];
  await w(IT.setVerifiedCitizens([owner.address, x.address, y.address], true));
  for (const s of [owner, x, y]) { await w(IT.connect(s).claim()); await w(IT.connect(s).approve(await RA.getAddress(), MAX)); }
  await w(RA.listCompany(0, "Holder", 10, HOUR));
  await w(RA.listCompany(1, "Target", 1000, HOUR));
  // corporate bid of 150 at max 1/share: filled 75 + 75 over two rounds -> 1% of 150 = 1 comp share
  await w(RA.placeCorporateBid(0, 1, E(150), E(1), g.address));
  await w(IT.transfer(await RA.getAddress(), E(150)));
  await w(RA.connect(x).placeBid(1, E(1), MAX));
  const c = await RA.companies(1); await warp(Number(c.roundEnd) - (await now()) + 1);
  await w(RA.settleRound(1));
  const corp = await RA.corporateHolder(0);
  const r1 = (await RA.companyShareCount(1, corp)) + (await RA.companyShareCount(1, g.address));
  ok(r1 === 150n && (await RA.companyShareCount(1, g.address)) === 1n, "RA-4: 1% compensation counted on the cumulative fill (150 shares -> 1)");
  let compId = null;
  for (let t = 0n; t < (await RA.nextTokenId()); t++) if ((await RA.ownerOf(t)) === g.address) compId = t;
  await warp(8 * DAY);
  ok(await reverts(async () => RA.connect(g).transferFrom(g.address, y.address, compId), "comp shares locked"), "GOV-5: compensation locked for 60 days by time (recalls can't shorten it)");
  await warp(53 * DAY);
  await w(RA.connect(g).transferFrom(g.address, y.address, compId));
  ok((await RA.ownerOf(compId)) === y.address, "unlocked after 60 days");
  ok(await reverts(async () => RA.connect(x).placeCorporateBid(0, 1, E(1), E(1), g.address), "not treasury"), "only the treasury can place corporate bids");
}

console.log("\nIndependent v9 audit: attacks that must fail");
{ // RA-1: a 1-INVEST anchor can't pin the price
  const { RA, cits } = await system(8);
  const [h1, h2, h3, h4, h5, att, att2, anchor] = cits;
  await w(RA.listCompany(0, "Co", 1500, HOUR));
  await round(RA, 0, [[h1, 500], [h2, 500], [h3, 500], [h4, 500], [h5, 500]]);
  const r = await round(RA, 0, [[att, 1000], [att2, 1000], [anchor, 1]]);
  const ev = r.logs.map((l) => { try { return RA.interface.parseLog(l); } catch { return null; } }).find((x) => x?.name === "RoundSettled");
  ok(ev.args.price > E(6), `RA-1: oversubscribed round clears at ${ethers.formatEther(ev.args.price).slice(0, 6)} INVEST/share, not the anchor's 1`);
  ok((await RA.companyShareCount(0, anchor.address)) === 0n, "RA-1: the anchor buys nothing");
  ok((await RA.companyShareCount(0, att.address)) + (await RA.companyShareCount(0, att2.address)) <= 150n, "RA-1: attacker gets at most the 150 shares on offer this round, at the clearing price");
}
{ // RA-2: per-share price limit
  const { RA, cits } = await system(3);
  await w(RA.listCompany(0, "Co", 1000, HOUR));
  const r = await round(RA, 0, [[cits[0], 5], [cits[1], 500, E(2)]]);
  const ev = r.logs.map((l) => { try { return RA.interface.parseLog(l); } catch { return null; } }).find((x) => x?.name === "RoundSettled");
  ok(ev.args.price <= E(2) && (await RA.companyShareCount(0, cits[1].address)) > 0n, `RA-2/RA-N2: a capped bid sets the floor at its own cap and buys (price ${ethers.formatEther(ev.args.price)})`);
}
{ // RA-N1: squatting the full book with bids that never buy is no longer free
  const { IT, RA, cits } = await system(102);
  await w(RA.listCompany(0, "Co", 100000, HOUR));
  for (let i = 0; i < 100; i++) await w(RA.connect(cits[i]).placeBid(0, E(1000), E(1)));
  await w(RA.connect(cits[100]).placeBid(0, E(2), E(2)));
  ok((await RA.activeBidCount(0)) === 100n && (await RA.activeBidSlot(0, cits[100].address)) !== 0n, "RA-N1: a 2-INVEST bid evicts a 1000-INVEST bid capped at 1/share (eviction by effective price)");
  const c = await RA.companies(0); await warp(Number(c.roundEnd) - (await now()) + 1);
  await w(RA.settleRound(0, { gasLimit: 32_000_000 }));
  ok((await RA.companies(0)).sharesIssued === 150n, "RA-N1: squat bids are eligible at the floor and buy (150 shares issued, none blocked)");
  ok(await raInvariant(IT, RA, [0]), "accounting exact");
}
{ // GOV-1: shares lent for one second at the snapshot weigh nothing
  const { RA, GOV, cits } = await system(12);
  await soldCompany(RA, 0, cits.slice(0, 10), 1);
  await warp(8 * DAY);
  const att = cits[11];
  const ids = [0n, 1n, 2n];
  const lenders = [];
  let Tl = 0;
  for (const t of ids) {
    const o = await RA.ownerOf(t); const s = cits.find((x) => x.address === o); lenders.push(s);
    const rc = await w(RA.connect(s).transferFrom(o, att.address, t, { gasLimit: 500000 }));
    Tl = (await P.getBlock(rc.blockNumber)).timestamp;
  }
  await P.send("evm_setNextBlockTimestamp", [Tl + 1]);
  for (let i = 0; i < 3; i++) await w(RA.connect(att).transferFrom(att.address, lenders[i].address, ids[i]));
  await P.send("evm_setNextBlockTimestamp", [Tl + DAY]);
  await w(GOV.openCandidacy(0));
  const snap = (await GOV.election(0)).snapshot;
  ok((await RA.shareCountAt(0, att.address, snap)) === 3n && (await RA.votingWeight(0, att.address, snap)) === 0n, "GOV-1: borrower held 3 at the snapshot second but weighs 0");
  ok(await reverts(async () => GOV.connect(att).declareCandidacy(0, "p"), "no shares at snapshot"), "GOV-1: borrower can't stand (or vote)");
}
{ // GOV-2: puppets can't fill the ballot against a majority
  const { RA, GOV, cits } = await system(50);
  await soldCompany(RA, 0, cits.slice(0, 50), 1);
  await warp(DAY + 1);
  await w(GOV.openCandidacy(0));
  for (let i = 0; i < 20; i++) await w(GOV.connect(cits[i]).declareCandidacy(0, "puppet"));
  await w(GOV.connect(cits[20]).declareCandidacy(0, "honest"));
  ok(!(await GOV.candidates(0, 1, cits[20].address)).onBallot, "full ballot: a newcomer with equal support waits");
  for (let i = 21; i < 24; i++) await w(GOV.connect(cits[i]).nominate(0, cits[20].address));
  ok((await GOV.candidates(0, 1, cits[20].address)).onBallot, "GOV-2: three nominations put the honest candidate on the ballot, displacing a puppet");
  ok(await reverts(async () => GOV.connect(cits[20]).withdrawCandidacy(0), "others nominated you"), "GOV-N2: a candidate others nominated can't withdraw and waste their nominations");
  await w(GOV.connect(cits[0]).withdrawCandidacy(0));
  ok(!(await GOV.candidates(0, 1, cits[0].address)).registered, "a candidate nobody else backed can still withdraw");
}
{ // GOV-7: against all
  const { RA, GOV, cits } = await system(12);
  await soldCompany(RA, 0, cits.slice(0, 10), 1);
  await warp(DAY + 1);
  await w(GOV.openCandidacy(0));
  await w(GOV.connect(cits[0]).declareCandidacy(0, "solo"));
  await warp(5 * DAY + 1); await w(GOV.openVoting(0));
  for (let i = 0; i < 3; i++) await w(GOV.connect(cits[i]).vote(0, cits[0].address));
  for (let i = 3; i < 7; i++) await w(GOV.connect(cits[i]).vote(0, ethers.ZeroAddress));
  await warp(3 * DAY + 1); await w(GOV.tallyRound(0));
  ok((await GOV.companyGovernor(0)) === ethers.ZeroAddress, "GOV-7: a lone candidate loses to 'against all'");
}
{ // GOV-3 + CT-5: recall can't be blocked by an empty recall; nobody is made an operating key against their will
  const { RA, GOV, CT, IT, cits } = await system(12);
  await soldCompany(RA, 0, cits.slice(0, 10), 1);
  await warp(DAY + 1);
  await elect(GOV, 0, cits[0], cits.slice(0, 5));
  await w(GOV.connect(cits[1]).openRecall(0));       // ally opens, nobody votes
  await warp(3 * DAY + 1);
  await w(GOV.connect(cits[2]).openRecall(0));
  ok((await GOV.lastRecallId(0)) === 2n, "GOV-3: a recall that never reached turnout doesn't start a cooldown");
  await setKey(GOV, 0, cits[0], cits[10]);
  const pid = await CT.nextProposalId();
  await w(CT.connect(cits[10]).proposePayment(0, await IT.getAddress(), 0, cits[11].address, E(1) / 4n));
  await w(GOV.connect(cits[0]).setOperatingKey(0, cits[3].address)); // try to silence holder 3
  await w(CT.connect(cits[3]).vote(pid, false));
  ok((await CT.proposals(pid)).no === 1n && (await GOV.governorOperatingKey(0)) === cits[10].address, "CT-5: naming a shareholder as key doesn't silence them (key needs acceptance)");
}
{ // CT-M1: a recall opened after the vote closes still stops the payment; recipient can't vote
  const { RA, GOV, CT, IT, cits } = await system(12);
  await soldCompany(RA, 0, cits.slice(0, 10), 1);
  await warp(DAY + 1);
  await elect(GOV, 0, cits[0], cits.slice(0, 5));
  await setKey(GOV, 0, cits[0], cits[10]);
  const pid = await CT.nextProposalId();
  await w(CT.connect(cits[10]).proposePayment(0, await IT.getAddress(), 0, cits[9].address, E(1) / 4n));
  ok(await reverts(async () => CT.connect(cits[9]).vote(pid, true), "recipient can't vote"), "CT-L4: the recipient can't vote on their own payment");
  for (let i = 1; i < 4; i++) await w(CT.connect(cits[i]).vote(pid, true));
  await warp(3 * DAY + 1);
  await w(GOV.connect(cits[4]).openRecall(0));            // opened only after the vote closed
  for (let i = 4; i < 9; i++) await w(GOV.connect(cits[i]).voteRecall(0, true));
  await warp(5 * DAY);                                      // execution falls due; recall closed but unresolved
  ok(await reverts(async () => CT.executePayment(pid), "recall pending"), "CT-M1: the governor can't race an unresolved recall");
  await w(GOV.resolveRecall(0));
  await w(CT.executePayment(pid));
  ok((await CT.proposals(pid)).status === 1n && (await IT.balanceOf(cits[9].address)) === E(999), "CT-M1: after the recall the payment is void, money back");
}
{ // CT-4: a 'no' vote never helps; CT-6: one-second loans don't count in the treasury
  const { RA, GOV, CT, IT, cits } = await system(22);
  await soldCompany(RA, 0, cits.slice(0, 20), 1);
  await warp(DAY + 1);
  await elect(GOV, 0, cits[0], cits.slice(0, 5));
  await setKey(GOV, 0, cits[0], cits[20]);
  const pid = await CT.nextProposalId();
  await w(CT.connect(cits[20]).proposePayment(0, await IT.getAddress(), 0, cits[21].address, E(1) / 4n));
  for (let i = 1; i < 4; i++) await w(CT.connect(cits[i]).vote(pid, true));
  await w(CT.connect(cits[4]).vote(pid, false));
  ok((await CT.eligibleShares(pid)) === 19n && !(await CT.passes(pid)), "CT-4: 3 yes / 1 no of 19 fails — opponents voting no can't push it over quorum");
}
{ // CT-1 end to end: the tunnelling path from the audit is closed at every step
  const { CT, RA } = await system(1);
  ok(!has(RA, "invest") && has(CT, "proposeInvest"), "CT-1: corporate investment needs a shareholder vote, with a max price per share");
}

// =================================================================
console.log("\nOpenVerifier v2 (F32)");
{
  const IT = await deploy("InvestToken", 1000);
  const OV = await deploy("OpenVerifierV2", await IT.getAddress(), owner.address);
  await w(IT.setVerifier(await OV.getAddress(), true));
  const F = await deploy("VerifyFactory");
  await w(owner.sendTransaction({ to: await F.getAddress(), value: E(1) }));
  ok(await reverts(async () => F.tryVerify(await OV.getAddress()), "ordinary wallets only"), "F32: a contract can't verify (no claim factories)");
  await w(OV.connect(S[1]).verifySelf());
  ok(await reverts(async () => OV.connect(S[1]).verifySelf(), "already verified"), "re-verifying doesn't use the cap");
  ok((await OV.remainingThisHour()) === 49n, "hourly counter: 49 left");
  for (let i = 2; i < 51; i++) await w(OV.connect(S[i]).verifySelf());
  ok(await reverts(async () => OV.connect(S[51]).verifySelf(), "this hour"), "CT-8: at most 50 new citizens an hour");
  await warp(HOUR);
  await w(OV.setPaused(true));
  ok(await reverts(async () => OV.connect(S[52]).verifySelf(), "paused"), "guardian can pause");
  ok(await reverts(async () => OV.connect(S[2]).setPaused(false), "not guardian"), "only the guardian can pause");
}

// =================================================================
console.log("\nTimelock on owner powers (F36)");
{
  const IT = await deploy("InvestToken", 1000);
  const TL = await deploy("FairRoundTimelock", owner.address);
  const tl = await TL.getAddress();
  await w(IT.transferOwnership(tl));
  ok(await reverts(async () => IT.setMaxCitizens(5), "0x118cdaa7"), "F36: owner wallet can no longer act directly");
  const data = IT.interface.encodeFunctionData("setMaxCitizens", [5]);
  const salt = ethers.ZeroHash;
  await w(TL.schedule(await IT.getAddress(), 0, data, ethers.ZeroHash, salt, 48 * HOUR));
  ok(await reverts(async () => TL.execute(await IT.getAddress(), 0, data, ethers.ZeroHash, salt), "0x5ead8eb5"), "F36: can't execute before 48 hours");
  await warp(48 * HOUR + 1);
  await w(TL.execute(await IT.getAddress(), 0, data, ethers.ZeroHash, salt));
  ok((await IT.maxCitizens()) === 5n, "runs after 48 hours, publicly scheduled");
  ok(await reverts(async () => TL.schedule(await IT.getAddress(), 0, data, ethers.ZeroHash, ethers.id("x"), 3600), "0x54336609"), "delay can't be shortened per call");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
