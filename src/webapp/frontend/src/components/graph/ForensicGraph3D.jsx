import { useEffect, useMemo, useRef } from "react";
import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import { clusterColor } from "../../lib/clusterColors";
import { CHART_COLORS as C } from "../../lib/chartColors";

const BG = "#101010";

/**
 * 3D force-directed forensic graph — flat shading, no post-processing.
 *
 * Encoding (all data-driven):
 *   colour     cluster_id (neutral luminance ramp); context nodes stay ash
 *   size       risk_score
 *   ring       geo-temporal mismatch -> orange torus around the node
 *   particles  flow along edges of scored entities (pale stone)
 * Click a node -> onSelectNode(id). focusNodeId flies the camera to that node.
 * Honours prefers-reduced-motion: no particle flow, short settle, no camera fly.
 */
export default function ForensicGraph3D({ data, focusNodeId, onSelectNode, height = "64vh" }) {
  const elRef = useRef(null);
  const graphRef = useRef(null);
  const selectRef = useRef(onSelectNode);
  useEffect(() => { selectRef.current = onSelectNode; }, [onSelectNode]);

  const rm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] };
    const ids = new Set(data.nodes.map((n) => n.id));
    return {
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ source: e.from, target: e.to })),
    };
  }, [data]);

  useEffect(() => {
    const el = elRef.current;
    if (!el || graphData.nodes.length === 0) return;

    const g = ForceGraph3D()(el)
      .backgroundColor(BG)
      .showNavInfo(false)
      .nodeId("id")
      .nodeRelSize(4)
      .nodeVal((n) => (n.is_context ? 0.6 : 1.5 + (n.risk_score ?? 0) * 6))
      .nodeColor((n) => (n.is_context ? C.STROKE : clusterColor(n.cluster_id)))
      .nodeOpacity(1)
      .nodeResolution(16)
      .nodeLabel((n) => {
        const risk = typeof n.risk_score === "number" ? n.risk_score.toFixed(4) : "not scored (context)";
        return `<div style="font:12px 'Geist Mono Variable',ui-monospace,monospace;color:#b8b3b0;background:#101010;border:1px solid #3d3a39;border-radius:3px;padding:8px 10px;max-width:340px;white-space:normal">
          <div style="color:#eeeeee">${n.id}</div>
          <div>risk ${risk}${n.cluster_id != null ? ` · cluster ${n.cluster_id}` : ""}</div>
          ${n.intent_label ? `<div>${n.intent_label}</div>` : ""}
          ${n.geo_temporal_flag ? `<div style="color:${C.ORANGE}">GEO-TEMPORAL MISMATCH</div>` : ""}
          ${n.reason ? `<div style="color:#8a8380;margin-top:4px">${n.reason}</div>` : ""}
        </div>`;
      })
      .nodeThreeObjectExtend(true)
      .nodeThreeObject((n) => {
        if (!n.geo_temporal_flag) return false;
        // orange ring = the same geo-temporal signal used everywhere else in the app
        const r = 4 * Math.cbrt(1.5 + (n.risk_score ?? 0) * 6);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.9, r * 0.14, 8, 40), new THREE.MeshBasicMaterial({ color: C.ORANGE }));
        ring.rotation.x = Math.PI / 2;
        return ring;
      })
      .linkColor(() => "rgba(184,179,176,0.3)")
      .linkOpacity(0.3)
      .linkWidth(0.4)
      .linkDirectionalParticles((l) => (rm ? 0 : (l.source?.is_context && l.target?.is_context ? 0 : 2)))
      .linkDirectionalParticleWidth(1)
      .linkDirectionalParticleSpeed(0.005)
      .linkDirectionalParticleColor(() => C.STONE)
      .onNodeClick((n) => selectRef.current?.(String(n.id)))
      .onNodeHover((n) => { el.style.cursor = n ? "pointer" : null; })
      .cooldownTicks(rm ? 40 : 160)
      .d3VelocityDecay(0.3)
      .graphData(graphData);

    g.d3Force("charge").strength(-90);
    g.d3Force("link").distance(28);

    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); g.width(r.width); g.height(r.height); });
    ro.observe(el);
    graphRef.current = g;

    return () => { ro.disconnect(); g.pauseAnimation(); g._destructor?.(); graphRef.current = null; };
  }, [graphData, rm]);

  // Camera fly-to on focus — after the engine has had time to place nodes.
  useEffect(() => {
    const g = graphRef.current;
    if (!g || !focusNodeId) return;
    const t = setTimeout(() => {
      const node = g.graphData().nodes.find((n) => n.id === focusNodeId);
      if (!node || node.x === undefined) return;
      const dist = 90;
      const ratio = 1 + dist / Math.hypot(node.x, node.y, node.z);
      g.cameraPosition({ x: node.x * ratio, y: node.y * ratio, z: node.z * ratio }, node, rm ? 0 : 700);
    }, 600);
    return () => clearTimeout(t);
  }, [focusNodeId, graphData, rm]);

  return <div ref={elRef} style={{ width: "100%", height, background: BG }} />;
}
