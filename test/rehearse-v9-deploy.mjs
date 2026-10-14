// Rehearsal of DEPLOY_V9.md on a local chain with Arbitrum's limits.
// Follows the checklist step by step and reads every value back.
// InvestToken and the v8 RoundAuction are stand-ins for the live ones.
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
const at = (n, addr) => new ethers.Contract(addr, art(n).abi, me);

console.log("Stand-ins for the live v8 system");
const IT = await deploy("InvestToken", 1000);
const RA8 = await deploy("RoundAuction", await IT.getAddress());
const OV1 = await deploy("OpenVerifier", await IT.getAddress());
await w(IT.setRoundAuctionForTradability(await RA8.getAddress()));
await w(IT.setVerifier(await OV1.getAddress(), true));
await w(IT.setAuthorizedSink(await RA8.getAddress(), true));
const it = await IT.getAddress();

console.log("Part 2 — deploy");
const RA9 = await deploy("RoundAuctionV9", it); const ra9 = await RA9.getAddress();
const GOV9 = await deploy("GovernanceV9", ra9); const gov9 = await GOV9.getAddress();
const CT9 = await deploy("CompanyTreasuryV9", it, ra9, gov9); const ct9 = await CT9.getAddress();
const DV9 = await deploy("CompanyDividendsV9", it, ra9, gov9); const dv9 = await DV9.getAddress();
const OV2 = await deploy("OpenVerifierV2", it, me.address); const ov2 = await OV2.getAddress();
const TL = await deploy("SakartveloTimelock", me.address); const tl = await TL.getAddress();
for (const [n, c] of [["RoundAuctionV9", RA9], ["GovernanceV9", GOV9], ["CompanyTreasuryV9", CT9], ["CompanyDividendsV9", DV9], ["OpenVerifierV2", OV2], ["SakartveloTimelock", TL]]) {
  const len = ((await P.getCode(await c.getAddress())).length - 2) / 2;
  ok(len > 0 && len <= 24576, `2: ${n} deployed, ${len} bytes`);
}
ok(RA9.interface.getFunction("placeCorporateBid") && RA9.interface.getFunction("corporateCompanyPlusOne") && CT9.interface.getFunction("proposeInvest"), "2: new functions present (not stale code)");

console.log("Part 3 — wiring");
await w(RA9.setGovernance(gov9)); ok((await RA9.governance()) === gov9, "3.1 governance = GOV9");
await w(RA9.setTreasury(ct9)); ok((await RA9.treasury()) === ct9, "3.2 treasury = CT9");
await w(RA9.setDividends(dv9)); ok((await RA9.dividends()) === dv9, "3.3 dividends = DV9");
let threw = false; try { await w(RA9.setTreasury(me.address)); } catch { threw = true; }
ok(threw, "3.1-3.3 can't be set twice");
const COMPANIES = [
  [0, "Bolnisi Gold Mines", 3000], [1, "Georgian Railway", 6000], [2, "Enguri Hydropower Plant", 6000], [3, "Batumi Sea Port", 6000],
  [4, "Sakartvelo Land Fund", 3000], [5, "Tkibuli Coal Basin", 1000], [6, "Racha Marble Works", 1000], [7, "National Forest Fund", 1000],
  [8, "Chiatura Manganese Concern", 3000], [9, "Zestafoni Ferroalloys Plant", 3000], [10, "Anaklia Deep Sea Port", 6000], [11, "Georgian Stock Exchange", 12000],
];
for (const [id, name, n] of COMPANIES) await w(RA9.listCompany(id, name, n, HOUR));
let allListed = true;
for (const [id, name, n] of COMPANIES) { const c = await RA9.companies(id); allListed &&= c.name === name && c.totalShares === BigInt(n); }
ok(allListed, "3.4 all 12 companies listed with their tiers (DEPLOY_V9.md table)");
await w(IT.setAuthorizedSink(ra9, true)); ok(await IT.authorizedSink(ra9), "3.5 RA9 sink");
await w(IT.setAuthorizedSink(ct9, true)); ok(await IT.authorizedSink(ct9), "3.6 CT9 sink");
await w(IT.setAuthorizedSink(dv9, true)); ok(await IT.authorizedSink(dv9), "3.7 DV9 sink");
await w(IT.setVerifier(ov2, true)); ok(await IT.verifier(ov2), "3.8 OV2 verifier");
await w(IT.setVerifier(await OV1.getAddress(), false)); ok(!(await IT.verifier(await OV1.getAddress())), "3.9 old OpenVerifier off");
ok((await IT.roundAuctionForTradability()) === await RA8.getAddress() && (await IT.auctionHouse()) === ethers.ZeroAddress, "do-not-touch: tradability still on v8, auctionHouse unset");
ok(await IT.authorizedSink(await RA8.getAddress()), "do-not-touch: v8 sink kept");

console.log("Part 4 — timelock");
await w(RA9.transferOwnership(tl)); ok((await RA9.owner()) === tl, "4.1 RA9 owner = TL");
await w(CT9.transferOwnership(tl)); ok((await CT9.owner()) === tl, "4.2 CT9 owner = TL");
await w(IT.transferOwnership(tl)); ok((await IT.owner()) === tl, "4.3 InvestToken owner = TL");
threw = false; try { await w(RA9.listCompany(101, "x", 10, HOUR)); } catch { threw = true; }
ok(threw, "4: your wallet can no longer list directly");

console.log("Part 5 — list a company through the timelock");
const data = RA9.interface.encodeFunctionData("listCompany", [101, "Second v9 company", 50, HOUR]);
const Z = ethers.ZeroHash;
await w(TL.schedule(ra9, 0, data, Z, Z, 172800));
threw = false; try { await w(TL.execute(ra9, 0, data, Z, Z)); } catch { threw = true; }
ok(threw, "5: can't execute before 48 hours");
await warp(172800 + 1);
await w(TL.execute(ra9, 0, data, Z, Z));
ok((await RA9.companies(101)).name === "Second v9 company", "5: listed after 48 hours");

console.log("Smoke test — a new citizen uses v9");
const cit = S[5];
await w(OV2.connect(cit).verifySelf());
await w(IT.connect(cit).claim());
ok((await IT.balanceOf(cit.address)) === E(1000), "citizen verified with OV2 and claimed 1,000 INVEST");
await w(IT.connect(cit).approve(ra9, ethers.MaxUint256));
const c = await RA9.companies(101);
const t = (await P.getBlock("latest")).timestamp;
if (Number(c.roundEnd) <= t) { await w(RA9.settleRound(101)); await warp(HOUR + 1); }
await w(RA9.connect(cit).placeBid(101, E(10), E(10)));
const c2 = await RA9.companies(101); await warp(Number(c2.roundEnd) - (await P.getBlock("latest")).timestamp + 1);
await w(RA9.settleRound(101, { gasLimit: 32_000_000 }));
ok((await RA9.companyShareCount(101, cit.address)) === 1n, "bid settled: the citizen holds a v9 share");
const ownerNow = await RA9.ownerOf(0n);
ok(ownerNow === cit.address, "share NFT minted to the citizen");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
