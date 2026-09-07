import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useGeo } from "../../hooks/useGeo";
import { useAlerts } from "../../hooks/useAlerts";
import { motionTokens } from "../../lib/motionTokens";
import GeoBar from "./GeoBar";

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
 * Geo-Temporal Mismatch summary.
 *
 * This section was previously a TODO comment on this page — the alert-level
 * geo_temporal_flag now flows through /api/alerts, so it is built here from the existing
 * useAlerts hook with no new endpoint and no new data path.
 *
 * Note this is a claimed-country vs activity-hours breakdown, not a cartographic map:
 * the dataset carries country codes and ASNs, not coordinates.
 */
function GeoTemporalPanel({ rows }) {
  const reduceMotion = useReducedMotion();

  const flagged = useMemo(
    () => (rows ?? []).filter((r) => r.geo_temporal_flag === true),
    [rows]
  );

  const byClaimedCountry = useMemo(() => {
    const counts = new Map();
    for (const r of flagged) {
      // The reason string starts "claims XX, but ..." — the claimed country is the
      // authoritative field to group by, read straight from the sentence the detector wrote.
      const m = /^claims\s+([A-Z]{2})/.exec(String(r.geo_temporal_reason ?? ""));
      const key = m ? m[1] : "—";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [flagged]);

  return (
    <div className="panel" style={{ padding: "var(--spacing-20)", marginTop: "var(--spacing-24)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--spacing-16)" }}>
        <span className="eyebrow">Geo-Temporal Mismatch</span>
        <span className="mono" style={{ fontSize: "var(--text-caption)", color: "var(--color-ash)" }}>
          {flagged.length} of {(rows ?? []).length} flagged entities
        </span>
      </div>

      {flagged.length === 0 ? (
        <p style={{ color: "var(--color-ash)", fontSize: "var(--text-caption)" }}>
          No geo-temporal mismatches among the current alerts.
        </p>
      ) : (
        <>
          {byClaimedCountry.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-8)", marginBottom: "var(--spacing-20)" }}>
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

          <div>
            {flagged.slice(0, 8).map((r, i) => (
              <motion.div
                key={r.node_id}
                initial={{ opacity: 0, y: reduceMotion ? 0 : motionTokens.distance.sm }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal,
                  ease: motionTokens.easing.smooth,
                  delay: reduceMotion ? 0 : Math.min(i, 8) * 0.04,
                }}
                style={{
                  display: "flex", gap: "var(--spacing-16)", alignItems: "baseline",
                  padding: "var(--spacing-12) 0",
                  borderBottom: i === Math.min(flagged.length, 8) - 1 ? "none" : "1px solid var(--color-graphite)",
                }}
              >
                <span className="mono" style={{
                  fontSize: "var(--text-caption)", color: "var(--color-mist)", flexShrink: 0,
                  width: "16rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {r.node_id}
                </span>
                <span style={{ fontSize: "var(--text-caption)", color: "var(--color-fog)", lineHeight: 1.5 }}>
                  {r.geo_temporal_reason}
                </span>
              </motion.div>
            ))}
          </div>
        </>
      )}

      <p style={{ fontSize: "var(--text-caption)", color: "var(--color-ash)", marginTop: "var(--spacing-16)", lineHeight: 1.5 }}>
        A wallet whose claimed GeoIP country contradicts the hours it is actually active —
        the timezone tell of a VPN exit node. Grouped by claimed country, not by observed
        location.
      </p>
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
      <div style={{ display: "flex", gap: "var(--spacing-24)", flexWrap: "wrap" }}>
        <GeoGroup title="By Country" rows={data.by_country} labelKey="country" />
        <GeoGroup title="By ASN" rows={data.by_asn} labelKey="asn" />
      </div>

      <GeoTemporalPanel rows={alertRows} />
    </div>
  );
}
