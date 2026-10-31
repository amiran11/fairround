// Google Analytics events for the steps that matter (connect, verify, claim,
// bid, settle, vote). Sent only if the visitor accepted analytics: without
// consent gtag is never loaded and this does nothing. No wallet addresses,
// amounts or other personal data are ever sent: only the step's name and,
// where useful, which listing (a public number).
export function track(name, params = {}) {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") window.gtag("event", name, params);
  } catch {
    // analytics must never break the site
  }
}
