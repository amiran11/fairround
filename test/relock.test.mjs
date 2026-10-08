// Rehearses the mainnet re-lock: unlock via a 1-share company (as happened),
// then point InvestToken at TradabilityLock and exempt a fee wallet.
import { ethers } from "ethers";
import fs from "fs";
const art = (n) => JSON.parse(fs.readFileSync(`art/${n}.art.json`));
const P = new ethers.JsonRpcProvider("http://127.0.0.1:8545", undefined, { cacheTimeout: -1, pollingInterval: 50 });
const E = (n) => ethers.parseEther(String(n));
const w = async (p) => (await p).wait();
const warp = async (s) => { await P.send("evm_increaseTime", [s]); await P.send("evm_mine", []); };
const S = await Promise.all((await P.listAccounts()).slice(0, 6).map((a) => P.getSigner(a.address)));
const [owner, A, B, FEE, NEW, X] = S;
const deploy = async (n, ...a) => { const c = await new ethers.ContractFactory(art(n).abi, art(n).bytecode, owner).deploy(...a); await c.waitForDeployment(); return c; };
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); c ? pass++ : fail++; };
const reverts = async (p) => { try { await w(p); return false; } catch { return true; } };

const IT = await deploy("InvestToken", 300000);
const RA = await deploy("RoundAuction", await IT.getAddress());
const GOV = await deploy("Governance", await RA.getAddress());
const CT = await deploy("CompanyTreasury", await IT.getAddress(), await RA.getAddress(), await GOV.getAddress());
const OV = await deploy("OpenVerifier", await IT.getAddress());
const ra = await RA.getAddress(), ct = await CT.getAddress();
await w(RA.setGovernance(await GOV.getAddress())); await w(RA.setTreasury(ct));
await w(IT.setAuthorizedSink(ra, true)); await w(IT.setAuthorizedSink(ct, true)); await w(IT.setRoundAuctionForTradability(ra));
await w(IT.setVerifier(await OV.getAddress(), true));
await w(IT.setVerifiedCitizens([owner.address, A.address, B.address], true));
for (const s of [owner, A, B]) { await w(IT.connect(s).claim()); await w(IT.connect(s).approve(ra, ethers.MaxUint256)); }

// What happened on mainnet: 1-share company, one bid, settle -> unlocked.
await w(RA.listCompany(11, "Georgian Stock Exchange", 1, 3600));

await w(RA.connect(owner).placeBid(11, E(1000)));
await warp(3601); await w(RA.settleRound(11));
ok(await RA.globalTradabilityUnlocked(), "1-share company unlocked tradability (reproduces mainnet)");
await w(RA.connect(owner).withdrawHostFees());
ok((await IT.balanceOf(owner.address)) === E(10), "owner holds the 10 INVEST host fee");
ok(!(await reverts(IT.connect(A).transfer(B.address, E(1)))), "while unlocked, citizen->citizen transfer works");

// Step A: move the 10 INVEST to a separate fee wallet (possible while unlocked).
await w(IT.connect(owner).transfer(FEE.address, E(10)));
// Step B: deploy the lock and point InvestToken at it.
const LOCK = await deploy("TradabilityLock");
await w(IT.setRoundAuctionForTradability(await LOCK.getAddress()));
// Step C: exempt the fee wallet.
await w(IT.setAuthorizedSink(FEE.address, true));

ok(await reverts(IT.connect(A).transfer(X.address, E(1))), "after re-lock, citizen -> outsider transfer is blocked");
ok(await reverts(IT.connect(A).transfer(B.address, E(1))), "after re-lock, citizen -> citizen transfer is blocked");
ok(!(await reverts(IT.connect(FEE).transfer(X.address, E(4)))), "fee wallet can still send INVEST to anyone (sell)");
ok((await IT.balanceOf(X.address)) === E(4), "outsider received 4 INVEST from the fee wallet");
ok(await reverts(IT.connect(X).transfer(NEW.address, E(1))), "the buyer can't pass it on further (closed loop for them)");

// The rest of the system still works under the lock.
await w(RA.listCompany(1, "Railway", 1000, 3600));
await w(IT.setVerifiedCitizen(NEW.address, true));
ok(!(await reverts(IT.connect(NEW).claim())), "new citizen can still claim");
await w(IT.connect(NEW).approve(ra, ethers.MaxUint256));
ok(!(await reverts(RA.connect(NEW).placeBid(1, E(100)))), "bidding in auctions still works");
ok(!(await reverts(RA.connect(A).placeBid(1, E(50)))), "second bidder too");
await warp(3601);
ok(!(await reverts(RA.settleRound(1))), "settling a round (mints + refunds) still works");
ok(await RA.globalTradabilityUnlocked(), "(RoundAuction's own flag stays true, but InvestToken no longer reads it)");

// Owner can reopen later without a redeploy.
await w(LOCK.setUnlocked(true));
ok(!(await reverts(IT.connect(A).transfer(B.address, E(1)))), "LOCK.setUnlocked(true) reopens trading");
await w(LOCK.setUnlocked(false));
ok(await reverts(IT.connect(A).transfer(B.address, E(1))), "and setUnlocked(false) closes it again");
ok(await reverts(LOCK.connect(A).setUnlocked(true)), "only the owner can flip the lock");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
