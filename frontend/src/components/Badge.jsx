const COLOR_MAP = {
  // urgency
  low: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
  // sentiment
  positive: "bg-emerald-100 text-emerald-700",
  neutral: "bg-slate-100 text-slate-700",
  negative: "bg-red-100 text-red-700",
  // status
  open: "bg-amber-100 text-amber-700",
  in_progress: "bg-sky-100 text-sky-700",
  resolved: "bg-emerald-100 text-emerald-700",
};

export default function Badge({ value }) {
  const classes = COLOR_MAP[value] || "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${classes}`}>
      {value?.replace("_", " ")}
    </span>
  );
}
