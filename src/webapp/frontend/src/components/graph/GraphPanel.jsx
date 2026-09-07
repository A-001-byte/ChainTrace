export default function GraphPanel({ focusNodeId }) {
  const src = focusNodeId
    ? `/api/graph?focus=${encodeURIComponent(focusNodeId)}`
    : "/api/graph";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
        <h2>Forensic Graph</h2>
        {focusNodeId && (
          <span style={{
            fontSize: "0.75rem", color: "var(--accent-cyan)", fontFamily: "var(--font-mono)",
            background: "var(--bg-card)", border: "1px solid var(--border-color)",
            borderRadius: "6px", padding: "0.3rem 0.6rem", maxWidth: "60%",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            Focused on {focusNodeId}
          </span>
        )}
      </div>
      <div style={{
        border: "1px solid var(--border-color)", borderRadius: "10px",
        overflow: "hidden", height: "70vh", background: "var(--bg-card)",
      }}>
        {/* key forces the iframe to remount (not just navigate) when focus changes,
            so the vis-network canvas inside reliably reinitializes rather than
            silently keeping stale positions from the previous graph. */}
        <iframe
          key={src}
          src={src}
          title="ChainTrace Forensic Graph"
          style={{ width: "100%", height: "100%", border: "none" }}
        />
      </div>
    </div>
  );
}