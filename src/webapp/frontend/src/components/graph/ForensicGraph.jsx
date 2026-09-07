import { useEffect, useRef, useMemo } from "react";
import { Network } from "vis-network/standalone";
import { clusterColor } from "../../lib/clusterColors";

/**
 * Client-side forensic graph.
 *
 * Replaces the previous iframe of the server-rendered pyvis picture. That version
 * coloured every node by risk only, so the Louvain cluster structure that actually
 * exists in the data was invisible, and an iframe can't report clicks back to React.
 *
 * Visual encoding (all four are real, data-driven):
 *   colour  -> cluster_id (categorical palette; context nodes stay slate)
 *   size    -> risk_score
 *   shape   -> wallet (dot) vs tx (square/diamond)
 *   border  -> geo-temporal mismatch gets a muted-amber ring (#d99a4e, risk family)
 */
export default function ForensicGraph({ data, focusNodeId, onSelectNode, height = "68vh" }) {
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  // Kept in a ref so the click handler always sees the latest callback without the
  // network having to be torn down and rebuilt whenever the parent re-renders.
  const onSelectRef = useRef(onSelectNode);
  useEffect(() => { onSelectRef.current = onSelectNode; }, [onSelectNode]);

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };

    const visNodes = data.nodes.map((n) => {
      const isContext = n.is_context;
      const risk = typeof n.risk_score === "number" ? n.risk_score : null;
      const base = clusterColor(isContext ? null : n.cluster_id);

      // Scored entities scale 16->34 by risk; context nodes stay small and quiet so the
      // eye goes to what the pipeline actually scored.
      const size = isContext ? 8 : 16 + (risk ?? 0) * 18;

      const tooltipLines = [
        n.id,
        risk !== null ? `risk_score: ${risk.toFixed(4)}` : "risk_score: not scored (outside top alerts)",
        n.cluster_id !== null && n.cluster_id !== undefined ? `cluster: ${n.cluster_id}` : null,
        n.intent_label ? `intent: ${n.intent_label}` : null,
        n.geo_temporal_flag ? "GEO-TEMPORAL MISMATCH" : null,
        n.reason ? `\n${n.reason}` : null,
      ].filter(Boolean);

      return {
        id: n.id,
        shape: n.node_type === "tx" ? "square" : "dot",
        size,
        color: {
          background: isContext ? "#1c1e22" : base,
          border: n.geo_temporal_flag ? "#d99a4e" : (isContext ? "#23252a" : base),
          highlight: { background: base, border: "#e4f222" },
          hover: { background: base, border: "#e4f222" },
        },
        borderWidth: n.geo_temporal_flag ? 4 : (isContext ? 1 : 2),
        // vis-network renders `title` as its own tooltip; \n is preserved.
        title: tooltipLines.join("\n"),
        label: isContext ? undefined : `${n.id.slice(0, 10)}…`,
        font: { color: "#8a8f98", size: 11, face: "ui-monospace, Menlo, Consolas, monospace", strokeWidth: 0 },
        opacity: isContext ? 0.55 : 1,
        _isContext: isContext,
      };
    });

    const visEdges = data.edges.map((e, i) => ({
      id: `e${i}`,
      from: e.from,
      to: e.to,
      color: { color: "#23252a", highlight: "#e4f222", opacity: 0.8 },
      width: 1,
    }));

    return { nodes: visNodes, edges: visEdges };
  }, [data]);

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return;

    const network = new Network(
      containerRef.current,
      { nodes, edges },
      {
        physics: {
          // barnesHut settles a few-hundred-node graph quickly; stabilization is capped
          // so the canvas becomes interactive fast instead of simmering during a demo.
          solver: "barnesHut",
          barnesHut: { gravitationalConstant: -8000, springLength: 120, springConstant: 0.03, damping: 0.35 },
          stabilization: { enabled: true, iterations: 220, fit: true },
        },
        interaction: { hover: true, tooltipDelay: 90, navigationButtons: false, keyboard: false },
        nodes: { borderWidthSelected: 4, scaling: { min: 8, max: 36 } },
        edges: { smooth: { type: "continuous", roundness: 0.35 } },
        layout: { improvedLayout: false },
      }
    );

    networkRef.current = network;

    network.on("click", (params) => {
      if (params.nodes.length > 0) onSelectRef.current?.(String(params.nodes[0]));
    });

    // Physics off once settled: a graph that keeps drifting under the cursor reads as
    // unstable on a projector, and it stops burning CPU during the pitch.
    network.once("stabilizationIterationsDone", () => network.setOptions({ physics: false }));

    return () => { network.destroy(); networkRef.current = null; };
  }, [nodes, edges]);

  // Focus is applied separately so selecting an entity doesn't rebuild the whole network.
  useEffect(() => {
    const network = networkRef.current;
    if (!network || !focusNodeId) return;
    try {
      network.selectNodes([focusNodeId]);
      network.focus(focusNodeId, { scale: 1.15, animation: { duration: 480, easingFunction: "easeInOutCubic" } });
    } catch {
      // Focused entity isn't part of this neighbourhood view -- leave the camera alone.
    }
  }, [focusNodeId, nodes]);

  return (
    <div
      ref={containerRef}
      style={{
        height,
        width: "100%",
        background: "var(--surface-sunken)",
        borderRadius: "var(--radius)",
      }}
    />
  );
}
