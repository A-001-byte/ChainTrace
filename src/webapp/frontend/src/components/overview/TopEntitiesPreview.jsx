import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../../lib/motionTokens";
import { riskTier } from "../../lib/risk";
import { clusterColor } from "../../lib/clusterColors";

/** Top N highest-risk entities. Hairline separators between rows, not card boxes. */
export default function TopEntitiesPreview({ rows, onSelectEntity, onViewAll, limit = 5 }) {
  const reduceMotion = useReducedMotion();
  const top = [...(rows ?? [])]
    .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
    .slice(0, limit);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--spacing-12)" }}>
        <span className="eyebrow">Highest-Risk Entities</span>
        <button className="btn btn-accent" onClick={onViewAll}>View all</button>
      </div>

      {top.length === 0 ? (
        <p style={{ color: "var(--color-ash)", fontSize: "var(--text-caption)" }}>No flagged entities yet.</p>
      ) : (
        <div>
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
                whileHover={reduceMotion ? undefined : { x: 3, backgroundColor: "rgba(255,255,255,0.03)" }}
                style={{
                  display: "flex", alignItems: "center", gap: "var(--spacing-12)",
                  padding: "var(--spacing-12) var(--spacing-8)",
                  background: "rgba(255,255,255,0)", border: "none",
                  borderBottom: i === top.length - 1 ? "none" : "1px solid var(--color-graphite)",
                  cursor: "pointer", textAlign: "left", width: "100%", fontFamily: "inherit",
                }}
              >
                <span style={{ width: 2, alignSelf: "stretch", background: tier.color, flexShrink: 0 }} />
                <span className="mono" style={{
                  flex: 1, fontSize: "var(--text-caption)", color: "var(--color-mist)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {r.node_id}
                </span>
                {r.cluster_id !== null && r.cluster_id !== undefined && (
                  <span className="badge mono" style={{
                    color: clusterColor(r.cluster_id),
                    background: "rgba(255,255,255,0.02)",
                    boxShadow: `${clusterColor(r.cluster_id)}47 0px 0px 0px 1px inset`,
                    flexShrink: 0,
                  }}>
                    c{r.cluster_id}
                  </span>
                )}
                <span className="mono" style={{
                  fontSize: "var(--text-caption)", fontWeight: "var(--weight-medium)", color: tier.color,
                  flexShrink: 0, minWidth: "3.2rem", textAlign: "right",
                }}>
                  {typeof r.risk_score === "number" ? r.risk_score.toFixed(3) : "—"}
                </span>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
