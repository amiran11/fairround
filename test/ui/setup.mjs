// Builds a local chain that looks like the launch of version 9:
//   - version 8 (InvestToken, RoundAuction, Governance, CompanyTreasury,
//     OpenVerifier) as it is live, INVEST unlocked by a sold 1-share company;
//   - version 9 deployed next to it per DEPLOY_V9.md, the same companies in
//     share tiers, and enough activity to exercise every screen.
// Writes state.json with all addresses and the actors the browser test uses.
import { ethers } from "ethers";
import fs from "fs";
const ART = process.env.ART;   // v8 artifacts (and MockERC20)
const ART9 = process.env.ART9; // v9 artifacts
const art = (n) => JSON.parse(fs.readFileSync(`${n.endsWith("V9") || n === "OpenVerifierV2" || n === "SakartveloTimelock" ? ART9 : ART}/${n}.art.json`));
const P = new ethers.JsonRpcProvider("http://127.0.0.1:8545", undefined, { cacheTimeout: -1, pollingInterval: 50 });
{ const est = P.estimateGas.bind(P); P.estimateGas = async (tx) => ((await est(tx)) * 15n) / 10n; }
const E = (n) => ethers.parseEther(String(n));
const MAX = ethers.MaxUint256;
const DAY = 86400;
const w = async (p) => (await p).wait();
const warp = async (s) => { await P.send("evm_increaseTime", [s]); await P.send("evm_mine", []); };
const now = async () => (await P.getBlock("latest")).timestamp;
const S = await Promise.all((await P.listAccounts()).map((a) => P.getSigner(a.address)));
const [owner, A, B, C, KEY, V, D, NEWBIE] = S;
const deploy = async (n, ...a) => { const c = await new ethers.ContractFactory(art(n).abi, art(n).bytecode, owner).deploy(...a); await c.waitForDeployment(); return c; };

// ------------------------------------------------------------- version 8
const IT = await deploy("InvestToken", 1000);
const it = await IT.getAddress();
const RA8 = await deploy("RoundAuction", it);
const GOV8 = await deploy("Governance", await RA8.getAddress());
const CT8 = await deploy("CompanyTreasury", it, await RA8.getAddress(), await GOV8.getAddress());
const OV1 = await deploy("OpenVerifier", it);
const GEL = await deploy("MockERC20", "GEL");
const gel = await GEL.getAddress();
await w(RA8.setGovernance(await GOV8.getAddress())); await w(RA8.setTreasury(await CT8.getAddress()));
await w(IT.setAuthorizedSink(await RA8.getAddress(), true)); await w(IT.setAuthorizedSink(await CT8.getAddress(), true));
await w(IT.setRoundAuctionForTradability(await RA8.getAddress()));
await w(IT.setVerifier(await OV1.getAddress(), true));
await w(CT8.setApprovedPaymentToken(gel, true));

const cits = [A, B, C, V, D];
await w(IT.setVerifiedCitizens(cits.map((s) => s.address), true));
for (const s of cits) await w(IT.connect(s).claim());
for (const s of cits) { await w(IT.connect(s).approve(await RA8.getAddress(), MAX)); }
await w(RA8.listCompany(0, "Bolnisi Gold Mines", 10, 3600));
await w(RA8.listCompany(11, "Georgian Stock Exchange", 1, 3600));
await w(RA8.connect(C).placeBid(11, E(5))); await w(RA8.connect(A).placeBid(0, E(10))); await w(RA8.connect(V).placeBid(0, E(5)));
{ const c = await RA8.companies(11); const t = await now(); if (Number(c.roundEnd) > t) await warp(Number(c.roundEnd) - t + 1); }
await w(RA8.settleRound(11)); await w(RA8.settleRound(0));
if (!(await RA8.globalTradabilityUnlocked())) throw new Error("v8 tradability should be unlocked");

// ------------------------------------------------------------- version 9 (DEPLOY_V9.md parts 2-3)
const RA = await deploy("RoundAuctionV9", it); const ra = await RA.getAddress();
const GOV = await deploy("GovernanceV9", ra); const gov = await GOV.getAddress();
const CT = await deploy("CompanyTreasuryV9", it, ra, gov); const ct = await CT.getAddress();
const DV = await deploy("CompanyDividendsV9", it, ra, gov); const dv = await DV.getAddress();
const OV2 = await deploy("OpenVerifierV2", it, owner.address); const ov2 = await OV2.getAddress();
await w(RA.setGovernance(gov)); await w(RA.setTreasury(ct)); await w(RA.setDividends(dv));
for (const a of [ra, ct, dv]) await w(IT.setAuthorizedSink(a, true));
await w(IT.setVerifier(ov2, true)); await w(IT.setVerifier(await OV1.getAddress(), false));
await w(CT.setApprovedToken(gel, true));
for (const s of cits) { await w(IT.connect(s).approve(ra, MAX)); }

const settleWith = async (id, bids) => {
  // An expired round with no bids is settled first, which opens the next one.
  { const c0 = await RA.companies(id); if (BigInt(await now()) >= c0.roundEnd) await w(RA.settleRound(id, { gasLimit: 32_000_000 })); }
  const st = await RA.roundStart(id); let t = await now(); if (Number(st) > t) await warp(Number(st) - t + 1);
  for (const [s, amt] of bids) await w(RA.connect(s).placeBid(id, E(amt), MAX));
  const c = await RA.companies(id); t = await now(); if (Number(c.roundEnd) > t) await warp(Number(c.roundEnd) - t + 1);
  await w(RA.settleRound(id, { gasLimit: 32_000_000 }));
};

// Three test companies sized so one round passes 50% (the launch tiers are bigger).
await w(RA.listCompany(0, "Bolnisi Gold Mines", 150, 3600));
await w(RA.listCompany(3, "Batumi Sea Port", 150, 3600));
await w(RA.listCompany(4, "Sakartvelo Land Fund", 150, 3600));
await settleWith(0, [[A, 60], [B, 30], [V, 20], [D, 1]]);    // price 1: 111 shares
await settleWith(3, [[B, 40], [D, 20], [V, 30], [C, 1]]);    // 91 shares
await settleWith(4, [[A, 40], [V, 30], [C, 10], [D, 1]]);    // 81 shares
await warp(DAY + 60);

// Company 0: election -> governor A, operating key KEY.
await w(GOV.openCandidacy(0));
await w(GOV.connect(A).declareCandidacy(0, "Keep the mine running and publish monthly accounts."));
await w(GOV.connect(B).declareCandidacy(0, "Pay dividends every term."));
await w(GOV.connect(V).nominate(0, A.address));
await warp(3 * DAY);
// Company 3: candidacy opens three days later, so its vote is still open at the end.
const longProgram = [
  "Batumi Sea Port should earn its keep before it pays anyone.",
  "",
  "1. Publish the port's accounts every month, on-chain, so every shareholder can check them.",
  "2. Propose selling the idle cranes at a sealed-bid auction and investing the proceeds in Georgian Railway, which moves our cargo.",
  "3. No dividend vote for reinvesting in my first term. From the second, I'll back a dividend whenever capital grows.",
  "4. Every payment comes with a full invoice in the proposal.",
].join("\n");
await w(GOV.openCandidacy(3));
await w(GOV.connect(B).declareCandidacy(3, longProgram));
await w(GOV.connect(D).declareCandidacy(3, "Lower port fees to win traffic from Poti. Reinvest everything until volumes double."));
await warp(2 * DAY + 60);
await w(GOV.openVoting(0));
await w(GOV.connect(A).vote(0, A.address)); await w(GOV.connect(V).vote(0, A.address)); await w(GOV.connect(B).vote(0, B.address));
await warp(3 * DAY + 60);
await w(GOV.tallyRound(0));
if ((await GOV.companyGovernor(0)) !== A.address) throw new Error("A should govern company 0");
await w(GOV.openVoting(3));
await w(GOV.connect(D).vote(3, D.address));
await w(GOV.connect(A).setOperatingKey(0, KEY.address)); await w(GOV.connect(KEY).acceptOperatingKey(0));
await w(owner.sendTransaction({ to: KEY.address, value: E(0.01) }));
// Company 4: candidacy open now; V can back a candidate.
await w(GOV.openCandidacy(4));
await w(GOV.connect(A).declareCandidacy(4, "Lease the land to farmers on ten-year contracts."));

// Treasury of company 0: a GEL gift, then the governor's proposals.
await w(GEL.mint(C.address, E(1000))); await w(GEL.connect(C).approve(ct, E(1000))); await w(CT.connect(C).depositToken(0, gel, E(1000)));
await w(CT.connect(KEY).proposePayment(0, gel, 0, C.address, E(50)));                 // proposal 0
await w(CT.connect(KEY).proposeSale(0, gel, 0, E(100), it, E(10)));                   // proposal 1: 100 GEL, reserve 10 INVEST
await w(GEL.mint(V.address, E(100)));

// Share market: B offers one share of company 0.
const bTokens = (await RA.queryFilter(RA.filters.Transfer(null, B.address))).map((e) => e.args[2]);
await w(RA.connect(B).listShare(bTokens[0], E(3)));

// The rest of the roster in launch tiers (DEPLOY_V9.md), with open rounds.
const roster = [
  [1, "Georgian Railway", 6000], [2, "Enguri Hydropower Plant", 6000], [10, "Anaklia Deep Sea Port", 6000],
  [8, "Chiatura Manganese Concern", 3000], [9, "Zestafoni Ferroalloys Plant", 3000],
  [5, "Tkibuli Coal Basin", 1000], [6, "Racha Marble Works", 1000], [7, "National Forest Fund", 1000],
  [11, "Georgian Stock Exchange", 12000],
];
for (const [id, name, n] of roster) await w(RA.listCompany(id, name, n, 3600));
await w(RA.connect(A).placeBid(1, E(50), MAX)); await w(RA.connect(V).placeBid(1, E(20), E(5)));

const chainNow = await now();
fs.writeFileSync("state.json", JSON.stringify({
  addresses: {
    InvestToken: it, RoundAuction: await RA8.getAddress(), Governance: await GOV8.getAddress(), CompanyTreasury: await CT8.getAddress(), OpenVerifier: await OV1.getAddress(),
    RoundAuctionV9: ra, GovernanceV9: gov, CompanyTreasuryV9: ct, CompanyDividendsV9: dv, OpenVerifierV2: ov2,
  },
  gel, owner: owner.address, A: A.address, B: B.address, C: C.address, key: KEY.address, viewer: V.address, D: D.address, newbie: NEWBIE.address,
  bListed: bTokens[0].toString(),
  offsetMs: chainNow * 1000 - Date.now(),
}, null, 2));
console.log("setup done; chain is", Math.round((chainNow * 1000 - Date.now()) / 3600000), "hours ahead of wall clock");
