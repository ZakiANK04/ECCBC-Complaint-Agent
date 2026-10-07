import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toneDot } from "./ui";
import { formatPercent } from "../lib/format";
// (chart labels arrive already translated from the screens that use them)

/** Headline number with an optional comparison line. */
export function StatTile({ label, value, hint, tone }) {
  return (
    <div className="card px-4 py-3.5">
      <p className="text-xs text-muted flex items-center gap-1.5">
        {tone && <span className={`w-1.5 h-1.5 rounded-full ${toneDot(tone)}`} />}
        {label}
      </p>
      <p className="mt-1.5 text-[26px] leading-none font-semibold text-ink">{value}</p>
      <p className="mt-2 text-xs text-muted min-h-4">{hint}</p>
    </div>
  );
}

function TrendTooltip({ active, payload, formatCount }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-raised border border-line-strong rounded-lg shadow-pop px-3 py-2 text-xs">
      <p className="text-muted">{point.label}</p>
      <p className="mt-0.5 text-ink font-semibold tnum">{formatCount(point.count)}</p>
    </div>
  );
}

/** Single-series volume over time. `data`: [{ key, tick, label, count }]. */
export function TrendChart({ data, formatCount = String, height = 220 }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--c-series)", stopOpacity: 0.16 }} />
              <stop offset="100%" style={{ stopColor: "var(--c-series)", stopOpacity: 0.02 }} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--c-grid)" />
          <XAxis
            dataKey="tick"
            tickLine={false}
            axisLine={{ stroke: "var(--c-axis)" }}
            tick={{ fontSize: 11, fill: "var(--c-muted)" }}
            tickMargin={8}
            minTickGap={28}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            domain={[0, max < 4 ? 4 : "auto"]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--c-muted)" }}
            width={44}
          />
          <Tooltip
            content={<TrendTooltip formatCount={formatCount} />}
            cursor={{ stroke: "var(--c-axis)", strokeWidth: 1 }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--c-series)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="url(#trend-fill)"
            dot={data.length <= 31 ? { r: 2.5, fill: "var(--c-series)", stroke: "var(--c-surface)", strokeWidth: 1.5 } : false}
            activeDot={{ r: 4.5, fill: "var(--c-series)", stroke: "var(--c-surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Ranked horizontal bars with the value at the tip. Rows are buttons when
 * `onSelect` is given, so a bar doubles as a filter.
 */
export function BarList({ items, selected, onSelect }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((sum, i) => sum + i.value, 0);
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const isSelected = selected === item.key;
        const dimmed = selected && !isSelected;
        const Row = onSelect ? "button" : "div";
        return (
          <li key={item.key}>
            <Row
              {...(onSelect
                ? { type: "button", onClick: () => onSelect(isSelected ? null : item.key), "aria-pressed": isSelected }
                : {})}
              title={`${item.label} : ${item.value} (${formatPercent(total ? item.value / total : 0)})`}
              className={`w-full text-left rounded-lg px-2 py-1.5 -mx-2 transition-colors ${
                onSelect ? "hover:bg-sunken" : ""
              } ${isSelected ? "bg-sunken" : ""}`}
            >
              <span className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className={`truncate ${dimmed ? "text-muted" : "text-ink-2"}`}>{item.label}</span>
                <span className={`tnum font-medium shrink-0 ${dimmed ? "text-muted" : "text-ink"}`}>{item.value}</span>
              </span>
              <span className="mt-1.5 block h-1.5 rounded-full bg-sunken overflow-hidden">
                <span
                  className={`block h-full rounded-full bg-series transition-[width,opacity] duration-300 ${
                    dimmed ? "opacity-35" : ""
                  }`}
                  style={{ width: `${(item.value / max) * 100}%` }}
                />
              </span>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Part-to-whole strip for a small set of states, with a labelled legend so
 * the meaning never rests on color alone. `segments`: [{ key, label, tone, value }].
 */
export function Distribution({ title, segments }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  return (
    <div>
      <p className="text-xs font-medium text-ink-2">{title}</p>
      <div className="mt-2 flex gap-0.5 h-2" role="img" aria-label={`${title} : ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
        {total === 0 ? (
          <span className="flex-1 rounded-full bg-sunken" />
        ) : (
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <span
                key={s.key}
                className={`rounded-sm first:rounded-l-full last:rounded-r-full ${toneDot(s.tone)}`}
                style={{ flexGrow: s.value, flexBasis: 0, minWidth: 4 }}
                title={`${s.label} : ${s.value}`}
              />
            ))
        )}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-xs text-ink-2">
            <span className={`w-2 h-2 rounded-sm ${toneDot(s.tone)}`} />
            {s.label}
            <span className="tnum font-medium text-ink">{s.value}</span>
            <span className="tnum text-muted">{formatPercent(total ? s.value / total : 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
