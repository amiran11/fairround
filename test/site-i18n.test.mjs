// Checks that every English string the site shows has a Georgian
// translation in site/src/strings.ka.js, and that no Georgian entry is left
// over from text that was removed.
//   node test/site-i18n.test.mjs site/src site/src/strings.ka.js
import fs from "fs"; import path from "path";
const root = process.argv[2]; const keys = new Set();
const walk = (d) => fs.readdirSync(d).forEach((f) => { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(f) && !f.startsWith("strings.")) scan(fs.readFileSync(p, "utf8"), p); });
const str = String.raw`"((?:[^"\\]|\\.)*)"`;
function scan(s, p) {
  for (const m of s.matchAll(new RegExp(String.raw`\bt\(\s*` + str, "g"))) keys.add(JSON.parse(`"${m[1]}"`));
  for (const m of s.matchAll(new RegExp(String.raw`\btn\(\s*` + str + String.raw`\s*,\s*` + str, "g"))) { keys.add(JSON.parse(`"${m[1]}"`)); keys.add(JSON.parse(`"${m[2]}"`)); }
  for (const m of s.matchAll(new RegExp(String.raw`t\(runoff \? ` + str + " : " + str, "g"))) { keys.add(JSON.parse(`"${m[1]}"`)); keys.add(JSON.parse(`"${m[2]}"`)); }
  for (const m of s.matchAll(new RegExp(String.raw`label="` + `([^"]+)"`, "g"))) keys.add(m[1]);
  for (const m of s.matchAll(new RegExp(String.raw`setError\(\s*` + str, "g"))) keys.add(JSON.parse(`"${m[1]}"`));
  if (p.endsWith("WhitePaper.jsx")) for (const m of s.matchAll(new RegExp(String.raw`\[\s*` + str + String.raw`,\s*` + str + String.raw`\s*\]`, "g"))) { keys.add(JSON.parse(`"${m[1]}"`)); keys.add(JSON.parse(`"${m[2]}"`)); }
  if (p.endsWith("web3.js")) for (const m of s.matchAll(new RegExp(String.raw`\[\s*"[^"]+",\s*` + str + String.raw`\s*\]`, "g"))) keys.add(JSON.parse(`"${m[1]}"`));
  if (p.endsWith("liveUtils.js")) for (const m of s.matchAll(new RegExp(String.raw`return ` + str, "g"))) keys.add(JSON.parse(`"${m[1]}"`));
}
walk(root);
const extra = ["You cancelled the transaction in MetaMask."];
extra.forEach((k) => keys.add(k));
const ka = process.argv[3] ? (await import(path.resolve(process.argv[3]))).default : {};
const NOISE = new Set(["", "0%", "…"]);
NOISE.forEach((k) => keys.delete(k));
const missing = [...keys].filter((k) => !(k in ka)).sort();
const unused = Object.keys(ka).filter((k) => !keys.has(k));
if (process.argv[4] === "--list") console.log(JSON.stringify(missing, null, 0).replace(/","/g, '",\n"'));
console.log(`${keys.size} strings, ${missing.length} without Georgian, ${unused.length} Georgian entries unused`);
if (unused.length && process.argv[4] !== "--list") console.log("unused:", unused.slice(0, 20));
process.exit(missing.length || unused.length ? 1 : 0);
