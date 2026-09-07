export default function TopBar() {
  return (
    <header className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <strong style={{ fontSize: "1.05rem", letterSpacing: "-0.01em" }}>
          Chain<span style={{ color: "var(--accent-cyan)" }}>Trace</span>
        </strong>
        <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
          Bitcoin Forensics &amp; Threat Intelligence
        </span>
      </div>
      <div style={{ display: "flex", gap: "0.6rem" }}>
        <span className="status-badge"><span className="dot" /> System Operational</span>
      </div>
    </header>
  );
}