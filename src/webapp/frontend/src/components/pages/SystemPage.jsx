import { useStats } from "../../hooks/useStats";
import { useAlerts } from "../../hooks/useAlerts";
import { useGeo } from "../../hooks/useGeo";
import { useAplSummary } from "../../hooks/useAplSummary";
import { CHART_COLORS as C } from "../../lib/chartColors";
import { num } from "../../lib/format";
import { Card, Tile, Tiles, Section, Tag, KV, Reveal } from "../ui";
import { HBars, Donut } from "../charts";

function Row({ label, ok, detail }) {
  return <tr><td className="fg">{label}</td><td>{detail}</td><td className="r"><Tag t={ok ? "lo" : ""}>{ok ? "active" : "pending"}</Tag></td></tr>;
}

export default function SystemPage() {
  const { data: stats, error: statsErr } = useStats();
  const { data: alerts } = useAlerts();
  const { data: geo } = useGeo();
  const { data: apl } = useAplSummary();
  const rows = Array.isArray(alerts?.rows) ? alerts.rows : [];
  const n = rows.length || 1;
  const hasIntent = rows.some((r) => r.intent_label);
  const hasGeoTemporal = rows.some((r) => r.geo_temporal_flag);
  const isMock = stats?.data_source_label?.toLowerCase().includes("mock");
  const coverage = [
    { k: "risk score", n: rows.filter((r) => typeof r.risk_score === "number").length / n },
    { k: "confidence", n: rows.filter((r) => typeof r.classifier_confidence === "number").length / n },
    { k: "anomaly", n: rows.filter((r) => typeof r.anomaly_score === "number").length / n },
    { k: "cluster", n: rows.filter((r) => r.cluster_id != null).length / n },
    { k: "intent", n: rows.filter((r) => r.intent_label).length / n },
    { k: "geo country", n: rows.filter((r) => r.geo_country).length / n },
    { k: "asn", n: rows.filter((r) => r.asn).length / n },
    { k: "known label", n: rows.filter((r) => r.is_known_label).length / n },
  ];
  const stages = [!statsErr, rows.length > 0, !!geo && geo.by_country?.length > 0, true, hasIntent, hasGeoTemporal, true, !!apl?.available, !!apl?.manifest_b];

  return (
    <>
      <Section eyebrow="System" right={<Tag>offline analysis mode</Tag>}>
        <Reveal>
          <Tiles>
            <Tile k="Transactions" v={num(stats?.total_transactions)} s={stats?.data_source_label ?? "…"} />
            <Tile k="Flagged" v={num(stats?.total_flagged)} s="alerts" />
            <Tile k="Clusters" v={num(stats?.distinct_clusters)} s="distinct" />
            <Tile k="Confidence" v={stats ? `${stats.flagged_avg_confidence_pct}%` : "—"} s="average" />
            <Tile k="Stages" v={`${stages.filter(Boolean).length}/${stages.length}`} tone="green" s="active" />
          </Tiles>
        </Reveal>
        <div className="grid g3">
          <Reveal delay={0.03} className="span2">
            <Card flush title="Pipeline" right="derived live from api responses">
              <table className="tbl" style={{ marginTop: 12 }}><tbody>
                <Row label="Data ingestion / ML detection" ok={!statsErr} detail={statsErr ? "unavailable" : (isMock ? "mock" : "live")} />
                <Row label="Alert ranking & explainability" ok={rows.length > 0} detail={`${rows.length} alerts`} />
                <Row label="Network / GeoIP layer" ok={!!geo && geo.by_country?.length > 0} detail={geo ? `${geo.by_country?.length ?? 0} countries` : "—"} />
                <Row label="Forensic graph" ok detail="offline, capped neighbourhood" />
                <Row label="Intent intelligence" ok={hasIntent} detail={hasIntent ? "populated" : "not yet in pipeline"} />
                <Row label="Geo-temporal intelligence" ok={hasGeoTemporal} detail={hasGeoTemporal ? "populated" : "not yet in pipeline"} />
                <Row label="Kick Down Doors" ok detail="local disruption analysis" />
                <Row label="Adversarial provenance · A" ok={!!apl?.available} detail={apl?.available ? `run ${apl.manifest.run_id.slice(0, 8)}` : "not built"} />
                <Row label="Adversarial provenance · B" ok={!!apl?.manifest_b} detail={apl?.manifest_b ? `run ${apl.manifest_b.run_id.slice(0, 8)}` : "not built"} />
              </tbody></table>
            </Card>
          </Reveal>
          <Reveal delay={0.06}><Card title="Types" right="alert rows"><Donut rows={rows} field="node_type" colors={[C.BONE, C.GRANITE]} /></Card></Reveal>
          <Reveal delay={0.09} className="span2"><Card title="Coverage" right="share of alert rows carrying each field"><HBars data={coverage} name="coverage" color={C.STONE} fmt={(v) => `${(v * 100).toFixed(0)}%`} height={220} /></Card></Reveal>
          <Reveal delay={0.12}>
            <Card title="Claims">
              <KV rows={[["deanonymize", "no"], ["identity", "never claimed"], ["network layer", "ip · timing · asn"], ["chain layer", "wallet · tx structure"], ["runtime", "no external calls"]]} />
              <div className="note" style={{ marginTop: 16 }}>Flags where the network-layer and chain-layer stories contradict each other. Confidence-based investigative signals — never a definitive real-world identity claim.</div>
            </Card>
          </Reveal>
        </div>
      </Section>
    </>
  );
}
