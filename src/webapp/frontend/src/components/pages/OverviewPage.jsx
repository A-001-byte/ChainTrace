import { useMemo } from "react";
import { useStats } from "../../hooks/useStats";
import { useAlerts } from "../../hooks/useAlerts";
import { clusterColor } from "../../lib/clusterColors";
import { Panel, Stat, Bar, RiskTag, Empty, ErrorPanel, Reveal, num, short } from "../ui";

export default function OverviewPage({ onOpen, onNav }) {
  const { data: s, error, loading } = useStats();
  const { data: a } = useAlerts();
  const rows = Array.isArray(a?.rows) ? a.rows : [];

  const top = useMemo(
    () => [...rows].sort((x, y) => (y.risk_score ?? 0) - (x.risk_score ?? 0)).slice(0, 12),
    [rows],
  );
  const clusters = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (r.cluster_id === null || r.cluster_id === undefined) continue;
      const c = m.get(r.cluster_id) ?? { id: r.cluster_id, n: 0, max: 0 };
      c.n += 1; c.max = Math.max(c.max, r.risk_score ?? 0); m.set(r.cluster_id, c);
    }
    return [...m.values()].sort((x, y) => y.n - x.n || y.max - x.max).slice(0, 10);
  }, [rows]);
  const geoFlagged = rows.filter((r) => r.geo_temporal_flag === true).length;

  if (loading) return <Empty>loading overview…</Empty>;
  if (error) return <ErrorPanel error={error} />;

  const tiers = s.risk_tier_counts;
  const tot = (tiers.high + tiers.medium + tiers.low) || 1;
  const maxC = clusters[0]?.n ?? 1;

  return (
    <>
      <Reveal>
        <Panel flush>
          <div className="statrow">
            <Stat k="flagged" v={num(s.total_flagged)} s={`${tiers.high} hi · ${tiers.medium} md · ${tiers.low} lo`} />
            <Stat k="high risk" v={num(tiers.high)} s={`risk_score ≥ ${s.risk_tier_thresholds.high}`} />
            <Stat k="wallets" v={num(s.node_type_breakdown?.wallet ?? 0)} />
            <Stat k="transactions" v={num(s.node_type_breakdown?.tx ?? 0)} />
            <Stat k="avg risk" v={Number(s.avg_risk_score).toFixed(3)} />
            <Stat k="geo-temporal" v={num(geoFlagged)} s="claimed country ≠ activity hours" />
            <Stat k="tx scanned" v={num(s.total_transactions)} size="md" s={`${s.distinct_clusters} clusters among flagged`} />
          </div>
        </Panel>
      </Reveal>

      <div className="cols">
        <Reveal delay={0.05} style={{ flex: 3 }}>
          <Panel title="highest-risk entities" right={<button className="btn" onClick={() => onNav("alerts")}>all alerts</button>} flush>
            <table className="tbl">
              <thead><tr><th>#</th><th>node_id</th><th>type</th><th>cluster</th><th className="r">risk</th><th>intent</th><th>geo</th></tr></thead>
              <tbody>
                {top.map((r, i) => (
                  <tr key={r.node_id} className="row" onClick={() => onOpen(r.node_id)}>
                    <td className="mute">{i + 1}</td>
                    <td className="fg" title={r.node_id}>{short(r.node_id, 30)}</td>
                    <td>{r.node_type}</td>
                    <td style={{ color: clusterColor(r.cluster_id) }}>{r.cluster_id ?? "—"}</td>
                    <td className="r"><RiskTag score={r.risk_score} /></td>
                    <td className="trunc">{r.intent_label ?? "—"}</td>
                    <td>{r.geo_temporal_flag ? <span className="md">MISMATCH</span> : <span className="mute">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </Reveal>

        <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
          <Reveal delay={0.1}>
            <Panel title="risk distribution" right={`${num(s.total_flagged)} flagged`}>
              {[["high", tiers.high, "var(--risk-hi)"], ["medium", tiers.medium, "var(--risk-md)"], ["low", tiers.low, "var(--risk-lo)"]].map(([k, n, c], i) => (
                <div key={k} style={{ display: "grid", gridTemplateColumns: "56px 1fr 44px 44px", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span className="mute" style={{ fontSize: "var(--fs-xs)" }}>{k}</span>
                  <Bar frac={n / tot} color={c} delay={i * 0.06} />
                  <span className="r fg" style={{ textAlign: "right" }}>{n}</span>
                  <span className="mute" style={{ textAlign: "right", fontSize: "var(--fs-xs)" }}>{((n / tot) * 100).toFixed(0)}%</span>
                </div>
              ))}
            </Panel>
          </Reveal>
          <Reveal delay={0.15}>
            <Panel title="cluster concentration" right={`${clusters.length} shown`}>
              {clusters.length === 0 ? <div className="note">no cluster assignments</div> : clusters.map((c, i) => (
                <div key={c.id} style={{ display: "grid", gridTemplateColumns: "48px 1fr 32px", gap: 8, alignItems: "center", marginBottom: 3 }}>
                  <span style={{ color: clusterColor(c.id), fontSize: "var(--fs-xs)" }}>c{c.id}</span>
                  <Bar frac={c.n / maxC} color={clusterColor(c.id)} delay={i * 0.04} />
                  <span className="dim" style={{ textAlign: "right", fontSize: "var(--fs-xs)" }}>{c.n}</span>
                </div>
              ))}
              <div className="note" style={{ marginTop: 6 }}>Louvain communities among flagged entities — concentration indicates coordinated rather than isolated activity.</div>
            </Panel>
          </Reveal>
        </div>
      </div>
    </>
  );
}
