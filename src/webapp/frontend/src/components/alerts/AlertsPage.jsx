import { useAlerts } from "../../hooks/useAlerts";
import AlertsTable from "./AlertsTable";
import EntityDetailDrawer from "./EntityDetailDrawer";

export default function AlertsPage({ selectedNodeId, onSelectNode }) {
  const { data, error, loading } = useAlerts();

  if (loading) return <p style={{ color: "var(--text-muted)" }}>Loading alerts…</p>;

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

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const wallets = rows.filter((r) => (r.node_type || "").toLowerCase() === "wallet");
  const txs = rows.filter((r) => (r.node_type || "").toLowerCase() !== "wallet");

  return (
    <div>
      <h2 style={{ marginBottom: "1rem" }}>Alert Investigation</h2>
      <AlertsTable title="Top Risk Wallets" rows={wallets} onSelectRow={onSelectNode} />
      <AlertsTable title="Top Risk Transactions" rows={txs} onSelectRow={onSelectNode} />
      <EntityDetailDrawer nodeId={selectedNodeId} onClose={() => onSelectNode(null)} />
    </div>
  );
}