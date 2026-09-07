import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../../lib/motionTokens";

function KpiCard({ label, value, sub, accent, variants, reduceMotion }) {
  return (
    <motion.div
      variants={variants}
      whileHover={reduceMotion ? undefined : {
        scale: motionTokens.hover.cardScale,
        y: motionTokens.hover.cardLift,
      }}
      transition={{ duration: motionTokens.duration.fast, ease: motionTokens.easing.sharp }}
      className="panel"
      style={{
        padding: "var(--space-4)",
        flex: "1 1 150px",
        borderLeft: `3px solid ${accent || "var(--border-strong)"}`,
      }}
    >
      <div className="eyebrow">{label}</div>
      <div className="mono" style={{
        fontSize: "var(--text-2xl)", fontWeight: 700, marginTop: "var(--space-2)",
        letterSpacing: "var(--tracking-tight)", color: "var(--text-primary)", lineHeight: 1.1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginTop: "var(--space-2)" }}>
          {sub}
        </div>
      )}
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
      style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}
    >
      <KpiCard
        label="Total Flagged"
        value={stats.total_flagged.toLocaleString()}
        sub={`${stats.risk_tier_counts.high} high · ${stats.risk_tier_counts.medium} medium · ${stats.risk_tier_counts.low} low`}
        accent="var(--accent)"
        variants={card}
        reduceMotion={reduceMotion}
      />
      <KpiCard
        label="High-Risk Entities"
        value={stats.risk_tier_counts.high.toLocaleString()}
        sub={`risk_score ≥ ${stats.risk_tier_thresholds.high}`}
        accent="var(--risk-critical)"
        variants={card}
        reduceMotion={reduceMotion}
      />
      <KpiCard label="Wallets Flagged" value={wallet.toLocaleString()} accent="var(--accent-purple)" variants={card} reduceMotion={reduceMotion} />
      <KpiCard label="Transactions Flagged" value={tx.toLocaleString()} accent="var(--accent-blue)" variants={card} reduceMotion={reduceMotion} />
      <KpiCard label="Avg Risk Score" value={stats.avg_risk_score.toFixed(3)} accent="var(--risk-high)" variants={card} reduceMotion={reduceMotion} />
    </motion.div>
  );
}
