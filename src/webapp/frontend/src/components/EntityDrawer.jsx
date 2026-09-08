import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEntity } from "../hooks/useEntity";
import { useKickDownDoors } from "../hooks/useKickDownDoors";
import { useAplAgency } from "../hooks/useAplAgency";
import { clusterColor } from "../lib/clusterColors";
import { num, f3, short } from "../lib/format";
import { Risk, Tag, KV, Stat, Stats } from "./ui";

const EASE = [0.4, 0, 0.2, 1];

function Sec({ title, children }) {
  return <div className="sec"><div className="sh">{title}</div>{children}</div>;
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
        <motion.div key="ov" className="overlay" onClick={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15, ease: EASE }}>
          <motion.aside className="drawer" onClick={(e) => e.stopPropagation()}
            initial={{ x: rm ? 0 : 32, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: rm ? 0 : 32, opacity: 0 }}
            transition={{ duration: rm ? 0 : 0.2, ease: EASE }}>
            <div className="dh">
              <span className="id" title={nodeId}>{nodeId}</span>
              {onGraph && <button className="btn sm" onClick={() => onGraph(nodeId)}>Graph</button>}
              <button className="btn sm" onClick={onClose}>Close</button>
            </div>
            <div className="db">
              {loading && <div className="empty">Loading entity…</div>}
              {error && <p className="note">Could not load this entity: {error}</p>}
              {data && (
                <>
                  {data.in_top_alerts === false && (
                    <Sec title="Outside the current top alerts">
                      <p className="note">Found in the scored dataset but not in the ranked alert set, so no risk score, cluster or
                        explanation was persisted for it. The network metadata and linked transactions below are real; the score
                        fields are genuinely absent, not zero.</p>
                    </Sec>
                  )}

                  <Stats sm>
                    <Stat k="Risk" v={<Risk score={a.risk_score} />} />
                    <Stat k="Confidence" v={f3(a.classifier_confidence)} />
                    <Stat k="Anomaly" v={f3(a.anomaly_score)} />
                  </Stats>

                  <Sec title="Entity">
                    <KV rows={[
                      ["Type", a.node_type],
                      ["Label", a.label],
                      ["Cluster", a.cluster_id !== null && a.cluster_id !== undefined ? <span className="num" style={{ color: clusterColor(a.cluster_id) }}>{a.cluster_id}</span> : "—"],
                      ["Geo / ASN", `${a.geo_country ?? "—"} / ${a.asn ?? "—"}`],
                    ]} />
                  </Sec>

                  <Sec title="Why it was flagged">
                    <p className="note">{a.reason || "—"}</p>
                  </Sec>

                  {a.intent_label && (
                    <Sec title="Intent">
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <Tag t="on">{a.intent_label}</Tag>
                        {typeof a.intent_confidence === "number" && <span className="meta">confidence {a.intent_confidence.toFixed(2)}</span>}
                      </div>
                      <p className="note">Rule-based structural pattern match — not a trained crime-type classifier.</p>
                      {a.intent_explanation && <p className="note">{a.intent_explanation}</p>}
                    </Sec>
                  )}

                  {a.geo_temporal_flag && (
                    <Sec title="Geo-temporal">
                      <Tag t="hi">Mismatch</Tag>
                      <p className="note">{a.geo_temporal_reason || "—"}</p>
                    </Sec>
                  )}

                  {apl?.found && (
                    <Sec title="Custody agency">
                      <Stats sm>
                        <Stat k="Alpha" v={apl.alpha.toFixed(2)} t={apl.alpha === 0 ? "up" : undefined} s={apl.alpha === 0 ? "zero custody agency" : "spend authority"} />
                        <Stat k="Links" v={num(apl.n_taint_links)} s="tainted" />
                        {apl.module_b_available && apl.risk_baseline !== null && (
                          <Stat k="Interval" v={`${apl.risk_cwt_ablated.toFixed(2)}–${apl.risk_baseline.toFixed(2)}`} s="evidence" />
                        )}
                      </Stats>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {apl.queue === "CONTESTED_EVIDENCE" && <Tag t="hi">Contested evidence</Tag>}
                        {[["Spent", apl.has_spent], ["Spent after exposure", apl.spend_after_exposure], ["Commingled", apl.commingled], ["Repeat counterparty", apl.repeat_counterparty]]
                          .map(([l, on]) => <Tag key={l} t={on ? "on" : ""}>{l}: {on ? "yes" : "no"}</Tag>)}
                      </div>
                      <p className="note">{apl.evidence_reason}</p>
                      <p className="note">
                        {apl.cluster_id !== null
                          ? <>Co-spend cluster {apl.cluster_id} holds {apl.cluster_size} addresses; fragility {apl.cluster_cfi_status === "OK" ? `CFI ${apl.cluster_cfi.toFixed(2)}` : apl.cluster_cfi_status === "TRIVIAL" ? "trivial (under 3 addresses)" : "not computed"}.</>
                          : <>No co-spend cluster: the multi-input heuristic can only cluster addresses that have spent, and this one never has.</>}
                        {" "}Agency describes recorded spend authority in the Elliptic++ structure, not a live UTXO ledger and not a
                        finding about a real-world person. It routes the alert; it does not clear it.
                      </p>
                    </Sec>
                  )}

                  <Sec title={<>Kick Down Doors — <span className="brand">LOCAL DISRUPTION ANALYSIS</span></>}>
                    {kddL && <p className="note">Analysing local neighborhood…</p>}
                    {kddErr && <p className="note">Kick Down Doors analysis unavailable: {kddErr}</p>}
                    {kdd && (kdd.results.length === 0 ? <p className="note">No structural articulation points found in this entity&apos;s immediate neighborhood.</p> : (
                      <>
                        <table className="tbl">
                          <thead><tr><th>Node</th><th>Bridge</th><th className="r">Impact</th></tr></thead>
                          <tbody>{kdd.results.map((n) => (
                            <tr key={n.node_id}>
                              <td className="mono trunc" style={{ maxWidth: 220 }} title={n.node_id}>{short(n.node_id, 20)}</td>
                              <td>{n.is_articulation_point ? <Tag t="hi">Yes</Tag> : <span className="dim">No</span>}</td>
                              <td className="r num">{n.impact_score.toFixed(3)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                        <p className="note">{kdd.results[0]?.reason}</p>
                      </>
                    ))}
                  </Sec>

                  {data.linked_transactions.length > 0 && (
                    <Sec title="Linked transactions">
                      <table className="tbl">
                        <tbody>{data.linked_transactions.map((t, i) => (
                          <tr key={t.txid ?? i}>
                            <td className="mono trunc" title={t.txid}>{short(t.txid, 24)}</td>
                            <td className="sec">{t.timestamp ?? ""}</td>
                            <td className="sec">{t.geo_country ?? ""}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </Sec>
                  )}
                </>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
