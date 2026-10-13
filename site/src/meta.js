// Per-page <title> and description, so shared links and search results
// say what the page is.
import { useEffect } from "react";

const SITE = "Sakartvelo Exchange";

export function usePageTitle(title, description) {
  useEffect(() => {
    document.title = title ? `${title} — ${SITE}` : `${SITE} — a privatization simulation on Arbitrum`;
    if (description) {
      const tag = document.querySelector('meta[name="description"]');
      if (tag) tag.setAttribute("content", description);
    }
  }, [title, description]);
}
