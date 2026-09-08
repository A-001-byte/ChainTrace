import { useMemo } from "react";
import { useStats } from "../../hooks/useStats";
import { useAlerts } from "../../hooks/useAlerts";
import { useAplSummary } from "../../hooks/useAplSummary";
import { clusterColor } from "../../lib/clusterColors";
import { CHART_COLORS as C } from "../../lib/chartColors";
import { num, short, pct } from "../../lib/format";
import { Card, Tile, Tiles, Section, RiskTag, Tag, Empty, ErrorCard, Reveal } from "../ui";
import { Histogram, XYScatter, CountBars, Donut, HBars } from "../charts";

export default function OverviewPage({ onOpen, onNav }) {
  const { data: s, error, loading } = useStats();
  const { data: a } = useAlerts();
  const { data: apl } = useAplSummary();
  const rows = useMemo(() => (Array.isArray(a?.rows) ? a.rows : []), [a]);
  const top = useMemo(() => [...rows].sort((x, y) => (y.risk_score ?? 0) - (x.risk_score ?? 0)).slice(0, 8), [rows]);
  const geo = rows.filter((r) => r.geo_temporal_flag === true).length;
  const ov = apl?.headline_stats?.ranked_alerts_overlap;
  const ex = apl?.headline_stats?.exoneration_by_threshold?.find((r) => r.threshold === apl.headline_stats.default_threshold);
  const clusterRows = useMemo(() => {
    const m = new Map();
    for (const r of rows) { if (r.cluster_id == null) continue; const e = m.get(r.cluster_id) ?? { k: `c${r.cluster_id}`, id: r.cluster_id, n: 0 }; e.n += 1; m.set(r.cluster_id, e); }
    return [...m.values()].sort((x, y) => y.n - x.n).slice(0, 8);
  }, [rows]);

  if (loading) return <Empty>Loading…</Empty>;
  if (error) return <ErrorCard error={error} />;
  const t = s.risk_tier_counts;

  return (
    <>
      <Section eyebrow="Live posture">
        <Reveal>
          <Card light panel>
            <Tiles>
              <Tile k="Flagged" v={num(s.total_flagged)} s={`${t.high} high · ${t.medium} medium · ${t.low} low`} />
              <Tile k="High" v={num(t.high)} tone="orange" s={`risk ≥ ${s.risk_tier_thresholds.high}`} />
              <Tile k="Average" v={Number(s.avg_risk_score).toFixed(3)} s="risk score" />
              <Tile k="Confidence" v={`${s.flagged_avg_confidence_pct}%`} s="classifier · flagged" />
              <Tile k="Clusters" v={num(s.distinct_clusters)} s="louvain · flagged" />
              <Tile k="Mismatches" v={num(geo)} tone="orange" s="geo-temporal" />
              <Tile k="Exonerated" v={ov ? `${ov.n_zero_agency}/${ov.n_wallet_alerts}` : "—"} tone="green" s={ov ? `${ov.n_never_spent} never spent` : "provenance not built"} />
              <Tile k="Scanned" v={num(s.total_transactions)} s="transactions" />
            </Tiles>
          </Card>
        </Reveal>
      </Section>

      <Section eyebrow="Distributions">
        <div className="grid g3">
          <Reveal delay={0.03}><Card title="Risk" right="score · colour = tier"><Histogram rows={rows} field="risk_score" name="entities" byRisk /></Card></Reveal>
          <Reveal delay={0.06}><Card title="Confidence × Anomaly" right="click a point"><XYScatter rows={rows} x="classifier_confidence" y="anomaly_score" z="risk_score" xName="confidence" yName="anomaly" xDomain={[0, 1]} yDomain={[0, 1]} onPick={onOpen} /></Card></Reveal>
          <Reveal delay={0.09}><Card title="Intent" right="rule-based · categorical"><Donut rows={rows} field="intent_label" /></Card></Reveal>
          <Reveal delay={0.12}><Card title="Clusters" right="members"><HBars data={clusterRows} name="members" colorBy={(e) => clusterColor(e.id)} /></Card></Reveal>
          <Reveal delay={0.15}><Card title="Hop depth" right="intent structure"><CountBars rows={rows} field="intent_hop_depth" name="entities" color={C.STONE} /></Card></Reveal>
          <Reveal delay={0.18}><Card title="Fan-in × Fan-out" right="size = risk"><XYScatter rows={rows} x="intent_fan_in" y="intent_fan_out" z="risk_score" xName="fan-in" yName="fan-out" onPick={onOpen} /></Card></Reveal>
        </div>
      </Section>

      <Section eyebrow="Signals">
        <div className="grid g3">
          <Reveal delay={0.03}><Card title="Geo-temporal" right="claimed country"><CountBars rows={rows} name="mismatches" color={C.ORANGE} map={(r) => (r.geo_temporal_flag === true ? (/^claims\s+([A-Z]{2})/.exec(String(r.geo_temporal_reason ?? ""))?.[1] ?? null) : null)} /></Card></Reveal>
          <Reveal delay={0.06}><Card title="Timing" right="intent pattern"><CountBars rows={rows} field="intent_timing_pattern" name="entities" color={C.STONE} /></Card></Reveal>
          <Reveal delay={0.09}><Card title="Label" right="known vs unknown"><Donut rows={rows} field="label" colors={[C.ORANGE, C.GREEN, C.GRANITE]} /></Card></Reveal>
        </div>
      </Section>

      <Section eyebrow="Highest risk" right={<button className="btn ghost" onClick={() => onNav("alerts")}>All alerts →</button>}>
        <Reveal>
          <Card flush>
            <table className="tbl">
              <thead><tr><th>#</th><th>Node</th><th>Type</th><th>Cluster</th><th className="r">Risk</th><th>Intent</th><th>Geo</th></tr></thead>
              <tbody>{top.map((r, i) => (
                <tr key={r.node_id} className="row" onClick={() => onOpen(r.node_id)}>
                  <td className="muted">{i + 1}</td><td className="fg mono" title={r.node_id}>{short(r.node_id, 30)}</td><td>{r.node_type}</td>
                  <td className="mono" style={{ color: clusterColor(r.cluster_id) }}>{r.cluster_id ?? "—"}</td><td className="r"><RiskTag score={r.risk_score} /></td>
                  <td className="trunc">{r.intent_label ?? "—"}</td><td>{r.geo_temporal_flag ? <Tag t="hi">mismatch</Tag> : <span className="muted">—</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        </Reveal>
      </Section>

      {ex && (
        <Section eyebrow="Adversarial provenance" right={<button className="btn ghost" onClick={() => onNav("provenance")}>Details →</button>}>
          <Reveal>
            <Card light panel>
              <Tiles>
                <Tile k="Exonerated" v={pct(ex.pct_zero_agency)} s={`${num(ex.n_zero_agency)} of ${num(ex.n_flagged_baseline)} haircut-flagged · α = 0`} />
                <Tile k="Unspent" v={pct(ex.pct_never_spent)} s={`${num(ex.n_never_spent)} never a transaction input`} />
                <Tile k="Fragility" v={apl.headline_stats.fragility ? apl.headline_stats.fragility.cfi_median.toFixed(2) : "—"} s="median CFI · clusters ≥ 3" />
                <Tile k="Contested" v={num(apl.headline_stats.fragility?.n_contested_evidence ?? 0)} s="routed, never suppressed" />
              </Tiles>
            </Card>
          </Reveal>
        </Section>
      )}
    </>
  );
}
