import { Link, Outlet } from "react-router-dom";
import { useT } from "../i18n.jsx";

// Every v8 page sits inside this: v8 keeps running, nothing in it is
// switched off, but new activity happens in version 9.
export default function Frame() {
  const { t } = useT();
  return (
    <>
      <div className="archive-bar">
        <div className="page row">
          <span className="stamp stamp-quiet">{t("Version 8")}</span>
          <span className="small">
            {t("The first version of the contracts. It keeps running: INVEST, shares and votes here stay yours, and everything below still works. New companies and activity are in version 9.")}
          </span>
          <span className="row-tight small">
            <Link to="/v8">{t("v8 register")}</Link>
            <Link to="/v8/portfolio">{t("v8 portfolio")}</Link>
            <Link to="/v8/market">{t("v8 INVEST market")}</Link>
            <Link to="/v8/rules">{t("v8 rules")}</Link>
          </span>
        </div>
      </div>
      <Outlet />
    </>
  );
}
