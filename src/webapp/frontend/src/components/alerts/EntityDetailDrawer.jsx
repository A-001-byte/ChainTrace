import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEntity } from "../../hooks/useEntity";
import { useKickDownDoors } from "../../hooks/useKickDownDoors";
import { useAplAgency } from "../../hooks/useAplAgency";
import RiskPill from "../shared/RiskPill";
import { motionTokens } from "../../lib/motionTokens";

function Field({ label, value }) {
  return (
    <div style={{ marginBottom: "0.7rem" }}>
      <div style={{ fontSize: "var(--text-caption)", color: "var(--color-ash)" }}>
        {label}
      </div>
      <div style={{ fontSize: "var(--text-caption)", color: "var(--color-mist)", fontFamily: "var(--font-berkeley-mono)" }}>
        {value ?? "-"}
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h4 style={{
      fontSize: "var(--text-caption)", color: "var(--color-fog)", fontWeight: "var(--weight-medium)",
      marginTop: "var(--spacing-24)", marginBottom: "var(--spacing-12)",
      borderBottom: "1px solid var(--color-graphite)", paddingBottom: "var(--spacing-8)",
    }}>
      {children}
    </h4>
  );
}

export default function EntityDetailDrawer({ nodeId, onClose }) {
  const reduceMotion = useReducedMotion();
  const { data, error, loading } = useEntity(nodeId);
  const { data: kddData, error: kddError, loading: kddLoading } = useKickDownDoors(nodeId);
  const { data: aplData } = useAplAgency(nodeId);

  // Staggered reveal for the "USP tour" a judge scrolls through: Entity -> Why Flagged ->
  // Intent -> Geo-Temporal -> Linked Transactions -> Kick Down Doors.
  const sectionsContainer = {
    hidden: {},
    visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.07 } },
  };

  const section = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : motionTokens.distance.sm },
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
    // Explicit mode (not the default) per the motion guidance: the drawer is a single
    // element swapping in and out, so its exit must finish before anything else enters.
    <AnimatePresence mode="wait">
      {nodeId && (
        <motion.div
          key="entity-drawer-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: motionTokens.duration.fast, ease: motionTokens.easing.sharp }}
          style={{
            position: "fixed", inset: 0, background: "rgba(8,9,10,0.72)",
            display: "flex", justifyContent: "flex-end", zIndex: 50,
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            // Travels on transform only -- "100%" is relative to the panel itself, so the
            // drawer genuinely slides in from the right edge without touching width.
            initial={{ x: reduceMotion ? 0 : "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: reduceMotion ? 0 : "100%", opacity: 0 }}
            transition={{
              duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal,
              ease: motionTokens.easing.smooth,
            }}
            style={{
              width: "440px", height: "100%", background: "var(--color-obsidian)",
              borderLeft: "1px solid var(--color-graphite)", padding: "var(--spacing-24)",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "var(--text-body-lg)", fontWeight: "var(--weight-medium)", wordBreak: "break-all", paddingRight: "1rem" }}>{nodeId}</h3>
              <motion.button
                onClick={onClose}
                initial={{ scale: 1 }}
                whileHover={reduceMotion ? undefined : { scale: 1.15 }}
                whileTap={reduceMotion ? undefined : { scale: 0.92 }}
                transition={{ duration: motionTokens.duration.fast, ease: motionTokens.easing.sharp }}
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", fontSize: "1.2rem", cursor: "pointer", flexShrink: 0 }}
              >
                ✕
              </motion.button>
            </div>

            {loading && <p style={{ color: "var(--text-muted)" }}>Loading entity…</p>}

            {error && (
              <div style={{ color: "var(--warning)", fontSize: "var(--text-caption)" }}>
                Could not load this entity: {error}
              </div>
            )}

            {data && (
              <motion.div variants={sectionsContainer} initial="hidden" animate="visible">
                {data.in_top_alerts === false && (
                  <motion.div variants={section} style={{
                    background: "var(--surface-sunken)", border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)", padding: "0.7rem", marginBottom: "var(--space-3)",
                  }}>
                    <div className="eyebrow" style={{ color: "var(--text-secondary)", marginBottom: 4 }}>
                      Outside current top alerts
                    </div>
                    <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.5 }}>
                      Found in the scored dataset but not in the ranked alert set, so no risk
                      score, cluster, or explanation was persisted for it. Network metadata and
                      linked transactions below are real; the score fields are genuinely absent,
                      not zero.
                    </p>
                  </motion.div>
                )}

                <motion.div variants={section}>
                  <SectionTitle>Entity</SectionTitle>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <Field label="Node Type" value={data.alert.node_type} />
                    <Field label="Label" value={data.alert.label} />
                    <Field label="Cluster" value={data.alert.cluster_id} />
                    <Field
                      label="Risk Score"
                      value={typeof data.alert.risk_score === "number" ? <RiskPill score={data.alert.risk_score} /> : "-"}
                    />
                    <Field
                      label="Classifier Confidence"
                      value={typeof data.alert.classifier_confidence === "number" ? data.alert.classifier_confidence.toFixed(3) : "-"}
                    />
                    <Field
                      label="Anomaly Score"
                      value={typeof data.alert.anomaly_score === "number" ? data.alert.anomaly_score.toFixed(3) : "-"}
                    />
                  </div>
                </motion.div>

                <motion.div variants={section}>
                  <SectionTitle>Why Flagged</SectionTitle>
                  <p style={{ fontSize: "var(--text-caption)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {data.alert.reason || "-"}
                  </p>
                </motion.div>

                <motion.div variants={section}>
                  <SectionTitle>Intent Intelligence</SectionTitle>
                  {data.alert.intent_label ? (
                    <>
                      <p style={{ fontSize: "var(--text-body-sm)", color: "var(--text-primary)", marginBottom: "0.3rem" }}>
                        {data.alert.intent_label}
                        {typeof data.alert.intent_confidence === "number" && (
                          <span style={{ color: "var(--text-muted)" }}> (confidence {data.alert.intent_confidence.toFixed(2)})</span>
                        )}
                      </p>
                      <p style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)", fontStyle: "italic" }}>
                        Rule-based structural pattern match — not a trained crime-type classifier.
                      </p>
                    </>
                  ) : (
                    <p style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>-</p>
                  )}
                </motion.div>

                <motion.div variants={section}>
                  <SectionTitle>Geo-Temporal Intelligence</SectionTitle>
                  {data.alert.geo_temporal_flag ? (
                    <motion.div
                      // One-time attention pulse on a USP moment, then it settles. Finite
                      // keyframes (no repeat), and box-shadow/opacity only -- never a
                      // layout property.
                      initial={{ opacity: 0, boxShadow: "0 0 0 0 rgba(217,154,78,0)" }}
                      animate={{
                        opacity: 1,
                        boxShadow: [
                          "0 0 0 0 rgba(217,154,78,0)",
                          "0 0 0 6px rgba(217,154,78,0.32)",
                          "0 0 0 0 rgba(217,154,78,0)",
                        ],
                      }}
                      transition={{
                        opacity: { duration: motionTokens.duration.fast, ease: motionTokens.easing.sharp },
                        boxShadow: reduceMotion
                          ? { duration: 0 }
                          : { duration: motionTokens.duration.slow, ease: motionTokens.easing.smooth, delay: motionTokens.duration.fast },
                      }}
                      style={{
                        background: "var(--signal-tint)", boxShadow: "var(--signal-line) 0px 0px 0px 1px inset",
                        borderRadius: "var(--radius-badges)", padding: "var(--spacing-12)",
                      }}
                    >
                      <div style={{ color: "var(--signal)", fontWeight: "var(--weight-semi)", fontSize: "var(--text-caption)", marginBottom: "var(--spacing-8)" }}>
                        GEO-TEMPORAL MISMATCH
                      </div>
                      <p style={{ fontSize: "var(--text-caption)", color: "var(--text-secondary)" }}>
                        {data.alert.geo_temporal_reason || "-"}
                      </p>
                    </motion.div>
                  ) : (
                    <p style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>-</p>
                  )}
                </motion.div>

                <motion.div variants={section}>
                  <SectionTitle>Linked Blockchain Transactions</SectionTitle>
                  {data.linked_transactions.length === 0 ? (
                    <p style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>No linked transactions found.</p>
                  ) : (
                    <div style={{ fontSize: "var(--text-caption)" }}>
                      {data.linked_transactions.map((tx, i) => (
                        <div key={tx.txid ?? i} style={{
                          padding: "0.5rem 0", borderBottom: "1px solid var(--border-color)",
                          fontFamily: "var(--font-mono)", color: "var(--text-secondary)",
                        }}>
                          {tx.txid ?? "-"}
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>

                <motion.div variants={section}>
                  <SectionTitle>Custody Agency</SectionTitle>
                  {!aplData?.found ? (
                    <p style={{ fontSize: "var(--text-caption)", color: "var(--color-ash)" }}>
                      Not present in the Elliptic++ address-transaction edge lists.
                    </p>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--spacing-12)", marginBottom: "var(--spacing-8)" }}>
                        <span className="mono" style={{
                          fontSize: "var(--text-subheading)", lineHeight: "var(--leading-subheading)",
                          letterSpacing: "var(--tracking-subheading)", fontWeight: "var(--weight-medium)",
                          color: aplData.alpha === 0 ? "var(--color-pulse-green)" : "var(--color-bone)",
                        }}>
                          &alpha; = {aplData.alpha.toFixed(2)}
                        </span>
                        {aplData.alpha === 0 && (
                          <span className="badge mono" style={{
                            color: "var(--color-pulse-green)", background: "var(--risk-low-tint)",
                            boxShadow: "var(--risk-low-line) 0px 0px 0px 1px inset",
                          }}>
                            ZERO CUSTODY AGENCY
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: "var(--text-caption)", color: "var(--color-fog)", lineHeight: 1.6 }}>
                        {aplData.evidence_reason}
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-8)", marginTop: "var(--spacing-12)" }}>
                        {[
                          ["spent", aplData.has_spent],
                          ["spent after exposure", aplData.spend_after_exposure],
                          ["commingled", aplData.commingled],
                          ["repeat counterparty", aplData.repeat_counterparty],
                        ].map(([label, on]) => (
                          <span key={label} className="badge" style={{
                            color: on ? "var(--color-mist)" : "var(--color-ash)",
                            background: "rgba(255,255,255,0.02)",
                            boxShadow: "var(--color-graphite) 0px 0px 0px 1px inset",
                          }}>
                            {on ? "yes" : "no"} &middot; {label}
                          </span>
                        ))}
                        <span className="badge mono" style={{
                          color: "var(--color-ash)", background: "rgba(255,255,255,0.02)",
                          boxShadow: "var(--color-graphite) 0px 0px 0px 1px inset",
                        }}>
                          {aplData.n_taint_links} tainted links
                        </span>
                      </div>
                      <p style={{ fontSize: "var(--text-caption)", color: "var(--color-ash)", lineHeight: 1.5, marginTop: "var(--spacing-12)" }}>
                        Agency describes this address's recorded spend authority in the Elliptic++
                        address-transaction structure, not a live UTXO ledger and not a finding about
                        a real-world person. It routes the alert; it does not clear it.
                      </p>
                    </>
                  )}
                </motion.div>

                <motion.div variants={section}>
                  <SectionTitle>💥 Kick Down Doors — Local Disruption Analysis</SectionTitle>
                  {kddLoading && <p style={{ color: "var(--text-muted)", fontSize: "var(--text-caption)" }}>Analyzing local neighborhood…</p>}

                  {kddError && (
                    <div style={{ color: "var(--warning)", fontSize: "var(--text-caption)" }}>
                      Kick Down Doors analysis unavailable: {kddError}
                    </div>
                  )}

                  {kddData && (
                    kddData.results.length === 0 ? (
                      <p style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>
                        No structural articulation points found in this entity's immediate neighborhood.
                      </p>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", fontSize: "var(--text-caption)", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                              <th style={{ padding: "0.3rem 0.4rem 0.3rem 0", fontWeight: 500 }}>Node</th>
                              <th style={{ padding: "0.3rem 0.4rem", fontWeight: 500 }}>Type</th>
                              <th style={{ padding: "0.3rem 0.4rem", fontWeight: 500 }}>Impact</th>
                              <th style={{ padding: "0.3rem 0.4rem", fontWeight: 500 }}>Bridge?</th>
                            </tr>
                          </thead>
                          <tbody>
                            {kddData.results.map((n, i) => (
                              <motion.tr
                                key={n.node_id}
                                initial={{ opacity: 0, y: reduceMotion ? 0 : motionTokens.distance.sm }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                  duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal,
                                  ease: motionTokens.easing.smooth,
                                  delay: i * 0.04,
                                }}
                                style={{ borderTop: "1px solid var(--border-color)" }}
                              >
                                <td style={{ padding: "0.4rem 0.4rem 0.4rem 0", fontFamily: "var(--font-mono)", color: "var(--text-primary)", wordBreak: "break-all" }}>
                                  {n.node_id}
                                </td>
                                <td style={{ padding: "0.4rem", color: "var(--text-secondary)" }}>{n.node_type}</td>
                                <td style={{ padding: "0.4rem", color: "var(--text-secondary)" }}>{n.impact_score.toFixed(3)}</td>
                                <td style={{ padding: "0.4rem" }}>
                                  {n.is_articulation_point ? (
                                    <span style={{ color: "var(--signal)", fontWeight: "var(--weight-semi)" }}>Yes</span>
                                  ) : (
                                    <span style={{ color: "var(--text-muted)" }}>No</span>
                                  )}
                                </td>
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                        <p style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)", marginTop: "0.5rem", lineHeight: 1.4 }}>
                          {kddData.results[0]?.reason}
                        </p>
                      </div>
                    )
                  )}
                </motion.div>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
