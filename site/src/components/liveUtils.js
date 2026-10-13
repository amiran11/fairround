// Formatting and hooks shared by the live screens. Visual pieces are in
// ui.jsx; colours are CSS variables in styles.css.
import { useState, useEffect, useCallback } from "react";
import { friendlyError } from "../web3.js";
import { useSession } from "../session.jsx";
import { useT } from "../i18n.jsx";

export const ZERO = "0x0000000000000000000000000000000000000000";
export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

// Display for 18-decimal (or other) amounts, with up to `places` decimals.
export function fmt(raw, decimals = 18, places = 2) {
  if (raw === null || raw === undefined) return "…";
  const neg = raw < 0n;
  const v = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  let frac = "";
  if (places > 0) {
    const f = ((v % base) * 10n ** BigInt(places)) / base;
    frac = f === 0n ? "" : "." + f.toString().padStart(places, "0").replace(/0+$/, "");
  }
  return (neg ? "-" : "") + whole.toLocaleString("en-US") + frac;
}

export const int = (n) => (n === null || n === undefined ? "…" : BigInt(n).toLocaleString("en-US"));

export function pct(part, whole) {
  if (!whole || whole === 0n) return "0%";
  const bp = Number((BigInt(part) * 10000n) / BigInt(whole));
  return `${(bp / 100).toFixed(bp < 100 && bp > 0 ? 2 : bp % 100 === 0 ? 0 : 1)}%`;
}

export function fmtDate(seconds, lang = "en") {
  if (!seconds) return "";
  return new Date(Number(seconds) * 1000).toLocaleString(lang === "ka" ? "ka-GE" : "en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// Ticking countdown to a unix timestamp (seconds). `label` is compact and
// language-neutral (2d 4h, 3h 12m, 4m 09s).
export function useCountdown(endSeconds) {
  const { lang } = useT();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const end = Number(endSeconds || 0);
  const remaining = Math.max(0, end - now);
  return { passed: end > 0 && remaining === 0, remaining, label: duration(remaining, lang) };
}

const UNITS = { en: ["d", "h", "m", "s", ""], ka: [" დღე", " სთ", " წთ", " წმ", " "] };

export function duration(sec, lang = "en") {
  const [ud, uh, um, us, gap] = UNITS[lang] || UNITS.en;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const sep = gap ? " " : " ";
  if (d > 0) return `${d}${ud}${sep}${h}${uh}`;
  if (h > 0) return `${h}${uh}${sep}${String(m).padStart(2, "0")}${um}`;
  return `${m}${um}${sep}${String(s).padStart(2, "0")}${us}`;
}

// One busy flag and one error per action. `run(fn, after)` sends a
// transaction, shows a readable error if it fails, then calls `after` and
// tells the rest of the site that the chain changed.
export function useTx() {
  const { changed } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = useCallback(async (fn, after) => {
    setError("");
    setBusy(true);
    try {
      const out = await fn();
      if (after) await after(out);
      changed();
      return out;
    } catch (err) {
      setError(friendlyError(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [changed]);
  return { busy, error, setError, run };
}

// A read that failed: almost always the network, so say that plainly.
export function readError(err) {
  const raw = `${err?.shortMessage || ""} ${err?.message || ""}`;
  if (/fetch|network|timeout|ECONN|429|503|rate/i.test(raw)) {
    return "Couldn't reach the network. Check your connection, then reload the page.";
  }
  return "Couldn't read this from the chain. Reload the page to try again.";
}

// Loads something from the chain and reloads it whenever a transaction
// confirms anywhere on the site. Returns [data, error, reload].
export function useChain(load, deps) {
  const { provider, version } = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (!provider) return;
    try {
      setData(await load(provider));
      setError("");
    } catch (err) {
      console.warn("chain read failed", err);
      setError(readError(err));
    }
  }, [provider, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload, version]);
  return [data, error, reload];
}
