import { useEffect, useMemo, useRef } from "react";
import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import { clusterColor } from "../../lib/clusterColors";
import { CHART_COLORS as C } from "../../lib/chartColors";

const BG = "#ffffff";
const CONTEXT = "#c9c9d3";

/**
 * 3D force-directed forensic graph — flat shading on the light canvas, no post-processing.
 *
 * Encoding (all data-driven):
 *   colour     cluster_id (violet-to-slate ramp); context nodes stay a light grey
 *   size       risk_score
 *   ring       geo-temporal mismatch -> red torus around the node
 * Click a node -> onSelectNode(id). focusNodeId flies the camera to that node.
 * Honours prefers-reduced-motion: short settle, no camera fly.
 */
export default function ForensicGraph3D({ data, focusNodeId, onSelectNode, height = "62vh" }) {
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
      .nodeRelSize(6)
      .nodeVal((n) => (n.is_context ? 1.2 : 3 + (n.risk_score ?? 0) * 9))
      .nodeColor((n) => (n.is_context ? CONTEXT : clusterColor(n.cluster_id)))
      .nodeOpacity(1)
      .nodeResolution(16)
      .nodeLabel((n) => {
        const risk = typeof n.risk_score === "number" ? n.risk_score.toFixed(4) : "not scored (context)";
        return `<div style="font:12px Inter,system-ui,sans-serif;color:#686b82;background:#fff;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.12);padding:10px 12px;max-width:320px;white-space:normal">
          <div style="color:#101114;font-weight:500;margin-bottom:2px">${n.id}</div>
          <div>Risk ${risk}${n.cluster_id != null ? ` · cluster ${n.cluster_id}` : ""}</div>
          ${n.intent_label ? `<div>${n.intent_label}</div>` : ""}
          ${n.geo_temporal_flag ? `<div style="color:${C.DOWN}">Geo-temporal mismatch</div>` : ""}
        </div>`;
      })
      .nodeThreeObjectExtend(true)
      .nodeThreeObject((n) => {
        if (!n.geo_temporal_flag) return false;
        // red ring = the same geo-temporal signal used everywhere else in the app
        const r = 6 * Math.cbrt(3 + (n.risk_score ?? 0) * 9);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.7, r * 0.12, 8, 40), new THREE.MeshBasicMaterial({ color: C.DOWN }));
        ring.rotation.x = Math.PI / 2;
        return ring;
      })
      .linkColor(() => "rgba(16,17,20,0.14)")
      .linkWidth(0.5)
      .onNodeClick((n) => selectRef.current?.(String(n.id)))
      .onNodeHover((n) => { el.style.cursor = n ? "pointer" : null; })
      .cooldownTicks(rm ? 40 : 160)
      .d3VelocityDecay(0.3)
      .graphData(graphData);

    g.d3Force("charge").strength(-120);
    g.d3Force("link").distance(34);

    // Flat lighting: the node colours are the whole encoding, no speculars or glow.
    const scene = g.scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));

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
      const dist = 110;
      const ratio = 1 + dist / Math.hypot(node.x, node.y, node.z);
      g.cameraPosition({ x: node.x * ratio, y: node.y * ratio, z: node.z * ratio }, node, rm ? 0 : 700);
    }, 600);
    return () => clearTimeout(t);
  }, [focusNodeId, graphData, rm]);

  return <div ref={elRef} style={{ width: "100%", height, background: BG }} />;
}
