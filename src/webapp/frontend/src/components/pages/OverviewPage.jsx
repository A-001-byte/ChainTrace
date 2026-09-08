import { useMemo } from "react";
import { useStats } from "../../hooks/useStats";
import { useAlerts } from "../../hooks/useAlerts";
import { useAplSummary } from "../../hooks/useAplSummary";
import { clusterColor } from "../../lib/clusterColors";
import { riskColor } from "../../lib/chartColors";
import { num, short, pct, buckets } from "../../lib/format";
import { Card, Stat, Stats, Section, PageHead, Risk, Bar, Tag, Empty, ErrorCard, Reveal } from "../ui";
import { Bars } from "../charts";

export default function OverviewPage({ onOpen, onNav }) {
  const { data: s, error, loading } = useStats();
  const { data: a } = useAlerts();
  const { data: apl } = useAplSummary();
  const rows = useMemo(() => (Array.isArray(a?.rows) ? a.rows : []), [a]);
  const top = useMemo(() => [...rows].sort((x, y) => (y.risk_score ?? 0) - (x.risk_score ?? 0)).slice(0, 8), [rows]);
  const dist = useMemo(() => buckets(rows, "risk_score", { min: 0, max: 1, count: 10 }), [rows]);

  if (loading) return <Empty>Loading…</Empty>;
  if (error) return <ErrorCard error={error} />;
  const t = s.risk_tier_counts;
  const geo = rows.filter((r) => r.geo_temporal_flag === true).length;
  const ex = apl?.headline_stats?.exoneration_by_threshold?.find((r) => r.threshold === apl.headline_stats.default_threshold);

  return (
    <>
      <Reveal>
        <PageHead
          title="Overview"
          sub="Wallets and transactions the pipeline has flagged, ranked by risk. Every figure below is read from the scored dataset."
        />
      </Reveal>

      <Reveal delay={0.04}>
        <Stats>
          <Stat k="Flagged" v={num(s.total_flagged)} s="entities in the queue" />
          <Stat k="High" v={num(t.high)} t="down" s={`risk ≥ ${s.risk_tier_thresholds.high}`} />
          <Stat k="Average" v={Number(s.avg_risk_score).toFixed(3)} s="risk score" />
          <Stat k="Clusters" v={num(s.distinct_clusters)} s="distinct" />
          <Stat k="Scanned" v={num(s.total_transactions)} s="transactions" />
        </Stats>
      </Reveal>

      <Section title="Risk distribution" right={`${num(geo)} geo-temporal mismatches`}>
        <Reveal>
          <Card>
            <Bars data={dist} name="entities" colorBy={(d) => riskColor(d.x)} height={220} />
          </Card>
        </Reveal>
      </Section>

      <Section title="Highest risk" right={<button className="btn ghost" onClick={() => onNav("alerts")}>View all alerts</button>}>
        <Reveal>
          <Card flush>
            <table className="tbl">
              <thead><tr><th>Entity</th><th>Type</th><th>Cluster</th><th>Intent</th><th className="r">Risk</th></tr></thead>
              <tbody>{top.map((r) => (
                <tr key={r.node_id} className="row" onClick={() => onOpen(r.node_id)}>
                  <td className="mono" title={r.node_id}>{short(r.node_id, 28)}</td>
                  <td className="sec">{r.node_type}</td>
                  <td><span className="num" style={{ color: clusterColor(r.cluster_id) }}>{r.cluster_id ?? "—"}</span></td>
                  <td className="sec trunc">{r.geo_temporal_flag ? <Tag t="hi">Geo mismatch</Tag> : (r.intent_label ?? "—")}</td>
                  <td className="r">
                    <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }}>
                      <Bar frac={r.risk_score} color={riskColor(r.risk_score)} />
                      <Risk score={r.risk_score} />
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        </Reveal>
      </Section>

      {ex && (
        <Section title="Adversarial provenance" right={<button className="btn ghost" onClick={() => onNav("provenance")}>See the method</button>}>
          <Reveal>
            <Card band>
              <Stats sm>
                <Stat k="Exonerated" v={pct(ex.pct_zero_agency)} t="up" s={`${num(ex.n_zero_agency)} of ${num(ex.n_flagged_baseline)} haircut-flagged wallets never held spend authority`} />
                <Stat k="Unspent" v={pct(ex.pct_never_spent)} s={`${num(ex.n_never_spent)} were never a transaction input`} />
                <Stat k="Fragility" v={apl.headline_stats.fragility ? apl.headline_stats.fragility.cfi_median.toFixed(2) : "—"} s="median cluster fragility index" />
              </Stats>
            </Card>
          </Reveal>
        </Section>
      )}
    </>
  );
}
