import { Link } from "react-router-dom";
import { useT } from "../i18n.jsx";
import { usePageTitle } from "../meta.js";

export default function NotFound() {
  const { t } = useT();
  usePageTitle(t("Page not found"));
  return (
    <div className="page stack" style={{ paddingTop: 48 }}>
      <h1 className="h2">{t("There's no page at this address.")}</h1>
      <p><Link to="/" className="btn btn-secondary">{t("Back to the launches")}</Link></p>
    </div>
  );
}
