// VotedUnrig (vUNRIG) against the real v9 contracts on anvil with Arbitrum's
// limits. Normal flows (wrap a voted payment, wrap a won sale, trade,
// unwrap) plus one attack per way someone might try to mint vUNRIG without
// a treasury vote. UNRIG runs closed-loop, as on mainnet.
// Needs art9/ with VotedUnrig, the v9 set and TestHelpersV9 (BlockingToken).
import { ethers } from "ethers";
import fs from "fs";
const art = (n) => JSON.parse(fs.readFileSync(`./art9/${n}.art.json`));
const P = new ethers.JsonRpcProvider("http://127.0.0.1:8545", undefined, { cacheTimeout: -1 });
{ const est = P.estimateGas.bind(P); P.estimateGas = async (tx) => ((await est(tx)) * 15n) / 10n; }
const E = (n) => ethers.parseEther(String(n));
const DAY = 86400, HOUR = 3600, EXEC = 8 * DAY + 1;
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
const MAX = ethers.MaxUint256;

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
async function elect(GOV, id, winner, voters) {
  await w(GOV.openCandidacy(id));
  await w(GOV.connect(winner).declareCandidacy(id, "program"));
  await warp(5 * DAY + 1); await w(GOV.openVoting(id));
  for (const v of voters) await w(GOV.connect(v).vote(id, winner.address));
  await warp(3 * DAY + 1); await w(GOV.tallyRound(id));
}
const setKey = async (GOV, id, gov, key) => { await w(GOV.connect(gov).setOperatingKey(id, key.address)); await w(GOV.connect(key).acceptOperatingKey(id)); };

// ---- the system, as deployed on Arbitrum One (owner = deployer here) ----
const IT = await deploy("InvestToken", 1000); const it = await IT.getAddress();
const RA = await deploy("RoundAuctionV9", it); const ra = await RA.getAddress();
const GOV = await deploy("GovernanceV9", ra);
const CT = await deploy("CompanyTreasuryV9", it, ra, await GOV.getAddress()); const ct = await CT.getAddress();
const DV = await deploy("CompanyDividendsV9", it, ra, await GOV.getAddress());
for (const a of [ra, ct, await DV.getAddress()]) await w(IT.setAuthorizedSink(a, true));
await w(RA.setGovernance(await GOV.getAddress())); await w(RA.setTreasury(ct)); await w(RA.setDividends(await DV.getAddress()));
const cits = S.slice(1, 17);
await w(IT.setVerifiedCitizens(cits.map((s) => s.address), true));
for (const s of cits) { await w(IT.connect(s).claim()); await w(IT.connect(s).approve(ra, MAX)); }
const usdc = await deploy("BlockingToken"); const u = await usdc.getAddress();
await w(CT.setApprovedToken(u, true));

// Listing 0 "Big": 10 units, one each to cits[0..9] at 100 UNRIG -> ~990 UNRIG capital.
// Listing 1 "Small": 3 units to cits[0..2] (below the wrapper's 5-unit minimum).
await w(RA.listCompany(0, "Big", 10, HOUR)); await w(RA.listCompany(1, "Small", 3, HOUR));
await round(RA, 0, cits.slice(0, 10).map((s) => [s, 100]));
await round(RA, 1, cits.slice(0, 3).map((s) => [s, 100]));
await warp(DAY + 1);
await elect(GOV, 0, cits[0], cits.slice(0, 5)); await setKey(GOV, 0, cits[0], cits[10]);
await elect(GOV, 1, cits[0], cits.slice(0, 3)); await setKey(GOV, 1, cits[0], cits[13]);
const capital0 = (await RA.companies(0)).capital;

console.log("Deploy");
const VU = await deploy("VotedUnrig", it, ct, ra, 5); const vu = await VU.getAddress();
ok((await VU.symbol()) === "vUNRIG" && (await VU.minListingUnits()) === 5n, "vUNRIG deployed: symbol vUNRIG, minimum listing 5 units");
ok(!VU.interface.fragments.some((f) => ["owner", "mint", "setMinListingUnits", "pause"].includes(f.name)), "no owner, no free mint, no admin settings");
ok(await reverts(() => deploy("VotedUnrig", it, owner.address, ra, 5), ""), "constructor refuses a treasury that isn't a FairRound treasury");
const bytes = (art("VotedUnrig").bytecode.length - 2) / 2;
ok(((await P.getCode(vu)).length - 2) / 2 <= 24576, `fits Arbitrum's size limit (${((await P.getCode(vu)).length - 2) / 2} bytes runtime, ${bytes} with constructor)`);

console.log("\nProposals (all inside one 30-day term)");
const pay = await CT.nextProposalId();
await w(CT.connect(cits[10]).proposePayment(0, it, 0, cits[11].address, E(20)));
const rej = pay + 1n; await w(CT.connect(cits[10]).proposePayment(0, it, 0, cits[15].address, E(5)));
const sale = pay + 2n; await w(CT.connect(cits[10]).proposeSale(0, it, 0, E(20), u, 1000n));
const small = pay + 3n; await w(CT.connect(cits[13]).proposePayment(1, it, 0, cits[12].address, E(5)));
ok(await reverts(() => VU.connect(cits[11]).wrapPayment(pay, E(1)), "payment not executed"), "can't wrap while the vote is still running");
for (let i = 1; i < 5; i++) { await w(CT.connect(cits[i]).vote(pay, true)); await w(CT.connect(cits[i]).vote(sale, true)); }
await w(CT.connect(cits[1]).vote(small, true)); await w(CT.connect(cits[2]).vote(small, true));
await warp(EXEC);
await w(CT.executePayment(pay)); await w(CT.executePayment(rej)); await w(CT.executePayment(small)); await w(CT.startAuction(sale));
ok((await CT.proposals(pay)).status === 2n, "payment of 20 UNRIG executed after vote + 5-day delay");

console.log("\nVoted payment -> vUNRIG");
await w(IT.connect(cits[11]).approve(vu, MAX));
ok(await reverts(() => VU.connect(cits[11]).wrapPayment(pay, E(10)), "closed loop"), "until the timelock makes vUNRIG an authorized sink, nothing can be wrapped");
await w(IT.setAuthorizedSink(vu, true));
let [acct, left] = await VU.wrappable(pay);
ok(acct === cits[11].address && left === E(20), "wrappable(): recipient may wrap the full 20");
await w(VU.connect(cits[11]).wrapPayment(pay, E(12)));
ok((await VU.balanceOf(cits[11].address)) === E(12) && (await IT.balanceOf(vu)) === E(12), "wrapped 12: 12 vUNRIG minted, 12 UNRIG held as backing");
await w(VU.connect(cits[11]).wrapPayment(pay, E(8)));
ok((await VU.wrappedFrom(pay)) === E(20), "partial wraps add up to the payment (12 + 8)");
ok(await reverts(() => VU.connect(cits[11]).wrapPayment(pay, 1n), "more than the treasury released"), "ATTACK: wrapping the same payment again fails");

console.log("\nvUNRIG trades freely; UNRIG stays closed-loop");
await w(VU.connect(cits[11]).transfer(cits[14].address, E(5)));
ok((await VU.balanceOf(cits[14].address)) === E(5), "vUNRIG moves wallet to wallet (a pool or exchange could hold it)");
ok(await reverts(() => IT.connect(cits[11]).transfer(cits[14].address, E(1)), "closed loop"), "plain UNRIG still can't move wallet to wallet");
const before14 = await IT.balanceOf(cits[14].address);
await w(VU.connect(cits[14]).unwrap(E(5)));
ok((await IT.balanceOf(cits[14].address)) - before14 === E(5) && (await VU.balanceOf(cits[14].address)) === 0n, "unwrap: 5 vUNRIG burned, 5 UNRIG back (spendable inside FairRound)");
ok(await reverts(() => IT.connect(cits[14]).transfer(cits[15].address, E(5)), "closed loop"), "unwrapped UNRIG is closed-loop again");
ok((await VU.totalSupply()) <= (await IT.balanceOf(vu)), "backing: vUNRIG supply never exceeds the UNRIG the wrapper holds");

console.log("\nFarmers and other ways around the vote");
const farmer = cits[15];
await w(IT.connect(farmer).approve(vu, MAX));
ok(await reverts(() => VU.connect(farmer).wrapPayment(pay, E(1)), "not the recipient"), "ATTACK: a farmer can't wrap someone else's payment");
ok(await reverts(() => VU.connect(farmer).wrapPayment(9999, E(1)), ""), "ATTACK: a made-up proposal id fails");
const fb = await IT.balanceOf(farmer.address);
await w(IT.connect(farmer).transfer(vu, E(100)));   // allowed: vUNRIG is a sink
ok((await VU.balanceOf(farmer.address)) === 0n && (await IT.balanceOf(farmer.address)) === fb - E(100), "ATTACK: sending free claims straight to the wrapper mints nothing (they're just lost)");
ok(await reverts(() => VU.connect(farmer).unwrap(E(1)), ""), "ATTACK: unwrap needs vUNRIG; donated UNRIG can't be pulled back out");
ok((await VU.totalSupply()) < (await IT.balanceOf(vu)), "donations only over-back vUNRIG");

console.log("\nRejected payments, small listings");
ok((await CT.proposals(rej)).status === 1n, "a payment nobody voted for is rejected");
ok(await reverts(() => VU.connect(farmer).wrapPayment(rej, E(1)), "payment not executed"), "ATTACK: a rejected payment can't be wrapped");
ok((await CT.proposals(small)).status === 2n, "small listing (3 units): payment executed");
await w(IT.connect(cits[12]).approve(vu, MAX));
ok(await reverts(() => VU.connect(cits[12]).wrapPayment(small, E(1)), "listing too small"), "ATTACK: UNRIG from a listing below 5 units can't be wrapped (one person could own it)");
[acct, left] = await VU.wrappable(small);
ok(acct === ethers.ZeroAddress && left === 0n, "wrappable() says so too");

console.log("\nVoted sale -> vUNRIG");
const [bA, bB] = [cits[12], cits[14]];
for (const s of [bA, bB]) { await w(usdc.mint(s.address, 10000n)); await w(usdc.connect(s).approve(ct, 10000n)); }
const salt = ethers.id("salt");
await w(CT.connect(bA).commitBid(sale, await CT.commitHashFor(sale, 1500n, salt, bA.address)));
await w(CT.connect(bB).commitBid(sale, await CT.commitHashFor(sale, 1200n, salt, bB.address)));
await warp(2 * DAY + 1);
await w(CT.connect(bA).revealBid(sale, 1500n, salt)); await w(CT.connect(bB).revealBid(sale, 1200n, salt));
ok(await reverts(() => VU.connect(bA).wrapSale(sale, E(1)), "sale not settled"), "can't wrap before the sale is settled");
await warp(DAY + 1); await w(CT.settleAuction(sale));
ok(await reverts(() => VU.connect(bA).wrapSale(sale, E(1)), "claim the sale first"), "winner must claim the UNRIG first");
await w(CT.connect(bA).claimAuction(sale)); await w(CT.connect(bB).claimAuction(sale));
ok(await reverts(() => VU.connect(bB).wrapSale(sale, E(1)), "not the winner"), "ATTACK: the losing bidder can't wrap");
ok(await reverts(() => VU.connect(bA).wrapPayment(sale, E(1)), "not a payment"), "ATTACK: a sale can't be wrapped as a payment");
ok(await reverts(() => VU.connect(cits[11]).wrapSale(pay, E(1)), "not a sale"), "ATTACK: a payment can't be wrapped as a sale");
await w(VU.connect(bA).wrapSale(sale, E(20)));
ok((await VU.balanceOf(bA.address)) === E(20), "sale winner wrapped the 20 UNRIG they bought");
ok(await reverts(() => VU.connect(bA).wrapSale(sale, 1n), "more than the treasury released"), "ATTACK: and not a wei more");

console.log("\nAccounting");
ok((await VU.totalSupply()) === E(20) + E(15) && (await IT.balanceOf(vu)) === E(20) + E(15) + E(100), "supply 35 (20 + 20 - 5 unwrapped) vs backing 135 (incl. the farmer's 100 donation)");
ok((await RA.companies(0)).capital === capital0 - E(20) - E(20), "the listing's capital fell by exactly what holders voted out (20 paid + 20 sold)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
