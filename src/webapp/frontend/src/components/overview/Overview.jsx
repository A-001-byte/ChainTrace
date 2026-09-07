import { useStats } from "../../hooks/useStats";
import KpiRow from "./KpiRow";

export default function Overview() {
  const { data, error, loading } = useStats();

  if (loading) {
    return <p style={{ color: "var(--text-muted)" }}>Loading overview…</p>;
  }

  // Genuine network/parse failure — fetch() itself threw. Still a real possibility
  // (server not running, malformed JSON), so this branch stays.
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

  const isMock = data.data_source_label?.toLowerCase().includes("mock");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Overview</h2>
        <span style={{
          fontSize: "0.72rem", padding: "0.25rem 0.6rem", borderRadius: "20px",
          color: isMock ? "var(--warning)" : "var(--success)",
          background: isMock ? "rgba(255,145,0,0.12)" : "rgba(0,230,118,0.12)",
          border: `1px solid ${isMock ? "var(--warning)" : "var(--success)"}33`,
        }}>
          {isMock ? "OFFLINE MOCK DATA" : "LIVE DATASET"}
        </span>
      </div>
      {data.warnings?.length > 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginBottom: "1rem" }}>
          {data.warnings.join(" ")}
        </p>
      )}
      <KpiRow stats={data} />
    </div>
  );
}