import { useState, useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useAlerts } from "../../hooks/useAlerts";
import { useKickDownDoors } from "../../hooks/useKickDownDoors";
import { motionTokens } from "../../lib/motionTokens";
import { clusterColor } from "../../lib/clusterColors";
import RiskPill from "../shared/RiskPill";

export default function KickDownDoorsPage({ selectedNodeId, onSelectNode }) {
  const reduceMotion = useReducedMotion();
  // Reuses the alert list already fetched for the Alerts page rather than adding a
  // second data path for the entity picker.
  const { data: alertsData, loading: alertsLoading } = useAlerts();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => (Array.isArray(alertsData?.rows) ? alertsData.rows : []), [alertsData]);

  const target = selectedNodeId ?? rows[0]?.node_id ?? null;
  const { data, error, loading } = useKickDownDoors(target);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? rows.filter((r) => String(r.node_id).toLowerCase().includes(q)) : rows;
    return base.slice(0, 40);
  }, [rows, query]);

  const targetRow = rows.find((r) => r.node_id === target);

  return (
    <div>
      <div className="page-header">
        <h2>Kick Down Doors</h2>
        <p className="lede">
          Structural disruption analysis: which nodes in a flagged entity's own
          neighbourhood carry the money-flow, so an intervention can be aimed at the
          smallest set of points that actually breaks the path.
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(260px, 320px) 1fr",
        gap: "var(--space-4)",
        alignItems: "start",
      }}>
        {/* Entity picker */}
        <section className="panel" style={{ padding: "var(--space-4)" }}>
          <span className="eyebrow">Select Entity</span>
          <input
            className="input"
            placeholder="Search flagged entities…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: "100%", margin: "var(--space-3) 0" }}
          />
          {alertsLoading ? (
            <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>Loading entities…</p>
          ) : (
            <div style={{ maxHeight: "56vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
              {matches.map((r) => {
                const isActive = r.node_id === target;
                return (
                  <button
                    key={r.node_id}
                    onClick={() => onSelectNode?.(r.node_id)}
                    className="mono"
                    style={{
                      display: "flex", alignItems: "center", gap: "var(--space-2)",
                      padding: "0.45rem 0.55rem", borderRadius: "var(--radius-sm)",
                      background: isActive ? "var(--accent-dim)" : "transparent",
                      border: isActive ? "1px solid var(--accent-line)" : "1px solid transparent",
                      color: isActive ? "var(--accent-strong)" : "var(--text-secondary)",
                      cursor: "pointer", textAlign: "left", fontSize: "var(--text-2xs)",
                      width: "100%",
                    }}
                  >
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.node_id}
                    </span>
                    {r.cluster_id !== null && r.cluster_id !== undefined && (
                      <span style={{ color: clusterColor(r.cluster_id), flexShrink: 0 }}>c{r.cluster_id}</span>
                    )}
                  </button>
                );
              })}
              {matches.length === 0 && (
                <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>No entity matches that filter.</p>
              )}
            </div>
          )}
        </section>

        {/* Analysis */}
        <section className="panel" style={{ padding: "var(--space-5)" }}>
          {!target ? (
            <p style={{ color: "var(--text-muted)" }}>Select an entity to run the analysis.</p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
                <span className="mono" style={{ fontSize: "var(--text-base)", color: "var(--text-primary)", wordBreak: "break-all" }}>
                  {target}
                </span>
                {targetRow && typeof targetRow.risk_score === "number" && <RiskPill score={targetRow.risk_score} />}
              </div>

              {/* Wording is deliberate and must stay scoped: this is a local analysis. */}
              <div style={{
                display: "inline-block", padding: "0.3rem 0.7rem", borderRadius: "var(--radius-sm)",
                background: "var(--signal-dim)", border: "1px solid var(--signal-line)",
                color: "var(--signal)", fontSize: "var(--text-2xs)", fontWeight: 700,
                letterSpacing: "var(--tracking-wide)", marginBottom: "var(--space-4)",
              }}>
                LOCAL DISRUPTION ANALYSIS
              </div>

              {loading && <p style={{ color: "var(--text-muted)" }}>Analyzing local neighborhood…</p>}

              {error && (
                <div style={{ color: "var(--signal)", fontSize: "var(--text-sm)" }}>
                  Kick Down Doors analysis unavailable: {error}
                </div>
              )}

              {data && (
                data.results.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
                    No structural articulation points found in this entity's immediate neighborhood.
                  </p>
                ) : (
                  <>
                    <div style={{ overflowX: "auto" }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th style={{ cursor: "default" }}>Node</th>
                            <th style={{ cursor: "default" }}>Type</th>
                            <th style={{ cursor: "default" }}>Impact</th>
                            <th style={{ cursor: "default" }}>Betweenness</th>
                            <th style={{ cursor: "default" }}>Articulation Point</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.results.map((n, i) => (
                            <motion.tr
                              key={n.node_id}
                              initial={{ opacity: 0, y: reduceMotion ? 0 : motionTokens.distance.sm }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal,
                                ease: motionTokens.easing.smooth,
                                delay: reduceMotion ? 0 : i * 0.05,
                              }}
                            >
                              <td className="mono" style={{ color: "var(--text-primary)", wordBreak: "break-all", maxWidth: 280 }}>
                                {n.node_id}
                              </td>
                              <td>{n.node_type}</td>
                              <td className="mono" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
                                {n.impact_score.toFixed(3)}
                              </td>
                              <td className="mono">{n.betweenness.toFixed(4)}</td>
                              <td>
                                {n.is_articulation_point
                                  ? <span style={{ color: "var(--signal)", fontWeight: 700 }}>Yes</span>
                                  : <span style={{ color: "var(--text-faint)" }}>No</span>}
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{
                      marginTop: "var(--space-4)", padding: "var(--space-3)",
                      background: "var(--surface-sunken)", borderRadius: "var(--radius-sm)",
                      fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.6,
                    }}>
                      <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>Top target rationale</span>
                      {data.results[0]?.reason}
                    </div>
                  </>
                )
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
