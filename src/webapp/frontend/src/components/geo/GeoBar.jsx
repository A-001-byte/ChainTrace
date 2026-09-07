export default function GeoBar({ label, flaggedCount, avgRisk, maxRisk, maxCount }) {
  const pct = maxCount > 0 ? (flaggedCount / maxCount) * 100 : 0;
  let barColor = "var(--success)";
  if (avgRisk >= 0.8) barColor = "var(--danger)";
  else if (avgRisk >= 0.6) barColor = "var(--warning)";

  return (
    <div style={{ marginBottom: "0.6rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.2rem" }}>
        <span style={{ color: "var(--text-primary)" }}>{label}</span>
        <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
          {flaggedCount} flagged · avg {avgRisk?.toFixed(2) ?? "-"} · max {maxRisk?.toFixed(2) ?? "-"}
        </span>
      </div>
      <div style={{ background: "var(--bg-main)", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: "4px" }} />
      </div>
    </div>
  );
}