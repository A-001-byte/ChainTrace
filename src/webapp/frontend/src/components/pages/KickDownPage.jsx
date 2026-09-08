import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useAlerts } from "../../hooks/useAlerts";
import { useKickDownDoors } from "../../hooks/useKickDownDoors";
import { clusterColor } from "../../lib/clusterColors";
import { motionTokens } from "../../lib/motionTokens";
import { Panel, RiskTag, Tag, Empty, Reveal, short } from "../ui";

export default function KickDownPage({ selected, onSelect }) {
  const rm = useReducedMotion();
  const { data: a, loading: al } = useAlerts();
  const [q, setQ] = useState("");
  const rows = useMemo(() => (Array.isArray(a?.rows) ? a.rows : []), [a]);
  const target = selected ?? rows[0]?.node_id ?? null;
  const { data, error, loading } = useKickDownDoors(target);
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (n ? rows.filter((r) => String(r.node_id).toLowerCase().includes(n)) : rows).slice(0, 60);
  }, [rows, q]);
  const trow = rows.find((r) => r.node_id === target);

  return (
    <div className="cols">
      <Reveal style={{ flex: "0 0 340px" }}>
        <Panel title="select entity" right={<input className="inp" placeholder="filter" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 120 }} />} flush>
          <div style={{ maxHeight: "72vh", overflowY: "auto" }}>
            {al ? <Empty>loading…</Empty> : (
              <table className="tbl">
                <tbody>
                  {matches.map((r) => (
                    <tr key={r.node_id} className={`row${r.node_id === target ? " sel" : ""}`} onClick={() => onSelect?.(r.node_id)}>
                      <td className="fg" title={r.node_id}>{short(r.node_id, 28)}</td>
                      <td style={{ color: clusterColor(r.cluster_id) }}>{r.cluster_id ?? "—"}</td>
                      <td className="r"><RiskTag score={r.risk_score} /></td>
                    </tr>
                  ))}
                  {matches.length === 0 && <tr><td className="mute">no match</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </Panel>
      </Reveal>

      <Reveal delay={0.05} style={{ flex: 1 }}>
        <Panel title="kick down doors" right={target ? <Tag t="md">LOCAL DISRUPTION ANALYSIS</Tag> : null} flush>
          {!target ? <Empty>select an entity</Empty> : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderBottom: "1px solid var(--rule)", fontSize: "var(--fs-sm)" }}>
                <span className="acc" style={{ overflowWrap: "anywhere" }}>{target}</span>
                {trow && typeof trow.risk_score === "number" && <RiskTag score={trow.risk_score} />}
              </div>
              <div className="prose" style={{ padding: "6px 8px", fontSize: "var(--fs-sm)" }}>
                Which nodes in this entity's own neighbourhood carry the money-flow — so an intervention can be aimed at the smallest set of points that actually breaks the path.
              </div>
              {loading && <Empty>analyzing local neighborhood…</Empty>}
              {error && <div className="note hi" style={{ padding: 8 }}>Kick Down Doors analysis unavailable: {error}</div>}
              {data && (data.results.length === 0 ? (
                <Empty>No structural articulation points found in this entity's immediate neighborhood.</Empty>
              ) : (
                <>
                  <table className="tbl">
                    <thead><tr><th>node</th><th>type</th><th className="r">impact</th><th className="r">betweenness</th><th>articulation</th></tr></thead>
                    <tbody>
                      {data.results.map((n, i) => (
                        <motion.tr key={n.node_id}
                          initial={{ opacity: 0, y: rm ? 0 : motionTokens.distance.sm }} animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: rm ? motionTokens.duration.fast : motionTokens.duration.normal, ease: motionTokens.easing.smooth, delay: rm ? 0 : i * 0.04 }}>
                          <td className="fg" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{n.node_id}</td>
                          <td>{n.node_type}</td>
                          <td className="r fg">{n.impact_score.toFixed(3)}</td>
                          <td className="r">{n.betweenness.toFixed(4)}</td>
                          <td>{n.is_articulation_point ? <span className="md">YES</span> : <span className="mute">no</span>}</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="note" style={{ padding: 8, borderTop: "1px solid var(--rule)" }}><span className="mute">top target rationale · </span>{data.results[0]?.reason}</div>
                </>
              ))}
            </>
          )}
        </Panel>
      </Reveal>
    </div>
  );
}
