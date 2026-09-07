import { useGeo } from "../../hooks/useGeo";
import GeoBar from "./GeoBar";

function GeoGroup({ title, rows, labelKey }) {
  const maxCount = rows.length > 0 ? Math.max(...rows.map((r) => r.flagged_count ?? 0)) : 0;
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border-color)",
      borderRadius: "10px", padding: "1.2rem", flex: 1, minWidth: "320px",
    }}>
      <h3 style={{ fontSize: "0.85rem", marginBottom: "1rem", color: "var(--text-primary)" }}>{title}</h3>
      {rows.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>No data available.</p>
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

export default function GeoPage() {
  const { data, error, loading } = useGeo();

  if (loading) return <p style={{ color: "var(--text-muted)" }}>Loading geo intelligence…</p>;

  if (error) {
    return (
      <div style={{
        background: "var(--bg-card)", border: "1px dashed var(--border-color)",
        borderRadius: "10px", padding: "1.5rem", color: "var(--text-secondary)",
      }}>
        <h3 style={{ color: "var(--warning)", marginBottom: "0.5rem" }}>Data Source Unavailable</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: "0.4rem" }}>Geo Intelligence</h2>
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.2rem" }}>
        {data.flagged_considered} flagged entities considered, out of {data.total_transactions} total transactions.
        Correlates network-layer signals (GeoIP, ASN) with blockchain-layer risk — not a real-world identity claim.
      </p>
      <div style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap" }}>
        <GeoGroup title="By Country" rows={data.by_country} labelKey="country" />
        <GeoGroup title="By ASN" rows={data.by_asn} labelKey="asn" />
      </div>

      {/* Geo-Temporal Mismatch summary will appear here automatically once
          Ankit's attach_to_alerts() is wired into the real pipeline — the
          alert-level geo_temporal_flag already flows through the Alerts
          drawer with no code change needed on this end. */}
    </div>
  );
}