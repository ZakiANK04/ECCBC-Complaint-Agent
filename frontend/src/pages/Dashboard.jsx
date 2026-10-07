import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Inbox, RefreshCw, Search, X } from "lucide-react";
import { api } from "../api";
import {
  SENTIMENT,
  SENTIMENT_ORDER,
  STATUS,
  STATUS_ORDER,
  TICKET_TYPE,
  TICKET_TYPE_ORDER,
  URGENCY,
  URGENCY_ORDER,
  dayKey,
  formatDateTime,
  formatDay,
  formatPercent,
  formatRelative,
  formatTime,
  ticketType,
} from "../lib/format";
import { translate, useT } from "../lib/i18n";
import { Alert, Card, EmptyState, PageHeader, Segmented, Spinner, StateBadge } from "../components/ui";
import { BarList, Distribution, StatTile, TrendChart } from "../components/charts";
import TicketDrawer from "../components/TicketDrawer";

const PERIODS = [
  { value: "7", label: "7 j" },
  { value: "30", label: "30 j" },
  { value: "90", label: "90 j" },
  { value: "all", label: "Tout" },
];
const PAGE_SIZE = 10;
const DAY_MS = 86_400_000;
const URGENCY_RANK = { high: 3, medium: 2, low: 1 };

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Ticket counts per day (or per week once the span gets long), gaps filled with zero. */
function buildTrend(tickets, periodDays) {
  if (!tickets.length && !periodDays) return [];
  const today = startOfDay(new Date());
  const first = periodDays
    ? new Date(today.getTime() - (periodDays - 1) * DAY_MS)
    : startOfDay(new Date(Math.min(...tickets.map((row) => new Date(row.created_at).getTime()))));
  const span = Math.round((today - first) / DAY_MS) + 1;
  const weekly = span > 92;

  const counts = {};
  for (const row of tickets) counts[dayKey(row.created_at)] = (counts[dayKey(row.created_at)] || 0) + 1;

  const points = [];
  for (let i = 0; i < span; i++) {
    // Noon avoids landing on the wrong date across a daylight-saving change.
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i, 12);
    const count = counts[dayKey(day)] || 0;
    if (weekly && i % 7 !== 0) {
      points[points.length - 1].count += count;
    } else {
      points.push({
        key: dayKey(day),
        tick: formatDay(day),
        weekly,
        count,
      });
    }
  }
  return points;
}

function exportCsv(tickets) {
  const label = (defs, value) => (defs[value] ? translate(defs[value].label) : value);
  const columns = [
    ['Ticket', (row) => row.ticket_id],
    ['Date', (row) => row.created_at],
    ['Type', (row) => label(TICKET_TYPE, ticketType(row))],
    ['Statut', (row) => label(STATUS, row.status)],
    ['Urgence', (row) => label(URGENCY, row.urgency)],
    ['Sentiment', (row) => label(SENTIMENT, row.sentiment)],
    ['Département', (row) => row.department_label],
    ['Motif', (row) => row.problem_type],
    ['Résumé', (row) => row.summary],
    ['Message', (row) => row.complaint_text],
    ['Client', (row) => row.client_name || row.created_by || ""],
  ];
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    columns.map(([h]) => cell(translate(h))).join(";"),
    ...tickets.map((row) => columns.map(([, get]) => cell(get(row))).join(";")),
  ];
  // BOM + semicolons so Excel (French locale) opens it with accents and columns intact.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `eccbc-tickets-${dayKey(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function Dashboard() {
  const t = useT();
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);

  const [period, setPeriod] = useState("all");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [urgency, setUrgency] = useState("all");
  const [sentiment, setSentiment] = useState("all");
  const [department, setDepartment] = useState(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setTickets(await api.listTickets());
      setLoadedAt(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The period scopes every figure, chart and row on the page.
  const periodDays = period === "all" ? null : Number(period);
  const scoped = useMemo(() => {
    if (!tickets) return [];
    if (!periodDays) return tickets;
    const from = startOfDay(new Date()).getTime() - (periodDays - 1) * DAY_MS;
    return tickets.filter((row) => new Date(row.created_at).getTime() >= from);
  }, [tickets, periodDays]);

  const previousCount = useMemo(() => {
    if (!tickets || !periodDays) return null;
    const to = startOfDay(new Date()).getTime() - (periodDays - 1) * DAY_MS;
    const from = to - periodDays * DAY_MS;
    return tickets.filter((row) => {
      const at = new Date(row.created_at).getTime();
      return at >= from && at < to;
    }).length;
  }, [tickets, periodDays]);

  const stats = useMemo(() => {
    const by = (key, value) => scoped.filter((row) => t[key] === value).length;
    const resolved = by("status", "resolved");
    return {
      total: scoped.length,
      open: by("status", "open"),
      inProgress: by("status", "in_progress"),
      resolved,
      resolutionRate: scoped.length ? resolved / scoped.length : 0,
      urgentPending: scoped.filter((row) => row.urgency === "high" && row.status !== "resolved").length,
    };
  }, [scoped]);

  const trend = useMemo(() => buildTrend(scoped, periodDays), [scoped, periodDays]);

  const departments = useMemo(() => {
    const counts = {};
    for (const row of scoped) counts[row.department_label] = (counts[row.department_label] || 0) + 1;
    return Object.entries(counts)
      .map(([label, value]) => ({ key: label, label, value }))
      .sort((a, b) => b.value - a.value);
  }, [scoped]);

  const segments = (defs, order, read) =>
    order.map((value) => ({
      key: value,
      label: t(defs[value].label),
      tone: defs[value].tone,
      value: scoped.filter((row) => read(row) === value).length,
    }));

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = scoped.filter(
      (row) =>
        (status === "all" || row.status === status) &&
        (type === "all" || ticketType(row) === type) &&
        (urgency === "all" || row.urgency === urgency) &&
        (sentiment === "all" || row.sentiment === sentiment) &&
        (!department || row.department_label === department) &&
        (!q ||
          [row.ticket_id, row.problem_type, row.summary, row.complaint_text, row.department_label, row.client_name]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(q)))
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sort.key === "urgency") {
        const diff = (URGENCY_RANK[a.urgency] || 0) - (URGENCY_RANK[b.urgency] || 0);
        if (diff) return diff * dir;
      }
      return a.created_at.localeCompare(b.created_at) * (sort.key === "date" ? dir : -1);
    });
  }, [scoped, status, type, urgency, sentiment, department, query, sort]);

  useEffect(() => setPage(1), [period, status, type, urgency, sentiment, department, query, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = tickets?.find((row) => row.ticket_id === selectedId) || null;
  const filtersActive = status !== "all" || type !== "all" || urgency !== "all" || sentiment !== "all" || department || query.trim();

  function resetFilters() {
    setStatus("all");
    setType("all");
    setUrgency("all");
    setSentiment("all");
    setDepartment(null);
    setQuery("");
  }

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  }

  function handleStatusChange(ticketId, newStatus) {
    setTickets((list) =>
      list.map((row) =>
        row.ticket_id === ticketId ? { ...row, status: newStatus, status_updated_at: new Date().toISOString() } : t
      )
    );
  }

  if (!tickets) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <PageHeader title={t("Tableau de bord")} />
        {error ? (
          <Alert tone="crit" title={t("Impossible de charger les tickets")}>
            {error}{" "}
            <button type="button" className="underline font-medium" onClick={load}>
              {t("Réessayer")}
            </button>
          </Alert>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="skeleton h-[104px]" />
              ))}
            </div>
            <div className="skeleton h-72" />
            <div className="skeleton h-96" />
          </>
        )}
      </div>
    );
  }

  const periodLabel = periodDays
    ? t("Nombre de tickets reçus, {n} derniers jours", { n: periodDays })
    : t("Nombre de tickets reçus, depuis le premier ticket");
  const delta = previousCount == null ? null : stats.total - previousCount;
  const requestCount = scoped.filter((row) => ticketType(row) === "request").length;

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <PageHeader
        title={t("Tableau de bord")}
        subtitle={
          loadedAt
            ? t("Réclamations et demandes reçues, et leur traitement. Données actualisées à {time}.", { time: formatTime(loadedAt) })
            : t("Réclamations et demandes reçues, et leur traitement.")
        }
        actions={
          <>
            <Segmented
              label={t("Période")}
              options={PERIODS.map((p) => ({ ...p, label: t(p.label) }))}
              value={period}
              onChange={setPeriod}
            />
            <button type="button" className="btn btn-secondary" onClick={load} disabled={refreshing}>
              {refreshing ? <Spinner size={14} /> : <RefreshCw size={14} />}
              {t("Actualiser")}
            </button>
          </>
        }
      />

      {error && (
        <Alert tone="crit" title={t("Actualisation impossible")}>
          {error}
        </Alert>
      )}

      {/* Key figures */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile
          label={t("Tickets reçus")}
          value={stats.total}
          hint={
            delta == null
              ? t("dont {n} demandes", { n: requestCount })
              : t("{delta} vs {n} j précédents", { delta: `${delta > 0 ? "+" : ""}${delta}`, n: periodDays })
          }
        />
        <StatTile label={t("Ouvertes")} tone="warn" value={stats.open} hint={t("En attente de prise en charge")} />
        <StatTile label={t("En cours")} tone="info" value={stats.inProgress} hint={t("En traitement")} />
        <StatTile
          label={t("Résolues")}
          tone="ok"
          value={stats.resolved}
          hint={t("Taux de résolution {rate}", { rate: formatPercent(stats.resolutionRate) })}
        />
        <div className="col-span-2 lg:col-span-1">
          <StatTile label={t("Urgence haute à traiter")} tone="crit" value={stats.urgentPending} hint={t("Non résolues")} />
        </div>
      </div>

      {tickets.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title={t("Aucun ticket pour le moment")}>
            {t("Les demandes et réclamations envoyées depuis l'assistant client apparaîtront ici.")}
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card
              className="lg:col-span-2"
              title={t("Volume de tickets")}
              description={periodLabel}
            >
              {scoped.length ? (
                <TrendChart
                  data={trend.map((point) => ({
                    ...point,
                    label: point.weekly ? t("Semaine du {day}", { day: point.tick }) : point.tick,
                  }))}
                  formatCount={(n) => t(n > 1 ? "{n} tickets" : "{n} ticket", { n })}
                />
              ) : (
                <p className="text-[13px] text-muted py-16 text-center">{t("Aucun ticket sur cette période.")}</p>
              )}
            </Card>
            <Card title={t("Par département")} description={t("Cliquez sur un département pour filtrer la liste")}>
              {departments.length ? (
                <BarList items={departments} selected={department} onSelect={setDepartment} />
              ) : (
                <p className="text-[13px] text-muted py-16 text-center">{t("Aucune donnée.")}</p>
              )}
            </Card>
          </div>

          <Card bodyClassName="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
            <Distribution title={t("Type")} segments={segments(TICKET_TYPE, TICKET_TYPE_ORDER, ticketType)} />
            <Distribution title={t("Statut")} segments={segments(STATUS, STATUS_ORDER, (row) => row.status)} />
            <Distribution title={t("Urgence (réclamations)")} segments={segments(URGENCY, URGENCY_ORDER, (row) => row.urgency)} />
            <Distribution title={t("Sentiment")} segments={segments(SENTIMENT, SENTIMENT_ORDER, (row) => row.sentiment)} />
          </Card>

          {/* Tickets */}
          <section className="card overflow-hidden">
            <div className="p-3 sm:p-4 space-y-3 border-b border-line">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <Segmented
                  label={t("Filtrer par statut")}
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: "all", label: t("Tous"), count: scoped.length },
                    ...STATUS_ORDER.map((s) => ({
                      value: s,
                      label: t(STATUS[s].label),
                      count: scoped.filter((row) => row.status === s).length,
                    })),
                  ]}
                />
                <div className="relative lg:w-72">
                  <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  <input
                    type="search"
                    className="input pl-8"
                    placeholder={t("Rechercher un ticket, un motif…")}
                    aria-label={t("Rechercher dans les tickets")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select className="input w-auto" aria-label={t("Type")} value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="all">{t("Type : tous")}</option>
                  {TICKET_TYPE_ORDER.map((k) => (
                    <option key={k} value={k}>
                      {t("Type :")} {t(TICKET_TYPE[k].label).toLowerCase()}
                    </option>
                  ))}
                </select>
                <select
                  className="input w-auto"
                  aria-label={t("Urgence")}
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value)}
                >
                  <option value="all">{t("Urgence : toutes")}</option>
                  {URGENCY_ORDER.map((u) => (
                    <option key={u} value={u}>
                      {t("Urgence :")} {t(URGENCY[u].label).toLowerCase()}
                    </option>
                  ))}
                </select>
                <select
                  className="input w-auto"
                  aria-label={t("Sentiment")}
                  value={sentiment}
                  onChange={(e) => setSentiment(e.target.value)}
                >
                  <option value="all">{t("Sentiment : tous")}</option>
                  {SENTIMENT_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {t("Sentiment :")} {t(SENTIMENT[s].label).toLowerCase()}
                    </option>
                  ))}
                </select>
                <select
                  className="input w-auto max-w-full"
                  aria-label={t("Département")}
                  value={department || "all"}
                  onChange={(e) => setDepartment(e.target.value === "all" ? null : e.target.value)}
                >
                  <option value="all">{t("Département : tous")}</option>
                  {departments.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.label}
                    </option>
                  ))}
                </select>
                {filtersActive && (
                  <button type="button" className="btn btn-ghost" onClick={resetFilters}>
                    <X size={14} /> {t("Réinitialiser")}
                  </button>
                )}
                <span className="flex-1" />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => exportCsv(rows)}
                  disabled={rows.length === 0}
                >
                  <Download size={14} /> {t("Exporter CSV")}
                </button>
              </div>
            </div>

            {rows.length === 0 ? (
              <EmptyState
                icon={Search}
                title={t("Aucun ticket ne correspond")}
                action={
                  filtersActive && (
                    <button type="button" className="btn btn-secondary" onClick={resetFilters}>
                      {t("Réinitialiser les filtres")}
                    </button>
                  )
                }
              >
                {t("Modifiez la période ou les filtres pour élargir la recherche.")}
              </EmptyState>
            ) : (
              <>
                {/* Table (md+) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-left text-xs text-muted border-b border-line">
                        <SortHeader label={t("Ticket")} sortKey="date" sort={sort} onSort={toggleSort} className="pl-4 w-[150px]" />
                        <th className="font-medium px-3 py-2.5">{t("Objet")}</th>
                        <th className="font-medium px-3 py-2.5 w-[190px]">{t("Département")}</th>
                        <SortHeader label={t("Urgence")} sortKey="urgency" sort={sort} onSort={toggleSort} className="w-[110px]" />
                        <th className="font-medium px-3 py-2.5 w-[110px]">{t("Sentiment")}</th>
                        <th className="font-medium px-3 py-2.5 w-[110px]">{t("Statut")}</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row) => (
                        <tr
                          key={row.ticket_id}
                          tabIndex={0}
                          onClick={() => setSelectedId(row.ticket_id)}
                          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelectedId(row.ticket_id))}
                          className="border-b border-line last:border-b-0 hover:bg-sunken/60 cursor-pointer focus-visible:outline-offset-[-2px]"
                        >
                          <td className="pl-4 pr-3 py-3 align-top">
                            <span className="block font-mono text-xs text-ink">{row.ticket_id}</span>
                            <span className="block text-xs text-muted mt-0.5" title={formatDateTime(row.created_at)}>
                              {formatRelative(row.created_at)}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-top max-w-0">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="font-medium text-ink truncate">{row.problem_type}</span>
                              {ticketType(row) === "request" && <StateBadge kind="type" value="request" />}
                            </span>
                            <span className="block text-xs text-muted mt-0.5 truncate">{row.summary}</span>
                          </td>
                          <td className="px-3 py-3 align-top text-ink-2">{row.department_label}</td>
                          <td className="px-3 py-3 align-top">
                            {row.urgency ? <StateBadge kind="urgency" value={row.urgency} /> : <span className="text-muted">—</span>}
                          </td>
                          <td className="px-3 py-3 align-top">
                            <StateBadge kind="sentiment" value={row.sentiment} />
                          </td>
                          <td className="px-3 py-3 align-top">
                            <StateBadge kind="status" value={row.status} />
                          </td>
                          <td className="pr-3 py-3 align-top text-muted">
                            <ChevronRight size={16} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Cards (phones) */}
                <ul className="md:hidden divide-y divide-line">
                  {pageRows.map((row) => (
                    <li key={row.ticket_id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.ticket_id)}
                        className="w-full text-left px-4 py-3.5 active:bg-sunken"
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-ink">{row.problem_type}</span>
                            <span className="block text-xs text-muted mt-0.5">
                              <span className="font-mono">{row.ticket_id}</span> · {formatRelative(row.created_at)}
                            </span>
                          </span>
                          <StateBadge kind="status" value={row.status} />
                        </span>
                        <span className="block text-[13px] text-ink-2 mt-2 line-clamp-2">{row.summary}</span>
                        <span className="flex flex-wrap items-center gap-1.5 mt-2.5">
                          {ticketType(row) === "request" && <StateBadge kind="type" value="request" />}
                          {row.urgency && <StateBadge kind="urgency" value={row.urgency} />}
                          <StateBadge kind="sentiment" value={row.sentiment} />
                          <span className="text-xs text-muted">{row.department_label}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-line text-xs text-muted">
                  <span className="tnum">
                    {t("{from}–{to} sur {total}", {
                      from: (page - 1) * PAGE_SIZE + 1,
                      to: Math.min(page * PAGE_SIZE, rows.length),
                      total: rows.length,
                    })}
                  </span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={() => setPage((p) => p - 1)}
                      disabled={page <= 1}
                      aria-label={t("Page précédente")}
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span className="tnum px-1">
                      {page} / {pageCount}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page >= pageCount}
                      aria-label={t("Page suivante")}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </span>
                </div>
              </>
            )}
          </section>
        </>
      )}

      {selected && (
        <TicketDrawer
          key={selected.ticket_id}
          ticket={selected}
          onClose={() => setSelectedId(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}

function SortHeader({ label, sortKey, sort, onSort, className = "" }) {
  const active = sort.key === sortKey;
  const Icon = active && sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={`font-medium px-3 py-2.5 ${className}`}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-ink ${active ? "text-ink" : ""}`}
      >
        {label}
        <Icon size={12} className={active ? "" : "opacity-30"} />
      </button>
    </th>
  );
}
