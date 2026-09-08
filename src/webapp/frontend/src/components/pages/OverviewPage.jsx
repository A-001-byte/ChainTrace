import { useMemo } from "react";
import { useStats } from "../../hooks/useStats";
import { useAlerts } from "../../hooks/useAlerts";
import { useAplSummary } from "../../hooks/useAplSummary";
import { clusterColor } from "../../lib/clusterColors";
import { Panel, Stat, RiskTag, Tag, Empty, ErrorPanel, Reveal, num, short, pct } from "../ui";
import { RiskHistogram, ConfAnomScatter, ClusterBars, IntentDonut, GeoMismatchBars } from "../charts";

export default function OverviewPage({ onOpen, onNav }) {
  const { data: s, error, loading } = useStats();
  const { data: a } = useAlerts();
  const { data: apl } = useAplSummary();
  const rows = useMemo(() => (Array.isArray(a?.rows) ? a.rows : []), [a]);
  const top = useMemo(() => [...rows].sort((x, y) => (y.risk_score ?? 0) - (x.risk_score ?? 0)).slice(0, 10), [rows]);
  const geoFlagged = rows.filter((r) => r.geo_temporal_flag === true).length;
  const ov = apl?.headline_stats?.ranked_alerts_overlap;
  const ex = apl?.headline_stats?.exoneration_by_threshold?.find((r) => r.threshold === apl.headline_stats.default_threshold);

  if (loading) return <Empty>loading overview…</Empty>;
  if (error) return <ErrorPanel error={error} />;
  const tiers = s.risk_tier_counts;

  return (
    <>
      <Reveal>
        <Panel flush>
          <div className="statrow">
            <Stat k="entities flagged" v={<span className="acc">{num(s.total_flagged)}</span>} s={`${tiers.high} hi · ${tiers.medium} md · ${tiers.low} lo`} />
            <Stat k="high risk" v={<span className="hi">{num(tiers.high)}</span>} s={`risk_score ≥ ${s.risk_tier_thresholds.high}`} />
            <Stat k="avg risk" v={Number(s.avg_risk_score).toFixed(3)} s={`${s.flagged_avg_confidence_pct}% avg confidence`} />
            <Stat k="clusters" v={num(s.distinct_clusters)} s="Louvain, among flagged" />
            <Stat k="geo-temporal" v={<span className="md-c">{num(geoFlagged)}</span>} s="claimed country ≠ activity hours" />
            <Stat k="zero custody" v={<span className="lo">{ov ? `${ov.n_zero_agency}/${ov.n_wallet_alerts}` : "—"}</span>} s={ov ? `${ov.n_never_spent} never spent · α = 0` : "provenance not built"} />
            <Stat k="tx scanned" v={num(s.total_transactions)} size="md" s={`${num(s.node_type_breakdown?.wallet ?? 0)} wallets · ${num(s.node_type_breakdown?.tx ?? 0)} tx flagged`} />
          </div>
        </Panel>
      </Reveal>

      <div className="grid g3">
        <Reveal delay={0.04}><Panel title="risk score distribution" right="histogram · colour = tier"><RiskHistogram rows={rows} /></Panel></Reveal>
        <Reveal delay={0.08}><Panel title="confidence × anomaly" right="size = risk · click = open"><ConfAnomScatter rows={rows} onPick={onOpen} /></Panel></Reveal>
        <Reveal delay={0.12}><Panel title="intent archetypes" right="rule-based, categorical"><IntentDonut rows={rows} /></Panel></Reveal>
      </div>

      <div className="cols">
        <Reveal delay={0.16} style={{ flex: 3 }}>
          <Panel title="highest-risk entities" right={<button className="btn" onClick={() => onNav("alerts")}>all alerts</button>} flush>
            <table className="tbl">
              <thead><tr><th>#</th><th>node_id</th><th>type</th><th>cluster</th><th className="r">risk</th><th>intent</th><th>signals</th></tr></thead>
              <tbody>
                {top.map((r, i) => (
                  <tr key={r.node_id} className="row" onClick={() => onOpen(r.node_id)}>
                    <td className="mute">{i + 1}</td>
                    <td className="fg" title={r.node_id}>{short(r.node_id, 30)}</td>
                    <td>{r.node_type}</td>
                    <td style={{ color: clusterColor(r.cluster_id) }}>{r.cluster_id ?? "—"}</td>
                    <td className="r"><RiskTag score={r.risk_score} /></td>
                    <td className="trunc">{r.intent_label ? <Tag t="vi">{r.intent_label}</Tag> : "—"}</td>
                    <td>{r.geo_temporal_flag ? <Tag t="md">GEO</Tag> : <span className="mute">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </Reveal>
        <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
          <Reveal delay={0.2}><Panel title="cluster concentration" right="members per cluster"><ClusterBars rows={rows} /></Panel></Reveal>
          <Reveal delay={0.24}><Panel title="geo-temporal by claimed country" right={<button className="btn" onClick={() => onNav("geo")}>map</button>}><GeoMismatchBars rows={rows} /></Panel></Reveal>
        </div>
      </div>

      {ex && (
        <Reveal delay={0.28}>
          <Panel title="adversarial provenance — headline" right={<button className="btn" onClick={() => onNav("provenance")}>details</button>} flush>
            <div className="statrow">
              <Stat k="of haircut-flagged, zero custody agency" v={<span className="acc">{pct(ex.pct_zero_agency)}</span>} s={`${num(ex.n_zero_agency)} of ${num(ex.n_flagged_baseline)} at threshold ${apl.headline_stats.default_threshold}`} size="md" />
              <Stat k="never spent at all" v={pct(ex.pct_never_spent)} s={`${num(ex.n_never_spent)} never a transaction input — a set difference, not a model output`} size="md" />
              <Stat k="clusters median CFI" v={apl.headline_stats.fragility ? apl.headline_stats.fragility.cfi_median.toFixed(2) : "—"} s="share of an entity resting on single-witness merges" size="md" />
            </div>
          </Panel>
        </Reveal>
      )}
    </>
  );
}
