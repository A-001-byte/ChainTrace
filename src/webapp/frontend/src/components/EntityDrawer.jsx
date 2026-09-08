import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEntity } from "../hooks/useEntity";
import { useKickDownDoors } from "../hooks/useKickDownDoors";
import { useAplAgency } from "../hooks/useAplAgency";
import { clusterColor } from "../lib/clusterColors";
import { num, f3 } from "../lib/format";
import { RiskTag, Tag, KV, Tile, Tiles } from "./ui";

const EASE = [0.4, 0, 0.2, 1];

function Sec({ title, children }) {
  return <div className="sec"><div className="sh eyebrow">{title}</div><div className="sb">{children}</div></div>;
}

export default function EntityDrawer({ nodeId, onClose, onGraph }) {
  const rm = useReducedMotion();
  const { data, error, loading } = useEntity(nodeId);
  const { data: kdd, error: kddErr, loading: kddL } = useKickDownDoors(nodeId);
  const { data: apl } = useAplAgency(nodeId);
  const a = data?.alert;

  return (
    <AnimatePresence mode="wait">
      {nodeId && (
        <motion.div key="ov" className="overlay" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15, ease: EASE }}>
          <motion.aside className="drawer" onClick={(e) => e.stopPropagation()}
            initial={{ x: rm ? 0 : 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: rm ? 0 : 24, opacity: 0 }}
            transition={{ duration: rm ? 0 : 0.2, ease: EASE }}>
            <div className="dh">
              <span className="id" title={nodeId}>{nodeId}</span>
              {a && typeof a.risk_score === "number" && <RiskTag score={a.risk_score} />}
              {onGraph && <button className="btn sm" onClick={() => onGraph(nodeId)}>Graph</button>}
              <button className="btn sm" onClick={onClose}>Esc</button>
            </div>
            <div className="db">
              {loading && <div className="empty">Loading entity…</div>}
              {error && <div className="note orange" style={{ paddingTop: 24 }}>Could not load this entity: {error}</div>}
              {data && (
                <>
                  {data.in_top_alerts === false && (
                    <Sec title="Outside current top alerts"><div className="note">Found in the scored dataset but not in the ranked alert set — no risk score, cluster, or explanation was persisted. Score fields are genuinely absent, not zero.</div></Sec>
                  )}
                  <Sec title="Scores">
                    <Tiles>
                      <Tile k="Risk" v={f3(a.risk_score)} tone={typeof a.risk_score === "number" ? (a.risk_score >= 0.6 ? "orange" : a.risk_score < 0.4 ? "green" : undefined) : undefined} />
                      <Tile k="Confidence" v={f3(a.classifier_confidence)} s="classifier" />
                      <Tile k="Anomaly" v={f3(a.anomaly_score)} />
                    </Tiles>
                  </Sec>
                  <Sec title="Entity">
                    <KV rows={[
                      ["type", a.node_type], ["label", a.label],
                      ["cluster", a.cluster_id !== null && a.cluster_id !== undefined ? <span className="mono" style={{ color: clusterColor(a.cluster_id) }}>c{a.cluster_id}</span> : "—"],
                      ["geo / asn", `${a.geo_country ?? "—"} / ${a.asn ?? "—"}`],
                      ["reason", a.reason || "—"],
                    ]} />
                  </Sec>
                  <Sec title="Intent">
                    {a.intent_label ? (
                      <>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}><Tag>{a.intent_label}</Tag>{typeof a.intent_confidence === "number" && <span className="eyebrow">confidence {a.intent_confidence.toFixed(2)}</span>}</div>
                        <div className="note" style={{ marginTop: 10 }}>Rule-based structural pattern match — not a trained crime-type classifier.</div>
                        {a.intent_explanation && <div className="note" style={{ marginTop: 6 }}>{a.intent_explanation}</div>}
                      </>
                    ) : <span className="muted">—</span>}
                  </Sec>
                  <Sec title="Geo-temporal">
                    {a.geo_temporal_flag ? (
                      <div style={{ borderLeft: "2px solid var(--orange)", paddingLeft: 12 }}>
                        <Tag t="hi">mismatch</Tag>
                        <div className="note" style={{ marginTop: 8, color: "var(--stone)" }}>{a.geo_temporal_reason || "—"}</div>
                      </div>
                    ) : <span className="muted">—</span>}
                  </Sec>
                  <Sec title="Custody agency">
                    {!apl?.found ? <span className="muted">Not present in the Elliptic++ address-transaction edge lists.</span> : (
                      <>
                        <Tiles>
                          <Tile k="Alpha" v={apl.alpha.toFixed(2)} tone={apl.alpha === 0 ? "green" : undefined} s={apl.alpha === 0 ? "zero custody agency" : "spend authority"} />
                          <Tile k="Links" v={num(apl.n_taint_links)} s="tainted" />
                          {apl.module_b_available && apl.risk_baseline !== null && <Tile k="Interval" v={`${apl.risk_cwt_ablated.toFixed(2)}–${apl.risk_baseline.toFixed(2)}`} s="evidence" />}
                        </Tiles>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                          {apl.queue === "CONTESTED_EVIDENCE" && <Tag t="hi">contested evidence</Tag>}
                          {[["spent", apl.has_spent], ["spent after exposure", apl.spend_after_exposure], ["commingled", apl.commingled], ["repeat counterparty", apl.repeat_counterparty]].map(([l, on]) => <Tag key={l} t={on ? "on" : ""}>{on ? "yes" : "no"} · {l}</Tag>)}
                        </div>
                        <div className="note" style={{ marginTop: 12, color: "var(--stone)" }}>{apl.evidence_reason}</div>
                        {apl.module_b_available && apl.risk_baseline !== null && (
                          <div style={{ marginTop: 16 }}>
                            <KV rows={[["ablated", f3(apl.risk_cwt_ablated)], ["custody-weighted", f3(apl.risk_cwt)], ["haircut", f3(apl.risk_baseline)]]} />
                            <div className="note" style={{ marginTop: 10 }}>
                              {apl.cluster_id !== null
                                ? <>Co-spend cluster {apl.cluster_id} holds {apl.cluster_size} addresses; fragility {apl.cluster_cfi_status === "OK" ? `CFI ${apl.cluster_cfi.toFixed(2)}` : apl.cluster_cfi_status === "TRIVIAL" ? "trivial (under 3 addresses)" : "not computed"}.</>
                                : <>No co-spend cluster: the multi-input heuristic can only cluster addresses that have spent, and this one never has.</>}
                            </div>
                          </div>
                        )}
                        <div className="note" style={{ marginTop: 12 }}>Recorded spend authority in the Elliptic++ structure, not a live UTXO ledger and not a finding about a real-world person. It routes the alert; it does not clear it.</div>
                      </>
                    )}
                  </Sec>
                  <Sec title="Linked transactions">
                    {data.linked_transactions.length === 0 ? <span className="muted">No linked transactions found.</span> : (
                      <table className="tbl"><tbody>{data.linked_transactions.map((t, i) => (
                        <tr key={t.txid ?? i}><td className="fg mono trunc" title={t.txid}>{t.txid ?? "—"}</td><td className="mono">{t.timestamp ?? ""}</td><td>{t.geo_country ?? ""}</td></tr>
                      ))}</tbody></table>
                    )}
                  </Sec>
                  <Sec title={<span>Kick Down Doors <Tag>LOCAL DISRUPTION ANALYSIS</Tag></span>}>
                    {kddL && <span className="muted">Analyzing local neighborhood…</span>}
                    {kddErr && <div className="note orange">Kick Down Doors analysis unavailable: {kddErr}</div>}
                    {kdd && (kdd.results.length === 0 ? <span className="muted">No structural articulation points found in this entity's immediate neighborhood.</span> : (
                      <>
                        <table className="tbl">
                          <thead><tr><th>Node</th><th>Type</th><th className="r">Impact</th><th>Bridge</th></tr></thead>
                          <tbody>{kdd.results.map((n) => (
                            <tr key={n.node_id}><td className="fg mono trunc" style={{ maxWidth: 200 }} title={n.node_id}>{n.node_id}</td><td>{n.node_type}</td><td className="r mono">{n.impact_score.toFixed(3)}</td><td>{n.is_articulation_point ? <Tag t="hi">yes</Tag> : <span className="muted">no</span>}</td></tr>
                          ))}</tbody>
                        </table>
                        <div className="note" style={{ marginTop: 10 }}>{kdd.results[0]?.reason}</div>
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
