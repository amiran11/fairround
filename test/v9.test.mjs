// v9 test suite: normal behaviour + one attack test per audit finding (23-40).
// Runs against anvil with Arbitrum's limits (32M gas/tx, 24,576-byte code).
// INVEST runs CLOSED-LOOP here (no tradability), the strictest setting: v9
// must work whether or not INVEST is freely tradable.
import { ethers } from "ethers";
import fs from "fs";
const art = (n) => JSON.parse(fs.readFileSync(`./art9/${n}.art.json`));
const P = new ethers.JsonRpcProvider("http://127.0.0.1:8545", undefined, { cacheTimeout: -1 });
const E = (n) => ethers.parseEther(String(n));
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

async function system(nCitizens = 40) {
  const IT = await deploy("InvestToken", 1000);
  const RA = await deploy("RoundAuctionV9", await IT.getAddress());
  const GOV = await deploy("GovernanceV9", await RA.getAddress());
  const CT = await deploy("CompanyTreasuryV9", await IT.getAddress(), await RA.getAddress(), await GOV.getAddress());
  const [ra, ct] = [await RA.getAddress(), await CT.getAddress()];
  await w(IT.setAuthorizedSink(ra, true)); await w(IT.setAuthorizedSink(ct, true));
  await w(RA.setGovernance(await GOV.getAddress())); await w(RA.setTreasury(ct));
  const cits = S.slice(1, 1 + nCitizens);
  await w(IT.setVerifiedCitizens(cits.map((s) => s.address), true));
  for (const s of cits) { await w(IT.connect(s).claim()); await w(IT.connect(s).approve(ra, ethers.MaxUint256)); await w(IT.connect(s).approve(ct, ethers.MaxUint256)); }
  return { IT, RA, GOV, CT, ra, ct, cits };
}
// one round: bids, wait, settle; then wait out the cooldown
async function round(RA, id, bids, { skipCooldown = true } = {}) {
  { const t = await now(); const st = await RA.roundStart(id); if (Number(st) > t) await warp(Number(st) - t + 1); }
  { const c0 = await RA.companies(id); if (BigInt(await now()) >= c0.roundEnd) await w(RA.settleRound(id, { gasLimit: 32_000_000 })); const st = await RA.roundStart(id); const t = await now(); if (Number(st) > t) await warp(Number(st) - t + 1); }
  for (const [s, amt] of bids) await w(RA.connect(s).placeBid(id, E(amt)));
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
for (const n of ["RoundAuctionV9", "GovernanceV9", "CompanyTreasuryV9", "OpenVerifierV2", "SakartveloTimelock"]) {
  const len = (JSON.parse(fs.readFileSync(`./art9/${n}.art.json`)).bytecode.length - 2) / 2;
  const code = await P.getCode(await (await deploy(...(n === "RoundAuctionV9" ? [n, owner.address] : n === "GovernanceV9" ? [n, owner.address] : n === "CompanyTreasuryV9" ? [n, owner.address, owner.address, owner.address] : n === "OpenVerifierV2" ? [n, owner.address, owner.address] : [n, owner.address]))).getAddress());
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

console.log("\nRoundAuction v9: partly filled bids carry over and can be withdrawn (F30)");
{
  const { IT, RA, cits } = await system(5);
  const [a, b] = cits;
  await w(RA.listCompany(0, "Big", 1000, HOUR));
  // MAX_SHARES_PER_ROUND = 300; a bids 1 (price), b bids 500 -> ents 1+500 > 300
  await round(RA, 0, [[a, 1], [b, 500]], { skipCooldown: false });
  const bBid = (await RA.getActiveBids(0)).find((x) => x.bidder === b.address);
  ok(bBid && (await RA.companyShareCount(0, b.address)) > 290n, "F30: big bid partly filled, the rest stays active");
  ok(await reverts(async () => RA.connect(cits[2]).placeBid(0, E(5)), "cooldown"), "F31: no bidding during the cooldown");
  const bal = await IT.balanceOf(b.address);
  await w(RA.connect(b).withdrawBid(0));
  ok((await IT.balanceOf(b.address)) - bal === bBid.amount, "F30: the remainder can be withdrawn during the cooldown");
  ok((await RA.activeBidSlot(0, a.address)) !== 0n, "the price-setting 1-INVEST bid got 0 of its 1 share pro rata and stays active");
  ok(await reverts(async () => RA.connect(cits[3]).withdrawBid(0), "no active bid"), "nothing to withdraw without a bid");
  await warp(HOUR + 1);
  await w(RA.connect(cits[2]).placeBid(0, E(5)));
  ok(await reverts(async () => RA.connect(cits[2]).withdrawBid(0), "only during cooldown"), "no withdrawal while a round is open (no last-second price games)");
  ok(await raInvariant(IT, RA, [0]), "INVEST accounting exact");
}

console.log("\nRoundAuction v9: full book eviction (F31)");
{
  const { IT, RA, cits } = await system(102);
  await w(RA.listCompany(0, "Co", 100000, HOUR));
  for (let i = 0; i < 100; i++) await w(RA.connect(cits[i]).placeBid(0, E(2)));
  ok(await reverts(async () => RA.connect(cits[100]).placeBid(0, E(2)), "must beat the lowest"), "F31: full book, equal bid can't enter");
  const victim = cits[99];
  const vb = await IT.balanceOf(victim.address);
  await w(RA.connect(cits[100]).placeBid(0, E(3)));
  ok((await RA.activeBidSlot(0, victim.address)) === 0n && (await IT.balanceOf(victim.address)) - vb === E(2), "F31: higher bid evicts the lowest (latest on ties), refunded in full");
  ok((await RA.activeBidCount(0)) === 100n && await raInvariant(IT, RA, [0]), "book stays at 100; accounting exact");
  // gas, worst case: 100 bidders, entitlements over 300, pro rata to all 100
  await w(RA.listCompany(1, "Gas", 100000, HOUR));
  for (let i = 0; i < 99; i++) await w(RA.connect(cits[i]).placeBid(1, E(20 + i)));
  await w(RA.connect(cits[99]).placeBid(1, E(2)));
  const c = await RA.companies(1); await warp(Number(c.roundEnd) - (await now()) + 1);
  const r = await w(RA.settleRound(1, { gasLimit: 32_000_000 }));
  ok(r.gasUsed < 32_000_000n, `settlement with 100 bids and 300 shares: ${r.gasUsed} gas (< 32M)`);
  ok((await RA.companies(1)).sharesIssued === 300n, "300 shares issued in the round, spread pro rata");
  ok(await raInvariant(IT, RA, [0, 1]), "accounting exact after the big settlement");
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
  await w(GOV.connect(g).setOperatingKey(0, k.address));
  ok(await reverts(async () => RA.connect(k).invest(0, 0, E(1)), "invest in itself"), "F38: a company can't reinvest in itself");
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
  ok((await GOV.candidateCount(0)) === 20n, "20 candidates");
  ok(await reverts(async () => GOV.connect(cits[20]).declareCandidacy(0, "p"), "no shares"), "slate full; outsiders can't squat");
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
  await w(GOV.connect(cits[0]).setOperatingKey(11, cits[1].address));
  const cap = (await RA.companies(11)).capital;
  const pid = await CT.nextProposalId();
  await w(CT.connect(cits[1]).proposePayment(11, await IT.getAddress(), 0, cits[2].address, cap));
  ok(await reverts(async () => CT.connect(cits[0]).vote(pid, true), "proposer can't vote"), "F26: governor can't vote on own proposal");
  ok(await reverts(async () => CT.connect(cits[1]).vote(pid, true), "proposer can't vote"), "F26: operating key can't vote");
  ok((await CT.eligibleShares(pid)) === 0n, "F23 replay: sole shareholder-governor's shares don't count toward quorum");
  await warp(3 * DAY + 1); await w(CT.executePayment(pid));
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
  await w(GOV.connect(cits[0]).setOperatingKey(0, cits[10].address));
  await w(usdc.mint(owner.address, 1000n)); await w(usdc.approve(ct, 1000n)); await w(CT.depositToken(0, u, 1000n));
  ok((await CT.balanceOf(0, u, 0)) === 1000n, "deposit credited to capital");
  // small payment (5%): quorum 20% of eligible (9 shares) -> 2 votes
  let pid = await CT.nextProposalId();
  await w(CT.connect(cits[10]).proposePayment(0, u, 0, cits[11].address, 50n));
  ok((await CT.proposals(pid)).quorumBps === 2000n, "5% payment needs 20% quorum");
  await w(CT.connect(cits[1]).vote(pid, true)); await w(CT.connect(cits[2]).vote(pid, true));
  await warp(3 * DAY + 1);
  await w(CT.executePayment(pid));
  ok((await usdc.balanceOf(cits[11].address)) === 50n, "approved payment executed");
  // large payment: 40% quorum; then a blocked recipient -> money returns
  pid = await CT.nextProposalId();
  await w(CT.connect(cits[10]).proposePayment(0, u, 0, cits[12].address, 500n));
  ok((await CT.proposals(pid)).quorumBps === 4000n, "large payment needs 40% quorum");
  for (let i = 1; i < 5; i++) await w(CT.connect(cits[i]).vote(pid, true));
  await w(usdc.setBlocked(cits[12].address));
  await warp(3 * DAY + 1); await w(CT.executePayment(pid));
  ok((await CT.proposals(pid)).status === 3n && (await CT.balanceOf(0, u, 0)) === 950n, "blocked recipient: transfer fails, money returns to the company");
}

console.log("\nTreasury v9: snapshot one day before the proposal (F34)");
{
  const { IT, RA, GOV, CT, cits } = await system(14);
  await soldCompany(RA, 0, cits.slice(0, 10), 1);
  await warp(DAY + 1);
  await elect(GOV, 0, cits[0], cits.slice(0, 5));
  await w(GOV.connect(cits[0]).setOperatingKey(0, cits[10].address));
  await warp(7 * DAY);
  // a renter buys a share and votes right away
  const tid = 3n;
  const ownerAddr = await RA.ownerOf(tid); const seller = cits.find((s) => s.address === ownerAddr);
  await w(RA.connect(seller).transferFrom(seller.address, cits[13].address, tid));
  const pid = await CT.nextProposalId();
  await w(CT.connect(cits[10]).proposePayment(0, await IT.getAddress(), 0, cits[11].address, E(1)));
  ok(await reverts(async () => CT.connect(cits[13]).vote(pid, true), "no shares at snapshot"), "F34: shares bought minutes before the proposal can't vote");
}

console.log("\nTreasury v9: sales by vote + sealed-bid auction with reserve (F25, F33, F35)");
{
  const { IT, RA, GOV, CT, ct, cits } = await system(14);
  const usdc = await deploy("BlockingToken"); const u = await usdc.getAddress(); const inv = await IT.getAddress();
  await w(CT.setApprovedToken(u, true));
  await soldCompany(RA, 0, cits.slice(0, 10), 10);
  await warp(DAY + 1);
  await elect(GOV, 0, cits[0], cits.slice(0, 5));
  await w(GOV.connect(cits[0]).setOperatingKey(0, cits[10].address));
  const cap0 = (await RA.companies(0)).capital;
  // sell 10 INVEST of capital for USDC, reserve 100
  let pid = await CT.nextProposalId();
  await w(CT.connect(cits[10]).proposeSale(0, inv, 0, E(10), u, 100n));
  ok((await RA.companies(0)).capital === cap0 - E(10), "asset reserved while the vote runs");
  for (let i = 1; i < 5; i++) await w(CT.connect(cits[i]).vote(pid, true));
  await warp(3 * DAY + 1); await w(CT.startAuction(pid));
  const a = await CT.auctions(pid);
  ok(a.deposit === 10n, "F35: bid deposit is 10% of the reserve");
  for (const s of [cits[11], cits[12], cits[13]]) { await w(usdc.mint(s.address, 1000n)); await w(usdc.connect(s).approve(ct, 1000n)); }
  const salt = ethers.id("s");
  await w(CT.connect(cits[11]).commitBid(pid, await CT.commitHashFor(pid, 150n, salt, cits[11].address)));
  await w(CT.connect(cits[12]).commitBid(pid, await CT.commitHashFor(pid, 90n, salt, cits[12].address)));
  await w(CT.connect(cits[13]).commitBid(pid, await CT.commitHashFor(pid, 400n, salt, cits[13].address)));
  await warp(2 * DAY + 1);
  await w(CT.connect(cits[11]).revealBid(pid, 150n, salt));
  ok(await reverts(async () => CT.connect(cits[12]).revealBid(pid, 90n, salt), "below reserve"), "F25: bids below the reserve can't win");
  // cits[13] takes the "last look" and doesn't reveal: loses deposit
  await warp(DAY + 1); await w(CT.settleAuction(pid));
  ok((await CT.balanceOf(0, u, 0)) === 150n + 20n, "F33: proceeds (150) + forfeited deposits (2x10) go to CAPITAL");
  ok((await CT.balanceOf(0, u, 1)) === 0n && (await RA.reinvestableIncome(0)) === 0n, "F33: capital never becomes reinvestable income");
  const ib = await IT.balanceOf(cits[11].address);
  await w(CT.connect(cits[11]).claimAuction(pid));
  ok((await IT.balanceOf(cits[11].address)) - ib === E(10) && (await usdc.balanceOf(cits[11].address)) === 1000n - 150n, "winner gets the asset and the deposit back");
  // unsold: no valid bid -> asset returns
  pid = await CT.nextProposalId();
  await w(CT.connect(cits[10]).proposeSale(0, inv, 0, E(5), u, 100n));
  for (let i = 1; i < 5; i++) await w(CT.connect(cits[i]).vote(pid, true));
  await warp(3 * DAY + 1); await w(CT.startAuction(pid));
  await warp(3 * DAY + 1); await w(CT.settleAuction(pid));
  ok((await RA.companies(0)).capital === cap0 - E(10), "F25: unsold asset returns to the company");
  // rejected sale returns too
  pid = await CT.nextProposalId();
  await w(CT.connect(cits[10]).proposeSale(0, inv, 0, E(5), u, 100n));
  await warp(3 * DAY + 1); await w(CT.startAuction(pid));
  ok((await CT.proposals(pid)).status === 1n && (await RA.companies(0)).capital === cap0 - E(10), "rejected sale: asset returns");
}

console.log("\nTreasury v9: proposals die with the term; corporate voting");
{
  const { IT, RA, GOV, CT, cits } = await system(14);
  await soldCompany(RA, 0, cits.slice(0, 10), 1);
  await warp(DAY + 1);
  await elect(GOV, 0, cits[0], cits.slice(0, 5));
  await w(GOV.connect(cits[0]).setOperatingKey(0, cits[10].address));
  await warp(27 * DAY);
  ok(await reverts(async () => CT.connect(cits[10]).proposePayment(0, await IT.getAddress(), 0, cits[11].address, E(1)), "outlast the term"), "a vote must finish inside the term");
  // recall kills a pending payment
  const { RA: RA2, GOV: GOV2, CT: CT2, IT: IT2, cits: c2 } = await system(14);
  await soldCompany(RA2, 0, c2.slice(0, 10), 1);
  await warp(DAY + 1);
  await elect(GOV2, 0, c2[0], c2.slice(0, 5));
  await w(GOV2.connect(c2[0]).setOperatingKey(0, c2[10].address));
  const pid = await CT2.nextProposalId();
  await w(CT2.connect(c2[10]).proposePayment(0, await IT2.getAddress(), 0, c2[11].address, E(1)));
  for (let i = 1; i < 5; i++) await w(CT2.connect(c2[i]).vote(pid, true));
  await w(GOV2.connect(c2[1]).openRecall(0));
  for (let i = 1; i < 6; i++) await w(GOV2.connect(c2[i]).voteRecall(0, true));
  await warp(3 * DAY + 1); await w(GOV2.resolveRecall(0));
  await w(CT2.executePayment(pid));
  ok((await CT2.proposals(pid)).status === 1n && (await IT2.balanceOf(c2[11].address)) === E(1000), "recall voids a pending approved payment");
}


console.log("\nCorporate path: reinvest vote -> invest -> compensation -> corporate votes; dividends");
{
  const { IT, RA, GOV, CT, cits } = await system(40);
  const inv = await IT.getAddress();
  const holders0 = cits.slice(0, 30);
  await soldCompany(RA, 0, holders0, 1000);              // capital ~ 29,700
  await warp(DAY + 1);
  await elect(GOV, 0, cits[0], holders0.slice(0, 10));
  await warp(30 * DAY + 1);
  await w(CT.openPolicyVote(0, 1));
  await w(CT.connect(cits[1]).votePolicy(0, 1, false));  // reinvest
  await warp(3 * DAY + 1);
  const cap = (await RA.companies(0)).capital;
  await w(CT.resolvePolicyVote(0, 1));
  const inc = await RA.reinvestableIncome(0);
  ok(inc === cap / 100n && (await RA.companies(0)).capital === cap - inc, "shareholders' reinvest vote moves 1% of capital to income");
  await elect(GOV, 0, cits[2], holders0.slice(0, 10));     // term 2
  await w(GOV.connect(cits[2]).setOperatingKey(0, cits[35].address));
  await w(RA.listCompany(1, "Target", 300, HOUR));
  await w(RA.connect(cits[36]).placeBid(1, E(1)));
  const useAmt = (inc / E(1)) * E(1);
  await w(RA.connect(cits[35]).invest(0, 1, useAmt));
  ok((await RA.corporateBidGovernor(1, await RA.corporateHolder(0))) === cits[2].address, "governor recorded at invest() time");
  await round(RA, 1, []);
  const corpShares = await RA.companyShareCount(1, await RA.corporateHolder(0));
  const comp = await RA.companyShareCount(1, cits[2].address);
  ok(corpShares > 0n && comp === (corpShares + comp) / 100n, `corporate holder got ${corpShares} shares, governor ${comp} as 1% compensation`);
  await warp(8 * DAY);
  const compTid = (await RA.nextTokenId()) - corpShares - comp; // comp minted first in that batch
  let compId = null;
  for (let t = compTid - 2n; t < compTid + 3n; t++) { try { if ((await RA.ownerOf(t)) === cits[2].address && (await RA.compensationUnlockTerm(t)) > 0n) { compId = t; break; } } catch {} }
  ok(compId !== null && await reverts(async () => RA.connect(cits[2]).transferFrom(cits[2].address, cits[3].address, compId), "comp shares locked"), "compensation shares locked until term + 2");
  // company 1 election won with company 0's corporate votes
  await w(GOV.openCandidacy(1));
  await w(GOV.connect(cits[36]).declareCandidacy(1, "p"));
  await warp(5 * DAY + 1); await w(GOV.openVoting(1));
  await w(GOV.connect(cits[35]).voteAsCorporation(0, 1, cits[36].address));
  await warp(3 * DAY + 1); await w(GOV.tallyRound(1));
  ok((await GOV.companyGovernor(1)) === cits[36].address, "corporate shares vote in elections through the holder's governor");
  await w(GOV.connect(cits[36]).setOperatingKey(1, cits[37].address));
  const pid = await CT.nextProposalId();
  const cap1 = (await RA.companies(1)).capital;
  await w(CT.connect(cits[37]).proposePayment(1, inv, 0, cits[38].address, cap1 / 100n));
  await w(CT.connect(cits[35]).voteAsCorporation(0, pid, true));
  await warp(3 * DAY + 1); await w(CT.executePayment(pid));
  ok((await CT.proposals(pid)).status === 2n, "corporate shares vote on payments through the holder's governor");
  // dividends for company 0, term 2
  await warp(30 * DAY);
  await w(CT.openPolicyVote(0, 2));
  for (let i = 3; i < 6; i++) await w(CT.connect(cits[i]).votePolicy(0, 2, true));
  await warp(3 * DAY + 1);
  await w(CT.resolvePolicyVote(0, 2));
  const owed = await CT.dividendOwed(0, 2, cits[3].address);
  const b = await IT.balanceOf(cits[3].address);
  await w(CT.connect(cits[3]).claimDividend(0, 2));
  ok(owed > 0n && (await IT.balanceOf(cits[3].address)) - b === owed, "dividend vote pays shareholders pro rata at the record date");
  ok(await reverts(async () => CT.connect(cits[3]).claimDividend(0, 2), "already claimed"), "no double claim");
  ok(await raInvariant(IT, RA, [0, 1]), "INVEST accounting exact across the whole corporate path");
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
  ok((await OV.remainingToday()) === 199n, "daily counter: 199 left");
  await w(OV.setPaused(true));
  ok(await reverts(async () => OV.connect(S[2]).verifySelf(), "paused"), "guardian can pause");
  ok(await reverts(async () => OV.connect(S[2]).setPaused(false), "not guardian"), "only the guardian can pause");
}

// =================================================================
console.log("\nTimelock on owner powers (F36)");
{
  const IT = await deploy("InvestToken", 1000);
  const TL = await deploy("SakartveloTimelock", owner.address);
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
