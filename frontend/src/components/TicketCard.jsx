import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import Badge from "./Badge";
import { api } from "../api";

const STATUS_OPTIONS = ["open", "in_progress", "resolved"];

export default function TicketCard({ ticket, onStatusChange }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(ticket.status);

  async function handleStatusChange(e) {
    const newStatus = e.target.value;
    setStatus(newStatus);
    await api.updateTicketStatus(ticket.ticket_id, newStatus);
    onStatusChange?.(ticket.ticket_id, newStatus);
  }

  return (
    <div className="bg-white rounded-2xl card-shadow overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-slate-400">#{ticket.ticket_id}</span>
            <span className="font-semibold text-slate-800 truncate">{ticket.problem_type}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <Badge value={ticket.urgency} />
            <Badge value={ticket.sentiment} />
            <Badge value={status} />
            <span className="text-xs text-slate-400">{ticket.department_label}</span>
          </div>
        </div>
        <ChevronDown className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-brand-red uppercase mb-1">Summary</p>
            <p className="text-sm text-slate-700">{ticket.summary}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-brand-red uppercase mb-1">Original complaint</p>
            <p className="text-sm text-slate-700 whitespace-pre-line">{ticket.complaint_text}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-brand-red uppercase mb-1">Automated reply sent</p>
            <p className="text-sm text-slate-700 whitespace-pre-line">{ticket.client_reply}</p>
          </div>

          {ticket.classification_meta && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs text-slate-600 space-y-1">
              <span className="font-bold text-slate-800 block text-[11px] uppercase">
                Analyse & Classification ({ticket.classification_meta.mode?.toUpperCase()})
              </span>
              <p>Décision: <span className="font-mono text-slate-700">{ticket.classification_meta.decision}</span></p>
              {ticket.classification_meta.lr_prediction && (
                <p>
                  Régression Logistique: <span className="font-medium text-slate-800">{ticket.classification_meta.lr_prediction.department}</span> (confiance: {Math.round((ticket.classification_meta.lr_prediction.department_confidence || 0) * 100)}%)
                </p>
              )}
            </div>
          )}

          {ticket.email_dispatch && (
            <div className="text-xs text-slate-500 flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
              <span>📧 Notification E-mail: <b>{ticket.email_dispatch.sent ? "Envoyée" : "Non envoyée"}</b></span>
              <span className="text-[11px] text-slate-400 truncate max-w-[280px]">{ticket.email_dispatch.message}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <select
              value={status}
              onChange={handleStatusChange}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-red/30"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
            <a
              href={api.ticketPdfUrl(ticket.ticket_id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-red hover:text-brand-red-dark"
            >
              <Download size={16} /> PDF ticket
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
