import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../../lib/motionTokens";

function KpiCard({ label, value, sub, variants, reduceMotion }) {
  return (
    <motion.div
      variants={variants}
      whileHover={reduceMotion ? undefined : { scale: 1.01 }}
      transition={{ duration: motionTokens.duration.fast, ease: motionTokens.easing.sharp }}
      style={{
        background: "var(--bg-card)", border: "1px solid var(--border-color)",
        borderRadius: "10px", padding: "1rem 1.25rem", flex: 1,
      }}
    >
      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.6rem", fontWeight: 700, fontFamily: "var(--font-mono)", marginTop: "0.3rem" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>{sub}</div>}
    </motion.div>
  );
}

export default function KpiRow({ stats }) {
  const reduceMotion = useReducedMotion();
  const wallet = stats.node_type_breakdown?.wallet ?? 0;
  const tx = stats.node_type_breakdown?.tx ?? 0;

  const container = {
    hidden: {},
    visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.06 } },
  };

  // Reduced motion keeps the fade but drops the y transform, on a shorter duration.
  const card = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : motionTokens.distance.md },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal,
        ease: motionTokens.easing.smooth,
      },
    },
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="visible"
      style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}
    >
      <KpiCard
        label="Total Flagged"
        value={stats.total_flagged.toLocaleString()}
        sub={`${stats.risk_tier_counts.high} high · ${stats.risk_tier_counts.medium} medium · ${stats.risk_tier_counts.low} low`}
        variants={card}
        reduceMotion={reduceMotion}
      />
      <KpiCard label="High-Risk Entities" value={stats.risk_tier_counts.high.toLocaleString()} sub={`risk_score ≥ ${stats.risk_tier_thresholds.high}`} variants={card} reduceMotion={reduceMotion} />
      <KpiCard label="Wallets Flagged" value={wallet.toLocaleString()} variants={card} reduceMotion={reduceMotion} />
      <KpiCard label="Transactions Flagged" value={tx.toLocaleString()} variants={card} reduceMotion={reduceMotion} />
      <KpiCard label="Avg Risk Score" value={stats.avg_risk_score.toFixed(3)} variants={card} reduceMotion={reduceMotion} />
    </motion.div>
  );
}
