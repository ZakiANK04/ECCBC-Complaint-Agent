import { useState, useEffect } from "react";
import {
  Sliders,
  Mail,
  Cpu,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Database,
  Send,
  Loader2,
  ShieldCheck,
  HelpCircle,
  Sparkles
} from "lucide-react";
import { api } from "../api";

export default function AdminSettings() {
  // Agent Config State
  const [config, setConfig] = useState({
    classification_mode: "hybrid",
    lr_weight: 0.5,
    lr_confidence_threshold: 0.6,
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccess, setConfigSuccess] = useState(null);

  // Retrain State
  const [retraining, setRetraining] = useState(false);
  const [retrainResult, setRetrainResult] = useState(null);

  // Departments State
  const [departments, setDepartments] = useState({});
  const [newEmails, setNewEmails] = useState({});
  const [savingDepts, setSavingDepts] = useState(false);
  const [deptSuccess, setDeptSuccess] = useState(null);

  // Email Config & Test State
  const [emailConfig, setEmailConfig] = useState(null);
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState(null);

  // KB Rebuild State
  const [rebuildingKb, setRebuildingKb] = useState(false);
  const [kbResult, setKbResult] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const [cfg, depts, mailCfg] = await Promise.all([
        api.getAgentConfig(),
        api.getDepartments(),
        api.getEmailConfig(),
      ]);
      setConfig(cfg);
      setDepartments(depts);
      setEmailConfig(mailCfg);
    } catch (err) {
      console.error("Error loading settings:", err);
    }
  }

  // --- Agent Config Handlers ---
  async function handleSaveConfig(e) {
    e.preventDefault();
    setSavingConfig(true);
    setConfigSuccess(null);
    try {
      const res = await api.updateAgentConfig(config);
      setConfig(res.config);
      setConfigSuccess("Configuration IA mise à jour avec succès !");
      setTimeout(() => setConfigSuccess(null), 3500);
    } catch (err) {
      alert("Erreur de sauvegarde: " + err.message);
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleRetrain() {
    setRetraining(true);
    setRetrainResult(null);
    try {
      const res = await api.retrainAgent();
      setRetrainResult(res.stats);
      setTimeout(() => setRetrainResult(null), 5000);
    } catch (err) {
      alert("Erreur d'entraînement: " + err.message);
    } finally {
      setRetraining(false);
    }
  }

  // --- Department Email Handlers ---
  async function handleAddEmail(deptKey) {
    const emailToAdd = (newEmails[deptKey] || "").trim();
    if (!emailToAdd) return;
    try {
      await api.addDepartmentEmail(deptKey, emailToAdd);
      setNewEmails((prev) => ({ ...prev, [deptKey]: "" }));
      const updated = await api.getDepartments();
      setDepartments(updated);
      setDeptSuccess(`Email ajouté à ${deptKey} !`);
      setTimeout(() => setDeptSuccess(null), 3000);
    } catch (err) {
      alert("Erreur: " + err.message);
    }
  }

  async function handleRemoveEmail(deptKey, emailToRemove) {
    if (!confirm(`Supprimer ${emailToRemove} de ${deptKey} ?`)) return;
    try {
      await api.removeDepartmentEmail(deptKey, emailToRemove);
      const updated = await api.getDepartments();
      setDepartments(updated);
      setDeptSuccess(`Email supprimé de ${deptKey}.`);
      setTimeout(() => setDeptSuccess(null), 3000);
    } catch (err) {
      alert("Erreur: " + err.message);
    }
  }

  // --- SMTP Test Handler ---
  async function handleTestEmail(e) {
    e.preventDefault();
    if (!testEmailAddress.trim()) return;
    setTestingEmail(true);
    setTestEmailResult(null);
    try {
      const res = await api.testEmail(testEmailAddress.trim());
      setTestEmailResult({ success: true, message: res.message });
    } catch (err) {
      setTestEmailResult({ success: false, message: err.message });
    } finally {
      setTestingEmail(false);
    }
  }

  // --- Knowledge Base Handler ---
  async function handleRebuildKb() {
    setRebuildingKb(true);
    setKbResult(null);
    try {
      const res = await api.rebuildKnowledgeBase();
      setKbResult(`Base vectorielle reconstruite: ${res.chunks_indexed} fragments indexés (incluant avis .CSV, PDF et Word) !`);
    } catch (err) {
      alert("Erreur d'indexation: " + err.message);
    } finally {
      setRebuildingKb(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-fade-in">
      {/* Page Header */}
      <div className="bg-white rounded-2xl card-shadow p-6 border-l-4 border-brand-red flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Sliders className="text-brand-red" size={22} />
            Paramètres Agent IA & Routage Départemental
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Gérez la classification hybride (Machine Learning + LLM), les adresses de notification par département et l'envoi automatisé des rapports PDF.
          </p>
        </div>
        <button
          onClick={loadAll}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors self-start sm:self-center"
        >
          <RefreshCw size={14} /> Rafraîchir
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* SECTION 1: Hybrid Classification & Agent Parameters */}
        <div className="bg-white rounded-2xl card-shadow p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Cpu className="text-brand-red" size={18} />
              Moteur de Classification Hybride
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Arbitrage configurable entre Régression Logistique (TF-IDF local) et le LLM Gemini 3 Flash.
            </p>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-5">
            {/* Mode selection */}
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase block mb-2">
                Mode de Classification
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "hybrid", label: "Hybride", sub: "ML + LLM" },
                  { id: "llm_only", label: "LLM Seul", sub: "Gemini 3 Flash" },
                  { id: "lr_only", label: "ML Seul", sub: "Logistic Reg." },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setConfig({ ...config, classification_mode: m.id })}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      config.classification_mode === m.id
                        ? "border-brand-red bg-red-50/60 text-brand-red ring-2 ring-brand-red/20 font-bold"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700 font-medium"
                    }`}
                  >
                    <span className="block text-sm leading-tight">{m.label}</span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">{m.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Logistic Regression Weight Slider */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-600">
                  Poids Régression Logistique (vs LLM)
                </label>
                <span className="text-xs font-mono font-bold text-brand-red bg-red-50 px-2 py-0.5 rounded">
                  {Math.round((config.lr_weight || 0.5) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={config.lr_weight || 0.5}
                onChange={(e) => setConfig({ ...config, lr_weight: parseFloat(e.target.value) })}
                className="w-full accent-brand-red cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>0% (Priorité LLM)</span>
                <span>50% (Arbitrage Équilibré)</span>
                <span>100% (Priorité LR)</span>
              </div>
            </div>

            {/* Confidence Threshold Slider */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-600">
                  Seuil de Confiance LR (Confidence Threshold)
                </label>
                <span className="text-xs font-mono font-bold text-brand-red bg-red-50 px-2 py-0.5 rounded">
                  {Math.round((config.lr_confidence_threshold || 0.6) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.4"
                max="0.95"
                step="0.05"
                value={config.lr_confidence_threshold || 0.6}
                onChange={(e) =>
                  setConfig({ ...config, lr_confidence_threshold: parseFloat(e.target.value) })
                }
                className="w-full accent-brand-red cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Si la probabilité calculée par la régression logistique dépasse ce seuil, elle valide ou arbitre le département contre le LLM.
              </p>
            </div>

            {configSuccess && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-xl border border-emerald-200">
                <CheckCircle2 size={16} />
                {configSuccess}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={savingConfig}
                className="flex-1 bg-brand-red hover:bg-brand-red-dark text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors shadow-sm disabled:opacity-50"
              >
                {savingConfig ? "Enregistrement..." : "Sauvegarder les Paramètres"}
              </button>

              <button
                type="button"
                onClick={handleRetrain}
                disabled={retraining}
                title="Entraîne le modèle sur l'ensemble des tickets récents + données seed"
                className="bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {retraining ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {retraining ? "Entraînement..." : "Ré-entraîner ML"}
              </button>
            </div>

            {retrainResult && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 text-slate-700">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  Modèle TF-IDF + Logistic Regression ré-entraîné !
                </div>
                <p>Échantillons analysés: <b>{retrainResult.sample_count}</b> réclamations (Français, Darija, Anglais).</p>
                <p>Classes reconnues: {retrainResult.department_classes?.join(", ")}</p>
              </div>
            )}
          </form>
        </div>

        {/* SECTION 2: Automated Email Dispatcher (SMTP) */}
        <div className="bg-white rounded-2xl card-shadow p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Mail className="text-brand-red" size={18} />
              Envoi Automatisé des Billets & Rapports PDF
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              À chaque réclamation, le système génère le PDF officiel et l'envoie automatiquement aux responsables du département.
            </p>
          </div>

          {/* Current Status Box */}
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 uppercase">Statut SMTP</span>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  emailConfig?.enabled
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {emailConfig?.enabled ? "Activé (Prêt à l'envoi)" : "Désactivé (Simulation en local)"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div>
                <span className="text-slate-400 block text-[10px]">Serveur Hôte:</span>
                <span className="font-mono">{emailConfig?.host || "smtp.gmail.com"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Port:</span>
                <span className="font-mono">{emailConfig?.port || "587 (TLS)"}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block text-[10px]">Expéditeur:</span>
                <span className="font-mono truncate block">{emailConfig?.from_email || "Non configuré"}</span>
              </div>
            </div>
          </div>

          {/* Test Email Form */}
          <form onSubmit={handleTestEmail} className="space-y-3">
            <label className="text-xs font-semibold text-slate-600 block">
              Tester l'envoi réel vers votre adresse e-mail
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="votre.email@domaine.com"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                disabled={testingEmail}
                className="flex-1 border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/30"
              />
              <button
                type="submit"
                disabled={testingEmail || !testEmailAddress.trim()}
                className="bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors shrink-0"
              >
                {testingEmail ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {testingEmail ? "Envoi..." : "Tester"}
              </button>
            </div>

            {testEmailResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  testEmailResult.success
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {testEmailResult.success ? (
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-600 mt-0.5" />
                ) : (
                  <AlertCircle size={16} className="shrink-0 text-red-600 mt-0.5" />
                )}
                <span>{testEmailResult.message}</span>
              </div>
            )}
          </form>

          {/* Setup Guide Accordion / Note */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-900 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <HelpCircle size={14} className="text-amber-700" />
              Comment configurer les e-mails réels (Gmail / SMTP) :
            </p>
            <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-amber-800 pl-1">
              <li>Ouvrez le fichier <code>backend/.env</code>.</li>
              <li>Mettez <code>SMTP_ENABLED=true</code>.</li>
              <li>Pour Gmail: Activez la validation en 2 étapes, créez un <b>Mot de passe d'application</b> (16 caractères) et collez-le dans <code>SMTP_PASSWORD</code>.</li>
              <li>Renseignez <code>SMTP_USER=votre.email@gmail.com</code>.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* SECTION 3: Department Routing & Email Management */}
      <div className="bg-white rounded-2xl card-shadow p-6 space-y-6">
        <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="text-brand-red" size={20} />
              Adresses E-mails de Notification par Département
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Ajoutez ou supprimez les collaborateurs qui recevront automatiquement le billet de réclamation et le rapport PDF selon le département ciblé.
            </p>
          </div>

          {deptSuccess && (
            <span className="text-xs text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full font-semibold border border-emerald-200">
              {deptSuccess}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(departments).map(([key, data]) => {
            const emails = data.emails && data.emails.length > 0
              ? data.emails
              : (data.contact_email ? [data.contact_email] : []);

            return (
              <div
                key={key}
                className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-bold text-slate-800 text-sm">{data.label || key}</span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-slate-200 text-slate-700 rounded font-semibold">
                      {key}
                    </span>
                  </div>

                  {/* List of active emails */}
                  <div className="space-y-1.5 my-3 min-h-[60px]">
                    {emails.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Aucune adresse configurée</p>
                    ) : (
                      emails.map((em) => (
                        <div
                          key={em}
                          className="flex items-center justify-between gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-700"
                        >
                          <span className="truncate" title={em}>
                            {em}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveEmail(key, em)}
                            title="Supprimer cet email"
                            className="text-slate-400 hover:text-red-600 transition-colors p-0.5"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Add email input */}
                <div className="pt-2 border-t border-slate-200/60 flex gap-1.5">
                  <input
                    type="email"
                    placeholder="nouvel.email@..."
                    value={newEmails[key] || ""}
                    onChange={(e) =>
                      setNewEmails({ ...newEmails, [key]: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddEmail(key);
                      }
                    }}
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-red"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddEmail(key)}
                    className="bg-brand-red hover:bg-brand-red-dark text-white p-1.5 rounded-lg text-xs transition-colors shrink-0"
                    title="Ajouter"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 4: Knowledge Base (RAG & CSV Reviews) */}
      <div className="bg-white rounded-2xl card-shadow p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-red-50 text-brand-red flex items-center justify-center shrink-0">
            <Database size={24} />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-sm">
              Base Documentaire & Avis Clients (.CSV, PDF, Word, TXT)
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Lit désormais les fichiers CSV (comme <code>coca_cola_full_reviews.csv</code>), ainsi que les manuels de marque et rapports ESG.
            </p>
          </div>
        </div>

        <button
          onClick={handleRebuildKb}
          disabled={rebuildingKb}
          className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 shrink-0"
        >
          {rebuildingKb ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {rebuildingKb ? "Indexation ChromaDB..." : "Reconstruire l'index RAG"}
        </button>
      </div>

      {kbResult && (
        <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-medium rounded-xl border border-emerald-200 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-600" />
          {kbResult}
        </div>
      )}
    </div>
  );
}
