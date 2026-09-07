function KpiCard({ label, value, sub }) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border-color)",
      borderRadius: "10px", padding: "1rem 1.25rem", flex: 1,
    }}>
      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.6rem", fontWeight: 700, fontFamily: "var(--font-mono)", marginTop: "0.3rem" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>{sub}</div>}
    </div>
  );
}

export default function KpiRow({ stats }) {
  const wallet = stats.node_type_breakdown?.wallet ?? 0;
  const tx = stats.node_type_breakdown?.tx ?? 0;

  return (
    <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
      <KpiCard
        label="Total Flagged"
        value={stats.total_flagged.toLocaleString()}
        sub={`${stats.risk_tier_counts.high} high · ${stats.risk_tier_counts.medium} medium · ${stats.risk_tier_counts.low} low`}
      />
      <KpiCard label="High-Risk Entities" value={stats.risk_tier_counts.high.toLocaleString()} sub={`risk_score ≥ ${stats.risk_tier_thresholds.high}`} />
      <KpiCard label="Wallets Flagged" value={wallet.toLocaleString()} />
      <KpiCard label="Transactions Flagged" value={tx.toLocaleString()} />
      <KpiCard label="Avg Risk Score" value={stats.avg_risk_score.toFixed(3)} />
    </div>
  );
}