// Drives the built site in Chromium against the launch-day local chain
// (setup.mjs): version 9 as the main site, version 8 in the archive. Every
// action is a real transaction, checked on the chain. Part of the test
// moves the chain clock forward to run the 5-day wait and a sealed-bid sale.
import { chromium } from "playwright";
import { ethers } from "ethers";
import fs from "fs";
const SP = process.env.SP;
const ART = process.env.ART;
const ART9 = process.env.ART9;
const BASE = "http://127.0.0.1:4173";
const st = JSON.parse(fs.readFileSync("state.json"));
const P = new ethers.JsonRpcProvider("http://127.0.0.1:8545", undefined, { cacheTimeout: -1 });
const abi = (dir, n) => JSON.parse(fs.readFileSync(`${dir}/${n}.art.json`)).abi;
const A = st.addresses;
const RA = new ethers.Contract(A.RoundAuctionV9, abi(ART9, "RoundAuctionV9"), P);
const GOV = new ethers.Contract(A.GovernanceV9, abi(ART9, "GovernanceV9"), P);
const CT = new ethers.Contract(A.CompanyTreasuryV9, abi(ART9, "CompanyTreasuryV9"), P);
const IT = new ethers.Contract(A.InvestToken, abi(ART, "InvestToken"), P);
const GEL = new ethers.Contract(st.gel, abi(ART, "MockERC20"), P);
const E = (n) => ethers.parseEther(String(n));
const DAY = 86400;
const SHOTS = `${SP}/shots`; fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "  PASS " : "  FAIL ") + m); c ? pass++ : fail++; };
const problems = [];
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };
let offsetMs = st.offsetMs;
const warp = async (s) => { await P.send("evm_increaseTime", [s]); await P.send("evm_mine", []); offsetMs += s * 1000; };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

// account = null: a visitor without a wallet.
async function open(path, { account = null, viewport = { width: 1280, height: 1000 }, lang = "en" } = {}) {
  const page = await browser.newPage({ viewport });
  const who = account ? account.slice(0, 6) : "visitor";
  page.on("pageerror", (e) => problems.push(`[${who} ${path}] page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") problems.push(`[${who} ${path}] console: ${m.text().slice(0, 200)}`); });
  await page.addInitScript(({ account, offsetMs, lang }) => {
    const realNow = Date.now.bind(Date);
    Date.now = () => realNow() + offsetMs;
    localStorage.setItem("sakartvelo_analytics_consent", "denied");
    localStorage.setItem("sakartvelo_lang", lang);
    if (!account) return;
    window.ethereum = {
      isMetaMask: true, on() {}, removeListener() {},
      async request({ method, params }) {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
        if (method.startsWith("wallet_")) return null;
        const r = await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: (window.__rpcId = (window.__rpcId || 0) + 1), method, params: params || [] }) });
        const j = await r.json();
        if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; }
        return j.result;
      },
    };
  }, { account, offsetMs, lang });
  await page.goto(BASE + path);
  if (account) {
    await page.getByRole("banner").getByRole("button", { name: "Connect wallet" }).click();
    await page.getByRole("banner").getByText(`${account.slice(0, 6)}…`).waitFor({ timeout: 20000 });
  }
  return page;
}
const act = (page, title) => page.locator(".act", { has: page.getByRole("heading", { name: title, exact: true }) });
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const proposal = (page, text) => page.locator("li", { hasText: text });
const signer = async (addr) => P.getSigner(addr);

// ------------------------------------------------------------- visitor
console.log("Visitor without a wallet");
{
  const page = await open("/");
  await page.getByRole("link", { name: "Georgian Stock Exchange" }).waitFor({ timeout: 30000 });
  ok((await page.locator("table.register tbody tr").count()) === 12, "the v9 register lists all 12 companies, read from the chain with no wallet");
  ok(await page.getByText("0 of 12,000").isVisible(), "the Georgian Stock Exchange has 12,000 shares");
  ok(await page.getByText("Governed, term 1").isVisible() && await page.getByText("Election", { exact: true }).isVisible() && await page.getByText("Candidates declaring").isVisible(), "stage stamps: governed, election, candidates declaring");
  await page.screenshot({ path: `${SHOTS}/00-register.png`, fullPage: true });
  await page.getByRole("link", { name: "Enguri Hydropower Plant" }).click();
  await page.getByText("Connect a wallet to bid for shares.").waitFor({ timeout: 20000 });
  ok(!(await page.getByRole("button", { name: "Place bid" }).count()), "a visitor sees the auction but no bid form");
  await page.getByRole("button", { name: "ქართული" }).click();
  await page.getByRole("heading", { name: "აქციების აუქციონი" }).waitFor({ timeout: 5000 });
  ok(await page.getByRole("heading", { name: "ენგურის ჰესი" }).isVisible(), "the Georgian switch translates the page");
  await page.close();
  for (const path of ["/", "/company/0", "/company/3", "/market", `/portfolio/${st.viewer}`, "/rules"]) {
    const ph = await open(path, { viewport: { width: 390, height: 844 } });
    await ph.waitForTimeout(2000);
    ok(await noSideScroll(ph), `phone width: no sideways scrolling on ${path}`);
    await ph.close();
  }
}

// ------------------------------------------------------------- new citizen (OpenVerifierV2)
console.log("Brand-new wallet");
{
  const page = await open("/citizen", { account: st.newbie });
  await page.getByRole("button", { name: "Verify this wallet" }).click();
  await page.getByRole("button", { name: "Claim 1,000 INVEST" }).waitFor({ timeout: 20000 });
  ok(await IT.verifiedCitizen(st.newbie), "verified through OpenVerifierV2");
  await page.getByRole("button", { name: "Claim 1,000 INVEST" }).click();
  await page.getByText("Claimed. This wallet holds 1,000 INVEST.").waitFor({ timeout: 20000 });
  ok((await IT.balanceOf(st.newbie)) === E(1000), "claimed 1,000 INVEST");
  await page.close();
}

// ------------------------------------------------------------- shareholder
console.log("Shareholder");
{
  let page = await open("/portfolio", { account: st.viewer });
  await page.getByText("Vote in the election with 30 shares.").waitFor({ timeout: 40000 });
  ok(await page.getByText("Back a candidate in the election with 30 shares.").isVisible(), "portfolio: back a candidate (Land Fund) is waiting");
  ok(await page.getByText("Vote on proposal 0 with 20 shares.").isVisible() && await page.getByText("Vote on proposal 1 with 20 shares.").isVisible(), "portfolio: both treasury proposals are waiting for my vote");
  await page.screenshot({ path: `${SHOTS}/01-portfolio.png`, fullPage: true });
  await page.close();

  page = await open("/company/1", { account: st.viewer });
  await page.getByText("Your bid: 20 INVEST").waitFor({ timeout: 20000 });
  ok(await page.getByText("At most 5 INVEST a share.").isVisible(), "my existing bid shows its price limit");
  await page.close();

  page = await open("/company/2", { account: st.viewer });
  await page.getByLabel("How much INVEST to commit").fill("30");
  await page.getByLabel("Highest price you'll pay per share (optional)").fill("3");
  await page.getByRole("button", { name: "Place bid" }).click();
  await page.getByText("Your bid: 30 INVEST").waitFor({ timeout: 20000 });
  const b2 = await RA.getActiveBids(2);
  ok(b2.length === 1 && b2[0].bidder === st.viewer && b2[0].amount === E(30) && b2[0].maxPrice === E(3), "placed a real bid: 30 INVEST, at most 3 a share");
  await page.close();

  page = await open("/company/4", { account: st.viewer });
  await page.getByRole("button", { name: "Back this candidate with 30 shares" }).click();
  await page.getByText("You've backed a candidate in this election.").waitFor({ timeout: 20000 });
  const e4 = await GOV.election(4);
  ok(await GOV.hasNominated(4, e4.id, st.viewer), "backing a candidate is recorded on chain");
  await page.close();

  page = await open("/company/3", { account: st.viewer });
  await page.getByText("You can vote with 30 shares").waitFor({ timeout: 20000 });
  ok(await page.getByRole("button", { name: "Vote against all" }).isVisible(), "'against all' is offered");
  await page.getByRole("button", { name: "Read the whole program" }).click();
  ok(await page.getByText("Publish the port's accounts every month").isVisible(), "programs expand in full");
  await page.locator("li.candidate", { hasText: "Batumi Sea Port should earn" }).getByRole("button", { name: "Vote for this candidate" }).click();
  await page.getByText("You've voted in this round.").waitFor({ timeout: 20000 });
  const e3 = await GOV.election(3);
  ok((await GOV.roundVotes(3, e3.round, st.B)) === 30n, "my 30-share vote landed on the candidate I chose");
  await page.screenshot({ path: `${SHOTS}/02-election.png`, fullPage: true });
  await page.close();

  page = await open("/company/0?tab=proposals", { account: st.viewer });
  await proposal(page, "Pay 50 GEL").getByRole("button", { name: "Approve with 20 shares" }).click();
  await proposal(page, "Pay 50 GEL").getByText("You've voted on this proposal.").waitFor({ timeout: 20000 });
  await proposal(page, "Sell 100 GEL").getByRole("button", { name: "Approve with 20 shares" }).click();
  await proposal(page, "Sell 100 GEL").getByText("You've voted on this proposal.").waitFor({ timeout: 20000 });
  ok((await CT.proposals(0)).yes === 20n && (await CT.proposals(1)).yes === 20n, "my approvals of both proposals are on chain");
  await page.close();

  page = await open("/market", { account: st.viewer });
  await page.getByRole("button", { name: "Buy" }).click();
  await page.getByText("No shares are offered right now.").waitFor({ timeout: 20000 });
  ok((await RA.ownerOf(BigInt(st.bListed))) === st.viewer, "bought the listed share on the share market");
  await page.close();
}

// ------------------------------------------------------------- governor's operating key
console.log("Governor's operating key");
{
  const page = await open("/company/0?tab=governor", { account: st.key });
  await page.getByText("This wallet is the operating key of Bolnisi Gold Mines").waitFor({ timeout: 20000 });
  const pay = act(page, "Propose a payment");
  await pay.getByLabel("Token").selectOption({ label: "GEL" });
  await pay.getByLabel("Recipient address").fill(st.C);
  await pay.getByLabel("Amount").fill("10");
  const before = await CT.nextProposalId();
  await pay.getByRole("button", { name: "Propose the payment" }).click();
  ok(await until(async () => (await CT.nextProposalId()) === before + 1n), "the operating key proposed a payment through the page");
  ok(!(await page.getByRole("button", { name: /Withdraw|Send/ }).count()), "there is no way for the governor to move money without a vote");
  await page.keyboard.press("Tab");
  ok(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== "none"), "keyboard focus is visible");
  await page.screenshot({ path: `${SHOTS}/03-governor.png`, fullPage: true });
  await page.close();
}

// ------------------------------------------------------------- after the vote and the 5-day wait
console.log("Eight days later: carrying out, and a sealed-bid sale");
{
  const B = await signer(st.B);
  await (await CT.connect(B).vote(1, true)).wait(); // the sale needs 40% of 51 shares: 20 + 30
  await warp(8 * DAY + 120);
  let page = await open("/company/0?tab=proposals", { account: st.viewer });
  const gelBefore = await GEL.balanceOf(st.C);
  await proposal(page, "Pay 50 GEL").getByRole("button", { name: "Carry out the payment" }).click();
  ok(await until(async () => (await GEL.balanceOf(st.C)) === gelBefore + E(50)), "after the wait, anyone can carry out the approved payment: 50 GEL paid");
  await proposal(page, "Sell 100 GEL").getByRole("button", { name: "Start the auction" }).click();
  await proposal(page, "Sell 100 GEL").getByLabel("Your bid").waitFor({ timeout: 20000 });
  await proposal(page, "Sell 100 GEL").getByLabel("Your bid").fill("12");
  await proposal(page, "Sell 100 GEL").getByRole("button", { name: "Place sealed bid" }).click();
  await page.getByText("Save your reveal code").waitFor({ timeout: 20000 });
  ok((await CT.sealedBids(1, st.viewer)).commitHash !== ethers.ZeroHash, "sealed bid committed; reveal code shown");
  ok(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("sx9-sealed-bid"))), "the bid's secret is also saved in this browser");
  const revealCodeText = (await page.locator(".notice code.code").first().innerText()).trim();
  await page.close();

  await warp(2 * DAY + 60);
  page = await open("/company/0?tab=proposals", { account: st.viewer });
  // A different browser (fresh profile): reveal with the copied code.
  await page.getByLabel("Reveal code").fill(revealCodeText);
  await page.getByRole("button", { name: "Reveal", exact: true }).click();
  ok(await until(async () => (await CT.sealedBids(1, st.viewer)).revealed), "revealed from another browser by pasting the reveal code");
  await page.close();

  await warp(DAY + 60);
  page = await open("/company/0?tab=proposals", { account: st.viewer });
  await page.getByRole("button", { name: "Settle the auction" }).click();
  await page.getByRole("button", { name: "Claim 100 GEL and your deposit" }).click();
  const gel0 = await GEL.balanceOf(st.viewer);
  ok(await until(async () => (await GEL.balanceOf(st.viewer)) === gel0 + E(100) || (await CT.sealedBids(1, st.viewer)).claimed), "won the auction and claimed 100 GEL");
  ok((await CT.hostFeeAccrued(A.InvestToken)) > 0n, "1% of the winning bid went to the host");
  await page.screenshot({ path: `${SHOTS}/04-sale.png`, fullPage: true });
  await page.close();
}

// ------------------------------------------------------------- version 8 retired
console.log("Version 8 retired");
{
  const page = await open("/v8", { account: st.viewer });
  await page.waitForURL((u) => !u.pathname.startsWith("/v8"), { timeout: 20000 });
  ok(new URL(page.url()).pathname === "/", "old /v8 links go to the homepage");
  await page.close();
}

await browser.close();
console.log(problems.length ? `\nBrowser problems:\n  ${problems.join("\n  ")}` : "\nNo page errors or console errors.");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail || problems.length ? 1 : 0);
