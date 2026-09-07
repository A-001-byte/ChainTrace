import { useMemo, lazy, Suspense } from "react";
import { useGraphData } from "../../hooks/useGraphData";
import { clusterColor } from "../../lib/clusterColors";

// vis-network is ~800kB. Code-split it so the Overview landing page paints immediately
// instead of waiting on a renderer it doesn't use; it loads when the graph is opened.
const ForensicGraph = lazy(() => import("./ForensicGraph"));

function LegendSwatch({ color, border, shape = "dot", children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
      <span style={{
        width: 11, height: 11, background: color,
        border: border ? `2px solid ${border}` : "none",
        borderRadius: shape === "square" ? 2 : "50%",
        flexShrink: 0,
      }} />
      {children}
    </span>
  );
}

export default function GraphPanel({ focusNodeId, onSelectNode }) {
  const { data, error, loading } = useGraphData();

  const clusterIds = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.nodes.filter((n) => !n.is_context && n.cluster_id !== null).map((n) => n.cluster_id))]
      .sort((a, b) => a - b);
  }, [data]);

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-4)" }}>
        <div>
          <h2>Forensic Graph</h2>
          <p className="lede">
            Flagged entities and their immediate transaction neighbourhood. Colour encodes
            Louvain cluster membership, size encodes risk score, and squares are transactions.
            Click any node to open its full forensic record.
          </p>
        </div>
        {focusNodeId && (
          <span className="mono" style={{
            fontSize: "var(--text-xs)", color: "var(--accent-strong)",
            background: "var(--accent-dim)", border: "1px solid var(--accent-line)",
            borderRadius: "var(--radius-sm)", padding: "0.35rem 0.7rem", maxWidth: "40%",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0,
          }}>
            Focused: {focusNodeId}
          </span>
        )}
      </div>

      {loading && <p style={{ color: "var(--text-muted)" }}>Building graph…</p>}

      {error && (
        <div className="panel" style={{ padding: "var(--space-5)" }}>
          <h3 style={{ color: "var(--signal)", marginBottom: "var(--space-2)" }}>Graph Unavailable</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>{error}</p>
        </div>
      )}

      {data && (
        <div className="panel" style={{ padding: "var(--space-4)" }}>
          <div style={{
            display: "flex", flexWrap: "wrap", gap: "var(--space-4)", alignItems: "center",
            paddingBottom: "var(--space-3)", marginBottom: "var(--space-3)",
            borderBottom: "1px solid var(--border-subtle)",
          }}>
            <span className="eyebrow">Encoding</span>
            <LegendSwatch color="#38bdf8">colour = cluster</LegendSwatch>
            <LegendSwatch color="#7c8aa5" shape="square">square = transaction</LegendSwatch>
            <LegendSwatch color="#7c8aa5">circle = wallet</LegendSwatch>
            <LegendSwatch color="#38bdf8" border="#ffb020">amber ring = geo-temporal mismatch</LegendSwatch>
            <LegendSwatch color="#243149">unscored context</LegendSwatch>
            <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--text-faint)" }} className="mono">
              {data.nodes.length} nodes · {data.edges.length} edges · {clusterIds.length} clusters
            </span>
          </div>

          {clusterIds.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "var(--space-3)" }}>
              {clusterIds.map((cid) => (
                <span key={cid} className="mono" style={{
                  fontSize: "var(--text-2xs)", padding: "0.12rem 0.4rem", borderRadius: 4,
                  color: clusterColor(cid), background: "var(--surface-2-solid)",
                  border: `1px solid ${clusterColor(cid)}44`,
                }}>
                  c{cid}
                </span>
              ))}
            </div>
          )}

          <Suspense fallback={
            <div style={{
              height: "68vh", display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--surface-sunken)", borderRadius: "var(--radius)",
              color: "var(--text-muted)", fontSize: "var(--text-sm)",
            }}>
              Loading graph renderer…
            </div>
          }>
            <ForensicGraph data={data} focusNodeId={focusNodeId} onSelectNode={onSelectNode} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
