import { lazy, Suspense, useMemo, useState } from "react";
import { useGeo } from "../../hooks/useGeo";
import { useAlerts } from "../../hooks/useAlerts";
import { CHART_COLORS as C, riskColor } from "../../lib/chartColors";
import { claimedCountryFrom } from "../../lib/geoClaims";
import ClaimedVsActual from "../geo/ClaimedVsActual";
import { Card, Tile, Tiles, Section, Tag, Empty, ErrorCard, Reveal } from "../ui";
import { short, num } from "../../lib/format";
import { HBars, CountBars } from "../charts";

const GeoTemporalMap = lazy(() => import("../geo/GeoTemporalMap"));

export default function GeoPage() {
  const { data, error, loading } = useGeo();
  const { data: a } = useAlerts();
  const [sel, setSel] = useState(null);
  const rows = useMemo(() => (Array.isArray(a?.rows) ? a.rows : []), [a]);
  const flagged = useMemo(() => rows.filter((r) => r.geo_temporal_flag === true), [rows]);
  const points = useMemo(() => flagged.map((r) => ({ nodeId: r.node_id, claimedCountry: claimedCountryFrom(r.geo_temporal_reason), reason: r.geo_temporal_reason })).filter((p) => p.claimedCountry), [flagged]);
  const explainer = sel ?? points[0]?.nodeId ?? null;

  if (loading) return <Empty>Loading geo intelligence…</Empty>;
  if (error) return <ErrorCard error={error} />;
  const byC = (data.by_country ?? []).slice(0, 10).map((r) => ({ k: r.country, n: r.flagged_count ?? 0, avg: r.avg_risk_score }));
  const byA = (data.by_asn ?? []).slice(0, 10).map((r) => ({ k: String(r.asn), n: r.flagged_count ?? 0, avg: r.avg_risk_score }));
  const avgC = (data.by_country ?? []).slice(0, 10).map((r) => ({ k: r.country, n: r.avg_risk_score ?? 0 }));

  return (
    <>
      <Section eyebrow="Geo intelligence" right={<span className="eyebrow">network-layer signals · not a real-world identity claim</span>}>
        <Reveal>
          <Tiles>
            <Tile k="Considered" v={num(data.flagged_considered)} s="flagged entities" />
            <Tile k="Transactions" v={num(data.total_transactions)} s="total" />
            <Tile k="Mismatches" v={num(flagged.length)} tone="orange" s={`of ${num(rows.length)} flagged`} />
            <Tile k="Countries" v={num(data.by_country?.length ?? 0)} s="geoip" />
            <Tile k="Networks" v={num(data.by_asn?.length ?? 0)} s="asn" />
          </Tiles>
        </Reveal>
        <div className="grid g3">
          <Reveal delay={0.03}><Card title="Countries" right="flagged · colour = avg risk"><HBars data={byC} name="flagged" colorBy={(e) => riskColor(e.avg)} /></Card></Reveal>
          <Reveal delay={0.06}><Card title="Networks" right="flagged · colour = avg risk"><HBars data={byA} name="flagged" colorBy={(e) => riskColor(e.avg)} /></Card></Reveal>
          <Reveal delay={0.09}><Card title="Risk" right="average by country"><HBars data={avgC} name="avg risk" colorBy={(e) => riskColor(e.n)} fmt={(v) => Number(v).toFixed(3)} /></Card></Reveal>
        </div>
      </Section>

      <Section eyebrow="Geo-temporal mismatch" right={<span className="eyebrow">claimed country's working hours vs when the wallet actually transacts</span>}>
        <div className="grid g3">
          <Reveal className="span2"><Card title="Claimed vs actual" right={explainer ? short(explainer, 28) : ""}><ClaimedVsActual nodeId={explainer} /></Card></Reveal>
          <Reveal delay={0.03}><Card title="Claims" right="by country"><CountBars rows={flagged} name="mismatches" color={C.ORANGE} map={(r) => claimedCountryFrom(r.geo_temporal_reason)} /></Card></Reveal>
        </div>

        {flagged.length > 0 && (
          <div className="grid" style={{ gridTemplateColumns: "380px minmax(0, 1fr)" }}>
            <Reveal delay={0.06}>
              <Card flush title="Wallets" right={<span className="eyebrow">{num(flagged.length)} flagged</span>}>
                <div style={{ maxHeight: 520, overflowY: "auto", marginTop: 12 }}>
                  <table className="tbl"><tbody>
                    {flagged.map((r) => {
                      const c = claimedCountryFrom(r.geo_temporal_reason);
                      const on = r.node_id === sel;
                      return (
                        <tr key={r.node_id} className={`row${on ? " sel" : ""}`} onClick={() => setSel(on ? null : r.node_id)}>
                          <td style={{ whiteSpace: "normal" }}>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}><span className="mono" style={{ color: "var(--bone)" }} title={r.node_id}>{short(r.node_id, 24)}</span><Tag t="hi">{c}</Tag></div>
                            {/* the detector's sentence, rendered unmodified */}
                            <div className="note" style={{ marginTop: 6 }}>{r.geo_temporal_reason}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody></table>
                </div>
              </Card>
            </Reveal>
            <Reveal delay={0.09}>
              <Card panel>
                <Suspense fallback={<div className="empty" style={{ height: 300, padding: 24 }}>Loading map…</div>}>
                  <GeoTemporalMap points={points} selectedId={sel} onSelect={setSel} />
                </Suspense>
                <div className="note" style={{ padding: "14px 20px", borderTop: "1px solid var(--lift)", maxWidth: "none" }}>
                  Country-level resolution only. Each dot sits at the centroid of the country the wallet <em>claims</em>, jittered so overlapping wallets stay distinguishable — it is not a city-level or precise position, and not a real-world identity claim.
                </div>
              </Card>
            </Reveal>
          </div>
        )}
      </Section>
    </>
  );
}
