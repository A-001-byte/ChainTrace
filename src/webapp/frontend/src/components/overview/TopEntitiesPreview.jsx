import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../../lib/motionTokens";
import { riskTier } from "../../lib/risk";
import { clusterColor } from "../../lib/clusterColors";

/** Top N highest-risk entities, with a route into the full Alerts view. */
export default function TopEntitiesPreview({ rows, onSelectEntity, onViewAll, limit = 5 }) {
  const reduceMotion = useReducedMotion();
  const top = [...(rows ?? [])]
    .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
    .slice(0, limit);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
        <span className="eyebrow">Highest-Risk Entities</span>
        <button className="btn" onClick={onViewAll}>View all →</button>
      </div>

      {top.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>No flagged entities yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {top.map((r, i) => {
            const tier = riskTier(r.risk_score);
            return (
              <motion.button
                key={r.node_id}
                onClick={() => onSelectEntity?.(r.node_id)}
                initial={{ opacity: 0, x: reduceMotion ? 0 : -motionTokens.distance.sm }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal,
                  ease: motionTokens.easing.smooth,
                  delay: reduceMotion ? 0 : i * 0.05,
                }}
                whileHover={reduceMotion ? undefined : { x: 4, backgroundColor: "rgba(30, 42, 65, 1)" }}
                style={{
                  display: "flex", alignItems: "center", gap: "var(--space-3)",
                  padding: "0.55rem 0.6rem", borderRadius: "var(--radius-sm)",
                  background: "rgba(30, 42, 65, 0)", border: "none", cursor: "pointer",
                  textAlign: "left", width: "100%", fontFamily: "inherit",
                }}
              >
                <span style={{
                  width: 3, alignSelf: "stretch", borderRadius: 2,
                  background: tier.color, flexShrink: 0,
                }} />
                <span className="mono" style={{
                  flex: 1, fontSize: "var(--text-xs)", color: "var(--text-primary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {r.node_id}
                </span>
                {r.cluster_id !== null && r.cluster_id !== undefined && (
                  <span className="mono" style={{
                    fontSize: "var(--text-2xs)", color: clusterColor(r.cluster_id),
                    border: `1px solid ${clusterColor(r.cluster_id)}44`,
                    borderRadius: 4, padding: "0.1rem 0.35rem", flexShrink: 0,
                  }}>
                    c{r.cluster_id}
                  </span>
                )}
                <span className="mono" style={{
                  fontSize: "var(--text-sm)", fontWeight: 700, color: tier.color,
                  flexShrink: 0, minWidth: "3.4rem", textAlign: "right",
                }}>
                  {typeof r.risk_score === "number" ? r.risk_score.toFixed(3) : "-"}
                </span>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
