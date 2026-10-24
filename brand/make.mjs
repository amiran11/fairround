import { chromium } from "playwright"; import fs from "fs"; import { mark } from "./mark-lib.mjs";
const SP=process.env.BRAND_TMP||"/tmp"; // folder holding a.woff2 (Archivo) and g.woff2 (Noto Sans Georgian)
const R=process.env.REPO||process.cwd();
const C={paper:"#F4F4F1",ink:"#1B1D21",graphite:"#5B6068",rule:"#D3D4D6",stamp:"#3B3A9F",wash:"#E7E6F5",on:"#FBFBF9"};
const base=(w,h,bg)=>`<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:A;src:url(a.woff2);font-weight:100 900;font-stretch:62% 125%}
@font-face{font-family:G;src:url(g.woff2);font-weight:100 900}
html,body{margin:0;width:${w}px;height:${h}px;background:${bg};color:${C.ink};font-family:A,G;overflow:hidden;position:relative}
.wd{font-variation-settings:"wdth" 118}
.stamp{color:${C.stamp};border:3px solid ${C.stamp};border-radius:5px;padding:2px 12px;font-weight:720;font-variation-settings:"wdth" 84;transform:rotate(-2deg);display:inline-block}
.card{background:#FBFBF9;border:1px solid ${C.rule};border-radius:14px;padding:32px}
.n{font-size:52px;font-weight:800;color:${C.stamp};line-height:1}
.t{font-size:32px;font-weight:700;margin-top:16px}.p{font-size:23px;color:${C.graphite};line-height:1.42;margin-top:10px}
</style>`;
const logo=(s,f)=>`<div style="display:flex;align-items:center;gap:${s*0.3}px;font-size:${f}px;font-weight:700;font-variation-settings:'wdth' 112">${mark(s,C.stamp,"var(--bg)")}FairRound</div>`;
const rules=[["1","One price","Bids collect for an hour. Everyone filled pays the same clearing price. Speed gives no edge."],["2","Small buyers filled","Per-round caps and many rounds, so whales can't take the sale in one block."],["3","Raise held by holders","99% goes into a treasury holders control. Every payment is a vote, with a delay and a cap."]];
const pages={
 [`${R}/site/public/favicon.svg`]:"SVG",
 [`${R}/brand/fairround-icon-512.png`]:[512,512,base(512,512,"transparent")+`<div style="width:512px;height:512px;border-radius:112px;background:${C.stamp};display:flex;align-items:center;justify-content:center">${mark(400,C.on,C.stamp)}</div>`],
 [`${R}/brand/fairround-mark-512.png`]:[512,512,base(512,512,"transparent")+`<div style="--bg:transparent">${mark(512,C.stamp,"transparent")}</div>`],
 [`${R}/brand/x/x-profile-400.png`]:[400,400,base(400,400,C.stamp)+`<div style="width:400px;height:400px;display:flex;align-items:center;justify-content:center">${mark(290,C.on,C.stamp)}</div>`],
 [`${R}/brand/x/x-header-1500x500.png`]:[1500,500,base(1500,500,C.paper)+`<div style="position:absolute;left:-170px;top:-130px;opacity:.08">${mark(720,C.stamp,C.paper)}</div>
  <div style="position:absolute;right:110px;top:0;height:500px;width:900px;display:flex;flex-direction:column;justify-content:center">
   <div style="font-size:24px;font-weight:700;color:${C.stamp};letter-spacing:3px;text-transform:uppercase">FairRound · on-chain IPO exchange</div>
   <div class="wd" style="font-size:84px;font-weight:700;letter-spacing:-.015em;line-height:1.02;margin-top:16px">Unrig the <span style="color:${C.stamp}">launch.</span></div>
   <div style="font-size:25px;color:${C.graphite};margin-top:22px;line-height:1.4">One price per round. Small buyers filled.<br>The raise held in a treasury only holders can spend.</div>
   <div style="margin-top:24px;display:flex;gap:18px;align-items:center;font-size:22px;color:${C.graphite}"><span class="stamp" style="font-size:22px">Live on Arbitrum One</span><span>fairround.xyz</span></div></div>`],
 [`${R}/brand/x/x-post-how-it-works-1600x900.png`]:[1600,900,base(1600,900,C.paper)+`<div style="--bg:${C.paper};padding:80px 96px;height:100%;box-sizing:border-box;display:flex;flex-direction:column">
   ${logo(46,30)}
   <div class="wd" style="font-size:76px;font-weight:700;letter-spacing:-.015em;line-height:1.02;margin-top:44px">Unrig the <span style="color:${C.stamp}">launch.</span></div>
   <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:52px">${rules.map(([n,t,p])=>`<div class="card"><div class="n">${n}</div><div class="t">${t}</div><div class="p">${p}</div></div>`).join("")}</div>
   <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;font-size:23px;color:${C.graphite}"><span style="color:${C.stamp};font-weight:650;font-size:30px">fairround.xyz</span><span>Live on Arbitrum One as a demo with free UNRIG commitment credits.</span></div></div>`],
 [`${R}/brand/x/x-post-call-for-testers-1600x900.png`]:[1600,900,base(1600,900,C.wash)+`<div style="position:absolute;right:-200px;bottom:-240px;opacity:.13">${mark(860,C.stamp,C.wash)}</div>
   <div style="--bg:${C.wash};padding:84px 96px;height:100%;box-sizing:border-box;display:flex;flex-direction:column;position:relative">
   ${logo(46,30)}
   <div style="margin-top:48px"><span class="stamp" style="font-size:28px">Arbitrum Open House · Singapore</span></div>
   <div class="wd" style="font-size:100px;font-weight:700;letter-spacing:-.02em;line-height:.98;margin-top:36px">Test it.<br>Break it.<br><span style="color:${C.stamp}">Tell us.</span></div>
   <div style="font-size:32px;color:${C.graphite};line-height:1.4;margin-top:32px;max-width:900px">Verify a wallet, place one bid, tell us what breaks. Ten minutes.</div>
   <div style="margin-top:auto;font-size:34px;font-weight:650;color:${C.stamp}">fairround.xyz</div>
   <div style="font-size:21px;color:${C.graphite};margin-top:8px">A demo: UNRIG commitment credits are free and have no value. Nobody will ever ask for your secret phrase.</div></div>`],
 [`${R}/brand/x/x-post-unrig-1600x900.png`]:[1600,900,base(1600,900,C.paper)+`<div style="--bg:${C.paper};padding:84px 96px;height:100%;box-sizing:border-box;display:flex;flex-direction:column">
   ${logo(46,30)}
   <div style="display:flex;align-items:center;gap:72px;margin-top:60px">
    <img src="unrig.svg" style="width:340px;height:340px">
    <div><div class="wd" style="font-size:104px;font-weight:700;letter-spacing:-.02em;line-height:1">Meet <span style="color:${C.stamp}">UNRIG.</span></div>
    <div style="font-size:34px;color:${C.graphite};line-height:1.42;margin-top:28px;max-width:760px">The commitment credit you bid with. 1,000 free for every verified investor. It can't move wallet to wallet: no flipping, no sniping.</div></div></div>
   <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;font-size:23px;color:${C.graphite}"><span style="color:${C.stamp};font-weight:650;font-size:30px">fairround.xyz</span><span>A demo credit with no value. Nobody will ever ask for your secret phrase.</span></div></div>`],
 [`${R}/brand/x/x-post-ten-listings-1600x900.png`]:[1600,900,base(1600,900,C.wash)+`<div style="--bg:${C.wash};padding:72px 96px;height:100%;box-sizing:border-box;display:flex;flex-direction:column">
   ${logo(46,30)}
   <div class="wd" style="font-size:76px;font-weight:700;letter-spacing:-.015em;line-height:1.02;margin-top:36px">Ten listings. From <span style="color:${C.stamp}">1 unit</span> to <span style="color:${C.stamp}">300,000.</span></div>
   <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:18px;margin-top:44px">${[["1","The Chosen One"],["3","The Musketeers"],["9","The Fellowship"],["300","Spartans"],["1,000","The Thousand"],["10,000","The Immortals"],["12,000","Camelot"],["30,000","30K Corp"],["100,000","Hundred K Guild"],["300,000","Xerxes’ Host"]].map(([u,n])=>`<div class="card" style="padding:24px"><div style="font-size:40px;font-weight:800;color:${C.stamp};line-height:1">${u}</div><div style="font-size:24px;font-weight:700;margin-top:12px;line-height:1.2">${n}</div></div>`).join("")}</div>
   <div style="font-size:28px;color:${C.graphite};margin-top:36px">150 units a round, one price per round. Even the founder can't take The Thousand in one go.</div>
   <div style="margin-top:auto;font-size:30px;font-weight:650;color:${C.stamp}">fairround.xyz</div></div>`],
 [`${R}/site/public/og-image.png`]:[1200,630,base(1200,630,C.paper)+`<div style="position:absolute;right:-140px;top:-120px;opacity:.08">${mark(620,C.stamp,C.paper)}</div><div style="--bg:${C.paper};padding:64px 72px;height:100%;box-sizing:border-box;display:flex;flex-direction:column;position:relative">
   ${logo(44,30)}
   <h1 class="wd" style="margin:52px 0 0;font-size:84px;line-height:1;font-weight:700;letter-spacing:-.02em">Launch without<br>the rug.</h1>
   <div style="font-size:28px;color:${C.graphite};margin-top:24px;line-height:1.38;max-width:900px">The on-chain IPO exchange for crypto projects: one price per round, small buyers filled, the raise held by holders.</div>
   <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;font-size:24px;color:${C.graphite}"><span style="color:${C.stamp};font-weight:650">fairround.xyz</span><span class="stamp" style="font-size:22px">Live on Arbitrum One</span></div></div>`],
 [`${R}/brand/fairround-banner-1920x384.png`]:[1920,384,base(1920,384,C.paper)+`<div style="position:absolute;right:-90px;top:-170px;opacity:.08">${mark(720,C.stamp,C.paper)}</div>
  <div style="--bg:${C.paper};position:absolute;left:300px;top:0;height:384px;display:flex;align-items:center;gap:44px">${mark(150,C.stamp,C.paper)}
   <div><div class="wd" style="font-size:84px;font-weight:700;letter-spacing:-.015em;line-height:1">FairRound</div>
   <div style="font-size:30px;color:${C.graphite};margin-top:14px">The on-chain IPO exchange for crypto projects.</div>
   <div style="margin-top:22px;display:flex;gap:18px;align-items:center;font-size:22px;color:${C.graphite}"><span class="stamp" style="font-size:22px">Live on Arbitrum One</span><span>One price · Small buyers filled · Raise held by holders</span></div></div></div>`],
};
fs.writeFileSync(`${R}/site/public/favicon.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${C.stamp}"/><g transform="translate(51 51) scale(0.8)">${mark(512,C.on).replace(/^<svg[^>]*>/,"").replace(/<\/svg>$/,"")}</g></svg>`);
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
for(const [out,v] of Object.entries(pages)){ if(v==="SVG") continue; const [w,h,html]=v;
  fs.writeFileSync(`${SP}/page.html`,html); const p=await b.newPage({viewport:{width:w,height:h}});
  await p.goto(`file://${SP}/page.html`); await p.waitForTimeout(400); await p.screenshot({path:out,omitBackground:true}); await p.close(); console.log("made",out.split("/").slice(-2).join("/"));}
await b.close();
