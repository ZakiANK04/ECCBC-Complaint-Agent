import { useState } from "react";
import { Loader2, PlayCircle, Download, FileSearch } from "lucide-react";
import { api } from "../api";
import PatternCard from "./PatternCard";

export default function RootCauseAnalysis() {
  const [minCount, setMinCount] = useState(2);
  const [topN, setTopN] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.runRootCause(minCount, topN);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div className="bg-white rounded-2xl card-shadow p-6">
        <div className="flex items-center gap-2 mb-1">
          <FileSearch className="text-brand-red" size={20} />
          <h2 className="text-lg font-bold text-slate-800">Find recurring patterns behind bad complaints</h2>
        </div>
        <p className="text-slate-500 text-sm mb-5">
          Groups every ticket Agent 1 has logged by problem type and department, then asks the
          model to explain the likely root cause behind each recurring group — grounded in the
          actual complaint text, not guessed.
        </p>

        <div className="flex flex-wrap items-end gap-4">
          <Field label="Minimum complaints per pattern">
            <input
              type="number"
              min={2}
              max={20}
              value={minCount}
              onChange={(e) => setMinCount(Number(e.target.value))}
              className="w-24 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/30"
            />
          </Field>
          <Field label="Max patterns to report">
            <input
              type="number"
              min={1}
              max={10}
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              className="w-24 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/30"
            />
          </Field>
          <button
            onClick={handleRun}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-brand-red hover:bg-brand-red-dark disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <PlayCircle size={18} />}
            {loading ? "Analyzing..." : "Run analysis"}
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>

      {result && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl card-shadow p-6">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="font-bold text-slate-800">Executive summary</h3>
              <a
                href={api.rootCausePdfUrl(result.pdf_filename)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-red hover:text-brand-red-dark shrink-0"
              >
                <Download size={16} /> Download PDF report
              </a>
            </div>
            <p className="text-sm text-slate-700">{result.report.overall_summary}</p>
          </div>

          {result.report.findings.length === 0 ? (
            <p className="text-sm text-slate-400">No pattern met the minimum-count threshold yet.</p>
          ) : (
            result.report.findings.map((f, i) => <PatternCard key={i} finding={f} index={i + 1} />)
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}
