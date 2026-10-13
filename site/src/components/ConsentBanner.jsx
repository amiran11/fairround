import { useState, useEffect } from "react";
import { useT } from "../i18n.jsx";

const CONSENT_KEY = "sakartvelo_analytics_consent"; // "granted" | "denied"
const GA_MEASUREMENT_ID = "G-2CHEJDL9S9";

// Loads Google Analytics, only after the visitor allows it. The script
// domain is allowlisted in vercel.json's Content-Security-Policy.
function loadAnalytics() {
  if (document.getElementById("ga-script")) return;
  const gtagScript = document.createElement("script");
  gtagScript.id = "ga-script";
  gtagScript.async = true;
  gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(gtagScript);
  const initScript = document.createElement("script");
  initScript.src = "/gtag-init.js";
  document.head.appendChild(initScript);
}

function read() {
  try { return localStorage.getItem(CONSENT_KEY); } catch { return "denied"; }
}
function save(v) {
  try { localStorage.setItem(CONSENT_KEY, v); } catch { /* storage blocked: ask again next visit */ }
}

export default function ConsentBanner() {
  const { t } = useT();
  const [choice, setChoice] = useState(undefined);

  useEffect(() => {
    const saved = read();
    setChoice(saved || null);
    if (saved === "granted") loadAnalytics();
  }, []);

  if (choice !== null) return null;

  return (
    <aside className="consent" aria-label={t("Analytics")}>
      <p>{t("Can we count visits with Google Analytics? Nothing is loaded unless you allow it, and the site works the same either way.")}</p>
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-small" onClick={() => { save("granted"); setChoice("granted"); loadAnalytics(); }}>{t("Allow")}</button>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => { save("denied"); setChoice("denied"); }}>{t("No thanks")}</button>
      </div>
    </aside>
  );
}
