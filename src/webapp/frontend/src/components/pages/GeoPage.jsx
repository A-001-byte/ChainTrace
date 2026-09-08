import { lazy, Suspense, useMemo, useState } from "react";
import { useGeo } from "../../hooks/useGeo";
import { useAlerts } from "../../hooks/useAlerts";
import { claimedCountryFrom } from "../../lib/geoClaims";
import { riskColor } from "../../lib/chartColors";
import { short, num } from "../../lib/format";
import ClaimedVsActual from "../geo/ClaimedVsActual";
import { Card, Stat, Stats, PageHead, Section, Bar, Tag, Scroll, Empty, ErrorCard, Reveal } from "../ui";

const GeoTemporalMap = lazy(() => import("../geo/GeoTemporalMap"));

function Breakdown({ title, rows, k, unit }) {
  const list = (rows ?? []).slice(0, 8);
  const peak = list.length ? Math.max(...list.map((r) => r.flagged_count ?? 0)) : 1;
  return (
    <Card flush title={title} right={`${num(rows?.length ?? 0)} ${unit}`}>
      <table className="tbl">
        <thead><tr><th>{k === "country" ? "Country" : "Network"}</th><th style={{ width: "40%" }}>Flagged</th><th className="r">Count</th><th className="r">Avg risk</th></tr></thead>
        <tbody>
          {list.length === 0 ? <tr><td className="sec">No data</td></tr> : list.map((r) => (
            <tr key={r[k]}>
              <td>{r[k]}</td>
              <td><Bar frac={(r.flagged_count ?? 0) / peak} color={riskColor(r.avg_risk_score)} /></td>
              <td className="r num">{r.flagged_count}</td>
              <td className="r num sec">{r.avg_risk_score?.toFixed(2) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default function GeoPage() {
  const { data, error, loading } = useGeo();
  const { data: a } = useAlerts();
  const [sel, setSel] = useState(null);
  const rows = useMemo(() => (Array.isArray(a?.rows) ? a.rows : []), [a]);
  const flagged = useMemo(() => rows.filter((r) => r.geo_temporal_flag === true), [rows]);
  const points = useMemo(
    () => flagged.map((r) => ({ nodeId: r.node_id, claimedCountry: claimedCountryFrom(r.geo_temporal_reason), reason: r.geo_temporal_reason })).filter((p) => p.claimedCountry),
    [flagged],
  );
  const explainer = sel ?? points[0]?.nodeId ?? null;

  if (loading) return <Empty>Loading geo intelligence…</Empty>;
  if (error) return <ErrorCard error={error} />;

  return (
    <>
      <Reveal>
        <PageHead
          title="Geo-temporal intelligence"
          sub="A wallet's GeoIP puts it in one country, but its transactions cluster in the working hours of a different one. People transact when they are awake, and a VPN exit node moves the apparent country without moving the clock. This correlates network-layer signals with blockchain-layer risk — it is not a real-world identity claim."
        />
      </Reveal>

      <Reveal delay={0.04}>
        <Stats>
          <Stat k="Considered" v={num(data.flagged_considered)} s="flagged entities examined" />
          <Stat k="Mismatches" v={num(flagged.length)} t="down" s={`of ${num(rows.length)} flagged`} />
          <Stat k="Countries" v={num(data.by_country?.length ?? 0)} s="seen in the flagged set" />
          <Stat k="Networks" v={num(data.by_asn?.length ?? 0)} s="distinct ASNs" />
        </Stats>
      </Reveal>

      {flagged.length > 0 && (
        <>
          <Section title="Claimed working hours against real activity">
            <Reveal>
              <Card>
                <ClaimedVsActual nodeId={explainer} />
              </Card>
            </Reveal>
          </Section>

          <Section title="Claimed locations" right={`${num(points.length)} wallets plotted`}>
            <div className="grid split">
              <Reveal>
                <Card flush title="Flagged wallets">
                  <Scroll max={460}>
                    <table className="tbl">
                      <tbody>
                        {flagged.map((r) => {
                          const c = claimedCountryFrom(r.geo_temporal_reason);
                          const on = r.node_id === sel;
                          return (
                            <tr key={r.node_id} className={`row${on ? " sel" : ""}`} onClick={() => setSel(on ? null : r.node_id)}>
                              <td className="wrap">
                                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                                  <span className="mono" title={r.node_id}>{short(r.node_id, 20)}</span>
                                  <Tag t="on">{c}</Tag>
                                </div>
                                {/* the detector's sentence, rendered unmodified */}
                                <span className="note">{r.geo_temporal_reason}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Scroll>
                </Card>
              </Reveal>
              <Reveal delay={0.04}>
                <Card flush>
                  <Suspense fallback={<div className="empty" style={{ padding: 24, height: 320 }}>Loading map…</div>}>
                    <GeoTemporalMap points={points} selectedId={sel} onSelect={setSel} />
                  </Suspense>
                  <p className="note" style={{ padding: "16px 24px", borderTop: "1px solid var(--hair)", maxWidth: "none" }}>
                    Country-level resolution only. Each dot sits at the centroid of the country the wallet <em>claims</em>, jittered so
                    overlapping wallets stay distinguishable — it is not a city-level or precise position, and not a real-world identity claim.
                  </p>
                </Card>
              </Reveal>
            </div>
          </Section>
        </>
      )}

      <Section title="Network exposure">
        <div className="grid g2">
          <Reveal><Breakdown title="By country" rows={data.by_country} k="country" unit="countries" /></Reveal>
          <Reveal delay={0.04}><Breakdown title="By network" rows={data.by_asn} k="asn" unit="networks" /></Reveal>
        </div>
      </Section>
    </>
  );
}
