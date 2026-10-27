// VotedUnrig (vUNRIG) against the real v9 contracts on anvil with Arbitrum's
// limits. Normal flows (convert a voted payment or a won sale by burning the
// UNRIG, then trade vUNRIG) plus one attack per way someone might try to mint
// vUNRIG without a treasury vote. UNRIG runs closed-loop and InvestToken is
// owned by the 48-hour FairRoundTimelock, as on mainnet.
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
ok((await VU.symbol()) === "vUNRIG" && (await VU.name()) === "Voted UNRIG" && (await VU.minListingUnits()) === 5n, "deployed: Voted UNRIG (vUNRIG), minimum listing 5 units");
ok(!VU.interface.fragments.some((f) => ["owner", "mint", "unwrap", "setMinListingUnits", "pause"].includes(f.name)), "no owner, no free mint, no unwrap, no admin settings");
ok(await reverts(() => deploy("VotedUnrig", it, owner.address, ra, 5), ""), "constructor refuses a treasury that isn't a FairRound treasury");
ok(await reverts(() => deploy("VotedUnrig", it, ct, owner.address, 5), ""), "constructor refuses an auction the treasury doesn't use");
const bytes = (art("VotedUnrig").bytecode.length - 2) / 2;
ok(((await P.getCode(vu)).length - 2) / 2 <= 24576, `fits Arbitrum's size limit (${((await P.getCode(vu)).length - 2) / 2} bytes runtime, ${bytes} with constructor)`);

console.log("\nProposals (all inside one 30-day term)");
const pay = await CT.nextProposalId();
await w(CT.connect(cits[10]).proposePayment(0, it, 0, cits[11].address, E(20)));
const rej = pay + 1n; await w(CT.connect(cits[10]).proposePayment(0, it, 0, cits[15].address, E(5)));
const sale = pay + 2n; await w(CT.connect(cits[10]).proposeSale(0, it, 0, E(20), u, 1000n));
const small = pay + 3n; await w(CT.connect(cits[13]).proposePayment(1, it, 0, cits[12].address, E(5)));
ok(await reverts(() => VU.connect(cits[11]).convertPayment(pay, E(1)), "payment not executed"), "can't convert while the vote is still running");
for (let i = 1; i < 5; i++) { await w(CT.connect(cits[i]).vote(pay, true)); await w(CT.connect(cits[i]).vote(sale, true)); }
await w(CT.connect(cits[1]).vote(small, true)); await w(CT.connect(cits[2]).vote(small, true));
await warp(EXEC);
await w(CT.executePayment(pay)); await w(CT.executePayment(rej)); await w(CT.executePayment(small)); await w(CT.startAuction(sale));
ok((await CT.proposals(pay)).status === 2n, "payment of 20 UNRIG executed after vote + 5-day delay");
// The sale's sealed bids go in now (2-day commit window); they are revealed after the timelock wait.
const [bA, bB] = [cits[12], cits[14]];
for (const s of [bA, bB]) { await w(usdc.mint(s.address, 10000n)); await w(usdc.connect(s).approve(ct, 10000n)); }
const salt = ethers.id("salt");
await w(CT.connect(bA).commitBid(sale, await CT.commitHashFor(sale, 1500n, salt, bA.address)));
await w(CT.connect(bB).commitBid(sale, await CT.commitHashFor(sale, 1200n, salt, bB.address)));

console.log("\nTimelock: make vUNRIG an authorized sink (the mainnet step)");
const TL = await deploy("FairRoundTimelock", owner.address); const tl = await TL.getAddress();
await w(IT.transferOwnership(tl));
ok((await IT.owner()) === tl, "InvestToken owned by the 48-hour timelock, as on mainnet");
await w(IT.connect(cits[11]).approve(vu, MAX));
ok(await reverts(() => VU.connect(cits[11]).convertPayment(pay, E(10)), "closed loop"), "before the timelock step, nothing can be converted");
ok(await reverts(() => IT.setAuthorizedSink(vu, true), "0x118cdaa7"), "the deployer wallet can no longer change InvestToken directly");
const data = IT.interface.encodeFunctionData("setAuthorizedSink", [vu, true]);
const ZERO32 = ethers.ZeroHash, salt0 = ethers.id("vUNRIG sink");
await w(TL.schedule(it, 0, data, ZERO32, salt0, 48 * HOUR));
ok(await reverts(() => TL.execute(it, 0, data, ZERO32, salt0), "0x5ead8eb5"), "execute fails before 48 hours have passed");
await warp(48 * HOUR + 1);
await w(TL.execute(it, 0, data, ZERO32, salt0));
ok(await IT.authorizedSink(vu), "after 48 hours: execute -> vUNRIG is an authorized sink");
{ const t = await now(); const ce = (await CT.auctions(sale)).commitEnd; if (BigInt(t) <= ce) await warp(Number(ce) - t + 1); }
await w(CT.connect(bA).revealBid(sale, 1500n, salt)); await w(CT.connect(bB).revealBid(sale, 1200n, salt));

console.log("\nVoted payment -> burn UNRIG -> vUNRIG");
let [acct, left] = await VU.convertible(pay);
ok(acct === cits[11].address && left === E(20), "convertible(): recipient may convert the full 20");
const dead0 = await IT.balanceOf(await VU.DEAD());
await w(VU.connect(cits[11]).convertPayment(pay, E(12)));
ok((await VU.balanceOf(cits[11].address)) === E(12), "converted 12: 12 vUNRIG minted");
ok((await IT.balanceOf(await VU.DEAD())) - dead0 === E(12) && (await IT.balanceOf(vu)) === 0n, "the 12 UNRIG went to the dead address; the contract holds none");
await w(VU.connect(cits[11]).convertPayment(pay, E(8)));
ok((await VU.convertedFrom(pay)) === E(20), "partial conversions add up to the payment (12 + 8)");
ok(await reverts(() => VU.connect(cits[11]).convertPayment(pay, 1n), "more than the treasury released"), "ATTACK: converting the same payment again fails");

console.log("\nvUNRIG trades freely; UNRIG stays closed-loop");
await w(VU.connect(cits[11]).transfer(cits[14].address, E(5)));
ok((await VU.balanceOf(cits[14].address)) === E(5), "vUNRIG moves wallet to wallet (a pool or exchange could hold it)");
ok(await reverts(() => IT.connect(cits[11]).transfer(cits[14].address, E(1)), "closed loop"), "plain UNRIG still can't move wallet to wallet");
ok((await VU.totalSupply()) === (await VU.totalBurned()), "supply = UNRIG burned: every vUNRIG destroyed one UNRIG");

console.log("\nFarmers and other ways around the vote");
const farmer = cits[15];
await w(IT.connect(farmer).approve(vu, MAX));
ok(await reverts(() => VU.connect(farmer).convertPayment(pay, E(1)), "not the recipient"), "ATTACK: a farmer can't convert someone else's payment");
ok(await reverts(() => VU.connect(farmer).convertPayment(9999, E(1)), ""), "ATTACK: a made-up proposal id fails");
const fb = await IT.balanceOf(farmer.address);
await w(IT.connect(farmer).transfer(vu, E(100)));   // allowed: vUNRIG is a sink
ok((await VU.balanceOf(farmer.address)) === 0n && (await IT.balanceOf(farmer.address)) === fb - E(100), "ATTACK: sending free claims straight to the contract mints nothing");
await w(VU.connect(cits[3]).burnStray());
ok((await IT.balanceOf(vu)) === 0n, "anyone can burn stray UNRIG; the contract is empty again");
ok(await reverts(() => VU.burnStray(), "nothing to burn"), "burnStray with nothing to burn reverts");

console.log("\nRejected payments, small listings");
ok((await CT.proposals(rej)).status === 1n, "a payment nobody voted for is rejected");
ok(await reverts(() => VU.connect(farmer).convertPayment(rej, E(1)), "payment not executed"), "ATTACK: a rejected payment can't be converted");
ok((await CT.proposals(small)).status === 2n, "small listing (3 units): payment executed");
await w(IT.connect(cits[12]).approve(vu, MAX));
ok(await reverts(() => VU.connect(cits[12]).convertPayment(small, E(1)), "listing too small"), "ATTACK: UNRIG from a listing below 5 units can't be converted (one person could own it)");
[acct, left] = await VU.convertible(small);
ok(acct === ethers.ZeroAddress && left === 0n, "convertible() says so too");

console.log("\nVoted sale -> burn UNRIG -> vUNRIG");
ok(await reverts(() => VU.connect(bA).convertSale(sale, E(1)), "sale not settled"), "can't convert before the sale is settled");
await warp(DAY + 1); await w(CT.settleAuction(sale));
ok(await reverts(() => VU.connect(bA).convertSale(sale, E(1)), "claim the sale first"), "winner must claim the UNRIG first");
await w(CT.connect(bA).claimAuction(sale)); await w(CT.connect(bB).claimAuction(sale));
ok(await reverts(() => VU.connect(bB).convertSale(sale, E(1)), "not the winner"), "ATTACK: the losing bidder can't convert");
ok(await reverts(() => VU.connect(bA).convertPayment(sale, E(1)), "not a payment"), "ATTACK: a sale can't be converted as a payment");
ok(await reverts(() => VU.connect(cits[11]).convertSale(pay, E(1)), "not a sale"), "ATTACK: a payment can't be converted as a sale");
await w(VU.connect(bA).convertSale(sale, E(20)));
ok((await VU.balanceOf(bA.address)) === E(20), "sale winner converted the 20 UNRIG they bought");
ok(await reverts(() => VU.connect(bA).convertSale(sale, 1n), "more than the treasury released"), "ATTACK: and not a wei more");

console.log("\nAccounting");
const deadNow = (await IT.balanceOf(await VU.DEAD())) - dead0;
ok((await VU.totalSupply()) === E(40) && deadNow === E(140) && (await VU.totalBurned()) === E(140), "vUNRIG supply 40 (20 paid + 20 sold); 140 UNRIG burned (incl. the farmer's 100 stray)");
ok((await IT.balanceOf(vu)) === 0n, "the contract ends holding no UNRIG");
ok((await RA.companies(0)).capital === capital0 - E(20) - E(20), "the listing's capital fell by exactly what holders voted out (20 paid + 20 sold)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
