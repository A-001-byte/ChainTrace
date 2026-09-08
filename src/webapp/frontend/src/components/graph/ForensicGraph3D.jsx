import { useEffect, useMemo, useRef } from "react";
import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { clusterColor } from "../../lib/clusterColors";

const BG = "#04070c";
const AMBER = "#ffb347";
const CONTEXT = "#163044";

/**
 * 3D force-directed forensic graph with bloom.
 *
 * Encoding (all data-driven, same as the 2D view it replaces):
 *   colour     cluster_id (categorical); context nodes stay a dim slate
 *   size       risk_score
 *   ring       geo-temporal mismatch -> amber torus around the node
 *   particles  flow along edges of scored entities (cyan)
 * Click a node -> onSelectNode(id). focusNodeId flies the camera to that node.
 * Honours prefers-reduced-motion: no particle flow, short settle, no camera fly.
 */
export default function ForensicGraph3D({ data, focusNodeId, onSelectNode, height = "68vh" }) {
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
      .nodeColor((n) => (n.is_context ? CONTEXT : clusterColor(n.cluster_id)))
      .nodeOpacity(0.95)
      .nodeResolution(18)
      .nodeLabel((n) => {
        const risk = typeof n.risk_score === "number" ? n.risk_score.toFixed(4) : "not scored (context)";
        return `<div style="font:11px 'Fira Code',monospace;color:#e2f0fb;background:rgba(4,7,12,.95);border:1px solid rgba(0,229,255,.45);padding:6px 8px;max-width:340px;white-space:normal">
          <div style="color:#00e5ff">${n.id}</div>
          <div>risk_score ${risk}${n.cluster_id != null ? ` · cluster ${n.cluster_id}` : ""}</div>
          ${n.intent_label ? `<div style="color:#a78bfa">${n.intent_label}</div>` : ""}
          ${n.geo_temporal_flag ? `<div style="color:${AMBER}">GEO-TEMPORAL MISMATCH</div>` : ""}
          ${n.reason ? `<div style="color:#93abc0;margin-top:4px">${n.reason}</div>` : ""}
        </div>`;
      })
      .nodeThreeObjectExtend(true)
      .nodeThreeObject((n) => {
        if (!n.geo_temporal_flag) return false;
        // amber ring = the same geo-temporal signal used everywhere else in the app
        const r = 4 * Math.cbrt(1.5 + (n.risk_score ?? 0) * 6);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(r * 1.9, r * 0.14, 8, 40),
          new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.9 }),
        );
        ring.rotation.x = Math.PI / 2;
        return ring;
      })
      .linkColor(() => "rgba(0,229,255,0.35)")
      .linkOpacity(0.35)
      .linkWidth(0.5)
      .linkDirectionalParticles((l) => (rm ? 0 : (l.source?.is_context && l.target?.is_context ? 0 : 2)))
      .linkDirectionalParticleWidth(1.4)
      .linkDirectionalParticleSpeed(0.006)
      .linkDirectionalParticleColor(() => "#00e5ff")
      .onNodeClick((n) => selectRef.current?.(String(n.id)))
      .onNodeHover((n) => { el.style.cursor = n ? "pointer" : null; })
      .cooldownTicks(rm ? 40 : 160)
      .d3VelocityDecay(0.3)
      .graphData(graphData);

    g.d3Force("charge").strength(-90);
    g.d3Force("link").distance(28);

    // Bloom is what makes it glow: bright node colours and cyan particles bleed light.
    const rect = el.getBoundingClientRect();
    const bloom = new UnrealBloomPass(new THREE.Vector2(rect.width || 800, rect.height || 600), 1.35, 0.55, 0.12);
    g.postProcessingComposer().addPass(bloom);

    // Soft ambient so cluster colours read; the glow does the rest.
    const scene = g.scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));

    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); g.width(r.width); g.height(r.height); bloom.setSize(r.width, r.height); });
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
      g.cameraPosition({ x: node.x * ratio, y: node.y * ratio, z: node.z * ratio }, node, rm ? 0 : 900);
    }, 600);
    return () => clearTimeout(t);
  }, [focusNodeId, graphData, rm]);

  return <div ref={elRef} style={{ width: "100%", height, background: BG }} />;
}
