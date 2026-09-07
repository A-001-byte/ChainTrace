import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../../lib/motionTokens";

export default function GeoBar({ label, flaggedCount, avgRisk, maxRisk, maxCount }) {
  const reduceMotion = useReducedMotion();
  const fraction = maxCount > 0 ? flaggedCount / maxCount : 0;
  let barColor = "var(--success)";
  if (avgRisk >= 0.8) barColor = "var(--danger)";
  else if (avgRisk >= 0.6) barColor = "var(--warning)";

  return (
    <div style={{ marginBottom: "0.6rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.2rem" }}>
        <span style={{ color: "var(--text-primary)" }}>{label}</span>
        <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
          {flaggedCount} flagged · avg {avgRisk?.toFixed(2) ?? "-"} · max {maxRisk?.toFixed(2) ?? "-"}
        </span>
      </div>
      <div style={{ background: "var(--bg-main)", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
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
            width: "100%", height: "100%", background: barColor, borderRadius: "4px",
            transformOrigin: "left",
          }}
        />
      </div>
    </div>
  );
}
