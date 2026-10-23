import { chromium } from "playwright"; import fs from "fs"; import { mark } from "./mark-lib.mjs";
const R=process.env.REPO ? process.env.REPO + "/brand" : "brand";
const inner=mark(512,"#FBFBF9").replace(/^<svg[^>]*>/,"").replace(/<\/svg>$/,"");
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><circle cx="256" cy="256" r="252" fill="#3B3A9F"/><g transform="translate(64 64) scale(0.75)">${inner}</g></svg>`;
fs.writeFileSync(`${R}/unrig-token-logo.svg`,svg);
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
for(const s of [512,256,32]){const p=await b.newPage({viewport:{width:s,height:s}});await p.setContent(`<style>html,body{margin:0;overflow:hidden}svg{display:block}</style><body style="margin:0;background:transparent">${svg.replace('width="512" height="512"',`width="${s}" height="${s}"`)}</body>`);await p.screenshot({path:`${R}/unrig-token-logo-${s}.png`,omitBackground:true});await p.close();}
await b.close();
