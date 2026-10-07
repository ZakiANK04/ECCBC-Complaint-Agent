import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  CircleCheck,
  CircleHelp,
  Copy,
  Download,
  History,
  Inbox,
  Languages,
  Moon,
  Package,
  RefreshCw,
  ShoppingCart,
  SquarePen,
  Sun,
} from "lucide-react";
import { api } from "../api";
import { useAuth, useTheme } from "../lib/session";
import { useT } from "../lib/i18n";
import { formatDateTime, formatRelative, formatTime, ticketType } from "../lib/format";
import { AccountMenu } from "../components/AppShell";
import {
  Alert,
  BrandMark,
  Drawer,
  EmptyState,
  LanguageToggle,
  Spinner,
  StateBadge,
  useToast,
} from "../components/ui";

// Labels are translated at render; the sample messages stay as written,
// since they are what gets sent.
const SUGGESTIONS = [
  {
    icon: Package,
    label: "Signaler un problème",
    text: "J'ai reçu ce matin une palette de Coca-Cola 1L avec 6 bouteilles cassées et du liquide partout.",
  },
  {
    icon: ShoppingCart,
    label: "Passer une commande",
    text: "Je voudrais commander 30 packs de Coca-Cola 1L pour une livraison jeudi à Rouiba.",
  },
  {
    icon: CircleHelp,
    label: "Poser une question",
    text: "Quels sont les engagements d'ECCBC en matière de recyclage des emballages ?",
  },
  {
    icon: Languages,
    label: "Écrire en darija",
    text: "Salam, la commande li b3athouha lyoum lmagaza fiha 4 qra3i fassdin w saylin.",
  },
];

const newId = () => Math.random().toString(36).slice(2);

/**
 * Client assistant: answers questions, records order/delivery requests and
 * logs complaints. Rendered full-screen for clients (standalone) and inside
 * the staff shell for administrators (embedded).
 */
export default function Assistant({ embedded = false }) {
  const t = useT();
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const firstName = (user.name || "").split(/\s+/)[0];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  // Grow the composer with its content, up to a cap.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [input]);

  const send = useCallback(
    async (raw) => {
      const text = raw.trim();
      if (!text || pending) return;
      setMessages((list) => [...list, { id: newId(), role: "user", text, at: new Date() }]);
      setInput("");
      setPending(true);
      try {
        // A complaint or a request comes back as a ticket; an information
        // question comes back as a plain answer (no ticket_id).
        const res = await api.sendMessage(text);
        setMessages((list) => [
          ...list,
          { id: newId(), role: "assistant", text: res.client_reply, ticket: res.ticket_id ? res : null, at: new Date() },
        ]);
      } catch (err) {
        setMessages((list) => [
          ...list,
          { id: newId(), role: "assistant", error: err.message, retryText: text, at: new Date() },
        ]);
      } finally {
        setPending(false);
      }
    },
    [pending]
  );

  function handleKeyDown(e) {
    // Enter sends on desktop; on touch keyboards it stays a line break.
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    e.preventDefault();
    send(input);
  }

  function retry(message) {
    setMessages((list) => list.filter((m) => m.id !== message.id));
    send(message.retryText);
  }

  function pickSuggestion(text) {
    setInput(text);
    inputRef.current?.focus();
  }

  const empty = messages.length === 0;

  return (
    <div className={`flex flex-col bg-canvas ${embedded ? "flex-1 min-h-0" : "h-dvh"}`}>
      {/* Header */}
      <header
        className={`shrink-0 flex items-center justify-between gap-2 px-3 sm:px-5 h-14 border-b border-line bg-surface ${
          embedded ? "" : "pt-[env(safe-area-inset-top)] box-content"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {!embedded && <BrandMark size={34} />}
          <div className="leading-tight min-w-0">
            <p className="text-sm font-semibold text-ink truncate">{t("Assistant ECCBC")}</p>
            <p className="text-[11px] text-muted truncate flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-ok shrink-0" />
              Fruital Rouiba
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={() => setMessages([])}
            disabled={empty || pending}
            className="btn btn-ghost btn-icon sm:w-auto sm:px-2.5"
            aria-label={t("Nouvelle conversation")}
          >
            <SquarePen size={17} />
            <span className="hidden lg:inline">{t("Nouvelle conversation")}</span>
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="btn btn-ghost btn-icon sm:w-auto sm:px-2.5"
            aria-label={t("Mes tickets")}
          >
            <History size={17} />
            <span className="hidden lg:inline">{t("Mes tickets")}</span>
          </button>
          {!embedded && (
            <>
              <LanguageToggle />
              <button
                type="button"
                onClick={toggle}
                className="btn btn-ghost btn-icon"
                aria-label={theme === "dark" ? t("Passer au thème clair") : t("Passer au thème sombre")}
              >
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <div className="w-9">
                <AccountMenu compact placement="bottom" />
              </div>
            </>
          )}
        </div>
      </header>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scroll-thin overscroll-contain">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 min-h-full flex flex-col">
          {empty ? (
            <div className="flex-1 flex flex-col justify-center py-8 anim-rise">
              <BrandMark size={52} />
              <h1 className="mt-5 text-[26px] sm:text-[32px] leading-tight font-semibold text-ink">
                {firstName ? t("Bonjour {name},", { name: firstName }) : t("Bonjour,")}
                <br />
                <span className="text-muted">{t("que pouvons-nous faire pour vous ?")}</span>
              </h1>
              <p className="mt-3 text-sm text-ink-2 max-w-xl">
                {t(
                  "Posez une question, faites une demande de commande ou de livraison, ou signalez un problème. Vous pouvez écrire en français, en anglais ou en darija."
                )}
              </p>

              <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {SUGGESTIONS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => pickSuggestion(s.text)}
                      className="group text-left flex gap-3 rounded-xl border border-line bg-surface hover:border-line-strong hover:bg-sunken p-3.5 transition-colors"
                    >
                      <span className="w-8 h-8 rounded-lg bg-sunken group-hover:bg-surface border border-line flex items-center justify-center text-ink-2 shrink-0">
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-ink">{t(s.label)}</span>
                        <span className="block text-xs text-muted mt-0.5 line-clamp-2">{s.text}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="py-6 space-y-6" aria-live="polite">
              {messages.map((m) =>
                m.role === "user" ? (
                  <UserMessage key={m.id} message={m} />
                ) : (
                  <AssistantMessage key={m.id} message={m} onRetry={() => retry(m)} disabled={pending} />
                )
              )}
              {pending && (
                <div className="flex gap-3 anim-rise">
                  <BrandMark size={28} className="mt-0.5" />
                  <div className="flex items-center gap-2.5 h-8 text-[13px] text-muted">
                    <span className="flex items-center gap-1">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                    {t("Analyse de votre message…")}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className={`shrink-0 bg-canvas ${embedded ? "pb-3" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]"}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mx-auto w-full max-w-3xl px-3 sm:px-6"
        >
          <div className="flex items-end gap-2 rounded-[22px] border border-line-strong bg-surface shadow-card pl-4 pr-2 py-2 focus-within:border-focus focus-within:ring-[3px] focus-within:ring-focus/20 transition-shadow">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("Écrivez votre message…")}
              aria-label={t("Votre message")}
              className="flex-1 min-w-0 resize-none bg-transparent py-1.5 text-base sm:text-[15px] leading-6 text-ink placeholder:text-muted focus:outline-none scroll-thin"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              aria-label={t("Envoyer")}
              className="w-9 h-9 rounded-full bg-brand hover:bg-brand-hover text-on-brand flex items-center justify-center shrink-0 transition-colors disabled:bg-line-strong disabled:text-surface"
            >
              {pending ? <Spinner size={16} /> : <ArrowUp size={18} strokeWidth={2.4} />}
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted">
            <span className="hidden sm:inline">{t("Entrée pour envoyer, Maj + Entrée pour un saut de ligne")} · </span>
            {t("Les réponses sont générées automatiquement puis suivies par nos équipes.")}
          </p>
        </form>
      </div>

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}

function UserMessage({ message }) {
  return (
    <div className="flex flex-col items-end anim-rise">
      <div className="max-w-[88%] sm:max-w-[75%] rounded-[20px] rounded-br-md bg-sunken border border-line px-4 py-2.5 text-[15px] leading-relaxed text-ink whitespace-pre-wrap break-words">
        {message.text}
      </div>
      <span className="mt-1 mr-1 text-[11px] text-muted">{formatTime(message.at)}</span>
    </div>
  );
}

function AssistantMessage({ message, onRetry, disabled }) {
  const t = useT();
  return (
    <div className="flex gap-3 anim-rise">
      <BrandMark size={28} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-3">
        {message.error ? (
          <div className="space-y-2.5">
            <Alert tone="crit" title={t("Votre message n'a pas pu être traité.")}>
              {message.error}
            </Alert>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} disabled={disabled}>
              <RefreshCw size={13} /> {t("Réessayer")}
            </button>
          </div>
        ) : (
          <>
            <p className="text-[15px] leading-relaxed text-ink whitespace-pre-wrap break-words">{message.text}</p>
            {message.ticket && <TicketReceipt ticket={message.ticket} />}
          </>
        )}
        <span className="block text-[11px] text-muted">{formatTime(message.at)}</span>
      </div>
    </div>
  );
}

function PdfButton({ ticketId, className = "btn btn-secondary btn-sm" }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await api.downloadTicketPdf(ticketId);
    } catch (err) {
      toast(err.message, "crit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={className} onClick={handleClick} disabled={busy}>
      {busy ? <Spinner size={13} /> : <Download size={13} />}
      PDF
    </button>
  );
}

/** Confirmation attached to the assistant's reply once a ticket exists. */
function TicketReceipt({ ticket }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const isRequest = ticketType(ticket) === "request";

  async function copyId() {
    try {
      await navigator.clipboard.writeText(ticket.ticket_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable: the reference stays visible to copy by hand
    }
  }

  return (
    <div className="card overflow-hidden max-w-lg">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 border-b border-line">
        <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <CircleCheck size={16} className="text-ok-ink shrink-0" />
          {isRequest ? t("Demande enregistrée") : t("Réclamation enregistrée")}
        </span>
        <button
          type="button"
          onClick={copyId}
          className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-2 hover:text-ink shrink-0"
          aria-label={t("Copier la référence {id}", { id: ticket.ticket_id })}
        >
          #{ticket.ticket_id}
          {copied ? <Check size={13} className="text-ok-ink" /> : <Copy size={13} className="text-muted" />}
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3.5 text-[13px]">
        <div className="col-span-2 sm:col-span-1 min-w-0">
          <dt className="text-xs text-muted">{isRequest ? t("Objet") : t("Motif")}</dt>
          <dd className="font-medium text-ink mt-0.5 break-words">{ticket.problem_type}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1 min-w-0">
          <dt className="text-xs text-muted">{t("Service en charge")}</dt>
          <dd className="font-medium text-ink mt-0.5 break-words">{ticket.department_label}</dd>
        </div>
        {!isRequest && (
          <div>
            <dt className="text-xs text-muted">{t("Priorité")}</dt>
            <dd className="mt-1">
              <StateBadge kind="urgency" value={ticket.urgency} />
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-muted">{t("Statut")}</dt>
          <dd className="mt-1">
            <StateBadge kind="status" value={ticket.status} />
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-line bg-sunken/60">
        <span className="text-xs text-muted">{t("Conservez cette référence pour le suivi.")}</span>
        <PdfButton ticketId={ticket.ticket_id} />
      </div>
    </div>
  );
}

function HistoryDrawer({ open, onClose }) {
  const t = useT();
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api.myTickets().then(setTickets, (err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("Mes tickets")}
      subtitle={
        tickets
          ? t(tickets.length > 1 ? "{n} tickets enregistrés" : "{n} ticket enregistré", { n: tickets.length })
          : null
      }
      width="sm:max-w-md"
    >
      <div className="p-4 space-y-3">
        {error && <Alert tone="crit">{error}</Alert>}
        {!tickets && !error && (
          <>
            <div className="skeleton h-28" />
            <div className="skeleton h-28" />
          </>
        )}
        {tickets?.length === 0 && (
          <EmptyState icon={Inbox} title={t("Aucun ticket pour le moment")}>
            {t("Vos demandes et réclamations apparaîtront ici avec leur statut.")}
          </EmptyState>
        )}
        {tickets?.map((ticket) => (
          <article key={ticket.ticket_id} className="card p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink break-words">{ticket.problem_type}</p>
                <p className="text-xs text-muted mt-0.5" title={formatDateTime(ticket.created_at)}>
                  <span className="font-mono">#{ticket.ticket_id}</span> · {formatRelative(ticket.created_at)}
                </p>
              </div>
              <StateBadge kind="status" value={ticket.status} />
            </div>
            <p className="mt-2.5 text-[13px] text-ink-2 line-clamp-3 whitespace-pre-wrap break-words">
              {ticket.complaint_text}
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <StateBadge kind="type" value={ticketType(ticket)} />
                <span className="text-xs text-muted truncate">{ticket.department_label}</span>
              </span>
              <PdfButton ticketId={ticket.ticket_id} />
            </div>
          </article>
        ))}
      </div>
    </Drawer>
  );
}
