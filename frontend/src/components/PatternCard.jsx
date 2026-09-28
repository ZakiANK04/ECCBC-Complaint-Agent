import { AlertTriangle } from "lucide-react";

export default function PatternCard({ finding, index }) {
  return (
    <div className="bg-white rounded-2xl card-shadow p-5">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-8 h-8 rounded-full bg-brand-red/10 text-brand-red flex items-center justify-center font-bold">
          {index}
        </div>
        <div className="min-w-0">
          <h4 className="font-bold text-slate-800">{finding.cluster_label}</h4>
          <p className="text-xs text-slate-400 mb-3">{finding.ticket_count} complaints in this pattern</p>

          <p className="text-sm text-slate-700 mb-3">
            <span className="font-semibold text-brand-red">Likely root cause: </span>
            {finding.likely_root_cause}
          </p>

          <ul className="space-y-1 mb-3">
            {finding.supporting_evidence.map((ev, i) => (
              <li key={i} className="text-xs text-slate-500 flex gap-2">
                <span className="text-brand-red">•</span> {ev}
              </li>
            ))}
          </ul>

          <div className="flex items-start gap-2 bg-amber-50 text-amber-800 rounded-xl p-3 text-sm">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold">Recommended action: </span>
              {finding.recommended_action}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
