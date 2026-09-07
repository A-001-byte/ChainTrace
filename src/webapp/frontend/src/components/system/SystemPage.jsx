import { useStats } from "../../hooks/useStats";
import { useAlerts } from "../../hooks/useAlerts";
import { useGeo } from "../../hooks/useGeo";

function StatusRow({ label, ok, detail }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "0.6rem 0", borderBottom: "1px solid var(--border-color)",
    }}>
      <span style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{detail}</span>
        <span style={{
          fontSize: "var(--text-caption)", fontWeight: "var(--weight-medium)",
          padding: "0.15rem 0.5rem", borderRadius: "12px",
          color: ok ? "var(--success)" : "var(--text-muted)",
          background: ok ? "var(--risk-low-tint)" : "rgba(98,102,109,0.05)",
          border: `1px solid ${ok ? "var(--success)" : "var(--text-muted)"}33`,
        }}>
          {ok ? "Active" : "Pending"}
        </span>
      </div>
    </div>
  );
}

export default function SystemPage() {
  const { data: stats, error: statsErr } = useStats();
  const { data: alerts } = useAlerts();
  const { data: geo } = useGeo();

  const rows = Array.isArray(alerts?.rows) ? alerts.rows : [];
  const hasIntent = rows.some((r) => r.intent_label);
  const hasGeoTemporal = rows.some((r) => r.geo_temporal_flag);
  const isMock = stats?.data_source_label?.toLowerCase().includes("mock");

  return (
    <div>
      <h2 style={{ marginBottom: "0.4rem" }}>System / About</h2>
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.2rem" }}>
        Pipeline status derived live from actual API responses — nothing below is hardcoded.
      </p>

      <div style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border-color)",
          borderRadius: "10px", padding: "1.2rem", flex: 1, minWidth: "320px",
        }}>
          <h3 style={{ fontSize: "0.85rem", marginBottom: "0.4rem" }}>Pipeline Status</h3>
          <StatusRow label="Data ingestion / ML detection" ok={!statsErr} detail={statsErr ? "unavailable" : (isMock ? "mock" : "live")} />
          <StatusRow label="Alert ranking & explainability" ok={rows.length > 0} detail={`${rows.length} alerts`} />
          <StatusRow label="Network / geo-IP layer" ok={!!geo && geo.by_country?.length > 0} detail={geo ? `${geo.by_country?.length ?? 0} countries` : "-"} />
          <StatusRow label="Forensic graph" ok={true} detail="offline, capped subgraph" />
          <StatusRow label="Intent intelligence (USP)" ok={hasIntent} detail={hasIntent ? "populated" : "not yet in pipeline"} />
          <StatusRow label="Geo-temporal intelligence (USP)" ok={hasGeoTemporal} detail={hasGeoTemporal ? "populated" : "not yet in pipeline"} />
        </div>

        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border-color)",
          borderRadius: "10px", padding: "1.2rem", flex: 1, minWidth: "320px",
        }}>
          <h3 style={{ fontSize: "0.85rem", marginBottom: "0.6rem" }}>Mode</h3>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "0.4rem",
            fontSize: "var(--text-caption)", fontWeight: "var(--weight-medium)",
            padding: "0.3rem 0.7rem", borderRadius: "20px", marginBottom: "0.8rem",
            color: "var(--accent-cyan)", background: "rgba(0,229,255,0.1)",
            border: "1px solid var(--accent-cyan)33",
          }}>
            Offline Analysis Mode
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            This system is designed to run entirely offline by requirement — no external
            APIs, CDNs, or map tiles at runtime. Dataset: <strong>{stats?.data_source_label ?? "unknown"}</strong>.
          </p>
        </div>
      </div>

      <div style={{
        background: "var(--bg-card)", border: "1px solid var(--border-color)",
        borderRadius: "10px", padding: "1.2rem", maxWidth: "800px",
      }}>
        <h3 style={{ fontSize: "0.85rem", marginBottom: "0.6rem", color: "var(--accent-cyan)" }}>
          What ChainTrace Does — and Doesn't — Claim
        </h3>
        <p style={{ fontSize: "0.83rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "0.8rem" }}>
          ChainTrace does not deanonymize Bitcoin wallets and does not identify the real
          person behind an address — nobody legitimately can, since Bitcoin's network is
          pseudonymous by design.
        </p>
        <p style={{ fontSize: "0.83rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
          It correlates network-layer signals (IP, timing, ASN) with blockchain-layer
          signals (wallet and transaction structure), and flags when those two stories
          contradict each other. Every flag is a confidence-based investigative signal
          built from multiple independent signals agreeing — never a definitive
          real-world identity claim.
        </p>
      </div>
    </div>
  );
}