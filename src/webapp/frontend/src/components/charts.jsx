import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  ScatterChart, Scatter, ZAxis, PieChart, Pie, AreaChart, Area, LineChart, Line, Legend,
} from "recharts";
import { clusterColor } from "../lib/clusterColors";
import { CHART_COLORS } from "../lib/chartColors";

const { CYAN, BLUE, AMBER, RED, GREEN, VIOLET, TEAL, MUTE } = CHART_COLORS;
const GLOW = (c) => ({ filter: `drop-shadow(0 0 5px ${c}) drop-shadow(0 0 12px ${c}55)` });
const axis = { tick: { fill: MUTE, fontSize: 10, fontFamily: "Fira Code, monospace" }, axisLine: { stroke: "rgba(0,229,255,0.2)" }, tickLine: false };
const grid = { stroke: "rgba(0,229,255,0.08)", strokeDasharray: "2 4" };

function Tip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip">
      {label !== undefined && <div><b>{label}</b></div>}
      {payload.map((p, i) => <div key={i} style={{ color: p.color ?? "#e2f0fb" }}>{p.name}: {fmt ? fmt(p.value, p) : p.value}</div>)}
    </div>
  );
}

const riskColor = (r) => (r >= 0.6 ? RED : r >= 0.4 ? AMBER : GREEN);

/** Histogram of risk_score over the alert set (10 buckets across the observed range). */
export function RiskHistogram({ rows, height = 170 }) {
  const rs = rows.map((r) => r.risk_score).filter((v) => typeof v === "number");
  if (!rs.length) return <div className="empty">no scores</div>;
  const lo = Math.min(...rs), hi = Math.max(...rs), n = 10, w = (hi - lo) / n || 0.01;
  const b = Array.from({ length: n }, (_, i) => ({ x: (lo + i * w), label: (lo + i * w).toFixed(3), n: 0 }));
  for (const v of rs) b[Math.min(n - 1, Math.floor((v - lo) / w))].n += 1;
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={b} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid {...grid} vertical={false} />
          <XAxis dataKey="label" {...axis} interval={2} />
          <YAxis {...axis} allowDecimals={false} />
          <Tooltip content={<Tip />} cursor={{ fill: "rgba(0,229,255,0.06)" }} />
          <Bar dataKey="n" name="entities" style={GLOW(CYAN)} radius={[1, 1, 0, 0]}>
            {b.map((d, i) => <Cell key={i} fill={riskColor(d.x)} fillOpacity={0.85} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** classifier_confidence × anomaly_score, point colour = risk tier, size = risk. */
export function ConfAnomScatter({ rows, onPick, height = 170 }) {
  const d = rows.filter((r) => typeof r.classifier_confidence === "number" && typeof r.anomaly_score === "number")
    .map((r) => ({ x: r.classifier_confidence, y: r.anomaly_score, z: (r.risk_score ?? 0) * 100, id: r.node_id, risk: r.risk_score }));
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis type="number" dataKey="x" name="confidence" domain={[0, 1]} {...axis} />
          <YAxis type="number" dataKey="y" name="anomaly" domain={[0, 1]} {...axis} />
          <ZAxis type="number" dataKey="z" range={[20, 160]} />
          <Tooltip content={({ active, payload }) => active && payload?.length ? (
            <div className="tip"><b>{payload[0].payload.id}</b><div>confidence {payload[0].payload.x.toFixed(3)} · anomaly {payload[0].payload.y.toFixed(3)}</div><div>risk {payload[0].payload.risk?.toFixed(3)}</div></div>
          ) : null} cursor={{ strokeDasharray: "3 3", stroke: "rgba(0,229,255,0.3)" }} />
          <Scatter data={d} onClick={(p) => onPick?.(p.id)} style={{ cursor: "pointer", ...GLOW(CYAN) }}>
            {d.map((p, i) => <Cell key={i} fill={riskColor(p.risk)} fillOpacity={0.85} stroke={riskColor(p.risk)} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars, colour by cluster. */
export function ClusterBars({ rows, height = 190, max = 10 }) {
  const m = new Map();
  for (const r of rows) { if (r.cluster_id == null) continue; const e = m.get(r.cluster_id) ?? { c: r.cluster_id, n: 0, max: 0 }; e.n += 1; e.max = Math.max(e.max, r.risk_score ?? 0); m.set(r.cluster_id, e); }
  const d = [...m.values()].sort((a, b) => b.n - a.n || b.max - a.max).slice(0, max).map((e) => ({ ...e, name: `c${e.c}` }));
  if (!d.length) return <div className="empty">no cluster assignments</div>;
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={d} layout="vertical" margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} horizontal={false} />
          <XAxis type="number" {...axis} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={38} {...axis} />
          <Tooltip content={<Tip fmt={(v, p) => `${v} entities · max risk ${p.payload.max.toFixed(3)}`} />} cursor={{ fill: "rgba(0,229,255,0.06)" }} />
          <Bar dataKey="n" name="members" style={GLOW(BLUE)}>{d.map((e, i) => <Cell key={i} fill={clusterColor(e.c)} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const INTENT_COLOR = { "Ransomware-shaped": VIOLET, "Darknet-market-shaped": "#c084fc", "Sanctions-evasion-shaped": TEAL, "Pattern unclear": MUTE, "Insufficient signal": "#36506a" };
/** Donut of intent archetypes — categorical colours, never risk colours. */
export function IntentDonut({ rows, height = 190 }) {
  const m = new Map();
  for (const r of rows) if (r.intent_label) m.set(r.intent_label, (m.get(r.intent_label) ?? 0) + 1);
  const d = [...m.entries()].map(([name, value]) => ({ name, value }));
  if (!d.length) return <div className="empty">no intent labels yet</div>;
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={d} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="82%" paddingAngle={2} stroke="none" style={GLOW(VIOLET)}>
            {d.map((e, i) => <Cell key={i} fill={INTENT_COLOR[e.name] ?? MUTE} />)}
          </Pie>
          <Tooltip content={<Tip />} />
          <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 10, fontFamily: "Fira Code, monospace", color: "#93abc0" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Geo-temporal mismatches by claimed country. */
export function GeoMismatchBars({ rows, height = 150 }) {
  const m = new Map();
  for (const r of rows) { if (r.geo_temporal_flag !== true) continue; const c = /^claims\s+([A-Z]{2})/.exec(String(r.geo_temporal_reason ?? ""))?.[1] ?? "—"; m.set(c, (m.get(c) ?? 0) + 1); }
  const d = [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
  if (!d.length) return <div className="empty">no geo-temporal mismatches</div>;
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={d} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid {...grid} vertical={false} />
          <XAxis dataKey="name" {...axis} />
          <YAxis {...axis} allowDecimals={false} />
          <Tooltip content={<Tip />} cursor={{ fill: "rgba(255,179,71,0.06)" }} />
          <Bar dataKey="n" name="claims" fill={AMBER} fillOpacity={0.85} style={GLOW(AMBER)} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Area over thresholds (x) for one series in [0,1]. */
export function ThresholdArea({ data, xKey = "threshold", yKey, name, color = CYAN, height = 170 }) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
          <defs><linearGradient id={`g-${yKey}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.45} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></linearGradient></defs>
          <CartesianGrid {...grid} />
          <XAxis dataKey={xKey} {...axis} tickFormatter={(v) => v.toFixed(2)} />
          <YAxis domain={[0, 1]} {...axis} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
          <Tooltip content={<Tip fmt={(v) => `${(v * 100).toFixed(1)}%`} />} />
          <Area type="monotone" dataKey={yKey} name={name} stroke={color} strokeWidth={2} fill={`url(#g-${yKey})`} dot={{ r: 3, fill: color, stroke: color }} style={GLOW(color)} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two lines over thresholds — used for held-out recall (haircut vs custody-weighted). */
export function ThresholdLines({ data, xKey = "threshold", series, height = 170 }) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey={xKey} {...axis} tickFormatter={(v) => v.toFixed(2)} />
          <YAxis domain={[0, "auto"]} {...axis} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
          <Tooltip content={<Tip fmt={(v) => `${(v * 100).toFixed(1)}%`} />} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 10, fontFamily: "Fira Code, monospace", color: "#93abc0" }} />
          {series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3, fill: s.color, stroke: s.color }} style={GLOW(s.color)} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

