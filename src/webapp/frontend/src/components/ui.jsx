import { motion, useReducedMotion } from "motion/react";
import { tone } from "../lib/format";

/** Card. `light` = the bone figure on the dark canvas; default = hairline-bordered dark. */
export function Card({ title, right, light = false, panel = false, flush = false, className = "", style, children }) {
  return (
    <section className={`card${light ? " light" : ""}${panel ? " panel" : ""}${flush ? " flush" : ""} ${className}`} style={style}>
      {(title || right) && (
        <div className="ch">
          {title && <span className="eyebrow">{title}</span>}
          {right && <span className="eyebrow" style={{ color: "var(--granite)" }}>{right}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Metric tile: ONE-WORD label above the number, optional mono sub-line. */
export function Tile({ k, v, s, tone }) {
  return (
    <div className="tile">
      <div className="k">{k}</div>
      <div className={`v${tone ? ` ${tone}` : ""}`}>{v}</div>
      {s && <div className="s">{s}</div>}
    </div>
  );
}
export function Tiles({ children }) { return <div className="tiles">{children}</div>; }

export function Tag({ t = "", children, title }) { return <span className={`tag ${t}`} title={title}>{children}</span>; }
export function RiskTag({ score }) {
  const ok = typeof score === "number" && !Number.isNaN(score);
  return <Tag t={ok ? tone(score) : ""}>{ok ? score.toFixed(3) : "—"}</Tag>;
}

export function KV({ rows }) {
  return (
    <div className="kv">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <span className="k">{k}</span><span className="v">{v ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

/** Proportional bar. Grows on transform: scaleX from the left, never width. */
export function Bar({ frac, color = "var(--bone)" }) {
  const rm = useReducedMotion();
  const f = Math.max(0, Math.min(1, Number(frac) || 0));
  return (
    <div className="bar">
      <motion.i initial={{ scaleX: rm ? f : 0 }} animate={{ scaleX: f }} transition={{ duration: rm ? 0 : 0.2, ease: [0.4, 0, 0.2, 1] }} style={{ background: color, width: "100%" }} />
    </div>
  );
}

export function Empty({ children }) { return <div className="empty">{children}</div>; }
export function ErrorCard({ error }) { return <Card title="unavailable"><div className="note orange">{String(error)}</div></Card>; }

/** Section wrapper: eyebrow + optional h1, then content with the system's spacing. */
export function Section({ eyebrow, title, right, children }) {
  return (
    <div className="section">
      {(eyebrow || title || right) && (
        <div className="head">
          <div>{eyebrow && <div className="eyebrow dot" style={{ marginBottom: title ? 12 : 0 }}>{eyebrow}</div>}{title && <h1>{title}</h1>}</div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/** Mount reveal: opacity + 6px only, 0.2s mechanical easing. Respects reduced motion. */
export function Reveal({ children, delay = 0, style, className }) {
  const rm = useReducedMotion();
  return (
    <motion.div className={className} style={style}
      initial={{ opacity: 0, y: rm ? 0 : 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: rm ? 0 : 0.2, ease: [0.4, 0, 0.2, 1], delay: rm ? 0 : delay }}>
      {children}
    </motion.div>
  );
}
