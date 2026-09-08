import { motion, useReducedMotion } from "motion/react";
import { riskTier } from "../lib/risk";
import { motionTokens } from "../lib/motionTokens";

/** Console panel: header bar + body. Only structural element in the system. */
export function Panel({ title, right, children, flush = false, style, className = "" }) {
  return (
    <section className={`panel ${className}`} style={style}>
      {title !== undefined && (
        <div className="ph">
          <span>{title}</span>
          {right !== undefined && <span className="r">{right}</span>}
        </div>
      )}
      <div className={`pb${flush ? " flush" : ""}`}>{children}</div>
    </section>
  );
}

/** Map a risk score to a tag tone. Semantic only — never decorative. */
export function tone(score) {
  const t = riskTier(score).key;
  if (t === "critical" || t === "high") return "hi";
  if (t === "medium") return "md";
  if (t === "low") return "lo";
  return "";
}

export function Tag({ t = "", children, title }) {
  return <span className={`tag ${t}`} title={title}>{children}</span>;
}

export function RiskTag({ score }) {
  const ok = typeof score === "number" && !Number.isNaN(score);
  return <Tag t={ok ? tone(score) : ""}>{ok ? score.toFixed(3) : "—"}</Tag>;
}

export function Stat({ k, v, s, size }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={`v${size === "md" ? " md" : ""}`}>{v}</div>
      {s && <div className="s">{s}</div>}
    </div>
  );
}

export function KV({ rows }) {
  return (
    <div className="kv">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <span className="k">{k}</span>
          <span className="v">{v ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

/** Proportional bar. Grows on transform: scaleX from the left, never width. */
export function Bar({ frac, color = "var(--acc)", delay = 0 }) {
  const rm = useReducedMotion();
  const f = Math.max(0, Math.min(1, Number(frac) || 0));
  return (
    <div className="bar">
      <motion.i
        initial={{ scaleX: rm ? f : 0 }}
        animate={{ scaleX: f }}
        transition={{ duration: rm ? 0 : motionTokens.duration.slow, ease: motionTokens.easing.smooth, delay: rm ? 0 : delay }}
        style={{ background: color, width: "100%" }}
      />
    </div>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

/** Mount reveal: opacity + small y only. Honours reduced motion. */
export function Reveal({ children, delay = 0, style }) {
  const rm = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: rm ? 0 : motionTokens.distance.sm }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: rm ? motionTokens.duration.fast : motionTokens.duration.normal, ease: motionTokens.easing.smooth, delay: rm ? 0 : delay }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

export function ErrorPanel({ title = "DATA SOURCE UNAVAILABLE", error }) {
  return (
    <Panel title={title}>
      <div className="note hi">{String(error)}</div>
    </Panel>
  );
}

export const pct = (x, d = 1) => `${(Number(x) * 100).toFixed(d)}%`;
export const num = (x) => (x === null || x === undefined ? "—" : Number(x).toLocaleString());
export const short = (s, n = 22) => (String(s ?? "").length > n ? String(s).slice(0, n) + "…" : String(s ?? "—"));
