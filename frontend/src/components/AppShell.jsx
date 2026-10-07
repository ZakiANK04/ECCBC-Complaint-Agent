import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, KeyRound, Languages, LogOut, Moon, PanelLeft, PanelLeftClose, Sun } from "lucide-react";
import { api } from "../api";
import { useAuth, useTheme } from "../lib/session";
import { LANGUAGES, useI18n, useT } from "../lib/i18n";
import { ROLES, navFor } from "../lib/format";
import { Alert, Avatar, BrandMark, Field, LanguageToggle, Modal, Spinner, useToast } from "./ui";

const COLLAPSE_KEY = "eccbc.sidebar";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

/** Staff layout: sidebar on desktop, top bar + bottom tab bar on phones. */
export default function AppShell({ active, onNavigate, children, fill = false }) {
  const t = useT();
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const items = navFor(user.role);
  const { lang, setLang } = useI18n();
  const nextLang = LANGUAGES[(LANGUAGES.findIndex((l) => l.code === lang) + 1) % LANGUAGES.length];

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "open" : "collapsed");
      } catch {
        // ignore
      }
      return !c;
    });
  }

  return (
    <div className="h-dvh flex bg-canvas overflow-hidden">
      {/* Sidebar (md+) */}
      <aside
        className={`hidden md:flex flex-col shrink-0 border-r border-line bg-surface transition-[width] duration-200 ${
          collapsed ? "w-[60px]" : "w-[232px]"
        }`}
      >
        <div className={`h-14 flex items-center gap-2.5 border-b border-line ${collapsed ? "justify-center" : "px-4"}`}>
          <BrandMark size={30} />
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <p className="text-[13px] font-semibold text-ink truncate">{t("ECCBC Service Client")}</p>
              <p className="text-[11px] text-muted truncate">Fruital Rouiba</p>
            </div>
          )}
        </div>

        <nav className="flex-1 p-2 space-y-0.5" aria-label={t("Navigation principale")}>
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === active;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? t(item.label) : undefined}
                className={`relative w-full h-9 flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                  collapsed ? "justify-center" : "px-2.5"
                } ${isActive ? "bg-sunken text-ink" : "text-ink-2 hover:bg-sunken hover:text-ink"}`}
              >
                {isActive && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand" />}
                <Icon size={17} className={isActive ? "text-brand-ink" : ""} />
                {!collapsed && <span className="truncate">{t(item.label)}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-2 border-t border-line space-y-0.5">
          <button
            type="button"
            onClick={() => setLang(nextLang.code)}
            title={collapsed ? nextLang.name : undefined}
            aria-label={nextLang.name}
            className={`w-full h-9 flex items-center gap-2.5 rounded-lg text-[13px] font-medium text-ink-2 hover:bg-sunken hover:text-ink ${
              collapsed ? "justify-center" : "px-2.5"
            }`}
          >
            <Languages size={17} />
            {!collapsed && nextLang.name}
          </button>
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? t("Changer de thème") : undefined}
            className={`w-full h-9 flex items-center gap-2.5 rounded-lg text-[13px] font-medium text-ink-2 hover:bg-sunken hover:text-ink ${
              collapsed ? "justify-center" : "px-2.5"
            }`}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            {!collapsed && (theme === "dark" ? t("Thème clair") : t("Thème sombre"))}
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? t("Déplier le menu") : undefined}
            className={`w-full h-9 flex items-center gap-2.5 rounded-lg text-[13px] font-medium text-ink-2 hover:bg-sunken hover:text-ink ${
              collapsed ? "justify-center" : "px-2.5"
            }`}
          >
            {collapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}
            {!collapsed && t("Réduire le menu")}
          </button>
          <AccountMenu compact={collapsed} placement="top" />
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar (phones) */}
        <header className="md:hidden shrink-0 flex items-center justify-between gap-3 px-4 h-14 bg-surface border-b border-line pt-[env(safe-area-inset-top)] box-content">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark size={30} />
            <p className="text-sm font-semibold text-ink truncate">{t("ECCBC Service Client")}</p>
          </div>
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <button type="button" onClick={toggle} className="btn btn-ghost btn-icon" aria-label={t("Changer de thème")}>
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <AccountMenu compact placement="bottom" />
          </div>
        </header>

        <main className={`flex-1 min-h-0 ${fill ? "flex flex-col" : "overflow-y-auto scroll-thin"}`}>{children}</main>

        {/* Bottom tab bar (phones) */}
        {items.length > 1 && (
          <nav
            className="md:hidden shrink-0 grid bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]"
            style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
            aria-label={t("Navigation principale")}
          >
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === active;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`h-14 flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium ${
                    isActive ? "text-brand-ink" : "text-muted"
                  }`}
                >
                  <Icon size={19} />
                  <span className="truncate max-w-full px-1">{t(item.label)}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}

/** Avatar button opening the account popover (identity, password, sign out). */
export function AccountMenu({ compact = false, placement = "bottom" }) {
  const t = useT();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const popover =
    placement === "top" ? "bottom-full mb-2 left-0" : "top-full mt-2 right-0";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("Mon compte")}
        className={
          compact
            ? "w-full h-9 flex items-center justify-center rounded-lg hover:bg-sunken"
            : "w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-sunken"
        }
      >
        <Avatar name={user.name} size={compact ? 28 : 30} />
        {!compact && (
          <>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[13px] font-medium text-ink truncate">{user.name}</span>
              <span className="block text-[11px] text-muted truncate">{t(ROLES[user.role]?.label)}</span>
            </span>
            <ChevronsUpDown size={14} className="text-muted shrink-0" />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-40 w-60 ${popover} bg-raised border border-line-strong rounded-xl shadow-pop p-1.5 anim-rise`}
        >
          <div className="px-2.5 py-2">
            <p className="text-[13px] font-medium text-ink truncate">{user.name}</p>
            <p className="text-xs text-muted truncate">
              {t(ROLES[user.role]?.label)} · {user.username}
            </p>
            {user.company && <p className="text-xs text-muted truncate mt-0.5">{user.company}</p>}
          </div>
          <div className="h-px bg-line my-1" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setPasswordOpen(true);
            }}
            className="w-full h-9 flex items-center gap-2.5 px-2.5 rounded-lg text-[13px] text-ink-2 hover:bg-sunken hover:text-ink"
          >
            <KeyRound size={15} /> {t("Changer le mot de passe")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            className="w-full h-9 flex items-center gap-2.5 px-2.5 rounded-lg text-[13px] text-ink-2 hover:bg-sunken hover:text-ink"
          >
            <LogOut size={15} /> {t("Se déconnecter")}
          </button>
        </div>
      )}

      <PasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}

function PasswordDialog({ open, onClose }) {
  const t = useT();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setCurrent("");
      setNext("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      toast(t("Mot de passe mis à jour."));
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("Changer le mot de passe")}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {t("Annuler")}
          </button>
          <button
            type="submit"
            form="password-form"
            className="btn btn-primary"
            disabled={busy || !current || next.length < 8}
          >
            {busy && <Spinner size={14} />}
            {t("Enregistrer")}
          </button>
        </>
      }
    >
      <form id="password-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert tone="crit">{error}</Alert>}
        <Field label={t("Mot de passe actuel")}>
          {(id) => (
            <input
              id={id}
              type="password"
              className="input"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("Nouveau mot de passe")} hint={t("8 caractères minimum.")}>
          {(id) => (
            <input
              id={id}
              type="password"
              className="input"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}
