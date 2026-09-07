export default function RiskPill({ score }) {
  const s = typeof score === "number" ? score : 0;
  let color = "var(--success)", bg = "rgba(0,230,118,0.12)";
  if (s >= 0.8) { color = "var(--danger)"; bg = "rgba(255,23,68,0.12)"; }
  else if (s >= 0.6) { color = "var(--warning)"; bg = "rgba(255,145,0,0.12)"; }

  return (
    <span style={{
      display: "inline-block", padding: "0.15rem 0.5rem", borderRadius: "6px",
      fontFamily: "var(--font-mono)", fontSize: "0.8rem", fontWeight: 600,
      color, background: bg, border: `1px solid ${color}33`,
    }}>
      {s.toFixed(3)}
    </span>
  );
}