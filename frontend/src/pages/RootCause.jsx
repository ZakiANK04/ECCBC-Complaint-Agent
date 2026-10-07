import { useEffect, useMemo, useState } from "react";
import { Download, Lightbulb, Microscope, Minus, Play, Plus, Quote } from "lucide-react";
import { api } from "../api";
import { formatDateTime, ticketType } from "../lib/format";
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner, useToast } from "../components/ui";
import { BarList } from "../components/charts";
import { useT } from "../lib/i18n";

// Keeps the last report while the user moves between screens in the same session.
let lastRun = null;

function Stepper({ label, hint, value, min, max, onChange }) {
  const t = useT();
  const clamp = (n) => Math.min(max, Math.max(min, n));
  return (
    <div>
      <p className="text-xs font-medium text-ink-2">{label}</p>
      <div className="mt-1.5 inline-flex items-center rounded-lg border border-line-strong bg-surface">
        <button
          type="button"
          className="btn btn-ghost btn-icon rounded-r-none"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          aria-label={t("Diminuer : {label}", { label })}
        >
          <Minus size={14} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value) || min))}
          aria-label={label}
          className="w-12 h-9 text-center text-sm font-medium text-ink bg-transparent tnum focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          className="btn btn-ghost btn-icon rounded-l-none"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          aria-label={t("Augmenter : {label}", { label })}
        >
          <Plus size={14} />
        </button>
      </div>
      <p className="mt-1.5 text-xs text-muted">{hint}</p>
    </div>
  );
}

export default function RootCause() {
  const t = useT();
  const toast = useToast();
  const [minCount, setMinCount] = useState(lastRun?.minCount ?? 2);
  const [topN, setTopN] = useState(lastRun?.topN ?? 5);
  const [tickets, setTickets] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [run, setRun] = useState(lastRun);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    // Root causes are about problems: requests are left out, as on the server.
    api.listTickets().then(
      (all) => setTickets(all.filter((row) => ticketType(row) === "complaint")),
      () => setTickets([])
    );
  }, []);

  // Same grouping the analysis applies server-side: motif × département.
  const groups = useMemo(() => {
    const counts = new Map();
    for (const row of tickets || []) {
      const key = `${row.problem_type} — ${row.department_label}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].map(([label, value]) => ({ key: label, label, value })).sort((a, b) => b.value - a.value);
  }, [tickets]);

  const eligible = groups.filter((g) => g.value >= minCount);
  const analysed = eligible.slice(0, topN);

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      const res = await api.runRootCause(minCount, topN);
      lastRun = { ...res, minCount, topN, at: new Date() };
      setRun(lastRun);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function downloadPdf() {
    setDownloading(true);
    try {
      await api.downloadRootCausePdf(run.pdf_filename);
    } catch (err) {
      toast(err.message, "crit");
    } finally {
      setDownloading(false);
    }
  }

  const findings = run?.report.findings || [];

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <PageHeader
        title={t("Analyse des causes racines")}
        subtitle={t("Regroupe les tickets par motif et par département, puis explique la cause probable de chaque motif récurrent à partir du texte réel des réclamations.")}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-4 items-start">
        {/* Parameters */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <Card title={t("Paramètres de l'analyse")}>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-5">
              <Stepper
                label={t("Réclamations minimum par motif")}
                hint={t("Un motif n'est analysé qu'à partir de ce nombre de tickets.")}
                value={minCount}
                min={2}
                max={20}
                onChange={setMinCount}
              />
              <Stepper
                label={t("Nombre maximum de motifs")}
                hint={t("Les motifs les plus fréquents sont analysés en premier.")}
                value={topN}
                min={1}
                max={10}
                onChange={setTopN}
              />
            </div>
            <button type="button" className="btn btn-primary btn-lg w-full mt-5" onClick={handleRun} disabled={running}>
              {running ? <Spinner /> : <Play size={16} />}
              {running ? t("Analyse en cours…") : t("Lancer l'analyse")}
            </button>
            {error && (
              <Alert tone="crit" className="mt-3">
                {error}
              </Alert>
            )}
          </Card>

          <Card
            title={t("Motifs concernés")}
            description={
              tickets
                ? t("{tickets} réclamations · {eligible} motifs récurrents sur {groups}", {
                    tickets: tickets.length,
                    eligible: eligible.length,
                    groups: groups.length,
                  })
                : t("Chargement…")
            }
          >
            {!tickets ? (
              <div className="skeleton h-24" />
            ) : analysed.length ? (
              <>
                <BarList items={analysed} />
                {eligible.length > analysed.length && (
                  <p className="mt-3 text-xs text-muted">
                    {t("Autres motifs au-delà du maximum choisi : {n}.", { n: eligible.length - analysed.length })}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[13px] text-muted">
                {t("Aucun motif n'atteint {n} réclamations. Abaissez le seuil ou attendez davantage de tickets.", { n: minCount })}
              </p>
            )}
          </Card>
        </div>

        {/* Report */}
        <div className="space-y-4 min-w-0">
          {!run && !running && (
            <Card>
              <EmptyState icon={Microscope} title={t("Aucune analyse lancée")}>
                {t("Réglez les paramètres puis lancez l'analyse. Le rapport s'affiche ici et peut être exporté en PDF.")}
              </EmptyState>
            </Card>
          )}

          {running && !run && (
            <>
              <div className="skeleton h-32" />
              <div className="skeleton h-56" />
              <div className="skeleton h-56" />
            </>
          )}

          {run && (
            <div className={`space-y-4 transition-opacity ${running ? "opacity-50" : ""}`}>
              <Card
                title={t("Synthèse")}
                description={t("Analyse du {date} · seuil {min}, {max} motifs maximum", {
                  date: formatDateTime(run.at),
                  min: run.minCount,
                  max: run.topN,
                })}
                actions={
                  <button type="button" className="btn btn-secondary btn-sm" onClick={downloadPdf} disabled={downloading}>
                    {downloading ? <Spinner size={13} /> : <Download size={13} />}
                    {t("Rapport PDF")}
                  </button>
                }
              >
                <p className="text-sm text-ink leading-relaxed">{run.report.overall_summary}</p>
              </Card>

              {findings.length === 0 ? (
                <Alert tone="info">{t("Aucun motif n'a atteint le seuil minimum pour cette analyse.")}</Alert>
              ) : (
                findings.map((finding, i) => <FindingCard key={i} finding={finding} index={i + 1} />)
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FindingCard({ finding, index }) {
  const t = useT();
  return (
    <article className="card">
      <header className="flex items-start gap-3 px-4 sm:px-5 pt-4 sm:pt-5">
        <span className="w-7 h-7 rounded-lg bg-sunken border border-line flex items-center justify-center text-xs font-semibold text-ink-2 tnum shrink-0">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink break-words">{finding.cluster_label}</h3>
        </div>
        <Badge tone="neutral" dot={false} className="tnum shrink-0">
          {t(finding.ticket_count > 1 ? "{n} réclamations" : "{n} réclamation", { n: finding.ticket_count })}
        </Badge>
      </header>

      <div className="px-4 sm:px-5 py-4 space-y-4">
        <div>
          <p className="eyebrow mb-1.5">{t("Cause racine probable")}</p>
          <p className="text-sm text-ink leading-relaxed">{finding.likely_root_cause}</p>
        </div>

        {finding.supporting_evidence?.length > 0 && (
          <div>
            <p className="eyebrow mb-1.5">{t("Éléments à l'appui")}</p>
            <ul className="space-y-1.5">
              {finding.supporting_evidence.map((evidence, i) => (
                <li key={i} className="flex gap-2 text-[13px] text-ink-2">
                  <Quote size={13} className="text-muted shrink-0 mt-1" />
                  <span className="min-w-0 break-words">{evidence}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-3 rounded-lg border border-line bg-sunken/60 p-3.5">
          <Lightbulb size={16} className="text-warn-ink shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink">{t("Action recommandée")}</p>
            <p className="text-[13px] text-ink-2 mt-0.5 break-words">{finding.recommended_action}</p>
          </div>
        </div>
      </div>
    </article>
  );
}
