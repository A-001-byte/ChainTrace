import { useStats } from "../../hooks/useStats";
import { useAlerts } from "../../hooks/useAlerts";
import { useGeo } from "../../hooks/useGeo";
import { useAplSummary } from "../../hooks/useAplSummary";
import { num } from "../../lib/format";
import { Card, Stat, Stats, PageHead, Section, Tag, KV, Reveal } from "../ui";

function Row({ label, ok, detail }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="sec">{detail}</td>
      <td className="r"><Tag t={ok ? "lo" : ""}>{ok ? "Active" : "Pending"}</Tag></td>
    </tr>
  );
}

export default function SystemPage() {
  const { data: stats, error: statsErr } = useStats();
  const { data: alerts } = useAlerts();
  const { data: geo } = useGeo();
  const { data: apl } = useAplSummary();
  const rows = Array.isArray(alerts?.rows) ? alerts.rows : [];
  const hasIntent = rows.some((r) => r.intent_label);
  const hasGeoTemporal = rows.some((r) => r.geo_temporal_flag);
  const isMock = stats?.data_source_label?.toLowerCase().includes("mock");
  const stages = [!statsErr, rows.length > 0, !!geo && geo.by_country?.length > 0, true, hasIntent, hasGeoTemporal, true, !!apl?.available, !!apl?.manifest_b];

  return (
    <>
      <Reveal>
        <PageHead
          title="System"
          sub="Pipeline status, derived live from the API responses this console is reading."
          right={<Tag t="on">Offline analysis mode</Tag>}
        />
      </Reveal>

      <Reveal delay={0.04}>
        <Stats>
          <Stat k="Stages" v={`${stages.filter(Boolean).length}/${stages.length}`} t="up" s="active" />
          <Stat k="Transactions" v={num(stats?.total_transactions)} s={stats?.data_source_label ?? "…"} />
          <Stat k="Flagged" v={num(stats?.total_flagged)} s="entities" />
          <Stat k="Confidence" v={stats ? `${stats.flagged_avg_confidence_pct}%` : "—"} s="average, flagged set" />
        </Stats>
      </Reveal>

      <Section title="Pipeline">
        <Reveal>
          <Card flush>
            <table className="tbl">
              <tbody>
                <Row label="Data ingestion and ML detection" ok={!statsErr} detail={statsErr ? "Unavailable" : (isMock ? "Mock dataset" : "Live dataset")} />
                <Row label="Alert ranking and explainability" ok={rows.length > 0} detail={`${rows.length} ranked alerts`} />
                <Row label="Network and GeoIP layer" ok={!!geo && geo.by_country?.length > 0} detail={geo ? `${geo.by_country?.length ?? 0} countries` : "—"} />
                <Row label="Forensic graph" ok detail="Offline, capped neighbourhood" />
                <Row label="Intent intelligence" ok={hasIntent} detail={hasIntent ? "Populated" : "Not yet in pipeline"} />
                <Row label="Geo-temporal intelligence" ok={hasGeoTemporal} detail={hasGeoTemporal ? "Populated" : "Not yet in pipeline"} />
                <Row label="Kick Down Doors" ok detail="Local disruption analysis" />
                <Row label="Adversarial provenance — module A" ok={!!apl?.available} detail={apl?.available ? `Run ${apl.manifest.run_id.slice(0, 8)}` : "Not built"} />
                <Row label="Adversarial provenance — module B" ok={!!apl?.manifest_b} detail={apl?.manifest_b ? `Run ${apl.manifest_b.run_id.slice(0, 8)}` : "Not built"} />
              </tbody>
            </table>
          </Card>
        </Reveal>
      </Section>

      <Section title="What ChainTrace claims">
        <div className="grid g2">
          <Reveal>
            <Card>
              <p className="note" style={{ fontSize: "var(--t-14)" }}>
                ChainTrace does not deanonymize Bitcoin wallets and does not identify the real person behind an address — nobody
                legitimately can, since Bitcoin&apos;s network is pseudonymous by design.
              </p>
              <p className="note" style={{ fontSize: "var(--t-14)", marginTop: 16 }}>
                It correlates network-layer signals with blockchain-layer structure and flags where those two stories contradict
                each other. Every flag is a confidence-based investigative signal — never a definitive real-world identity claim.
              </p>
            </Card>
          </Reveal>
          <Reveal delay={0.04}>
            <Card title="Operating envelope">
              <KV rows={[
                ["Network layer", "IP · timing · ASN"],
                ["Chain layer", "Wallet and transaction structure"],
                ["Runtime", "No external APIs, CDNs or map tiles"],
                ["Dataset", stats?.data_source_label ?? "—"],
                ["Clusters", num(stats?.distinct_clusters)],
              ]} />
            </Card>
          </Reveal>
        </div>
      </Section>
    </>
  );
}
