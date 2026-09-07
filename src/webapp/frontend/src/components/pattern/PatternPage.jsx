import { motion, useReducedMotion } from "motion/react";
import { useAlerts } from "../../hooks/useAlerts";
import { motionTokens } from "../../lib/motionTokens";
import IntentBadge, { intentColor } from "../shared/IntentBadge";

const ARCHETYPES = [
  "Ransomware-shaped",
  "Darknet-market-shaped",
  "Sanctions-evasion-shaped",
  "Pattern unclear",
  "Insufficient signal",
];

function ArchetypeBar({ label, count, total, index, reduceMotion }) {
  const fraction = total > 0 ? count / total : 0;
  const pct = fraction * 100;
  return (
    <div style={{ marginBottom: "var(--spacing-16)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-caption)", marginBottom: "var(--spacing-8)" }}>
        <IntentBadge label={label} />
        <span className="mono" style={{ color: "var(--color-ash)" }}>
          {count} ({total > 0 ? pct.toFixed(0) : 0}%)
        </span>
      </div>
      <div style={{ background: "var(--color-void)", borderRadius: "var(--radius-pills)", height: "4px", overflow: "hidden" }}>
        {/* Full-width bar scaled on X from its left edge -- a transform, not an animated
            width, so growth stays on the compositor. */}
        <motion.div
          initial={{ scaleX: reduceMotion ? fraction : 0 }}
          animate={{ scaleX: fraction }}
          transition={{
            duration: reduceMotion ? 0 : motionTokens.duration.slow,
            ease: motionTokens.easing.smooth,
            delay: reduceMotion ? 0 : index * 0.05,
          }}
          style={{
            width: "100%", height: "100%", background: intentColor(label),
            borderRadius: "var(--radius-pills)", transformOrigin: "left",
          }}
        />
      </div>
    </div>
  );
}

export default function PatternPage() {
  const reduceMotion = useReducedMotion();
  const { data, error, loading } = useAlerts();

  if (loading) return <p style={{ color: "var(--text-muted)" }}>Loading pattern intelligence…</p>;

  if (error) {
    return (
      <div className="panel" style={{
        padding: "var(--spacing-32)", color: "var(--color-fog)",
      }}>
        <h3 style={{ color: "var(--signal)", marginBottom: "var(--spacing-8)" }}>Data Source Unavailable</h3>
        <p>{error}</p>
      </div>
    );
  }

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const withIntent = rows.filter((r) => r.intent_label);

  return (
    <div>
      <div className="page-header">
      <h2>Pattern Intelligence</h2>
      <p className="lede">
        Intent Intelligence is a <strong>rule-based structural pattern matcher</strong> — it scores
        transaction structure against published qualitative descriptions of known crime-type
        money-movement shapes. It is not a trained crime-type classifier, since no crime-type
        ground truth exists in the underlying dataset. Labels reflect pattern similarity, not
        determinations of fact — hence "-shaped," not a bare accusation.
      </p>
      </div>

      {withIntent.length === 0 ? (
        <div className="panel" style={{ padding: "var(--spacing-32)", color: "var(--color-fog)" }}>
          <h3 style={{ color: "var(--color-bone)", marginBottom: "var(--spacing-8)" }}>
            Intent classification not yet available
          </h3>
          <p style={{ fontSize: "var(--text-caption)" }}>
            No flagged entity in the current dataset has an <code>intent_label</code> yet.
            This section will populate automatically once the intent classification
            module is merged — no dashboard changes are required for that.
          </p>
        </div>
      ) : (
        <div className="panel" style={{ padding: "var(--spacing-20)", maxWidth: "620px" }}>
          {ARCHETYPES.map((archetype, i) => (
            <ArchetypeBar
              key={archetype}
              label={archetype}
              count={withIntent.filter((r) => r.intent_label === archetype).length}
              total={withIntent.length}
              index={i}
              reduceMotion={reduceMotion}
            />
          ))}
        </div>
      )}
    </div>
  );
}