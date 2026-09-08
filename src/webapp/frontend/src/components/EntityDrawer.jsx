import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEntity } from "../hooks/useEntity";
import { useKickDownDoors } from "../hooks/useKickDownDoors";
import { useAplAgency } from "../hooks/useAplAgency";
import { clusterColor } from "../lib/clusterColors";
import { motionTokens } from "../lib/motionTokens";
import { RiskTag, Tag, KV, num } from "./ui";

function Sec({ title, children }) {
  return <div className="sec"><div className="sh">{title}</div><div className="sb">{children}</div></div>;
}
const f3 = (v) => (typeof v === "number" ? v.toFixed(3) : "—");

export default function EntityDrawer({ nodeId, onClose, onGraph }) {
  const rm = useReducedMotion();
  const { data, error, loading } = useEntity(nodeId);
  const { data: kdd, error: kddErr, loading: kddL } = useKickDownDoors(nodeId);
  const { data: apl } = useAplAgency(nodeId);
  const a = data?.alert;

  return (
    <AnimatePresence mode="wait">
      {nodeId && (
        <motion.div key="ov" className="overlay" onClick={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: motionTokens.duration.fast, ease: motionTokens.easing.sharp }}>
          <motion.aside className="drawer" onClick={(e) => e.stopPropagation()}
            initial={{ x: rm ? 0 : "100%", opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: rm ? 0 : "100%", opacity: 0 }}
            transition={{ duration: rm ? motionTokens.duration.fast : motionTokens.duration.normal, ease: motionTokens.easing.smooth }}>
            <div className="dh">
              <span className="id" title={nodeId}>{nodeId}</span>
              {a && typeof a.risk_score === "number" && <RiskTag score={a.risk_score} />}
              {onGraph && <button className="btn" onClick={() => onGraph(nodeId)}>graph</button>}
              <button className="btn" onClick={onClose}>esc</button>
            </div>
            <div className="db">
              {loading && <div className="empty">loading entity…</div>}
              {error && <div className="note hi" style={{ padding: 10 }}>Could not load this entity: {error}</div>}
              {data && (
                <>
                  {data.in_top_alerts === false && (
                    <Sec title="outside current top alerts">
                      <div className="note">Found in the scored dataset but not in the ranked alert set, so no risk score, cluster, or explanation was persisted for it. Network metadata and linked transactions below are real; the score fields are genuinely absent, not zero.</div>
                    </Sec>
                  )}
                  <Sec title="entity">
                    <KV rows={[
                      ["type", a.node_type], ["label", a.label],
                      ["cluster", a.cluster_id !== null && a.cluster_id !== undefined ? <span style={{ color: clusterColor(a.cluster_id) }}>c{a.cluster_id}</span> : "—"],
                      ["risk_score", typeof a.risk_score === "number" ? <RiskTag score={a.risk_score} /> : "—"],
                      ["classifier_confidence", f3(a.classifier_confidence)], ["anomaly_score", f3(a.anomaly_score)],
                      ["geo_country / asn", `${a.geo_country ?? "—"} / ${a.asn ?? "—"}`],
                    ]} />
                  </Sec>
                  <Sec title="why flagged"><div className="note" style={{ color: "var(--fg-dim)" }}>{a.reason || "—"}</div></Sec>
                  <Sec title="intent intelligence">
                    {a.intent_label ? (
                      <>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <Tag t="vi">{a.intent_label}</Tag>
                          {typeof a.intent_confidence === "number" && <span className="mute">confidence {a.intent_confidence.toFixed(2)}</span>}
                        </div>
                        <div className="note" style={{ marginTop: 4, fontStyle: "italic" }}>Rule-based structural pattern match — not a trained crime-type classifier.</div>
                        {a.intent_explanation && <div className="note" style={{ marginTop: 4 }}>{a.intent_explanation}</div>}
                      </>
                    ) : <span className="mute">—</span>}
                  </Sec>
                  <Sec title="geo-temporal intelligence">
                    {a.geo_temporal_flag ? (
                      <motion.div
                        initial={{ opacity: 0, boxShadow: "0 0 0 0 rgba(240,160,48,0)" }}
                        animate={{ opacity: 1, boxShadow: ["0 0 0 0 rgba(240,160,48,0)", "0 0 0 5px rgba(240,160,48,0.3)", "0 0 0 0 rgba(240,160,48,0)"] }}
                        transition={{ opacity: { duration: motionTokens.duration.fast }, boxShadow: rm ? { duration: 0 } : { duration: motionTokens.duration.slow, ease: motionTokens.easing.smooth, delay: motionTokens.duration.fast } }}
                        style={{ border: "1px solid var(--risk-md)", background: "var(--risk-md-dim)", padding: 6 }}>
                        <div className="md" style={{ fontSize: "var(--fs-xs)", letterSpacing: ".1em" }}>GEO-TEMPORAL MISMATCH</div>
                        <div className="note" style={{ color: "var(--fg-dim)", marginTop: 2 }}>{a.geo_temporal_reason || "—"}</div>
                      </motion.div>
                    ) : <span className="mute">—</span>}
                  </Sec>
                  <Sec title="custody agency">
                    {!apl?.found ? <span className="mute">Not present in the Elliptic++ address-transaction edge lists.</span> : (
                      <>
                        <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                          <span style={{ fontSize: "var(--fs-xl)", color: apl.alpha === 0 ? "var(--risk-lo)" : "var(--fg)" }}>α = {apl.alpha.toFixed(2)}</span>
                          {apl.alpha === 0 && <Tag t="lo">ZERO CUSTODY AGENCY</Tag>}
                          {apl.queue === "CONTESTED_EVIDENCE" && <Tag t="md">CONTESTED EVIDENCE</Tag>}
                        </div>
                        <div className="note" style={{ color: "var(--fg-dim)", marginTop: 4 }}>{apl.evidence_reason}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                          {[["spent", apl.has_spent], ["spent after exposure", apl.spend_after_exposure], ["commingled", apl.commingled], ["repeat counterparty", apl.repeat_counterparty]].map(([l, on]) => (
                            <Tag key={l} t={on ? "acc" : ""}>{on ? "yes" : "no"} · {l}</Tag>
                          ))}
                          <Tag>{apl.n_taint_links} tainted links</Tag>
                        </div>
                        {apl.module_b_available && apl.risk_baseline !== null && (
                          <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid var(--rule)" }}>
                            <div className="mute" style={{ fontSize: "var(--fs-xs)", letterSpacing: ".08em", textTransform: "uppercase" }}>evidence interval</div>
                            <div style={{ fontSize: "var(--fs-lg)", color: "var(--fg)" }}>{apl.risk_cwt_ablated.toFixed(2)} – {apl.risk_baseline.toFixed(2)}</div>
                            <KV rows={[["fragile merges removed", f3(apl.risk_cwt_ablated)], ["custody-weighted", f3(apl.risk_cwt)], ["industry haircut", f3(apl.risk_baseline)]]} />
                            <div className="note" style={{ marginTop: 4 }}>
                              {apl.cluster_id !== null
                                ? <>Co-spend cluster {apl.cluster_id} holds {apl.cluster_size} addresses; fragility {apl.cluster_cfi_status === "OK" ? `CFI ${apl.cluster_cfi.toFixed(2)}` : apl.cluster_cfi_status === "TRIVIAL" ? "trivial (under 3 addresses)" : "not computed"}.</>
                                : <>No co-spend cluster: the multi-input heuristic can only cluster addresses that have spent, and this one never has.</>}
                            </div>
                          </div>
                        )}
                        <div className="note" style={{ marginTop: 6 }}>Agency describes this address's recorded spend authority in the Elliptic++ address-transaction structure, not a live UTXO ledger and not a finding about a real-world person. It routes the alert; it does not clear it.</div>
                      </>
                    )}
                  </Sec>
                  <Sec title="linked blockchain transactions">
                    {data.linked_transactions.length === 0 ? <span className="mute">No linked transactions found.</span> : (
                      <table className="tbl"><tbody>{data.linked_transactions.map((t, i) => (
                        <tr key={t.txid ?? i}><td className="fg">{t.txid ?? "—"}</td><td className="mute">{t.timestamp ?? ""}</td><td className="mute">{t.geo_country ?? ""}</td></tr>
                      ))}</tbody></table>
                    )}
                  </Sec>
                  <Sec title={<span>kick down doors <Tag t="md">LOCAL DISRUPTION ANALYSIS</Tag></span>}>
                    {kddL && <span className="mute">Analyzing local neighborhood…</span>}
                    {kddErr && <div className="note hi">Kick Down Doors analysis unavailable: {kddErr}</div>}
                    {kdd && (kdd.results.length === 0 ? <span className="mute">No structural articulation points found in this entity's immediate neighborhood.</span> : (
                      <>
                        <table className="tbl">
                          <thead><tr><th>node</th><th>type</th><th className="r">impact</th><th>bridge</th></tr></thead>
                          <tbody>{kdd.results.map((n) => (
                            <tr key={n.node_id}><td className="fg trunc" style={{ maxWidth: 220 }} title={n.node_id}>{n.node_id}</td><td>{n.node_type}</td><td className="r">{n.impact_score.toFixed(3)}</td><td>{n.is_articulation_point ? <span className="md">YES</span> : <span className="mute">no</span>}</td></tr>
                          ))}</tbody>
                        </table>
                        <div className="note" style={{ marginTop: 4 }}>{kdd.results[0]?.reason}</div>
                      </>
                    ))}
                  </Sec>
                </>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
