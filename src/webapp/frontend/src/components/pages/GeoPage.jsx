import { lazy, Suspense, useMemo, useState } from "react";
import { useGeo } from "../../hooks/useGeo";
import { useAlerts } from "../../hooks/useAlerts";
import ClaimedVsActual from "../geo/ClaimedVsActual";
import { Panel, Bar, Tag, Empty, ErrorPanel, Reveal, short } from "../ui";

const GeoTemporalMap = lazy(() => import("../geo/GeoTemporalMap"));

/** Claimed country comes from the detector's own sentence — the authoritative record of
 *  what it judged. The alert row's geo_country is derived differently and disagrees for
 *  some wallets, which would place dots on the wrong country. */
export function claimedCountryFrom(reason) {
  const m = /^claims\s+([A-Z]{2})/.exec(String(reason ?? ""));
  return m ? m[1] : null;
}

function riskColor(r) { return r >= 0.6 ? "var(--risk-hi)" : r >= 0.4 ? "var(--risk-md)" : "var(--risk-lo)"; }

function GeoGroup({ title, rows, k }) {
  const max = rows.length ? Math.max(...rows.map((r) => r.flagged_count ?? 0)) : 1;
  return (
    <Panel title={title} flush>
      <table className="tbl">
        <thead><tr><th>{k}</th><th style={{ width: "40%" }}>share</th><th className="r">flagged</th><th className="r">avg</th><th className="r">max</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td className="mute">no data</td></tr> : rows.slice(0, 10).map((r, i) => (
            <tr key={r[k]}>
              <td className="fg">{r[k]}</td>
              <td><Bar frac={(r.flagged_count ?? 0) / max} color={riskColor(r.avg_risk_score)} delay={i * 0.03} /></td>
              <td className="r">{r.flagged_count}</td>
              <td className="r">{r.avg_risk_score?.toFixed(2) ?? "—"}</td>
              <td className="r">{r.max_risk_score?.toFixed(2) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

export default function GeoPage() {
  const { data, error, loading } = useGeo();
  const { data: a } = useAlerts();
  const [sel, setSel] = useState(null);
  const rows = Array.isArray(a?.rows) ? a.rows : [];
  const flagged = useMemo(() => rows.filter((r) => r.geo_temporal_flag === true), [rows]);
  const points = useMemo(() => flagged.map((r) => ({ nodeId: r.node_id, claimedCountry: claimedCountryFrom(r.geo_temporal_reason), reason: r.geo_temporal_reason })).filter((p) => p.claimedCountry), [flagged]);
  const tally = useMemo(() => { const m = new Map(); for (const p of points) m.set(p.claimedCountry, (m.get(p.claimedCountry) ?? 0) + 1); return [...m.entries()].sort((x, y) => y[1] - x[1]); }, [points]);
  const explainer = sel ?? points[0]?.nodeId ?? null;

  if (loading) return <Empty>loading geo intelligence…</Empty>;
  if (error) return <ErrorPanel error={error} />;

  return (
    <>
      <Reveal>
        <div className="prose">
          {data.flagged_considered} flagged entities considered, out of {data.total_transactions} total transactions. Correlates network-layer signals (GeoIP, ASN) with blockchain-layer risk — not a real-world identity claim.
        </div>
      </Reveal>

      <Reveal delay={0.04}>
        <Panel title="geo-temporal mismatch · claimed vs actual" right={`${flagged.length} of ${rows.length} flagged`}>
          <div className="prose" style={{ fontSize: "var(--fs-sm)", marginBottom: 10 }}>
            A wallet's GeoIP puts it in one country, but its transactions cluster in the working hours of a different one. People transact when they are awake, and a VPN exit node moves the apparent country without moving the clock. Below: the claimed country's 09:00–18:00 window against when the wallet actually transacts, in that same claimed country's local time.
          </div>
          <ClaimedVsActual nodeId={explainer} />
        </Panel>
      </Reveal>

      {flagged.length > 0 && (
        <div className="cols">
          <Reveal delay={0.08} style={{ flex: "0 0 420px" }}>
            <Panel title="flagged wallets" right={<span className="mute">geo_temporal_flag = true only</span>} flush>
              <div style={{ maxHeight: "52vh", overflowY: "auto" }}>
                <table className="tbl">
                  <tbody>
                    {flagged.map((r) => {
                      const c = claimedCountryFrom(r.geo_temporal_reason);
                      const on = r.node_id === sel;
                      return (
                        <tr key={r.node_id} className={`row${on ? " sel" : ""}`} onClick={() => setSel(on ? null : r.node_id)}>
                          <td>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span className="fg" title={r.node_id}>{short(r.node_id, 30)}</span>
                              <Tag t="md">{c}</Tag>
                            </div>
                            {/* the detector's sentence, rendered unmodified */}
                            <div className="note" style={{ whiteSpace: "normal" }}>{r.geo_temporal_reason}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </Reveal>
          <Reveal delay={0.12} style={{ flex: 1 }}>
            <Panel title="claimed locations" right={`${points.length} plotted`}>
              <Suspense fallback={<div className="empty" style={{ height: 300 }}>loading map…</div>}>
                <GeoTemporalMap points={points} selectedId={sel} onSelect={setSel} />
              </Suspense>
              <div className="note" style={{ marginTop: 6 }}>
                Country-level resolution only. Each dot sits at the centroid of the country the wallet <em>claims</em>, jittered so overlapping wallets stay distinguishable — it is not a city-level or precise position, and not a real-world identity claim.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {tally.map(([c, n]) => <Tag key={c} t="md">claims {c} · {n}</Tag>)}
              </div>
            </Panel>
          </Reveal>
        </div>
      )}

      <div className="grid g2">
        <Reveal delay={0.16}><GeoGroup title="by country" rows={data.by_country} k="country" /></Reveal>
        <Reveal delay={0.2}><GeoGroup title="by asn" rows={data.by_asn} k="asn" /></Reveal>
      </div>
    </>
  );
}
