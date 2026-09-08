import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  AreaChart, Area, LineChart, Line, Legend,
} from "recharts";
import { CHART_COLORS as C } from "../lib/chartColors";

/* Three chart types, deliberately. Everything else in this app is a number, a table,
   or an inline bar — a dashboard of charts is harder to read, not easier. */

const axis = { tick: { fill: C.SLATE, fontSize: 11 }, axisLine: false, tickLine: false };
const grid = { stroke: C.HAIR, vertical: false };

function Tip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip">
      {label !== undefined && <b>{label}</b>}
      {payload.map((p, i) => <div key={i}>{p.name}: {fmt ? fmt(p.value) : p.value}</div>)}
    </div>
  );
}

/** Vertical bars from pre-aggregated rows [{k, n}]. `colorBy` receives the row. */
export function Bars({ data, name = "count", color = C.VIOLET, colorBy, height = 200, fmt }) {
  if (!data?.length) return <div className="empty">No data</div>;
  return (
    <div className="chart"><ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barCategoryGap={4}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="k" {...axis} interval="preserveStartEnd" />
        <YAxis {...axis} allowDecimals={false} width={44} />
        <Tooltip content={<Tip fmt={fmt} />} cursor={{ fill: C.LINEN }} />
        <Bar dataKey="n" name={name} radius={[4, 4, 0, 0]} maxBarSize={56}>
          {data.map((d, i) => <Cell key={i} fill={colorBy ? colorBy(d) : color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer></div>
  );
}

/** Single filled curve over a [0,1] series — used for the threshold sweeps. */
export function Curve({ data, xKey = "threshold", yKey, name, color = C.VIOLET, height = 220 }) {
  return (
    <div className="chart"><ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
        <defs>
          <linearGradient id={`fill-${yKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.16} /><stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...grid} />
        <XAxis dataKey={xKey} {...axis} tickFormatter={(v) => v.toFixed(2)} />
        <YAxis domain={[0, 1]} {...axis} width={44} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
        <Tooltip content={<Tip fmt={(v) => `${(v * 100).toFixed(1)}%`} />} />
        <Area type="monotone" dataKey={yKey} name={name} stroke={color} strokeWidth={2} fill={`url(#fill-${yKey})`} dot={{ r: 3, fill: color, strokeWidth: 0 }} activeDot={{ r: 5 }} />
      </AreaChart>
    </ResponsiveContainer></div>
  );
}

/** Two or more comparable lines over the same x. */
export function Lines({ data, xKey = "threshold", series, height = 220 }) {
  return (
    <div className="chart"><ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey={xKey} {...axis} tickFormatter={(v) => v.toFixed(2)} />
        <YAxis domain={[0, "auto"]} {...axis} width={44} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
        <Tooltip content={<Tip fmt={(v) => `${(v * 100).toFixed(1)}%`} />} />
        <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3, fill: s.color, strokeWidth: 0 }} activeDot={{ r: 5 }} />)}
      </LineChart>
    </ResponsiveContainer></div>
  );
}
