import EntitySearch from "../shared/EntitySearch";

export default function TopBar({ onLookupEntity }) {
  return (
    <header className="topbar">
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--spacing-12)", flexShrink: 0 }}>
        <span style={{
          fontSize: "var(--text-body-lg)",
          lineHeight: "var(--leading-body-lg)",
          letterSpacing: "var(--tracking-body-lg)",
          fontWeight: "var(--weight-semi)",
          color: "var(--color-paper)",
        }}>
          ChainTrace
        </span>
        <span style={{
          color: "var(--color-ash)",
          fontSize: "var(--text-caption)",
          lineHeight: "var(--leading-caption)",
          fontWeight: "var(--weight-regular)",
        }}>
          Bitcoin Forensics &amp; Threat Intelligence
        </span>
      </div>

      <div style={{ display: "flex", gap: "var(--spacing-20)", alignItems: "center" }}>
        <EntitySearch onSubmit={onLookupEntity} />
        <span className="status-badge"><span className="dot" /> System Operational</span>
      </div>
    </header>
  );
}
