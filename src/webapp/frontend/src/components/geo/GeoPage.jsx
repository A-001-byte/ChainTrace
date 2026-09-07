import { useMemo, useState, lazy, Suspense } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useGeo } from "../../hooks/useGeo";
import { useAlerts } from "../../hooks/useAlerts";
import { motionTokens } from "../../lib/motionTokens";
import GeoBar from "./GeoBar";
import ClaimedVsActual from "./ClaimedVsActual";

// Bundles the world land outline (~56kB topojson) -- code-split so it only loads when
// the Geo page is opened, the same treatment the Forensic Graph renderer gets.
const GeoTemporalMap = lazy(() => import("./GeoTemporalMap"));

/** The detector's verdict sentence is the authoritative record of what it claimed.
 *  Parsed in one place so the list, the map and the country tally can never disagree.
 *
 *  Deliberately NOT the alert row's own geo_country column: that field is derived
 *  separately and genuinely disagrees with the detector's claim for some wallets, which
 *  would put dots on the wrong country. */
export function claimedCountryFrom(reason) {
  const m = /^claims\s+([A-Z]{2})/.exec(String(reason ?? ""));
  return m ? m[1] : null;
}

function GeoGroup({ title, rows, labelKey }) {
  const maxCount = rows.length > 0 ? Math.max(...rows.map((r) => r.flagged_count ?? 0)) : 0;
  return (
    <div className="panel" style={{ padding: "var(--spacing-20)", flex: 1, minWidth: "320px" }}>
      <span className="eyebrow" style={{ display: "block", marginBottom: "var(--spacing-16)" }}>{title}</span>
      {rows.length === 0 ? (
        <p style={{ color: "var(--color-ash)", fontSize: "var(--text-caption)" }}>No data available.</p>
      ) : (
        rows.slice(0, 10).map((r) => (
          <GeoBar
            key={r[labelKey]}
            label={r[labelKey]}
            flaggedCount={r.flagged_count}
            avgRisk={r.avg_risk_score}
            maxRisk={r.max_risk_score}
            maxCount={maxCount}
          />
        ))
      )}
    </div>
  );
}

/**
 * Geo-Temporal Mismatch: methodology explainer, then a flagged-wallet list beside a
 * country-centroid map, then the claimed-country tally.
 *
 * Every wallet here has geo_temporal_flag === true — wallets the detector never
 * evaluated and wallets it judged honest are both excluded.
 *
 * Built from the existing useAlerts hook; only the per-wallet activity histogram behind
 * the "claimed vs actual" block needed a new endpoint, because that data is exposed
 * nowhere else.
 */
function GeoTemporalSection({ rows }) {
  const reduceMotion = useReducedMotion();
  const [selectedId, setSelectedId] = useState(null);

  const flagged = useMemo(
    () => (rows ?? []).filter((r) => r.geo_temporal_flag === true),
    [rows]
  );

  const points = useMemo(
    () => flagged.map((r) => ({
      nodeId: r.node_id,
      claimedCountry: claimedCountryFrom(r.geo_temporal_reason),
      reason: r.geo_temporal_reason,
    })).filter((p) => p.claimedCountry),
    [flagged]
  );

  const byClaimedCountry = useMemo(() => {
    const counts = new Map();
    for (const p of points) counts.set(p.claimedCountry, (counts.get(p.claimedCountry) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [points]);

  // Default the explainer to the first flagged wallet so the concept is legible on
  // arrival rather than only after a click.
  const explainerId = selectedId ?? points[0]?.nodeId ?? null;

  return (
    <div style={{ marginTop: "var(--spacing-32)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--spacing-16)" }}>
        <h3 style={{ color: "var(--color-bone)" }}>Geo-Temporal Mismatch</h3>
        <span className="mono" style={{ fontSize: "var(--text-caption)", color: "var(--color-ash)" }}>
          {flagged.length} of {(rows ?? []).length} flagged entities
        </span>
      </div>

      {/* --- Methodology explainer --- */}
      <div className="panel" style={{ padding: "var(--spacing-20)", marginBottom: "var(--spacing-24)" }}>
        <p style={{ fontSize: "var(--text-caption)", color: "var(--color-fog)", lineHeight: 1.6, maxWidth: "80ch", marginBottom: "var(--spacing-20)" }}>
          A wallet's GeoIP puts it in one country, but its transactions cluster in the
          working hours of a different one. People transact when they are awake, and a VPN
          exit node moves the apparent country without moving the clock. Below: the country
          the wallet claims and that country's 09:00–18:00 window, against when the wallet
          actually transacts, expressed in that same claimed country's local time.
        </p>
        <ClaimedVsActual nodeId={explainerId} />
      </div>

      {flagged.length === 0 ? (
        <div className="panel" style={{ padding: "var(--spacing-20)" }}>
          <p style={{ color: "var(--color-ash)", fontSize: "var(--text-caption)" }}>
            No geo-temporal mismatches among the current alerts.
          </p>
        </div>
      ) : (
        <>
          {/* --- Two-panel: flagged list | country-centroid map --- */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(300px, 420px) 1fr",
            gap: "var(--spacing-24)",
            alignItems: "start",
          }}>
            <div className="panel" style={{ padding: "var(--spacing-20)" }}>
              <span className="eyebrow" style={{ display: "block", marginBottom: "var(--spacing-12)" }}>
                Flagged wallets
              </span>
              <div style={{ maxHeight: "440px", overflowY: "auto" }}>
                {flagged.map((r, i) => {
                  const country = claimedCountryFrom(r.geo_temporal_reason);
                  const isSelected = r.node_id === selectedId;
                  return (
                    <motion.button
                      key={r.node_id}
                      onClick={() => setSelectedId(isSelected ? null : r.node_id)}
                      initial={{ opacity: 0, y: reduceMotion ? 0 : motionTokens.distance.sm }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal,
                        ease: motionTokens.easing.smooth,
                        delay: reduceMotion ? 0 : Math.min(i, 10) * 0.03,
                      }}
                      style={{
                        display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                        fontFamily: "inherit", background: isSelected ? "var(--signal-tint)" : "transparent",
                        border: "none",
                        boxShadow: isSelected ? "var(--signal-line) 0px 0px 0px 1px inset" : "none",
                        borderRadius: "var(--radius-badges)",
                        borderBottom: i === flagged.length - 1 ? "none" : "1px solid var(--color-graphite)",
                        padding: "var(--spacing-12)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", marginBottom: "var(--spacing-4)" }}>
                        <span className="mono" style={{
                          flex: 1, fontSize: "var(--text-caption)", color: "var(--color-mist)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {r.node_id}
                        </span>
                        <span className="badge mono" style={{
                          color: "var(--signal)", background: "var(--signal-tint)",
                          boxShadow: "var(--signal-line) 0px 0px 0px 1px inset", flexShrink: 0,
                        }}>
                          {country}
                        </span>
                      </div>
                      {/* The detector's sentence, rendered unmodified. */}
                      <div style={{ fontSize: "var(--text-caption)", color: "var(--color-fog)", lineHeight: 1.5 }}>
                        {r.geo_temporal_reason}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            <div className="panel" style={{ padding: "var(--spacing-20)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--spacing-12)", flexWrap: "wrap", gap: "var(--spacing-8)" }}>
                <span className="eyebrow">Claimed locations</span>
                <span className="mono" style={{ fontSize: "var(--text-caption)", color: "var(--color-ash)" }}>
                  {points.length} plotted
                </span>
              </div>

              <Suspense fallback={
                <div style={{
                  height: 320, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--color-void)", borderRadius: "var(--radius-cards)",
                  color: "var(--color-ash)", fontSize: "var(--text-caption)",
                }}>
                  Loading map…
                </div>
              }>
                <GeoTemporalMap points={points} selectedId={selectedId} onSelect={setSelectedId} />
              </Suspense>

              {/* Honesty caption — resolution is one point per country, not a location. */}
              <p style={{ fontSize: "var(--text-caption)", color: "var(--color-ash)", marginTop: "var(--spacing-12)", lineHeight: 1.5 }}>
                Country-level resolution only. Each dot sits at the centroid of the country
                the wallet <em>claims</em>, jittered so overlapping wallets stay
                distinguishable — it is not a city-level or precise position, and not a
                real-world identity claim.
              </p>

              {byClaimedCountry.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-8)", marginTop: "var(--spacing-16)" }}>
                  {byClaimedCountry.map(([country, n]) => (
                    <span key={country} className="badge mono" style={{
                      color: "var(--signal)", background: "var(--signal-tint)",
                      boxShadow: "var(--signal-line) 0px 0px 0px 1px inset",
                    }}>
                      claims {country} · {n}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function GeoPage() {
  const { data, error, loading } = useGeo();
  const { data: alertsData } = useAlerts();

  if (loading) return <p style={{ color: "var(--color-ash)" }}>Loading geo intelligence…</p>;

  if (error) {
    return (
      <div className="panel" style={{ padding: "var(--spacing-32)" }}>
        <h3 style={{ color: "var(--signal)", marginBottom: "var(--spacing-8)" }}>Data Source Unavailable</h3>
        <p style={{ color: "var(--color-fog)" }}>{error}</p>
      </div>
    );
  }

  const alertRows = Array.isArray(alertsData?.rows) ? alertsData.rows : [];

  return (
    <div>
      <div className="page-header">
        <h2>Geo Intelligence</h2>
        <p className="lede">
          {data.flagged_considered} flagged entities considered, out of {data.total_transactions} total transactions.
          Correlates network-layer signals (GeoIP, ASN) with blockchain-layer risk — not a real-world identity claim.
        </p>
      </div>

      <GeoTemporalSection rows={alertRows} />

      <div style={{ display: "flex", gap: "var(--spacing-24)", flexWrap: "wrap", marginTop: "var(--spacing-32)" }}>
        <GeoGroup title="By Country" rows={data.by_country} labelKey="country" />
        <GeoGroup title="By ASN" rows={data.by_asn} labelKey="asn" />
      </div>
    </div>
  );
}
