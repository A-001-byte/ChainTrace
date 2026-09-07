import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../../lib/motionTokens";
import { RISK_TIERS } from "../../lib/risk";

/**
 * Risk distribution as a proportional bar rather than "50 high / 0 medium / 0 low" as
 * text. Growth uses transform: scaleX from the left, never width.
 * Colours are risk-semantic (coral / amber / green) — never the acid-lime action accent.
 */
export default function RiskDistribution({ counts, total }) {
  const reduceMotion = useReducedMotion();

  const segments = [
    { ...RISK_TIERS[0], count: counts?.high ?? 0 },
    { ...RISK_TIERS[2], count: counts?.medium ?? 0 },
    { ...RISK_TIERS[3], count: counts?.low ?? 0 },
  ];
  const sum = segments.reduce((a, s) => a + s.count, 0) || 1;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--spacing-16)" }}>
        <span className="eyebrow">Risk Distribution</span>
        <span className="mono" style={{ fontSize: "var(--text-caption)", color: "var(--color-ash)" }}>
          {total ?? sum} flagged
        </span>
      </div>

      <div style={{
        display: "flex", height: 8, borderRadius: "var(--radius-pills)", overflow: "hidden",
        background: "var(--color-void)", gap: 2,
      }}>
        {segments.map((s, i) => (
          <div key={s.key} style={{ flex: s.count / sum, minWidth: s.count > 0 ? 4 : 0, overflow: "hidden" }}>
            <motion.div
              initial={{ scaleX: reduceMotion ? 1 : 0 }}
              animate={{ scaleX: 1 }}
              transition={{
                duration: reduceMotion ? 0 : motionTokens.duration.slow,
                ease: motionTokens.easing.smooth,
                delay: reduceMotion ? 0 : i * 0.08,
              }}
              style={{ width: "100%", height: "100%", background: s.color, transformOrigin: "left" }}
            />
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "var(--spacing-20)", marginTop: "var(--spacing-16)", flexWrap: "wrap" }}>
        {segments.map((s) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "var(--radius-pills)", background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: "var(--text-caption)", color: "var(--color-fog)" }}>{s.label}</span>
            <span className="mono" style={{ fontSize: "var(--text-caption)", color: "var(--color-bone)", fontWeight: "var(--weight-medium)" }}>
              {s.count}
            </span>
            <span className="mono" style={{ fontSize: "var(--text-caption)", color: "var(--color-ash)" }}>
              {((s.count / sum) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
