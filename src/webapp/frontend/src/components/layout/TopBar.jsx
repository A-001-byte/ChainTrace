import EntitySearch from "../shared/EntitySearch";

export default function TopBar({ onLookupEntity }) {
  return (
    <header className="topbar">
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)", flexShrink: 0 }}>
        <strong style={{ fontSize: "var(--text-lg)", letterSpacing: "var(--tracking-tight)" }}>
          Chain<span style={{ color: "var(--accent)" }}>Trace</span>
        </strong>
        <span style={{ color: "var(--text-faint)", fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
          Bitcoin Forensics &amp; Threat Intelligence
        </span>
      </div>

      <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "center" }}>
        <EntitySearch onSubmit={onLookupEntity} />
        <span className="status-badge"><span className="dot" /> System Operational</span>
      </div>
    </header>
  );
}
