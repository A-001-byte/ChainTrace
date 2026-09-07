import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../../lib/motionTokens";
import { riskTier } from "../../lib/risk";

/**
 * Badge / Status Tag: ~5% tint of the semantic risk colour, 4px radius, hairline inset
 * border, and the numeric score set in Berkeley Mono. Risk severity only — this never
 * uses the Acid Lime action accent.
 */
export default function RiskPill({ score }) {
  const reduceMotion = useReducedMotion();
  const tier = riskTier(score);
  const hasScore = typeof score === "number" && !Number.isNaN(score);

  return (
    <motion.span
      className="badge mono"
      initial={{ scale: 1 }}
      whileHover={reduceMotion ? undefined : { scale: motionTokens.hover.pillScale }}
      whileTap={reduceMotion ? undefined : { scale: motionTokens.tap.pillScale }}
      transition={{ duration: motionTokens.duration.fast, ease: motionTokens.easing.sharp }}
      style={{
        color: tier.color,
        background: tier.tint,
        boxShadow: `${tier.line} 0px 0px 0px 1px inset`,
      }}
    >
      {hasScore ? score.toFixed(3) : "—"}
    </motion.span>
  );
}
