import { useAlerts } from "../../hooks/useAlerts";
import AlertsTable from "./AlertsTable";

export default function AlertsPage({ onSelectNode }) {
  const { data, error, loading } = useAlerts();

  if (loading) return <p style={{ color: "var(--text-muted)" }}>Loading alerts…</p>;

  if (error) {
    return (
      <div className="panel" style={{ padding: "var(--spacing-32)" }}>
        <h3 style={{ color: "var(--signal)", marginBottom: "var(--spacing-8)" }}>Data Source Unavailable</h3>
        <p style={{ color: "var(--color-fog)" }}>{error}</p>
      </div>
    );
  }

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const wallets = rows.filter((r) => (r.node_type || "").toLowerCase() === "wallet");
  const txs = rows.filter((r) => (r.node_type || "").toLowerCase() !== "wallet");

  return (
    <div>
      <div className="page-header">
        <h2>Alert Investigation</h2>
        <p className="lede">
          Ranked entities from the scored transaction graph. Wallets and transactions are
          kept in separate panels so a small number of flagged transactions can't be lost
          at the bottom of a much longer wallet list. Click any row for its full record.
        </p>
      </div>

      {/* Two independently paginated panels, side by side on wide screens. */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))",
        gap: "var(--spacing-24)",
        alignItems: "start",
      }}>
        <AlertsTable
          title="Wallets"
          subtitle="Addresses ranked by composite risk score"
          accent="var(--color-lavender)"
          rows={wallets}
          onSelectRow={onSelectNode}
        />
        <AlertsTable
          title="Transactions"
          subtitle="Flagged transactions — kept visible, not buried under wallets"
          accent="var(--color-signal-teal)"
          rows={txs}
          onSelectRow={onSelectNode}
        />
      </div>
    </div>
  );
}
