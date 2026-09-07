import { motion, useReducedMotion } from "motion/react";
import { useAlerts } from "../../hooks/useAlerts";
import { motionTokens } from "../../lib/motionTokens";

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
    <div style={{ marginBottom: "0.7rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "0.25rem" }}>
        <span style={{ color: "var(--text-primary)" }}>{label}</span>
        <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
          {count} ({total > 0 ? pct.toFixed(0) : 0}%)
        </span>
      </div>
      <div style={{ background: "var(--bg-main)", borderRadius: "4px", height: "8px", overflow: "hidden" }}>
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
            width: "100%", height: "100%", background: "var(--accent-cyan)",
            borderRadius: "4px", transformOrigin: "left",
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
      <div style={{
        background: "var(--bg-card)", border: "1px dashed var(--border-color)",
        borderRadius: "10px", padding: "1.5rem", color: "var(--text-secondary)",
      }}>
        <h3 style={{ color: "var(--warning)", marginBottom: "0.5rem" }}>Data Source Unavailable</h3>
        <p>{error}</p>
      </div>
    );
  }

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const withIntent = rows.filter((r) => r.intent_label);

  return (
    <div>
      <h2 style={{ marginBottom: "0.4rem" }}>Pattern Intelligence</h2>
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.2rem", maxWidth: "700px" }}>
        Intent Intelligence is a <strong>rule-based structural pattern matcher</strong> — it scores
        transaction structure against published qualitative descriptions of known crime-type
        money-movement shapes. It is not a trained crime-type classifier, since no crime-type
        ground truth exists in the underlying dataset. Labels reflect pattern similarity, not
        determinations of fact — hence "-shaped," not a bare accusation.
      </p>

      {withIntent.length === 0 ? (
        <div style={{
          background: "var(--bg-card)", border: "1px dashed var(--border-color)",
          borderRadius: "10px", padding: "1.5rem", color: "var(--text-secondary)",
        }}>
          <h3 style={{ color: "var(--text-primary)", marginBottom: "0.5rem", fontSize: "0.95rem" }}>
            Intent classification not yet available
          </h3>
          <p style={{ fontSize: "0.85rem" }}>
            No flagged entity in the current dataset has an <code>intent_label</code> yet.
            This section will populate automatically once the intent classification
            module is merged — no dashboard changes are required for that.
          </p>
        </div>
      ) : (
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border-color)",
          borderRadius: "10px", padding: "1.2rem", maxWidth: "600px",
        }}>
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