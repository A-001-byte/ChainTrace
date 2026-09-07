import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../../lib/motionTokens";

export default function RiskPill({ score }) {
  const reduceMotion = useReducedMotion();
  const s = typeof score === "number" ? score : 0;
  let color = "var(--success)", bg = "rgba(0,230,118,0.12)";
  if (s >= 0.8) { color = "var(--danger)"; bg = "rgba(255,23,68,0.12)"; }
  else if (s >= 0.6) { color = "var(--warning)"; bg = "rgba(255,145,0,0.12)"; }

  return (
    <motion.span
      initial={{ scale: 1 }}
      whileHover={reduceMotion ? undefined : { scale: 1.05 }}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      transition={{ duration: motionTokens.duration.fast, ease: motionTokens.easing.sharp }}
      style={{
        display: "inline-block", padding: "0.15rem 0.5rem", borderRadius: "6px",
        fontFamily: "var(--font-mono)", fontSize: "0.8rem", fontWeight: 600,
        color, background: bg, border: `1px solid ${color}33`,
      }}
    >
      {s.toFixed(3)}
    </motion.span>
  );
}
