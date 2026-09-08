import { useMemo, useState } from "react";
import { useAlerts } from "../../hooks/useAlerts";
import { useKickDownDoors } from "../../hooks/useKickDownDoors";
import { riskColor } from "../../lib/chartColors";
import { short, num, f3 } from "../../lib/format";
import { Card, Stat, Stats, PageHead, Section, Risk, Bar, Tag, Scroll, Empty, Reveal } from "../ui";

export default function KickDownPage({ selected, onSelect }) {
  const { data: a, loading: al } = useAlerts();
  const [q, setQ] = useState("");
  const rows = useMemo(() => (Array.isArray(a?.rows) ? a.rows : []), [a]);
  const target = selected ?? rows[0]?.node_id ?? null;
  const { data, error, loading } = useKickDownDoors(target);
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (n ? rows.filter((r) => String(r.node_id).toLowerCase().includes(n)) : rows).slice(0, 80);
  }, [rows, q]);

  const res = data?.results ?? [];
  const peak = res.length ? Math.max(...res.map((n) => n.impact_score)) : 1;
  const bridges = res.filter((n) => n.is_articulation_point).length;

  return (
    <>
      <Reveal>
        <PageHead
          title="Kick Down Doors"
          sub="Which nodes in an entity's own neighbourhood carry the money flow — so an intervention can be aimed at the smallest set of points that actually breaks the path."
          right={<Tag t="on">LOCAL DISRUPTION ANALYSIS</Tag>}
        />
      </Reveal>

      <div className="grid split">
        <Reveal delay={0.04}>
          <Card flush title="Select an entity">
            <div style={{ padding: "0 24px 16px" }}>
              <input className="inp sm" placeholder="Filter by id" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%" }} />
            </div>
            <Scroll max={520}>
              {al ? <Empty>Loading…</Empty> : (
                <table className="tbl">
                  <tbody>
                    {matches.map((r) => (
                      <tr key={r.node_id} className={`row${r.node_id === target ? " sel" : ""}`} onClick={() => onSelect?.(r.node_id)}>
                        <td className="mono" title={r.node_id}>{short(r.node_id, 22)}</td>
                        <td className="r"><Risk score={r.risk_score} /></td>
                      </tr>
                    ))}
                    {matches.length === 0 && <tr><td className="sec">No match</td></tr>}
                  </tbody>
                </table>
              )}
            </Scroll>
          </Card>
        </Reveal>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
          {!target ? <Empty>Select an entity to analyse.</Empty> : loading ? <Empty>Analysing local neighbourhood…</Empty> : error ? (
            <Card title="Unavailable"><p className="note">Kick Down Doors analysis unavailable: {error}</p></Card>
          ) : res.length === 0 ? (
            <Card><p className="note">No structural articulation points found in this entity&apos;s immediate neighborhood.</p></Card>
          ) : (
            <>
              <Reveal delay={0.08}>
                <Card band>
                  <p className="mono meta" style={{ overflowWrap: "anywhere", marginBottom: 20 }}>{target}</p>
                  <Stats sm>
                    <Stat k="Candidates" v={num(res.length)} s="nodes in the neighbourhood" />
                    <Stat k="Bridges" v={num(bridges)} t={bridges ? "down" : undefined} s="articulation points" />
                    <Stat k="Impact" v={f3(res[0].impact_score)} s="best single target" />
                  </Stats>
                </Card>
              </Reveal>

              <Reveal delay={0.12}>
                <Card flush title="Targets, by disruption impact">
                  <table className="tbl">
                    <thead><tr><th>Node</th><th>Type</th><th>Bridge</th><th className="r">Impact</th></tr></thead>
                    <tbody>{res.map((n) => (
                      <tr key={n.node_id}>
                        <td className="mono trunc" title={n.node_id}>{short(n.node_id, 24)}</td>
                        <td className="sec">{n.node_type}</td>
                        <td>{n.is_articulation_point ? <Tag t="hi">Yes</Tag> : <span className="dim">No</span>}</td>
                        <td className="r">
                          <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }}>
                            <Bar frac={n.impact_score / peak} color={n.is_articulation_point ? riskColor(0.9) : "var(--violet)"} />
                            <span className="num">{n.impact_score.toFixed(3)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </Card>
              </Reveal>

              <Reveal delay={0.16}>
                <Section title="Why this target">
                  <Card><p className="note">{res[0]?.reason}</p></Card>
                </Section>
              </Reveal>
            </>
          )}
        </div>
      </div>
    </>
  );
}
