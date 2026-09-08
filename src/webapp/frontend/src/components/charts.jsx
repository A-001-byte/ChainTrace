import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  ScatterChart, Scatter, ZAxis, PieChart, Pie, AreaChart, Area, LineChart, Line, Legend,
} from "recharts";
import { CHART_COLORS as C, riskColor } from "../lib/chartColors";

const axis = { tick: { fill: C.GRANITE, fontSize: 11, fontFamily: "Geist Mono Variable, ui-monospace" }, axisLine: { stroke: C.LIFT }, tickLine: false };
const grid = { stroke: C.LIFT, vertical: false };
const cursorFill = { fill: "rgba(238,238,238,0.04)" };
const legend = { iconType: "square", iconSize: 8, wrapperStyle: { fontSize: 11, fontFamily: "Geist Mono Variable, ui-monospace", textTransform: "uppercase" } };

function Tip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip">
      {label !== undefined && <div><b>{label}</b></div>}
      {payload.map((p, i) => <div key={i} style={{ color: p.color ?? C.STONE }}>{p.name}: {fmt ? fmt(p.value, p) : p.value}</div>)}
    </div>
  );
}

/** Generic bucketed histogram over a numeric field. */
export function Histogram({ rows, field, name = "entities", buckets = 10, min, max, color, byRisk = false, height = 160 }) {
  const vals = rows.map((r) => r[field]).filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (!vals.length) return <div className="empty">no data</div>;
  const lo = min ?? Math.min(...vals), hi = max ?? Math.max(...vals), w = (hi - lo) / buckets || 0.01;
  const b = Array.from({ length: buckets }, (_, i) => ({ x: lo + i * w, label: (lo + i * w).toFixed(2), n: 0 }));
  for (const v of vals) b[Math.min(buckets - 1, Math.max(0, Math.floor((v - lo) / w)))].n += 1;
  return (
    <div className="chart"><ResponsiveContainer width="100%" height={height}>
      <BarChart data={b} margin={{ top: 4, right: 4, left: -22, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid {...grid} /><XAxis dataKey="label" {...axis} interval={Math.max(0, Math.floor(buckets / 5) - 1)} /><YAxis {...axis} allowDecimals={false} />
        <Tooltip content={<Tip />} cursor={cursorFill} />
        <Bar dataKey="n" name={name} radius={[2, 2, 0, 0]}>{b.map((d, i) => <Cell key={i} fill={byRisk ? riskColor(d.x) : (color ?? C.STONE)} />)}</Bar>
      </BarChart>
    </ResponsiveContainer></div>
  );
}

/** Counts of a categorical field, as bars. */
export function CountBars({ rows, field, name = "entities", color = C.STONE, colorBy, limit = 12, height = 160, layout = "horizontal", map }) {
  const m = new Map();
  for (const r of rows) { let k = map ? map(r) : r[field]; if (k === null || k === undefined || k === "") continue; k = String(k); m.set(k, (m.get(k) ?? 0) + 1); }
  const d = [...m.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n).slice(0, limit);
  if (!d.length) return <div className="empty">no data</div>;
  const vertical = layout === "vertical";
  return (
    <div className="chart"><ResponsiveContainer width="100%" height={height}>
      <BarChart data={d} layout={vertical ? "vertical" : "horizontal"} margin={{ top: 4, right: 8, left: vertical ? 0 : -22, bottom: 0 }} barCategoryGap={vertical ? 4 : 6}>
        <CartesianGrid stroke={C.LIFT} horizontal={!vertical} vertical={vertical} />
        {vertical ? <><XAxis type="number" {...axis} allowDecimals={false} /><YAxis type="category" dataKey="k" width={64} {...axis} /></>
                  : <><XAxis dataKey="k" {...axis} /><YAxis {...axis} allowDecimals={false} /></>}
        <Tooltip content={<Tip />} cursor={cursorFill} />
        <Bar dataKey="n" name={name} radius={vertical ? [0, 2, 2, 0] : [2, 2, 0, 0]}>{d.map((e, i) => <Cell key={i} fill={colorBy ? colorBy(e.k) : color} />)}</Bar>
      </BarChart>
    </ResponsiveContainer></div>
  );
}

/** Two numeric fields as a scatter; point colour by risk, size optionally by a third. */
export function XYScatter({ rows, x, y, z, xName, yName, xDomain, yDomain, onPick, height = 160 }) {
  const d = rows.filter((r) => typeof r[x] === "number" && typeof r[y] === "number").map((r) => ({ x: r[x], y: r[y], z: z ? (r[z] ?? 0) * 100 : 60, id: r.node_id, risk: r.risk_score }));
  if (!d.length) return <div className="empty">no data</div>;
  return (
    <div className="chart"><ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid stroke={C.LIFT} />
        <XAxis type="number" dataKey="x" name={xName} domain={xDomain ?? ["auto", "auto"]} {...axis} />
        <YAxis type="number" dataKey="y" name={yName} domain={yDomain ?? ["auto", "auto"]} {...axis} />
        <ZAxis type="number" dataKey="z" range={[18, 120]} />
        <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="tip"><b>{payload[0].payload.id}</b><div>{xName} {Number(payload[0].payload.x).toFixed(3)} · {yName} {Number(payload[0].payload.y).toFixed(3)}</div>{typeof payload[0].payload.risk === "number" && <div>risk {payload[0].payload.risk.toFixed(3)}</div>}</div> : null} cursor={{ stroke: C.STROKE }} />
        <Scatter data={d} onClick={(p) => onPick?.(p.id)} style={{ cursor: onPick ? "pointer" : "default" }}>{d.map((p, i) => <Cell key={i} fill={riskColor(p.risk)} fillOpacity={0.9} />)}</Scatter>
      </ScatterChart>
    </ResponsiveContainer></div>
  );
}

/** Donut over a categorical field — neutral ramp, never risk colours. */
export function Donut({ rows, field, colors = C.NEUTRALS, height = 180, legendOn = true }) {
  const m = new Map();
  for (const r of rows) if (r[field]) m.set(r[field], (m.get(r[field]) ?? 0) + 1);
  const d = [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  if (!d.length) return <div className="empty">no data</div>;
  return (
    <div className="chart"><ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={d} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="86%" paddingAngle={2} stroke={C.LIFT} strokeWidth={1}>{d.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie>
        <Tooltip content={<Tip />} />
        {legendOn && <Legend {...legend} />}
      </PieChart>
    </ResponsiveContainer></div>
  );
}

/** Horizontal bars from pre-aggregated rows [{k, n}]. */
export function HBars({ data, name = "value", color = C.STONE, colorBy, height = 160, fmt }) {
  if (!data?.length) return <div className="empty">no data</div>;
  return (
    <div className="chart"><ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap={4}>
        <CartesianGrid stroke={C.LIFT} horizontal={false} />
        <XAxis type="number" {...axis} /><YAxis type="category" dataKey="k" width={110} {...axis} />
        <Tooltip content={<Tip fmt={fmt} />} cursor={cursorFill} />
        <Bar dataKey="n" name={name} radius={[0, 2, 2, 0]}>{data.map((e, i) => <Cell key={i} fill={colorBy ? colorBy(e) : color} />)}</Bar>
      </BarChart>
    </ResponsiveContainer></div>
  );
}

/** Area over thresholds for a [0,1] series. */
export function ThresholdArea({ data, xKey = "threshold", yKey, name, color = C.ORANGE, height = 180 }) {
  return (
    <div className="chart"><ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <defs><linearGradient id={`g-${yKey}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.25} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid {...grid} /><XAxis dataKey={xKey} {...axis} tickFormatter={(v) => v.toFixed(2)} /><YAxis domain={[0, 1]} {...axis} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
        <Tooltip content={<Tip fmt={(v) => `${(v * 100).toFixed(1)}%`} />} />
        <Area type="monotone" dataKey={yKey} name={name} stroke={color} strokeWidth={1.5} fill={`url(#g-${yKey})`} dot={{ r: 3, fill: color, stroke: color }} />
      </AreaChart>
    </ResponsiveContainer></div>
  );
}

/** Lines over thresholds. */
export function ThresholdLines({ data, xKey = "threshold", series, height = 180 }) {
  return (
    <div className="chart"><ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid {...grid} /><XAxis dataKey={xKey} {...axis} tickFormatter={(v) => v.toFixed(2)} /><YAxis domain={[0, "auto"]} {...axis} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
        <Tooltip content={<Tip fmt={(v) => `${(v * 100).toFixed(1)}%`} />} /><Legend {...legend} iconType="plainline" />
        {series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={1.5} dot={{ r: 3, fill: s.color, stroke: s.color }} />)}
      </LineChart>
    </ResponsiveContainer></div>
  );
}

/** Tiny 1px sparkline (no axes) from a numeric array. */
export function Spark({ values, color = C.GREEN, height = 40 }) {
  const d = (values ?? []).map((v, i) => ({ i, v }));
  if (d.length < 2) return null;
  return (
    <div className="chart"><ResponsiveContainer width="100%" height={height}>
      <LineChart data={d} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}><Line type="monotone" dataKey="v" stroke={color} strokeWidth={1} dot={false} isAnimationActive={false} /></LineChart>
    </ResponsiveContainer></div>
  );
}

