// English and Georgian. English text is the key (gettext style), so a
// component reads naturally: t("Round closes in {time}", { time }).
// Georgian lives in strings.ka.js; a missing Georgian string falls back to
// English and is reported by test/site-i18n.test.mjs.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import KA from "./strings.ka.js";

const LANG_KEY = "sakartvelo_lang";

function detect() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "ka") return saved;
  } catch { /* storage blocked */ }
  try {
    const langs = navigator.languages || [navigator.language || ""];
    return langs.some((l) => l.toLowerCase().startsWith("ka")) ? "ka" : "en";
  } catch {
    return "en";
  }
}

function fill(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])));
}

export function translate(lang, key, vars) {
  const text = lang === "ka" && KA[key] !== undefined ? KA[key] : key;
  return fill(text, vars);
}

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(detect);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo(() => {
    const t = (key, vars) => translate(lang, key, vars);
    // Plural for English; Georgian nouns don't change after a number.
    const tn = (one, many, n, vars) => translate(lang, BigInt(n) === 1n ? one : many, { n: Number(n).toLocaleString(lang === "ka" ? "ka-GE" : "en-US"), ...vars });
    const setLang = (l) => {
      setLangState(l);
      try { localStorage.setItem(LANG_KEY, l); } catch { /* storage blocked */ }
    };
    return { lang, setLang, t, tn };
  }, [lang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT() {
  return useContext(LangContext);
}
