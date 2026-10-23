// Rehearsal of DEPLOY_FAIRROUND.md on a local chain with Arbitrum's limits.
// A fresh, standalone FairRound set: InvestToken (test credits) plus the v9
// contracts, no v8. Follows the checklist step by step and reads every value
// back, then a new wallet verifies, claims, bids and receives a unit.
import { ethers } from "ethers";
import fs from "fs";
const art = (n) => JSON.parse(fs.readFileSync(`./art9/${n}.art.json`));
const P = new ethers.JsonRpcProvider("http://127.0.0.1:8545", undefined, { cacheTimeout: -1 });
{ const est = P.estimateGas.bind(P); P.estimateGas = async (tx) => ((await est(tx)) * 15n) / 10n; }
const E = (n) => ethers.parseEther(String(n));
const HOUR = 3600;
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "  PASS " : "  FAIL ") + m); c ? pass++ : fail++; };
const w = async (p) => (await p).wait();
const warp = async (s) => { await P.send("evm_increaseTime", [s]); await P.send("evm_mine", []); };
const S = await Promise.all((await P.listAccounts()).map((a) => P.getSigner(a.address)));
const me = S[0];
const deploy = async (n, ...a) => { const c = await new ethers.ContractFactory(art(n).abi, art(n).bytecode, me).deploy(...a); await c.waitForDeployment(); return c; };

console.log("Part 2 — deploy (7 contracts)");
const IT = await deploy("InvestToken", 10000); const it = await IT.getAddress();
ok((await IT.symbol()) === "UNRIG" && (await IT.name()) === "Unrig" && (await IT.maxCitizens()) === 10000n, "2.1 InvestToken: name Unrig, symbol UNRIG, maxCitizens 10000");
const RA9 = await deploy("RoundAuctionV9", it); const ra9 = await RA9.getAddress();
const GOV9 = await deploy("GovernanceV9", ra9); const gov9 = await GOV9.getAddress();
const CT9 = await deploy("CompanyTreasuryV9", it, ra9, gov9); const ct9 = await CT9.getAddress();
const DV9 = await deploy("CompanyDividendsV9", it, ra9, gov9); const dv9 = await DV9.getAddress();
const OV2 = await deploy("OpenVerifierV2", it, me.address); const ov2 = await OV2.getAddress();
const TL = await deploy("FairRoundTimelock", me.address); const tl = await TL.getAddress();
for (const [n, c] of [["InvestToken", IT], ["RoundAuctionV9", RA9], ["GovernanceV9", GOV9], ["CompanyTreasuryV9", CT9], ["CompanyDividendsV9", DV9], ["OpenVerifierV2", OV2], ["FairRoundTimelock", TL]]) {
  const len = ((await P.getCode(await c.getAddress())).length - 2) / 2;
  ok(len > 0 && len <= 24576, `2: ${n} deployed, ${len} bytes`);
}
ok((await OV2.HOURLY_CAP()) === 50n, "2.6 OV2 HOURLY_CAP = 50");
ok((await GOV9.shares()) === ra9 && (await CT9.roundAuction()) === ra9 && (await DV9.governance()) === gov9, "2: constructor addresses read back");

console.log("Part 3 — wiring");
await w(RA9.setGovernance(gov9)); ok((await RA9.governance()) === gov9, "3.1 governance = GOV9");
await w(RA9.setTreasury(ct9)); ok((await RA9.treasury()) === ct9, "3.2 treasury = CT9");
await w(RA9.setDividends(dv9)); ok((await RA9.dividends()) === dv9, "3.3 dividends = DV9");
const LAUNCHES = [
  [0, 'The Chosen One', 1],
  [1, 'The Musketeers', 3],
  [2, 'The Fellowship', 9],
  [3, 'Spartans', 300],
  [4, 'The Thousand', 1000],
  [5, 'The Immortals', 10000],
  [6, 'Camelot', 12000],
  [7, '30K Corp', 30000],
  [8, 'Hundred K Guild', 100000],
  [9, "Xerxes' Host", 300000],
];
for (const [id, name, n] of LAUNCHES) await w(RA9.listCompany(id, name, n, HOUR));
let allListed = true;
for (const [id, name, n] of LAUNCHES) { const c = await RA9.companies(id); allListed &&= c.name === name && c.totalShares === BigInt(n); }
ok(allListed, "3.4 all 10 tiers listed");
await w(IT.setAuthorizedSink(ra9, true)); ok(await IT.authorizedSink(ra9), "3.5 RA9 sink");
await w(IT.setAuthorizedSink(ct9, true)); ok(await IT.authorizedSink(ct9), "3.6 CT9 sink");
await w(IT.setAuthorizedSink(dv9, true)); ok(await IT.authorizedSink(dv9), "3.7 DV9 sink");
await w(IT.setVerifier(ov2, true)); ok(await IT.verifier(ov2), "3.8 OV2 verifier");
ok((await IT.roundAuctionForTradability()) === ethers.ZeroAddress && (await IT.auctionHouse()) === ethers.ZeroAddress, "do-not-touch: tradability and auctionHouse left unset");

console.log("Part 4 — timelock");
await w(RA9.transferOwnership(tl)); ok((await RA9.owner()) === tl, "4.1 RA9 owner = TL");
await w(CT9.transferOwnership(tl)); ok((await CT9.owner()) === tl, "4.2 CT9 owner = TL");
await w(IT.transferOwnership(tl)); ok((await IT.owner()) === tl, "4.3 InvestToken owner = TL");
let threw = false; try { await w(RA9.listCompany(99, "x", 10, HOUR)); } catch { threw = true; }
ok(threw, "4: the deploying wallet can no longer list directly");

console.log("Smoke test — a new wallet uses it");
const u = S[5];
await w(OV2.connect(u).verifySelf());
await w(IT.connect(u).claim());
ok((await IT.balanceOf(u.address)) === E(1000), "wallet verified with OV2 and claimed 1,000 UNRIG test credits");
threw = false; try { await w(IT.connect(u).transfer(S[6].address, E(1))); } catch { threw = true; }
ok(threw, "test credits can't be sent wallet to wallet (closed loop, tradability unset)");
await w(IT.connect(u).approve(ra9, ethers.MaxUint256));
const c = await RA9.companies(0);
if (Number(c.roundEnd) <= (await P.getBlock("latest")).timestamp) { await w(RA9.settleRound(0)); await warp(HOUR + 1); }
await w(RA9.connect(u).placeBid(0, E(10), E(10)));
ok((await IT.balanceOf(ra9)) === E(10), "bid escrowed in RA9 (spending into a sink works)");
const c2 = await RA9.companies(0); await warp(Number(c2.roundEnd) - (await P.getBlock("latest")).timestamp + 1);
await w(RA9.settleRound(0, { gasLimit: 32_000_000 }));
ok((await RA9.companyShareCount(0, u.address)) === 1n, "round settled: the wallet holds a unit");
ok((await RA9.ownerOf(0n)) === u.address, "unit NFT minted to the wallet");
{ const uri = await RA9.tokenURI(0n); const j = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
  ok(j.name === "The Chosen One - Unit 1/1" && j.description.startsWith("FairRound unit") && (await RA9.name()) === "FairRound Unit" && (await RA9.symbol()) === "FRUNIT", "unit metadata says FairRound: " + j.name); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
