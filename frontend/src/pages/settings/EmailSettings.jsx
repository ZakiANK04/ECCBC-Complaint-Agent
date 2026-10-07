import { useCallback, useEffect, useState } from "react";
import { Plus, Send, X } from "lucide-react";
import { api } from "../../api";
import { departmentEmails } from "../../lib/format";
import { Alert, Badge, Card, ConfirmDialog, Field, Spinner, Switch, useToast } from "../../components/ui";
import { useT } from "../../lib/i18n";

// The mailer skips these placeholder addresses instead of sending to them.
const isPlaceholder = (email) => email.endsWith("example-eccbc.dz");

export default function EmailSettings() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 items-start">
        <SmtpCard />
        <TestCard />
      </div>
      <DepartmentsCard />
    </div>
  );
}

// -------------------------------------------------------------------- SMTP --
function SmtpCard() {
  const t = useT();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const apply = useCallback((cfg) => {
    setStatus(cfg);
    setForm({
      enabled: cfg.enabled,
      host: cfg.host || "",
      port: String(cfg.port ?? ""),
      use_tls: cfg.use_tls ?? true,
      user: cfg.smtp_user || "",
      from_email: cfg.from_email || "",
      password: "",
    });
  }, []);

  useEffect(() => {
    api.getEmailConfig().then(apply, (err) => setError(err.message));
  }, [apply]);

  if (error) return <Alert tone="crit" title={t("Configuration e-mail indisponible")}>{error}</Alert>;
  if (!form) return <div className="skeleton h-96" />;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const port = Number(form.port);
  const portValid = Number.isInteger(port) && port >= 1 && port <= 65535;
  const ready = status.enabled && status.has_credentials;

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      apply(await api.updateEmailConfig({ ...form, port }));
      toast(t("Configuration SMTP enregistrée."));
    } catch (err) {
      toast(err.message, "crit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card
        title={t("Serveur d'envoi (SMTP)")}
        description={t("À chaque ticket, le PDF est envoyé aux destinataires du département concerné.")}
        actions={
          <Badge tone={ready ? "ok" : "warn"}>
            {ready ? t("Envoi actif") : status.enabled ? t("Identifiants manquants") : t("Envoi désactivé")}
          </Badge>
        }
        bodyClassName="p-4 sm:p-5 space-y-5"
      >
        <Switch
          label={t("Activer l'envoi des e-mails")}
          description={t("Désactivé, les tickets sont créés sans notification.")}
          checked={form.enabled}
          onChange={(v) => set({ enabled: v })}
        />

        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px] gap-4">
          <Field label={t("Serveur")}>
            {(id) => (
              <input id={id} className="input font-mono" spellCheck={false} value={form.host} onChange={(e) => set({ host: e.target.value })} />
            )}
          </Field>
          <Field label={t("Port")} error={form.port && !portValid ? t("Port invalide") : null}>
            {(id) => (
              <input id={id} className="input font-mono" inputMode="numeric" value={form.port} onChange={(e) => set({ port: e.target.value })} />
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("Identifiant")}>
            {(id) => (
              <input
                id={id}
                className="input"
                autoComplete="off"
                spellCheck={false}
                placeholder={t("adresse@domaine.com")}
                value={form.user}
                onChange={(e) => set({ user: e.target.value })}
              />
            )}
          </Field>
          <Field
            label={t("Mot de passe")}
            hint={status.has_password ? t("Laissez vide pour conserver le mot de passe actuel.") : t("Pour Gmail : mot de passe d'application (16 caractères).")}
          >
            {(id) => (
              <input
                id={id}
                type="password"
                className="input"
                autoComplete="new-password"
                placeholder={status.has_password ? t("•••••••• (enregistré)") : ""}
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
              />
            )}
          </Field>
        </div>

        <Field label={t("Expéditeur affiché")} hint={t("Exemple : ECCBC Service Client <adresse@domaine.com>")}>
          {(id) => (
            <input id={id} className="input" spellCheck={false} value={form.from_email} onChange={(e) => set({ from_email: e.target.value })} />
          )}
        </Field>

        <Switch
          label={t("Chiffrement STARTTLS")}
          description={t("Recommandé sur le port 587. Le port 465 utilise SSL automatiquement.")}
          checked={form.use_tls}
          onChange={(v) => set({ use_tls: v })}
        />

        <div className="flex justify-end pt-4 border-t border-line">
          <button type="submit" className="btn btn-primary" disabled={saving || !portValid || !form.host.trim()}>
            {saving && <Spinner size={14} />}
            {t("Enregistrer")}
          </button>
        </div>
      </Card>
    </form>
  );
}

function TestCard() {
  const t = useT();
  const [recipient, setRecipient] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setTesting(true);
    setResult(null);
    try {
      const res = await api.testEmail(recipient.trim());
      setResult({ ok: true, message: res.message });
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card title={t("Tester l'envoi")} description={t("Envoie un message de vérification avec la configuration enregistrée.")}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label={t("Adresse de destination")}>
          {(id) => (
            <input
              id={id}
              type="email"
              className="input"
              placeholder={t("vous@domaine.com")}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={testing}
            />
          )}
        </Field>
        <button type="submit" className="btn btn-secondary w-full" disabled={testing || !recipient.trim()}>
          {testing ? <Spinner size={14} /> : <Send size={14} />}
          {testing ? t("Envoi…") : t("Envoyer un e-mail de test")}
        </button>
        {result && <Alert tone={result.ok ? "ok" : "crit"}>{result.message}</Alert>}
      </form>
    </Card>
  );
}

// ------------------------------------------------------------- departments --
function DepartmentsCard() {
  const t = useT();
  const toast = useToast();
  const [departments, setDepartments] = useState(null);
  const [error, setError] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busyKey, setBusyKey] = useState(null);
  const [removing, setRemoving] = useState(null); // { key, email }

  const load = useCallback(
    () => api.getDepartments().then(setDepartments, (err) => setError(err.message)),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  async function addEmail(key) {
    const email = (drafts[key] || "").trim();
    if (!email) return;
    setBusyKey(key);
    try {
      await api.addDepartmentEmail(key, email);
      setDrafts((d) => ({ ...d, [key]: "" }));
      await load();
      toast(t("{email} ajouté.", { email }));
    } catch (err) {
      toast(err.message, "crit");
    } finally {
      setBusyKey(null);
    }
  }

  async function confirmRemove() {
    const { key, email } = removing;
    setBusyKey(key);
    try {
      await api.removeDepartmentEmail(key, email);
      await load();
      toast(t("{email} retiré.", { email }));
      setRemoving(null);
    } catch (err) {
      toast(err.message, "crit");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card
      title={t("Destinataires par département")}
      description={t("Personnes notifiées, avec le ticket PDF en pièce jointe, selon le département retenu par la classification.")}
    >
      {error && <Alert tone="crit">{error}</Alert>}
      {!departments && !error && <div className="skeleton h-48" />}
      {departments && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Object.entries(departments).map(([key, dept]) => {
            const emails = departmentEmails(dept);
            return (
              <div key={key} className="rounded-xl border border-line p-3.5 flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-ink truncate">{dept.label || key}</p>
                  <span className="font-mono text-[11px] text-muted bg-sunken border border-line rounded px-1.5 py-0.5 shrink-0">
                    {key}
                  </span>
                </div>

                <ul className="mt-3 space-y-1.5 flex-1">
                  {emails.length === 0 && <li className="text-xs text-muted">{t("Aucun destinataire.")}</li>}
                  {emails.map((email) => (
                    <li key={email} className="flex items-center gap-2 rounded-lg bg-sunken/70 border border-line pl-2.5 pr-1 py-1">
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-ink truncate" title={email}>
                          {email}
                        </span>
                        {isPlaceholder(email) && (
                          <span className="block text-[11px] text-warn-ink">{t("Adresse d'exemple, ignorée à l'envoi")}</span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm shrink-0"
                        onClick={() => setRemoving({ key, email })}
                        aria-label={t("Retirer {email}", { email })}
                      >
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                </ul>

                <form
                  className="mt-3 flex gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addEmail(key);
                  }}
                >
                  <input
                    type="email"
                    className="input"
                    placeholder={t("nouvelle.adresse@…")}
                    aria-label={t("Ajouter un destinataire pour {name}", { name: dept.label || key })}
                    value={drafts[key] || ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                  />
                  <button
                    type="submit"
                    className="btn btn-secondary btn-icon shrink-0"
                    disabled={busyKey === key || !(drafts[key] || "").trim()}
                    aria-label={t("Ajouter")}
                  >
                    {busyKey === key ? <Spinner size={14} /> : <Plus size={15} />}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        title={t("Retirer ce destinataire ?")}
        confirmLabel={t("Retirer")}
        busy={busyKey !== null}
      >
        {removing &&
          t("{email} ne recevra plus les notifications du département « {name} ».", {
            email: removing.email,
            name: departments?.[removing.key]?.label || removing.key,
          })}
      </ConfirmDialog>
    </Card>
  );
}
