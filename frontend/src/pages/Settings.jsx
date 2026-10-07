import { useCallback, useEffect, useState } from "react";
import { Cpu, Database, Mail, Sparkles, Users } from "lucide-react";
import { api } from "../api";
import { formatDateTime, formatPercent } from "../lib/format";
import { Alert, Card, Field, PageHeader, Spinner, useToast } from "../components/ui";
import EmailSettings from "./settings/EmailSettings";
import AccountSettings from "./settings/AccountSettings";
import KnowledgeSettings from "./settings/KnowledgeSettings";
import { useT } from "../lib/i18n";

const TABS = [
  { id: "ai", label: "Moteur IA", icon: Cpu },
  { id: "email", label: "E-mails et routage", icon: Mail },
  { id: "accounts", label: "Comptes et rôles", icon: Users },
  { id: "knowledge", label: "Base de connaissances", icon: Database },
];

export default function Settings({ section, onSection }) {
  const t = useT();
  const active = TABS.some((t) => t.id === section) ? section : "ai";

  return (
    <div className="mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-8 py-6">
      <PageHeader
        title={t("Paramètres")}
        subtitle={t("Configuration de l'agent, des notifications et des accès. Réservé aux administrateurs.")}
      />

      <div className="mt-5 border-b border-line -mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto scroll-none" role="tablist">
        <div className="flex gap-1 min-w-max">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSection(tab.id)}
                className={`relative h-10 px-3 inline-flex items-center gap-2 text-[13px] font-medium transition-colors ${
                  isActive ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                <Icon size={15} />
                {t(tab.label)}
                {isActive && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        {active === "ai" && <AiSettings />}
        {active === "email" && <EmailSettings />}
        {active === "accounts" && <AccountSettings />}
        {active === "knowledge" && <KnowledgeSettings />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- AI engine --
const MODE_OPTIONS = [
  { id: "hybrid", label: "Hybride", sub: "ML + LLM", text: "Les deux modèles classent la réclamation ; un arbitrage tranche en cas de désaccord." },
  { id: "llm_only", label: "LLM seul", sub: "Modèle de langage (Gemini)", text: "Le modèle de langage décide seul du département et du motif." },
  { id: "lr_only", label: "ML seul", sub: "Régression logistique", text: "Classification locale, sans appel au modèle de langage." },
];

function Slider({ label, value, min, max, step, onChange, disabled, marks }) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className={disabled ? "opacity-50" : ""}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-xs font-medium text-ink-2">{label}</span>
        <span className="tnum text-xs font-semibold text-ink bg-sunken border border-line rounded-md px-1.5 py-0.5">
          {formatPercent(value)}
        </span>
      </div>
      <input
        type="range"
        className="slider"
        style={{ "--fill": `${fill}%` }}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <div className="flex justify-between text-[11px] text-muted mt-0.5">
        {marks.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </div>
  );
}

/** Says plainly whether replies currently come from the language model or from the fallback text. */
function LlmStatus({ status }) {
  const t = useT();
  if (!status) return null;
  if (!status.configured) {
    return (
      <Alert tone="warn" title={t("Aucune clé Gemini configurée")}>
        {t("Le tri, le classement et les réponses utilisent le modèle local et des textes prédéfinis.")}
      </Alert>
    );
  }
  if (status.state === "failing") {
    const title =
      status.error_kind === "quota"
        ? t("Quota Gemini dépassé")
        : status.error_kind === "key"
        ? t("Clé Gemini refusée")
        : t("Le modèle de langage ne répond pas");
    return (
      <Alert tone="crit" title={title}>
        {t("Depuis le {date}, les réponses envoyées aux clients sont des textes prédéfinis et le classement repose sur le modèle local. Le service reprend automatiquement dès que le modèle répond à nouveau.", {
          date: formatDateTime(status.last_error_at),
        })}
        <span className="block mt-1.5 font-mono text-[11px] opacity-80 break-words">{status.last_error}</span>
      </Alert>
    );
  }
  if (status.state === "ok") {
    return (
      <Alert tone="ok">
        {t("Modèle de langage opérationnel. Dernier appel réussi le {date}.", { date: formatDateTime(status.last_ok_at) })}
      </Alert>
    );
  }
  return <Alert tone="info">{t("Aucun appel au modèle de langage depuis le démarrage du serveur.")}</Alert>;
}

function AiSettings() {
  const t = useT();
  const toast = useToast();
  const [saved, setSaved] = useState(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [retrainStats, setRetrainStats] = useState(null);
  const [llm, setLlm] = useState(null);

  useEffect(() => {
    api.getAgentStatus().then(setLlm, () => setLlm(null));
  }, []);

  const load = useCallback(() => {
    api.getAgentConfig().then(
      (cfg) => {
        setSaved(cfg);
        setConfig(cfg);
        setError(null);
      },
      (err) => setError(err.message)
    );
  }, []);

  useEffect(load, [load]);

  if (error) return <Alert tone="crit" title={t("Configuration indisponible")}>{error}</Alert>;
  if (!config) return <div className="skeleton h-96" />;

  const dirty = JSON.stringify(config) !== JSON.stringify(saved);
  const hybrid = config.classification_mode === "hybrid";
  const weight = config.lr_weight ?? 0.5;
  const threshold = config.lr_confidence_threshold ?? 0.6;
  const set = (patch) => setConfig((c) => ({ ...c, ...patch }));

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.updateAgentConfig(config);
      setSaved(res.config);
      setConfig(res.config);
      toast(t("Configuration du moteur IA enregistrée."));
    } catch (err) {
      toast(err.message, "crit");
    } finally {
      setSaving(false);
    }
  }

  async function handleRetrain() {
    setRetraining(true);
    try {
      const res = await api.retrainAgent();
      setRetrainStats(res.stats);
      toast(t("Modèle local ré-entraîné."));
    } catch (err) {
      toast(err.message, "crit");
    } finally {
      setRetraining(false);
    }
  }

  return (
    <div className="space-y-4">
      <LlmStatus status={llm} />
      <form onSubmit={handleSave}>
        <Card
          title={t("Classification des réclamations")}
          description={t("Arbitrage entre le modèle local (TF-IDF + régression logistique) et le modèle de langage.")}
          bodyClassName="p-4 sm:p-5 space-y-6"
        >
          <div>
            <p className="text-xs font-medium text-ink-2 mb-2">{t("Mode de classification")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" role="radiogroup" aria-label={t("Mode de classification")}>
              {MODE_OPTIONS.map((m) => {
                const isActive = config.classification_mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => set({ classification_mode: m.id })}
                    className={`text-left rounded-xl border p-3.5 transition-colors ${
                      isActive ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-line hover:border-line-strong hover:bg-sunken"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-ink">{t(m.label)}</span>
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isActive ? "border-brand" : "border-line-strong"
                        }`}
                      >
                        {isActive && <span className="w-2 h-2 rounded-full bg-brand" />}
                      </span>
                    </span>
                    <span className="block text-xs text-muted mt-0.5">{t(m.sub)}</span>
                    <span className="block text-xs text-ink-2 mt-2">{t(m.text)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <Slider
              label={t("Poids du modèle local (ML) face au LLM")}
              value={weight}
              min={0}
              max={1}
              step={0.05}
              disabled={!hybrid}
              onChange={(v) => set({ lr_weight: v })}
              marks={[t("0 % · priorité LLM"), t("50 %"), t("100 % · priorité ML")]}
            />
            <Slider
              label={t("Seuil de confiance du modèle local (LR)")}
              value={threshold}
              min={0.4}
              max={0.95}
              step={0.05}
              disabled={!hybrid}
              onChange={(v) => set({ lr_confidence_threshold: v })}
              marks={[t("40 %"), t("95 %")]}
            />
          </div>

          <Alert tone="info">
            {!hybrid
              ? t("Le poids et le seuil ne s'appliquent qu'en mode hybride.")
              : weight > 0.5
              ? t("En cas de désaccord, le modèle local l'emporte lorsque sa confiance atteint {threshold} ; sinon le LLM décide.", {
                  threshold: formatPercent(threshold),
                })
              : t("Avec un poids de 50 % ou moins, le LLM l'emporte toujours en cas de désaccord. Passez au-dessus de 50 % pour que le seuil de confiance s'applique.")}
          </Alert>

          <Field
            label={t("Modèle de langage")}
            hint={t("Identifiant du modèle Gemini utilisé pour la classification.")}
            className="max-w-sm"
          >
            {(id) => (
              <input
                id={id}
                className="input font-mono"
                spellCheck={false}
                value={config.model_name || ""}
                onChange={(e) => set({ model_name: e.target.value })}
              />
            )}
          </Field>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-4 border-t border-line">
            {dirty && <span className="text-xs text-warn-ink sm:mr-auto">{t("Modifications non enregistrées")}</span>}
            <button type="button" className="btn btn-secondary" onClick={() => setConfig(saved)} disabled={!dirty || saving}>
              {t("Annuler")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={!dirty || saving || !config.model_name?.trim()}>
              {saving && <Spinner size={14} />}
              {t("Enregistrer")}
            </button>
          </div>
        </Card>
      </form>

      <Card
        title={t("Modèle local")}
        description={t("Ré-entraîne la régression logistique sur le jeu d'exemples initial et sur l'historique des tickets.")}
        actions={
          <button type="button" className="btn btn-secondary" onClick={handleRetrain} disabled={retraining}>
            {retraining ? <Spinner size={14} /> : <Sparkles size={14} />}
            {retraining ? t("Entraînement…") : t("Ré-entraîner")}
          </button>
        }
      >
        {retrainStats ? (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
            <div>
              <dt className="text-xs text-muted">{t("Réclamations utilisées")}</dt>
              <dd className="text-ink font-semibold text-lg mt-0.5">{retrainStats.sample_count}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t("Départements reconnus")}</dt>
              <dd className="text-ink mt-1 font-mono text-xs">{retrainStats.department_classes?.join(" · ")}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-[13px] text-muted">
            {t("Lancez un ré-entraînement après avoir accumulé de nouveaux tickets pour que le modèle local en tienne compte.")}
          </p>
        )}
      </Card>
    </div>
  );
}
