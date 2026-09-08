import { useMemo, useState } from "react";
import { useAlerts } from "../../hooks/useAlerts";
import { useKickDownDoors } from "../../hooks/useKickDownDoors";
import { clusterColor } from "../../lib/clusterColors";
import { CHART_COLORS as C } from "../../lib/chartColors";
import { short, num, f3 } from "../../lib/format";
import { Card, Tile, Tiles, Section, RiskTag, Tag, Empty, Reveal } from "../ui";
import { HBars, Donut } from "../charts";

export default function KickDownPage({ selected, onSelect }) {
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
  const res = data?.results ?? [];
  const bridges = res.filter((n) => n.is_articulation_point).length;
  const impact = res.map((n) => ({ k: short(n.node_id, 16), n: n.impact_score, ap: n.is_articulation_point }));
  const btw = res.map((n) => ({ k: short(n.node_id, 16), n: n.betweenness }));

  return (
    <Section eyebrow="Kick Down Doors" right={<Tag>LOCAL DISRUPTION ANALYSIS</Tag>}>
      <div className="grid" style={{ gridTemplateColumns: "320px minmax(0, 1fr)" }}>
        <Reveal>
          <Card flush title="Entity" right={<input className="inp" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 120, height: 28 }} />}>
            <div style={{ maxHeight: "70vh", overflowY: "auto", marginTop: 12 }}>
              {al ? <Empty>Loading…</Empty> : (
                <table className="tbl"><tbody>
                  {matches.map((r) => (
                    <tr key={r.node_id} className={`row${r.node_id === target ? " sel" : ""}`} onClick={() => onSelect?.(r.node_id)}>
                      <td className="fg mono" title={r.node_id}>{short(r.node_id, 20)}</td>
                      <td className="mono" style={{ color: clusterColor(r.cluster_id) }}>{r.cluster_id ?? "—"}</td>
                      <td className="r"><RiskTag score={r.risk_score} /></td>
                    </tr>
                  ))}
                  {matches.length === 0 && <tr><td className="muted">No match</td></tr>}
                </tbody></table>
              )}
            </div>
          </Card>
        </Reveal>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
          {!target ? <Empty>Select an entity</Empty> : (
            <>
              <Reveal delay={0.03}>
                <Card light panel>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 24px 0" }}>
                    <span className="mono" style={{ fontSize: 12, overflowWrap: "anywhere" }}>{target}</span>
                    {trow && typeof trow.risk_score === "number" && <RiskTag score={trow.risk_score} />}
                  </div>
                  <div style={{ padding: 24 }}>
                    <Tiles>
                      <Tile k="Candidates" v={data ? num(res.length) : "…"} s="neighbourhood" />
                      <Tile k="Bridges" v={data ? num(bridges) : "…"} tone={bridges ? "orange" : undefined} s="articulation points" />
                      <Tile k="Impact" v={res[0] ? f3(res[0].impact_score) : "—"} s="top target" />
                      <Tile k="Betweenness" v={res[0] ? res[0].betweenness.toFixed(4) : "—"} s="top target" />
                    </Tiles>
                  </div>
                </Card>
              </Reveal>
              {loading && <Empty>Analyzing local neighborhood…</Empty>}
              {error && <Card><div className="note orange">Kick Down Doors analysis unavailable: {error}</div></Card>}
              {data && (res.length === 0 ? <Empty>No structural articulation points found in this entity's immediate neighborhood.</Empty> : (
                <>
                  <div className="grid g3">
                    <Reveal delay={0.06} className="span2"><Card title="Impact" right="orange = bridge"><HBars data={impact} name="impact" colorBy={(e) => (e.ap ? C.ORANGE : C.STONE)} fmt={(v) => Number(v).toFixed(3)} height={Math.max(160, res.length * 22)} /></Card></Reveal>
                    <Reveal delay={0.09}><Card title="Bridges" right="share"><Donut rows={res.map((n) => ({ b: n.is_articulation_point ? "bridge" : "not bridge" }))} field="b" colors={[C.ORANGE, C.GRAPHITE]} /></Card></Reveal>
                  </div>
                  <div className="grid g3">
                    <Reveal delay={0.12} className="span2">
                      <Card flush title="Targets">
                        <table className="tbl" style={{ marginTop: 12 }}>
                          <thead><tr><th>Node</th><th>Type</th><th className="r">Impact</th><th className="r">Betweenness</th><th>Bridge</th></tr></thead>
                          <tbody>{res.map((n) => (
                            <tr key={n.node_id}>
                              <td className="fg mono" style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{n.node_id}</td><td>{n.node_type}</td>
                              <td className="r fg mono">{n.impact_score.toFixed(3)}</td><td className="r mono">{n.betweenness.toFixed(4)}</td>
                              <td>{n.is_articulation_point ? <Tag t="hi">yes</Tag> : <span className="muted">no</span>}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </Card>
                    </Reveal>
                    <Reveal delay={0.15}><Card title="Betweenness"><HBars data={btw} name="betweenness" color={C.STONE} fmt={(v) => Number(v).toFixed(4)} height={Math.max(160, res.length * 22)} /></Card></Reveal>
                  </div>
                  <Reveal delay={0.18}><Card title="Rationale" right="top target"><div className="note">{res[0]?.reason}</div></Card></Reveal>
                </>
              ))}
            </>
          )}
        </div>
      </div>
    </Section>
  );
}
