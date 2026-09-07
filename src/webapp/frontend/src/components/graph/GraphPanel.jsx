import { useMemo, lazy, Suspense } from "react";
import { useGraphData } from "../../hooks/useGraphData";
import { clusterColor } from "../../lib/clusterColors";

// vis-network is ~800kB. Code-split it so the Overview landing page paints immediately
// instead of waiting on a renderer it doesn't use; it loads when the graph is opened.
const ForensicGraph = lazy(() => import("./ForensicGraph"));

function LegendSwatch({ color, border, shape = "dot", children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "var(--text-caption)", color: "var(--color-fog)" }}>
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
            fontSize: "var(--text-xs)", color: "var(--color-mist)",
            background: "rgba(255,255,255,0.02)", boxShadow: "var(--color-graphite) 0px 0px 0px 1px inset",
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
            <LegendSwatch color="#6366f1">colour = cluster</LegendSwatch>
            <LegendSwatch color="#8a8f98" shape="square">square = transaction</LegendSwatch>
            <LegendSwatch color="#8a8f98">circle = wallet</LegendSwatch>
            <LegendSwatch color="#6366f1" border="#d99a4e">amber ring = geo-temporal mismatch</LegendSwatch>
            <LegendSwatch color="#1c1e22">unscored context</LegendSwatch>
            <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--text-faint)" }} className="mono">
              {data.nodes.length} nodes · {data.edges.length} edges · {clusterIds.length} clusters
            </span>
          </div>

          {clusterIds.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "var(--space-3)" }}>
              {clusterIds.map((cid) => (
                <span key={cid} className="mono" style={{
                  fontSize: "var(--text-caption)", padding: "2px var(--spacing-8)", borderRadius: "var(--radius-badges)",
                  color: clusterColor(cid), background: "rgba(255,255,255,0.02)",
                  boxShadow: `${clusterColor(cid)}47 0px 0px 0px 1px inset`,
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
