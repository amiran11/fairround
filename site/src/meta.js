// Per-page <title> and description, so shared links and search results
// say what the page is.
import { useEffect } from "react";

const SITE = "FairRound";

export function usePageTitle(title, description) {
  useEffect(() => {
    document.title = title ? `${title} — ${SITE}` : `${SITE} — the on-chain IPO exchange for crypto projects`;
    if (description) {
      const tag = document.querySelector('meta[name="description"]');
      if (tag) tag.setAttribute("content", description);
    }
  }, [title, description]);
}
