import { LayoutDashboard, MessageSquareText, Microscope, Settings2 } from "lucide-react";
import { getLang } from "./i18n";

// ------------------------------------------------------------ access model --
// Single source of truth for which role sees which screen. The API enforces
// the same rules server-side; this only decides what the UI offers.
export const NAV = [
  { id: "assistant", label: "Assistant", icon: MessageSquareText, roles: ["client", "admin"] },
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, roles: ["employee", "admin"] },
  { id: "root-cause", label: "Causes racines", icon: Microscope, roles: ["employee", "admin"] },
  { id: "settings", label: "Paramètres", icon: Settings2, roles: ["admin"] },
];

export const HOME = { client: "assistant", employee: "dashboard", admin: "dashboard" };

export const navFor = (role) => NAV.filter((n) => n.roles.includes(role));

export const ROLES = {
  client: { label: "Client", tone: "neutral", description: "Assistant client et suivi de ses propres tickets" },
  employee: { label: "Employé", tone: "info", description: "Tableau de bord et analyse des causes racines" },
  admin: { label: "Administrateur", tone: "crit", description: "Accès complet, paramètres et gestion des comptes" },
};

// ------------------------------------------------------------------ labels --
// Labels are French source strings; components pass them through t().
export const TICKET_TYPE = {
  complaint: { label: "Réclamation", tone: "neutral" },
  request: { label: "Demande", tone: "info" },
};
export const TICKET_TYPE_ORDER = ["complaint", "request"];
export const ticketType = (t) => (t?.ticket_type === "request" ? "request" : "complaint");

export const STATUS = {
  open: { label: "Ouvert", tone: "warn" },
  in_progress: { label: "En cours", tone: "info" },
  resolved: { label: "Résolu", tone: "ok" },
};
export const STATUS_ORDER = ["open", "in_progress", "resolved"];

export const URGENCY = {
  high: { label: "Haute", tone: "crit" },
  medium: { label: "Moyenne", tone: "warn" },
  low: { label: "Basse", tone: "neutral" },
};
export const URGENCY_ORDER = ["high", "medium", "low"];

export const SENTIMENT = {
  negative: { label: "Négatif", tone: "crit" },
  neutral: { label: "Neutre", tone: "neutral" },
  positive: { label: "Positif", tone: "ok" },
};
export const SENTIMENT_ORDER = ["negative", "neutral", "positive"];

export const MODES = {
  hybrid: "Hybride (ML + LLM)",
  llm_only: "LLM seul",
  lr_only: "ML seul",
  local_fallback: "Repli local (ML)",
  request_triage: "Tri des demandes",
};

// ------------------------------------------------------------------- dates --
const LOCALES = { fr: "fr-FR", en: "en-GB" };
const FORMATS = {
  date: { day: "2-digit", month: "short", year: "numeric" },
  dateTime: { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" },
  time: { hour: "2-digit", minute: "2-digit" },
  day: { day: "2-digit", month: "short" },
};
const cache = {};

/** Intl formatter for the current UI language, built once per language. */
function fmt(kind) {
  const locale = LOCALES[getLang()] || LOCALES.fr;
  const key = `${locale}:${kind}`;
  if (!cache[key]) {
    cache[key] =
      kind === "relative"
        ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
        : new Intl.DateTimeFormat(locale, FORMATS[kind]);
  }
  return cache[key];
}

const valid = (d) => d instanceof Date && !Number.isNaN(d.getTime());
const toDate = (v) => (v instanceof Date ? v : new Date(v));

export const formatDate = (v) => (v && valid(toDate(v)) ? fmt("date").format(toDate(v)) : "—");
export const formatDateTime = (v) => (v && valid(toDate(v)) ? fmt("dateTime").format(toDate(v)) : "—");
export const formatTime = (v) => (v && valid(toDate(v)) ? fmt("time").format(toDate(v)) : "");
export const formatDay = (v) => (v && valid(toDate(v)) ? fmt("day").format(toDate(v)) : "");

export function formatRelative(v) {
  const d = toDate(v);
  if (!v || !valid(d)) return "—";
  const minutes = Math.round((d.getTime() - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) return fmt("relative").format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return fmt("relative").format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return fmt("relative").format(days, "day");
  return formatDate(d);
}

/** Local calendar day key (YYYY-MM-DD) of an ISO timestamp. */
export function dayKey(v) {
  const d = toDate(v);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// French typography puts a space before the percent sign.
export const formatPercent = (ratio) => `${Math.round((ratio || 0) * 100)}${getLang() === "fr" ? " %" : "%"}`;

export function formatBytes(bytes) {
  const [b, kb, mb] = getLang() === "fr" ? ["o", "Ko", "Mo"] : ["B", "KB", "MB"];
  if (bytes < 1024) return `${bytes} ${b}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ${kb}`;
  return `${(bytes / 1024 / 1024).toFixed(1)} ${mb}`;
}

export function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/** Recipients configured for a department (supports the legacy single-contact shape). */
export function departmentEmails(dept) {
  if (dept?.emails?.length) return dept.emails;
  return dept?.contact_email ? [dept.contact_email] : [];
}
