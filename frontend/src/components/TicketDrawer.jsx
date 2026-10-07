import { useState } from "react";
import { ChevronDown, Download, Mail, UserRound } from "lucide-react";
import { api } from "../api";
import { MODES, STATUS, STATUS_ORDER, formatDateTime, formatPercent, ticketType } from "../lib/format";
import { Alert, Badge, Drawer, Segmented, Spinner, StateBadge, useToast } from "./ui";
import { useT } from "../lib/i18n";

function Section({ title, children }) {
  return (
    <section className="px-5 py-4 border-b border-line last:border-b-0">
      <h3 className="eyebrow mb-2.5">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1 text-[13px]">
      <dt className="text-muted shrink-0">{label}</dt>
      <dd className="text-ink text-right min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Confidence meter: the track is a lighter step of the same hue. */
function Meter({ label, value, highlight }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className={`w-24 shrink-0 truncate ${highlight ? "text-ink font-medium" : "text-ink-2"}`}>{label}</span>
      <span className="flex-1 h-1.5 rounded-full bg-series/15 overflow-hidden">
        <span className="block h-full rounded-full bg-series" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="w-10 text-right tnum text-ink-2">{formatPercent(value)}</span>
    </div>
  );
}

export default function TicketDrawer({ ticket, onClose, onStatusChange }) {
  const t = useT();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  if (!ticket) return <Drawer open={false} onClose={onClose} />;

  const meta = ticket.classification_meta;
  // Older modes stored the model output under `lr_result` / `llm_result`.
  const lr = meta?.lr_prediction || meta?.lr_result;
  const llm = meta?.llm_prediction || meta?.llm_result;
  const recipients = ticket.department_emails?.length ? ticket.department_emails : [ticket.department_email].filter(Boolean);
  const dispatch = ticket.email_dispatch;
  const context = ticket.context_used || [];

  async function changeStatus(status) {
    if (status === ticket.status || saving) return;
    setSaving(true);
    try {
      await api.updateTicketStatus(ticket.ticket_id, status);
      onStatusChange(ticket.ticket_id, status);
      toast(t("Ticket #{id} : {status}.", { id: ticket.ticket_id, status: t(STATUS[status].label).toLowerCase() }));
    } catch (err) {
      toast(err.message, "crit");
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    setDownloading(true);
    try {
      await api.downloadTicketPdf(ticket.ticket_id);
    } catch (err) {
      toast(err.message, "crit");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={ticket.problem_type}
      subtitle={
        <>
          <span className="font-mono">#{ticket.ticket_id}</span> · {formatDateTime(ticket.created_at)}
        </>
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={downloadPdf} disabled={downloading}>
            {downloading ? <Spinner size={14} /> : <Download size={14} />}
            {t("Ticket PDF")}
          </button>
          <span className="flex-1" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t("Fermer")}
          </button>
        </>
      }
    >
      <div className="px-5 py-4 border-b border-line space-y-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <StateBadge kind="type" value={ticketType(ticket)} />
          <Badge tone="neutral" dot={false}>
            {ticket.department_label}
          </Badge>
          {ticket.urgency && <StateBadge kind="urgency" value={ticket.urgency} />}
          <StateBadge kind="sentiment" value={ticket.sentiment} />
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-medium text-ink-2 flex items-center gap-2">
            {t("Statut")} {saving && <Spinner size={12} className="text-muted" />}
          </span>
          <Segmented
            label={t("Statut du ticket")}
            size="sm"
            value={ticket.status}
            onChange={changeStatus}
            options={STATUS_ORDER.map((s) => ({ value: s, label: t(STATUS[s].label) }))}
          />
        </div>
        {ticket.status_updated_at && (
          <p className="text-xs text-muted">
            {ticket.status_updated_by
              ? t("Statut modifié le {date} par {user}.", { date: formatDateTime(ticket.status_updated_at), user: ticket.status_updated_by })
              : t("Statut modifié le {date}.", { date: formatDateTime(ticket.status_updated_at) })}
          </p>
        )}
      </div>

      <Section title={t("Résumé")}>
        <p className="text-sm text-ink">{ticket.summary}</p>
      </Section>

      <Section title={ticketType(ticket) === "request" ? t("Demande du client") : t("Réclamation du client")}>
        <p className="text-sm text-ink whitespace-pre-wrap break-words">{ticket.complaint_text}</p>
        {ticket.created_by && (
          <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted">
            <UserRound size={13} />
            {ticket.client_name || ticket.created_by}
            {ticket.client_company ? ` · ${ticket.client_company}` : ""} ({ticket.created_by})
          </p>
        )}
      </Section>

      <Section title={t("Réponse automatique envoyée")}>
        <p className="text-sm text-ink-2 whitespace-pre-wrap break-words">{ticket.client_reply}</p>
      </Section>

      <Section title={t("Routage et notification")}>
        <dl>
          <Row label={t("Département")}>{ticket.department_label}</Row>
          <Row label={t("Destinataires")}>
            {recipients.length ? (
              recipients.map((email) => (
                <span key={email} className="block font-mono text-xs leading-5">
                  {email}
                </span>
              ))
            ) : (
              <span className="text-muted">{t("Aucun")}</span>
            )}
          </Row>
          {dispatch && (
            <Row label={t("E-mail")}>
              <Badge tone={dispatch.sent ? "ok" : "neutral"}>
                <Mail size={11} />
                {dispatch.sent ? t("Envoyé") : t("Non envoyé")}
              </Badge>
            </Row>
          )}
        </dl>
        {dispatch?.message && <p className="mt-1.5 text-xs text-muted break-words">{dispatch.message}</p>}
      </Section>

      {meta && (
        <Section title={t("Classification")}>
          <dl>
            <Row label={t("Mode")}>{MODES[meta.mode] ? t(MODES[meta.mode]) : meta.mode}</Row>
            {meta.triage && (
              <Row label={t("Tri du message")}>
                <span className="font-mono text-xs">{meta.triage}</span>
              </Row>
            )}
            <Row label={t("Décision")}>
              <span className="font-mono text-xs">{meta.decision}</span>
            </Row>
            {meta.agreement != null && (
              <Row label={t("Accord ML / LLM")}>
                <Badge tone={meta.agreement ? "ok" : "warn"}>{meta.agreement ? t("Oui") : t("Non")}</Badge>
              </Row>
            )}
            {meta.lr_weight != null && <Row label={t("Poids ML")}>{formatPercent(meta.lr_weight)}</Row>}
            {meta.threshold != null && <Row label={t("Seuil de confiance ML")}>{formatPercent(meta.threshold)}</Row>}
          </dl>

          {lr && (
            <div className="mt-3.5 rounded-lg border border-line bg-sunken/50 p-3">
              <p className="text-xs font-medium text-ink">{t("Régression logistique (TF-IDF)")}</p>
              <p className="text-xs text-muted mt-0.5">
                {t("Motif prédit :")} {lr.problem_type}
                {lr.problem_type_confidence != null && ` (${formatPercent(lr.problem_type_confidence)})`}
              </p>
              <div className="mt-2.5 space-y-1.5">
                {lr.department_distribution ? (
                  Object.entries(lr.department_distribution)
                    .sort((a, b) => b[1] - a[1])
                    .map(([dept, p]) => <Meter key={dept} label={dept} value={p} highlight={dept === lr.department} />)
                ) : (
                  <Meter label={lr.department} value={lr.department_confidence || 0} highlight />
                )}
              </div>
            </div>
          )}

          {llm && (
            <div className="mt-2.5 rounded-lg border border-line bg-sunken/50 p-3">
              <p className="text-xs font-medium text-ink">{t("Modèle de langage (LLM)")}</p>
              <dl className="mt-1.5">
                <Row label={t("Département")}>{llm.department}</Row>
                <Row label={t("Motif")}>{llm.problem_type}</Row>
                <Row label={t("Urgence")}>
                  <StateBadge kind="urgency" value={llm.urgency} />
                </Row>
                <Row label={t("Sentiment")}>
                  <StateBadge kind="sentiment" value={llm.sentiment} />
                </Row>
              </dl>
            </div>
          )}

          {meta.llm_fallback_reason && (
            <Alert tone="warn" title={t("Classification LLM indisponible, repli sur le modèle local")} className="mt-2.5">
              {meta.llm_fallback_reason}
            </Alert>
          )}
          {meta.reply_fallback_reason && (
            <Alert tone="warn" title={t("Réponse générée localement")} className="mt-2.5">
              {meta.reply_fallback_reason}
            </Alert>
          )}
        </Section>
      )}

      {context.length > 0 && (
        <Section title={t("Contexte documentaire (RAG)")}>
          <button
            type="button"
            onClick={() => setContextOpen((v) => !v)}
            aria-expanded={contextOpen}
            className="w-full flex items-center justify-between gap-3 text-[13px] text-ink-2 hover:text-ink"
          >
            {t(context.length > 1 ? "{n} extraits utilisés pour la réponse" : "{n} extrait utilisé pour la réponse", { n: context.length })}
            <ChevronDown size={15} className={`transition-transform ${contextOpen ? "rotate-180" : ""}`} />
          </button>
          {contextOpen && (
            <ol className="mt-3 space-y-2">
              {context.map((chunk, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-line bg-sunken/50 p-3 text-xs text-ink-2 whitespace-pre-wrap break-words max-h-44 overflow-y-auto scroll-thin"
                >
                  {chunk}
                </li>
              ))}
            </ol>
          )}
        </Section>
      )}
    </Drawer>
  );
}
