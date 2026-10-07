import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Dices, Minus, Pencil, Search, Trash2, UserPlus } from "lucide-react";
import { api } from "../../api";
import { useAuth } from "../../lib/session";
import { NAV, ROLES, formatRelative } from "../../lib/format";
import {
  Alert,
  Avatar,
  Badge,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  Segmented,
  Spinner,
  StateBadge,
  Switch,
  useToast,
} from "../../components/ui";
import { useT } from "../../lib/i18n";

const ROLE_KEYS = ["client", "employee", "admin"];

function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export default function AccountSettings() {
  const t = useT();
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [role, setRole] = useState("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | user
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.listUsers().then(setUsers, (err) => setError(err.message)), []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users || []).filter(
      (u) =>
        (role === "all" || u.role === role) &&
        (!q || [u.name, u.username, u.email, u.company].filter(Boolean).some((v) => v.toLowerCase().includes(q)))
    );
  }, [users, role, query]);

  async function confirmDelete() {
    setBusy(true);
    try {
      await api.deleteUser(deleting.id);
      await load();
      toast(t("Compte « {name} » supprimé.", { name: deleting.username }));
      setDeleting(null);
    } catch (err) {
      toast(err.message, "crit");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Alert tone="crit" title={t("Comptes indisponibles")}>{error}</Alert>;
  if (!users) return <div className="skeleton h-96" />;

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-line flex flex-col lg:flex-row lg:items-center gap-3">
          <Segmented
            label={t("Filtrer par rôle")}
            value={role}
            onChange={setRole}
            options={[
              { value: "all", label: t("Tous"), count: users.length },
              ...ROLE_KEYS.map((r) => ({
                value: r,
                label: t(`${ROLES[r].label}s`),
                count: users.filter((u) => u.role === r).length,
              })),
            ]}
          />
          <div className="relative lg:ml-auto lg:w-64">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              type="search"
              className="input pl-8"
              placeholder={t("Rechercher un compte…")}
              aria-label={t("Rechercher un compte")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
            <UserPlus size={15} /> {t("Nouveau compte")}
          </button>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={Search} title={t("Aucun compte ne correspond")}>
            {t("Modifiez le filtre ou la recherche.")}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={u.name} size={36} className={u.active ? "" : "opacity-50"} />
                <div className="min-w-0 flex-1 grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_170px] md:items-center gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink truncate">
                      {u.name}
                      {u.id === me.id && <span className="text-muted font-normal"> ({t("vous")})</span>}
                    </p>
                    <p className="text-xs text-muted truncate font-mono">{u.username}</p>
                  </div>
                  <div className="min-w-0 text-xs text-muted">
                    <p className="truncate">{u.company || u.email || "—"}</p>
                    <p className="truncate">
                      {u.last_login_at ? t("Dernière connexion {when}", { when: formatRelative(u.last_login_at) }) : t("Jamais connecté")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StateBadge kind="role" value={u.role} />
                    {!u.active && <Badge tone="neutral">{t("Désactivé")}</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    onClick={() => setEditing(u)}
                    aria-label={t("Modifier {name}", { name: u.username })}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    onClick={() => setDeleting(u)}
                    disabled={u.id === me.id}
                    aria-label={t("Supprimer {name}", { name: u.username })}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card title={t("Droits par rôle")} description={t("Les mêmes règles sont appliquées par l'API, quel que soit l'écran affiché.")} bodyClassName="p-0 mt-3">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-xs text-muted border-y border-line">
                <th className="font-medium px-4 sm:px-5 py-2.5">{t("Écran")}</th>
                {ROLE_KEYS.map((r) => (
                  <th key={r} className="font-medium px-3 py-2.5 text-center w-32">
                    {t(ROLES[r].label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NAV.map((item) => (
                <tr key={item.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 sm:px-5 py-2.5 text-ink whitespace-nowrap">{t(item.label)}</td>
                  {ROLE_KEYS.map((r) => (
                    <td key={r} className="px-3 py-2.5">
                      <span className="flex justify-center">
                        {item.roles.includes(r) ? (
                          <Check size={16} className="text-ok-ink" aria-label={t("Autorisé")} />
                        ) : (
                          <Minus size={16} className="text-line-strong" aria-label={t("Non autorisé")} />
                        )}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <AccountDialog
          account={editing === "new" ? null : editing}
          isSelf={editing !== "new" && editing.id === me.id}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            await load();
            toast(message);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={t("Supprimer ce compte ?")}
        confirmLabel={t("Supprimer")}
        busy={busy}
      >
        {t("Le compte « {username} » ({name}) ne pourra plus se connecter. Ses tickets sont conservés.", {
          username: deleting?.username || "",
          name: deleting?.name || "",
        })}
      </ConfirmDialog>
    </div>
  );
}

function AccountDialog({ account, isSelf, onClose, onSaved }) {
  const t = useT();
  const creating = !account;
  const [form, setForm] = useState({
    name: account?.name || "",
    username: account?.username || "",
    role: account?.role || "client",
    company: account?.company || "",
    email: account?.email || "",
    active: account?.active ?? true,
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const passwordOk = creating ? form.password.length >= 8 : form.password === "" || form.password.length >= 8;
  const valid = form.name.trim() && (!creating || form.username.trim().length >= 3) && passwordOk;

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (creating) {
        const { active: _active, ...payload } = form;
        await api.createUser(payload);
        await onSaved(t("Compte « {name} » créé.", { name: form.username.trim().toLowerCase() }));
      } else {
        const { username: _username, password, ...changes } = form;
        await api.updateUser(account.id, password ? { ...changes, password } : changes);
        await onSaved(t("Compte « {name} » mis à jour.", { name: account.username }));
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-lg"
      title={creating ? t("Nouveau compte") : t("Modifier {name}", { name: account.username })}
      description={creating ? t("Le compte est utilisable dès sa création.") : null}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {t("Annuler")}
          </button>
          <button type="submit" form="account-form" className="btn btn-primary" disabled={busy || !valid}>
            {busy && <Spinner size={14} />}
            {creating ? t("Créer le compte") : t("Enregistrer")}
          </button>
        </>
      }
    >
      <form id="account-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert tone="crit">{error}</Alert>}

        <div>
          <p className="text-xs font-medium text-ink-2 mb-1.5">{t("Rôle")}</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("Rôle")}>
            {ROLE_KEYS.map((r) => {
              const isActive = form.role === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  disabled={isSelf}
                  onClick={() => set({ role: r })}
                  className={`rounded-lg border px-2 py-2 text-[13px] font-medium transition-colors disabled:opacity-60 ${
                    isActive ? "border-brand bg-brand/5 ring-1 ring-brand text-ink" : "border-line text-ink-2 hover:bg-sunken"
                  }`}
                >
                  {t(ROLES[r].label)}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted mt-1.5">
            {isSelf ? t("Vous ne pouvez pas modifier votre propre rôle.") : t(ROLES[form.role].description)}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("Nom complet")}>
            {(id) => <input id={id} className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} />}
          </Field>
          <Field label={t("Identifiant")} hint={creating ? t("3 caractères minimum, sans espace.") : t("Non modifiable.")}>
            {(id) => (
              <input
                id={id}
                className="input font-mono"
                autoCapitalize="none"
                spellCheck={false}
                disabled={!creating}
                value={form.username}
                onChange={(e) => set({ username: e.target.value.replace(/\s/g, "") })}
              />
            )}
          </Field>
          <Field label={form.role === "client" ? t("Point de vente / société") : t("Service")}>
            {(id) => <input id={id} className="input" value={form.company} onChange={(e) => set({ company: e.target.value })} />}
          </Field>
          <Field label={t("E-mail (facultatif)")}>
            {(id) => (
              <input id={id} type="email" className="input" value={form.email} onChange={(e) => set({ email: e.target.value })} />
            )}
          </Field>
        </div>

        <Field
          label={creating ? t("Mot de passe") : t("Nouveau mot de passe")}
          hint={creating ? t("8 caractères minimum. Communiquez-le à l'utilisateur.") : t("Laissez vide pour ne pas le changer.")}
          error={form.password && form.password.length < 8 ? t("8 caractères minimum.") : null}
        >
          {(id) => (
            <div className="flex gap-2">
              <input
                id={id}
                className="input font-mono"
                autoComplete="new-password"
                spellCheck={false}
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
              />
              <button type="button" className="btn btn-secondary shrink-0" onClick={() => set({ password: generatePassword() })}>
                <Dices size={14} /> {t("Générer")}
              </button>
            </div>
          )}
        </Field>

        {!creating && (
          <Switch
            label={t("Compte actif")}
            description={isSelf ? t("Vous ne pouvez pas désactiver votre propre compte.") : t("Un compte désactivé ne peut plus se connecter.")}
            checked={form.active}
            disabled={isSelf}
            onChange={(v) => set({ active: v })}
          />
        )}
      </form>
    </Modal>
  );
}
