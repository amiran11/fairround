// Shared pieces. Every screen is built from these and the classes in
// styles.css, so spacing, type and colour stay the same everywhere.
import { useId, isValidElement, cloneElement } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import { ACTIVE_NETWORK } from "../web3.js";
import { short } from "./liveUtils.js";

export function Button({ kind = "primary", small, busy, disabled, children, className = "", ...rest }) {
  const cls = ["btn", kind !== "primary" && `btn-${kind}`, small && "btn-small", className].filter(Boolean).join(" ");
  return (
    <button type="button" {...rest} className={cls} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy && <Loader2 size={14} className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

// Label + one control. The control is given the id the label points at;
// AmountInput forwards it to its inner input.
export function Field({ label, hint, children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {isValidElement(children) ? cloneElement(children, { id, "aria-describedby": hintId }) : children}
      {hint && <span className="field-hint" id={hintId}>{hint}</span>}
    </div>
  );
}

export function Input(props) {
  return <input {...props} className={`input ${props.className || ""}`} />;
}

export function AmountInput({ unit, ...props }) {
  return (
    <div className="input-unit">
      <Input type="number" inputMode="decimal" min="0" step="any" {...props} />
      <span aria-hidden="true">{unit}</span>
    </div>
  );
}

export function Select({ children, ...props }) {
  return <select {...props} className="select">{children}</select>;
}

export function Textarea(props) {
  return <textarea {...props} className="textarea" />;
}

export function Notice({ tone, title, children }) {
  return (
    <div className={`notice${tone ? ` notice-${tone}` : ""}`} role={tone === "danger" ? "alert" : undefined}>
      {title && <strong>{title}</strong>}
      {children}
    </div>
  );
}

export function Muted({ children, small, as: Tag = "p" }) {
  return <Tag className={`muted${small ? " small" : ""}`}>{children}</Tag>;
}

export function ErrorLine({ error }) {
  const { t } = useT();
  if (!error) return null;
  return <p className="error-line" role="alert">{t(error)}</p>;
}

// A company's stage, in stamp ink. `landed` plays the stamp animation once.
export function Stamp({ children, tone, landed }) {
  const cls = ["stamp", tone && `stamp-${tone}`, landed && "stamp-landed"].filter(Boolean).join(" ");
  return <span className={cls}>{children}</span>;
}

export function Address({ value, you }) {
  const { t } = useT();
  const { address } = useSession();
  const isYou = you ?? (address && value && address.toLowerCase() === value.toLowerCase());
  const href = ACTIVE_NETWORK.blockExplorerUrls[0] ? `${ACTIVE_NETWORK.blockExplorerUrls[0]}/address/${value}` : null;
  const label = <span className="addr" title={value}>{short(value)}</span>;
  return (
    <span>
      {href ? <a href={href} target="_blank" rel="noreferrer">{label}</a> : label}
      {isYou && <span className="muted"> ({t("you")})</span>}
    </span>
  );
}

// An action block: only rendered for a visitor who can act. Read-only
// content never goes inside one.
export function Act({ title, children }) {
  return (
    <div className="act">
      {title && <h4 className="act-title">{title}</h4>}
      {children}
    </div>
  );
}

// Asks a visitor without a wallet to connect, in the place an action would be.
export function ConnectToAct({ what }) {
  const { t } = useT();
  const { connect, connecting } = useSession();
  return (
    <div className="act">
      <p className="small">{what}</p>
      <Button kind="secondary" small busy={connecting} onClick={connect}>{t("Connect wallet")}</Button>
    </div>
  );
}

export function Tabs({ tabs, active, onChange, label }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tb) => (
        <button
          key={tb.id}
          type="button"
          role="tab"
          className="tab"
          aria-selected={active === tb.id}
          onClick={() => onChange(tb.id)}
        >
          {tb.label}
        </button>
      ))}
    </div>
  );
}

export function Loading({ children }) {
  const { t } = useT();
  return <p className="skeleton" aria-live="polite">{children || t("Reading from the chain…")}</p>;
}
