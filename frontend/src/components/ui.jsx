import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, CircleCheck, Info, Loader2, TriangleAlert, X } from "lucide-react";
import { ROLES, SENTIMENT, STATUS, TICKET_TYPE, URGENCY, initials } from "../lib/format";
import { LANGUAGES, useI18n, useT } from "../lib/i18n";

// ------------------------------------------------------------------- tones --
const TONE = {
  ok: { soft: "bg-ok/12 text-ok-ink", dot: "bg-ok", border: "border-ok/30" },
  warn: { soft: "bg-warn/15 text-warn-ink", dot: "bg-warn", border: "border-warn/35" },
  crit: { soft: "bg-crit/12 text-crit-ink", dot: "bg-crit", border: "border-crit/30" },
  info: { soft: "bg-info/12 text-info-ink", dot: "bg-info", border: "border-info/30" },
  neutral: { soft: "bg-sunken text-ink-2", dot: "bg-neutral", border: "border-line" },
};

export const toneDot = (tone) => TONE[tone]?.dot || TONE.neutral.dot;

export function Spinner({ size = 16, className = "" }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} aria-hidden="true" />;
}

/** Small state pill. The dot carries the color; the label carries the meaning. */
export function Badge({ tone = "neutral", children, dot = true, className = "" }) {
  const t = TONE[tone] || TONE.neutral;
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-xs font-medium whitespace-nowrap ${t.soft} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot}`} />}
      {children}
    </span>
  );
}

const KINDS = { status: STATUS, urgency: URGENCY, sentiment: SENTIMENT, role: ROLES, type: TICKET_TYPE };

export function StateBadge({ kind, value }) {
  const t = useT();
  const def = KINDS[kind]?.[value];
  return <Badge tone={def?.tone}>{def ? t(def.label) : value || "—"}</Badge>;
}

export function Avatar({ name, size = 32, className = "" }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-sunken border border-line text-ink-2 font-semibold shrink-0 select-none ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function BrandMark({ size = 32, className = "" }) {
  return (
    <img
      src="/eccbc-logo.png"
      alt=""
      width={size}
      height={size}
      className={`rounded-full bg-white object-contain border border-line shrink-0 ${className}`}
      style={{ width: size, height: size, padding: Math.max(1, Math.round(size * 0.04)) }}
    />
  );
}

// ------------------------------------------------------------------ layout --
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-[22px] font-semibold text-ink leading-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-muted mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}

export function Card({ title, description, actions, children, className = "", bodyClassName = "p-4 sm:p-5" }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12">
      {Icon && (
        <span className="w-11 h-11 rounded-xl bg-sunken border border-line flex items-center justify-center text-muted mb-3">
          <Icon size={20} />
        </span>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children && <p className="text-[13px] text-muted mt-1 max-w-sm">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const ALERT_ICON = { ok: CircleCheck, warn: TriangleAlert, crit: CircleAlert, info: Info };

export function Alert({ tone = "info", title, children, className = "" }) {
  const t = TONE[tone];
  const Icon = ALERT_ICON[tone] || Info;
  return (
    <div
      role={tone === "crit" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] ${t.soft} ${t.border} ${className}`}
    >
      <Icon size={16} className="shrink-0 mt-0.5" />
      <div className="min-w-0 break-words">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- forms --
export function Field({ label, hint, error, children, className = "" }) {
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-ink-2 mb-1.5">
          {label}
        </label>
      )}
      {typeof children === "function" ? children(id) : children}
      {error ? (
        <p className="text-xs text-crit-ink mt-1.5">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted mt-1.5">{hint}</p>
      )}
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }) {
  return (
    <label className={`flex items-start justify-between gap-4 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {description && <span className="block text-xs text-muted mt-0.5">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${checked ? "bg-brand" : "bg-line-strong"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </button>
    </label>
  );
}

/** Compact single-choice control for 2–4 options. */
export function Segmented({ options, value, onChange, size = "md", className = "", label }) {
  const h = size === "sm" ? "h-7 text-xs" : "h-8 text-[13px]";
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex p-0.5 rounded-lg bg-sunken border border-line max-w-full overflow-x-auto scroll-none ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`${h} px-2.5 rounded-md font-medium whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
              active ? "bg-surface text-ink shadow-card border border-line" : "text-muted hover:text-ink border border-transparent"
            }`}
          >
            {o.label}
            {o.count != null && <span className={`tnum text-[11px] ${active ? "text-muted" : "text-muted/80"}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- overlays --
function useOverlay(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);
  return ref;
}

function Backdrop({ onClose }) {
  return <div className="absolute inset-0 bg-black/45 anim-fade" onClick={onClose} aria-hidden="true" />;
}

function CloseButton({ onClose }) {
  const t = useT();
  return (
    <button type="button" onClick={onClose} className="btn btn-ghost btn-icon btn-sm -mr-1" aria-label={t("Fermer")}>
      <X size={16} />
    </button>
  );
}

/** Centered dialog on desktop, bottom sheet on phones. */
export function Modal({ open, onClose, title, description, children, footer, width = "max-w-md" }) {
  const ref = useOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <Backdrop onClose={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${width} max-h-[92dvh] flex flex-col bg-raised border border-line shadow-pop rounded-t-2xl sm:rounded-xl anim-sheet sm:anim-rise outline-none`}
      >
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
            {description && <p className="text-[13px] text-muted mt-0.5">{description}</p>}
          </div>
          <CloseButton onClose={onClose} />
        </header>
        <div className="px-5 pb-5 overflow-y-auto scroll-thin">{children}</div>
        {footer && (
          <footer className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-3 border-t border-line pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}

/** Side panel on desktop, full-height sheet on phones. */
export function Drawer({ open, onClose, title, subtitle, children, footer, width = "sm:max-w-xl" }) {
  const ref = useOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <Backdrop onClose={onClose} />
      <aside
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={`relative w-full ${width} h-full flex flex-col bg-raised border-l border-line shadow-pop anim-drawer outline-none`}
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
            {subtitle && <div className="text-xs text-muted mt-0.5">{subtitle}</div>}
          </div>
          <CloseButton onClose={onClose} />
        </header>
        <div className="flex-1 overflow-y-auto scroll-thin">{children}</div>
        {footer && (
          <footer className="flex items-center gap-2 px-5 py-3 border-t border-line pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        )}
      </aside>
    </div>,
    document.body
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel, busy }) {
  const t = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {t("Annuler")}
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy && <Spinner size={14} />}
            {confirmLabel || t("Confirmer")}
          </button>
        </>
      }
    >
      <p className="text-[13px] text-ink-2">{children}</p>
    </Modal>
  );
}

// ------------------------------------------------------------------ toasts --
const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const t = useT();
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((item) => item.id !== id)), []);

  const push = useCallback(
    (message, tone = "ok") => {
      const id = Math.random().toString(36).slice(2);
      setToasts((list) => [...list.slice(-3), { id, message, tone }]);
      setTimeout(() => dismiss(id), tone === "crit" ? 7000 : 4000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="fixed z-[60] inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:bottom-4 p-3 sm:p-0 flex flex-col gap-2 pointer-events-none pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          {toasts.map((item) => {
            const Icon = ALERT_ICON[item.tone] || Info;
            const color = item.tone === "crit" ? "text-crit-ink" : item.tone === "warn" ? "text-warn-ink" : "text-ok-ink";
            return (
              <div
                key={item.id}
                className="pointer-events-auto anim-rise flex items-start gap-2.5 sm:w-[360px] bg-raised border border-line-strong shadow-pop rounded-xl px-3.5 py-3 text-[13px] text-ink"
              >
                <Icon size={16} className={`shrink-0 mt-0.5 ${color}`} />
                <span className="flex-1 min-w-0 break-words">{item.message}</span>
                <button type="button" onClick={() => dismiss(item.id)} className="text-muted hover:text-ink" aria-label={t("Fermer")}>
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

/** One-tap switch between the available interface languages. */
export function LanguageToggle({ className = "btn btn-ghost btn-icon" }) {
  const { lang, setLang } = useI18n();
  const next = LANGUAGES[(LANGUAGES.findIndex((l) => l.code === lang) + 1) % LANGUAGES.length];
  return (
    <button
      type="button"
      onClick={() => setLang(next.code)}
      className={className}
      aria-label={`${next.name} (${next.label})`}
      title={next.name}
    >
      <span className="text-[11px] font-semibold tracking-wide">{lang.toUpperCase()}</span>
    </button>
  );
}

/** toast("Message") or toast("Message", "crit" | "warn"). */
export const useToast = () => useContext(ToastContext);
