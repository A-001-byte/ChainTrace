import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../../lib/motionTokens";

export default function GeoBar({ label, flaggedCount, avgRisk, maxRisk, maxCount }) {
  const reduceMotion = useReducedMotion();
  const fraction = maxCount > 0 ? flaggedCount / maxCount : 0;
  let barColor = "var(--risk-low)";
  if (avgRisk >= 0.6) barColor = "var(--risk-high)";
  else if (avgRisk >= 0.4) barColor = "var(--risk-medium)";

  return (
    <div style={{ marginBottom: "var(--spacing-12)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-caption)", marginBottom: "var(--spacing-4)" }}>
        <span style={{ color: "var(--color-mist)" }}>{label}</span>
        <span className="mono" style={{ color: "var(--color-ash)" }}>
          {flaggedCount} flagged · avg {avgRisk?.toFixed(2) ?? "-"} · max {maxRisk?.toFixed(2) ?? "-"}
        </span>
      </div>
      <div style={{ background: "var(--color-void)", borderRadius: "var(--radius-pills)", height: "4px", overflow: "hidden" }}>
        {/* The bar is laid out at full width and scaled down on the X axis, so growth is a
            GPU-composited transform rather than an animated width. */}
        <motion.div
          initial={{ scaleX: reduceMotion ? fraction : 0 }}
          animate={{ scaleX: fraction }}
          transition={{
            duration: reduceMotion ? 0 : motionTokens.duration.slow,
            ease: motionTokens.easing.smooth,
          }}
          style={{
            width: "100%", height: "100%", background: barColor, borderRadius: "var(--radius-pills)",
            transformOrigin: "left",
          }}
        />
      </div>
    </div>
  );
}
