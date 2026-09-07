import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../../lib/motionTokens";

/**
 * Card (Product Screenshot Frame): Carbon fill, 12px radius, inset hairline border via
 * shadow-subtle. No outer shadow, no glow. The accent rule is a thin semantic marker,
 * not decoration.
 */
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
        padding: "var(--spacing-20)",
        flex: "1 1 170px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {accent && (
        <span style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: accent,
        }} />
      )}
      <div className="eyebrow">{label}</div>
      <div className="mono" style={{
        fontSize: "var(--text-heading-sm)",
        lineHeight: "var(--leading-heading-sm)",
        letterSpacing: "var(--tracking-heading-sm)",
        fontWeight: "var(--weight-medium)",
        color: "var(--color-bone)",
        marginTop: "var(--spacing-12)",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: "var(--text-caption)", lineHeight: "var(--leading-caption)",
          color: "var(--color-ash)", marginTop: "var(--spacing-8)",
        }}>
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
      style={{ display: "flex", gap: "var(--spacing-16)", flexWrap: "wrap" }}
    >
      <KpiCard
        label="Total Flagged"
        value={stats.total_flagged.toLocaleString()}
        sub={`${stats.risk_tier_counts.high} high · ${stats.risk_tier_counts.medium} medium · ${stats.risk_tier_counts.low} low`}
        accent="var(--color-smoke)"
        variants={card}
        reduceMotion={reduceMotion}
      />
      <KpiCard
        label="High-Risk Entities"
        value={stats.risk_tier_counts.high.toLocaleString()}
        sub={`risk_score ≥ ${stats.risk_tier_thresholds.high}`}
        accent="var(--risk-high)"
        variants={card}
        reduceMotion={reduceMotion}
      />
      <KpiCard label="Wallets Flagged" value={wallet.toLocaleString()} accent="var(--color-lavender)" variants={card} reduceMotion={reduceMotion} />
      <KpiCard label="Transactions Flagged" value={tx.toLocaleString()} accent="var(--color-signal-teal)" variants={card} reduceMotion={reduceMotion} />
      <KpiCard label="Avg Risk Score" value={stats.avg_risk_score.toFixed(3)} accent="var(--color-smoke)" variants={card} reduceMotion={reduceMotion} />
    </motion.div>
  );
}
