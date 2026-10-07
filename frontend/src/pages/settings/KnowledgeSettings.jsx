import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Database, FileSpreadsheet, FileText, RefreshCw, Trash2, Upload } from "lucide-react";
import { api } from "../../api";
import { useT } from "../../lib/i18n";
import { formatBytes } from "../../lib/format";
import { Alert, Badge, Card, ConfirmDialog, EmptyState, Spinner, useToast } from "../../components/ui";

const ACCEPTED = [".pdf", ".docx", ".txt", ".md", ".csv"];
const extension = (name) => name.slice(name.lastIndexOf(".")).toLowerCase();

export default function KnowledgeSettings() {
  const t = useT();
  const toast = useToast();
  const inputRef = useRef(null);
  const [kb, setKb] = useState(null);
  const [error, setError] = useState(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState([]); // [{ name, state: "pending" | "done" | "error", message }]
  const [deleting, setDeleting] = useState(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const load = useCallback(() => {
    api.getKnowledgeBase().then(setKb, (err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const uploading = uploads.some((u) => u.state === "pending");

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || uploading) return;
    setUploads(files.map((f) => ({ name: f.name, state: "pending" })));
    const mark = (name, patch) => setUploads((list) => list.map((u) => (u.name === name ? { ...u, ...patch } : u)));

    // One at a time: each upload re-indexes the whole base on the server.
    for (const file of files) {
      if (!ACCEPTED.includes(extension(file.name))) {
        mark(file.name, { state: "error", message: t("Format non pris en charge.") });
      } else if (kb && file.size > kb.max_upload_bytes) {
        mark(file.name, {
          state: "error",
          message: t("Fichier trop volumineux (maximum {max}).", { max: formatBytes(kb.max_upload_bytes) }),
        });
      } else {
        try {
          const res = await api.uploadKnowledgeFile(file);
          setKb(res);
          mark(file.name, { state: "done", message: res.replaced ? t("Remplacé") : t("Ajouté") });
        } catch (err) {
          mark(file.name, { state: "error", message: err.message });
        }
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleRebuild() {
    setRebuilding(true);
    try {
      const res = await api.rebuildKnowledgeBase();
      setKb((k) => (k ? { ...k, chunks_indexed: res.chunks_indexed } : k));
      toast(t("Index reconstruit : {n} fragments indexés.", { n: res.chunks_indexed }));
    } catch (err) {
      toast(err.message, "crit");
    } finally {
      setRebuilding(false);
    }
  }

  async function confirmDelete() {
    setBusyDelete(true);
    try {
      setKb(await api.deleteKnowledgeFile(deleting));
      toast(t("« {name} » supprimé de la base.", { name: deleting }));
      setDeleting(null);
    } catch (err) {
      toast(err.message, "crit");
    } finally {
      setBusyDelete(false);
    }
  }

  if (error) return <Alert tone="crit" title={t("Base de connaissances indisponible")}>{error}</Alert>;
  if (!kb) return <div className="skeleton h-64" />;

  return (
    <div className="space-y-4">
      <Card
        title={t("Ajouter des documents")}
        description={t("Les documents ajoutés sont indexés immédiatement et utilisés par l'assistant pour répondre.")}
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`rounded-xl border border-dashed px-4 py-8 flex flex-col items-center text-center transition-colors ${
            dragging ? "border-focus bg-info/8" : "border-line-strong bg-sunken/40"
          }`}
        >
          <span className="w-10 h-10 rounded-xl bg-surface border border-line flex items-center justify-center text-ink-2">
            <Upload size={18} />
          </span>
          <p className="mt-3 text-[13px] font-medium text-ink">{t("Glissez vos fichiers ici")}</p>
          <p className="mt-1 text-xs text-muted">
            {t("PDF, Word (.docx), TXT, Markdown ou CSV · {max} maximum par fichier", {
              max: formatBytes(kb.max_upload_bytes),
            })}
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED.join(",")}
            className="sr-only"
            id="kb-upload"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <label htmlFor="kb-upload" className={`btn btn-secondary mt-4 ${uploading ? "pointer-events-none opacity-50" : ""}`}>
            {uploading ? <Spinner size={14} /> : <Upload size={14} />}
            {uploading ? t("Envoi et indexation…") : t("Choisir des fichiers")}
          </label>
        </div>

        {uploads.length > 0 && (
          <ul className="mt-3 space-y-1.5" aria-live="polite">
            {uploads.map((u) => (
              <li key={u.name} className="flex items-center gap-2.5 text-[13px]">
                {u.state === "pending" && <Spinner size={14} className="text-muted shrink-0" />}
                {u.state === "done" && <CircleCheck size={15} className="text-ok-ink shrink-0" />}
                {u.state === "error" && <CircleAlert size={15} className="text-crit-ink shrink-0" />}
                <span className="truncate text-ink">{u.name}</span>
                <span className={`ml-auto shrink-0 text-xs text-right ${u.state === "error" ? "text-crit-ink" : "text-muted"}`}>
                  {u.message || t("En cours…")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title={t("Documents de référence")}
        description={t("Sources lues par l'assistant pour rédiger ses réponses.")}
        actions={
          <button type="button" className="btn btn-secondary" onClick={handleRebuild} disabled={rebuilding || uploading}>
            {rebuilding ? <Spinner size={14} /> : <RefreshCw size={14} />}
            {rebuilding ? t("Indexation…") : t("Reconstruire l'index")}
          </button>
        }
        bodyClassName="p-0"
      >
        <div className="px-4 sm:px-5 py-4 flex flex-wrap items-baseline gap-x-2">
          <span className="text-[26px] leading-none font-semibold text-ink">{kb.chunks_indexed}</span>
          <span className="text-[13px] text-muted">
            {t(kb.chunks_indexed > 1 ? "fragments indexés" : "fragment indexé")}
            {kb.chunks_indexed === 0 && kb.files.length > 0 && ` — ${t("reconstruisez l'index pour activer la recherche documentaire")}`}
          </span>
        </div>
        {kb.files.length === 0 ? (
          <EmptyState icon={Database} title={t("Aucun document")}>
            {t("Ajoutez un premier document ci-dessus.")}
          </EmptyState>
        ) : (
          <ul className="border-t border-line divide-y divide-line">
            {kb.files.map((file) => {
              const Icon = file.type === "csv" ? FileSpreadsheet : FileText;
              return (
                <li key={file.name} className="flex items-center gap-3 px-4 sm:px-5 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-sunken border border-line flex items-center justify-center text-ink-2 shrink-0">
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] text-ink truncate" title={file.name}>
                    {file.name}
                  </span>
                  <Badge tone="neutral" dot={false} className="uppercase hidden sm:inline-flex">
                    {file.type}
                  </Badge>
                  <span className="text-xs text-muted tnum w-16 text-right shrink-0">{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon shrink-0"
                    onClick={() => setDeleting(file.name)}
                    disabled={!file.deletable || uploading}
                    title={file.deletable ? undefined : t("Document inclus dans le déploiement, non supprimable ici")}
                    aria-label={t("Supprimer {name}", { name: file.name })}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={t("Supprimer ce document ?")}
        confirmLabel={t("Supprimer")}
        busy={busyDelete}
      >
        {t("« {name} » sera supprimé du serveur et l'assistant ne s'en servira plus.", { name: deleting || "" })}
      </ConfirmDialog>
    </div>
  );
}
