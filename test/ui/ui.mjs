// Drives the real built site in Chromium against the local chain (see
// setup.mjs). Every action is a real transaction, checked on the chain.
import { chromium } from "playwright";
import { ethers } from "ethers";
import fs from "fs";
const SP = process.env.SP;
const ART = process.env.ART;
const BASE = "http://127.0.0.1:4173";
const st = JSON.parse(fs.readFileSync("state.json"));
const P = new ethers.JsonRpcProvider("http://127.0.0.1:8545", undefined, { cacheTimeout: -1 });
const abi = (n) => JSON.parse(fs.readFileSync(`${ART}/${n}.abi.json`));
const RA = new ethers.Contract(st.addresses.RoundAuction, abi("RoundAuction"), P);
const GOV = new ethers.Contract(st.addresses.Governance, abi("Governance"), P);
const CT = new ethers.Contract(st.addresses.CompanyTreasury, abi("CompanyTreasury"), P);
const IT = new ethers.Contract(st.addresses.InvestToken, abi("InvestToken"), P);
const GEL = new ethers.Contract(st.gel, abi("MockERC20"), P);
const E = (n) => ethers.parseEther(String(n));
const SHOTS = `${SP}/shots`; fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "  PASS " : "  FAIL ") + m); c ? pass++ : fail++; };
const problems = [];
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

// account = null: a visitor without a wallet.
async function open(path, { account = null, viewport = { width: 1280, height: 1000 } } = {}) {
  const page = await browser.newPage({ viewport });
  const who = account ? account.slice(0, 6) : "visitor";
  page.on("pageerror", (e) => problems.push(`[${who}] page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") problems.push(`[${who}] console: ${m.text().slice(0, 200)}`); });
  // Stand-in for MetaMask (local dev accounts are unlocked), and the page
  // clock aligned with the chain clock, which setup fast-forwarded.
  await page.addInitScript(({ account, offsetMs }) => {
    const realNow = Date.now.bind(Date);
    Date.now = () => realNow() + offsetMs;
    localStorage.setItem("sakartvelo_analytics_consent", "denied");
    localStorage.setItem("sakartvelo_lang", "en");
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
  }, { account, offsetMs: st.offsetMs });
  await page.goto(BASE + path);
  if (account) {
    await page.getByRole("banner").getByRole("button", { name: "Connect wallet" }).click();
    await page.getByRole("banner").getByText(`${account.slice(0, 6)}…`).waitFor({ timeout: 20000 });
  }
  return page;
}
const act = (page, title) => page.locator(".act", { has: page.getByRole("heading", { name: title, exact: true }) });
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// ------------------------------------------------------------- visitor
console.log("As a visitor without a wallet");
{
  const page = await open("/");
  await page.getByRole("link", { name: "Georgian Railway" }).waitFor({ timeout: 20000 });
  ok(await page.getByRole("heading", { level: 1 }).isVisible(), "the register loads from the chain with no wallet");
  ok((await page.locator("table.register tbody tr").count()) === 4, "all 4 listed companies are in the register");
  ok(await page.getByText("Governed, term 1").isVisible() && await page.getByText("Election", { exact: true }).isVisible(), "stage stamps: governed and election");
  await page.screenshot({ path: `${SHOTS}/00-register.png`, fullPage: true });
  await page.getByRole("link", { name: "Enguri Hydropower Plant" }).click();
  await page.getByText("Connect a wallet to bid for shares.").waitFor({ timeout: 20000 });
  ok(!(await page.getByRole("button", { name: "Place bid" }).count()), "a visitor sees the auction but no bid form, only a prompt to connect");
  await page.getByRole("button", { name: "ქართული" }).click();
  await page.getByRole("heading", { name: "აქციების აუქციონი" }).waitFor({ timeout: 5000 });
  ok(await page.getByRole("heading", { name: "ენგურის ჰესი" }).isVisible(), "the Georgian switch translates the page and puts the Georgian company name first");
  await page.close();
  for (const path of ["/", "/company/3", "/citizen", "/market", "/rules", "/whitepaper"]) {
    const ph = await open(path, { viewport: { width: 390, height: 844 } });
    await ph.waitForTimeout(1500);
    ok(await noSideScroll(ph), `phone width: no sideways scrolling on ${path}`);
    await ph.close();
  }
}

// ------------------------------------------------------------- portfolio
console.log("Portfolio");
{
  let page = await open("/portfolio", { account: st.viewer });
  await page.getByRole("heading", { name: "Your portfolio" }).waitFor({ timeout: 20000 });
  await page.getByText("Vote in the election with 2 shares.").waitFor({ timeout: 30000 });
  ok(await page.getByText("Vote on payment 0 with 2 shares.").isVisible(), "'Waiting for you' lists the open election and payment vote I can take part in");
  ok(await page.getByText("4 shares in 2 companies").isVisible(), "summary: 4 shares in 2 companies");
  ok((await page.locator("#p-shares").locator("xpath=ancestor::section").locator("tbody tr").count()) === 2, "both holdings are listed");
  ok(await page.locator("section", { has: page.locator("#p-bids") }).getByText("Georgian Railway").isVisible(), "my open bid on Georgian Railway is listed");
  await page.screenshot({ path: `${SHOTS}/05-portfolio.png`, fullPage: true });
  await page.locator("li", { hasText: "Vote in the election" }).getByRole("link").click();
  await page.waitForURL(/\/company\/3#s-election$/);
  await page.getByRole("button", { name: "Vote for this candidate" }).first().waitFor({ timeout: 20000 });
  ok(true, "the to-do item opens the company's election, ready to vote");
  await page.close();

  page = await open("/portfolio");
  await page.getByLabel("Look up any address").fill(st.viewer);
  await page.getByRole("button", { name: "Look up" }).click();
  await page.waitForURL(new RegExp(`/portfolio/${st.viewer}$`));
  await page.getByText("4 shares in 2 companies").waitFor({ timeout: 30000 });
  ok(await page.getByRole("heading", { name: "Waiting for this address" }).isVisible(), "a visitor can look up any address and see its portfolio");
  await page.close();
}

// ------------------------------------------------------------- new citizen
console.log("As a brand-new wallet");
{
  const page = await open("/citizen", { account: st.newbie });
  ok(!(await IT.verifiedCitizen(st.newbie)), "starts unverified");
  await page.getByRole("button", { name: "Verify this wallet" }).click();
  await page.getByRole("button", { name: "Claim 1,000 INVEST" }).waitFor({ timeout: 20000 });
  ok(await IT.verifiedCitizen(st.newbie), "the verify button made it a citizen (via OpenVerifier)");
  await page.getByRole("button", { name: "Claim 1,000 INVEST" }).click();
  await page.getByText("Claimed. This wallet holds 1,000 INVEST.").waitFor({ timeout: 20000 });
  ok((await IT.balanceOf(st.newbie)) === E(1000), "the claim button delivered 1,000 INVEST");
  await page.getByRole("banner").getByText("1,000 INVEST").waitFor({ timeout: 10000 });
  ok(true, "the header balance updates after the claim");
  await page.screenshot({ path: `${SHOTS}/01-citizen.png`, fullPage: true });
  await page.close();
}

// ------------------------------------------------------------- shareholder
console.log("As a shareholder");
{
  let page = await open("/company/1", { account: st.viewer });
  await page.getByText("Your bid: 20 INVEST").waitFor({ timeout: 20000 });
  ok(true, "Georgian Railway shows my existing 20 INVEST bid");
  ok(await page.getByText("2 active bids (at most 100)").isVisible(), "shows active bids against the 100 limit");
  await page.close();

  page = await open("/company/2", { account: st.viewer });
  await page.getByLabel("Your bid").fill("5");
  await page.getByRole("button", { name: "Place bid" }).click();
  await page.getByText("Your bid: 5 INVEST").waitFor({ timeout: 20000 });
  const eb = await RA.getActiveBids(2);
  ok(eb.length === 1 && eb[0].bidder === st.viewer && eb[0].amount === E(5), "bidding through the page placed a real 5 INVEST bid");
  await page.screenshot({ path: `${SHOTS}/02-bid.png`, fullPage: true });
  await page.close();

  page = await open("/company/3", { account: st.viewer });
  await page.getByRole("button", { name: "Read the whole program" }).waitFor({ timeout: 20000 });
  ok(await page.getByText("Batumi Sea Port should earn its keep").isVisible(), "candidate programs are readable before voting");
  await page.getByRole("button", { name: "Read the whole program" }).click();
  ok(await page.getByText("Publish the port's accounts every month").isVisible(), "'Read the whole program' expands the full text");
  ok(await page.getByText("You can vote with 2 shares").isVisible(), "shows my vote weight from when the round opened (2)");
  ok(await page.getByText("holds 1 share (").isVisible() && await page.getByText(/^1 vote \(/).isVisible(), "singular forms: '1 share', '1 vote'");
  const bItem = page.locator("li.candidate", { hasText: "Batumi Sea Port should earn" });
  await bItem.getByRole("button", { name: "Vote for this candidate" }).click();
  await page.getByText("You voted in this round with 2 shares.").waitFor({ timeout: 20000 });
  const round = await GOV.governanceRound(3);
  ok((await GOV.roundVotes(3, round, st.candidateB)) === 2n, "my vote landed on the chain for the candidate I chose");
  await page.screenshot({ path: `${SHOTS}/03-election.png`, fullPage: true });
  await page.close();

  page = await open("/company/0", { account: st.viewer });
  await page.getByRole("tab", { name: "Holdings" }).waitFor({ timeout: 20000 });
  ok(await page.getByText("GEL", { exact: true }).isVisible() && await page.getByText("700", { exact: true }).isVisible(), "treasury holdings: 700 GEL (1,000 minus 200 at auction and 100 pending payment)");
  ok(!(await page.getByRole("tab", { name: "Governor tools" }).count()), "no governor tools for an ordinary shareholder");
  await page.getByRole("tab", { name: "Sales" }).click();
  await page.getByLabel("Your bid").fill("25");
  await page.getByRole("button", { name: "Place sealed bid" }).click();
  await page.getByText("Save your reveal code").waitFor({ timeout: 20000 });
  ok((await CT.treasuryBids(0, st.viewer)).commitHash !== ethers.ZeroHash, "sealed bid committed on chain; the reveal code is shown to save");
  const saved = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sx-sealed-bid")).length);
  ok(saved === 1, "the bid's secret is also saved in the browser");
  await page.getByRole("tab", { name: "Payments" }).click();
  await page.getByRole("button", { name: "Approve with 2 shares" }).click();
  await page.getByText("You've voted on this payment.").waitFor({ timeout: 20000 });
  ok((await CT.vendorPayments(0)).yesWeight === 2n, "payment approval recorded on chain with my 2 shares");
  await page.close();

  page = await open("/market", { account: st.viewer });
  const before = await IT.balanceOf(st.viewer);
  await page.getByRole("button", { name: "Buy" }).click();
  await page.getByText("No open offers right now.").waitFor({ timeout: 20000 });
  ok((await IT.balanceOf(st.viewer)) === before + E(50), "bought 50 INVEST on the market through the page");
  await page.close();
}

// ------------------------------------------------------------- governor
console.log("As the governor's operating key");
{
  const page = await open("/company/0", { account: st.key });
  await page.getByText("This wallet is the operating key of Bolnisi Gold Mines").waitFor({ timeout: 20000 });
  ok(true, "the operating key is recognised");
  await page.getByRole("tab", { name: "Governor tools" }).click();
  const move = act(page, "Move tokens (up to 5% a term)");
  await move.getByLabel("Token").selectOption({ index: 1 });
  await move.getByText(/You can still move 35 GEL/).waitFor({ timeout: 15000 });
  ok(true, "the form shows the remaining 5% allowance (35 of 700 GEL)");
  await move.getByLabel("Recipient address").fill(st.cc);
  await move.getByLabel("Amount").fill("10");
  const gelBefore = await GEL.balanceOf(st.cc);
  await move.getByRole("button", { name: "Send" }).click();
  ok(await until(async () => (await GEL.balanceOf(st.cc)) === gelBefore + E(10)), "the governor moved 10 GEL through the page");
  await move.getByText(/You can still move 25 GEL/).waitFor({ timeout: 15000 });
  ok(true, "the allowance refreshes after the transfer (35 -> 25)");
  await move.getByLabel("Recipient address").fill(st.cc);
  await move.getByLabel("Amount").fill("30");
  await move.getByRole("button", { name: "Send" }).click();
  await move.getByText(/more than the 5% you can withdraw/).waitFor({ timeout: 15000 });
  ok(true, "going over the 5% limit gives a readable explanation");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  ok(outline !== "none", "keyboard focus is visible");
  await page.screenshot({ path: `${SHOTS}/04-governor.png`, fullPage: true });
  await page.close();
}

await browser.close();
console.log(problems.length ? `\nBrowser problems:\n  ${problems.join("\n  ")}` : "\nNo page errors or console errors.");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail || problems.length ? 1 : 0);
