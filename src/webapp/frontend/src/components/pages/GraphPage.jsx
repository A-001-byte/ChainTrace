import { lazy, Suspense, useMemo } from "react";
import { useGraphData } from "../../hooks/useGraphData";
import { clusterColor } from "../../lib/clusterColors";
import { Panel, Empty, ErrorPanel, Reveal } from "../ui";

// three.js + bloom is ~1MB; it only loads when this page is opened.
const ForensicGraph3D = lazy(() => import("../graph/ForensicGraph3D"));

function Sw({ c, sq, ring }) {
  return <i style={{ display: "inline-block", width: 9, height: 9, background: c, borderRadius: sq ? 0 : "50%", border: ring ? `2px solid ${ring}` : "none", boxShadow: `0 0 6px ${ring ?? c}`, verticalAlign: -1, marginRight: 5 }} />;
}

export default function GraphPage({ focus, onOpen }) {
  const { data, error, loading } = useGraphData();
  const cids = useMemo(() => (!data ? [] : [...new Set(data.nodes.filter((n) => !n.is_context && n.cluster_id !== null).map((n) => n.cluster_id))].sort((a, b) => a - b)), [data]);
  if (loading) return <Empty>building graph…</Empty>;
  if (error) return <ErrorPanel title="GRAPH UNAVAILABLE" error={error} />;
  return (
    <Reveal>
      <Panel title="forensic graph · 3d" right={<span>{data.nodes.length} nodes · {data.edges.length} edges · {cids.length} clusters{focus ? ` · focus ${focus}` : ""}</span>} flush>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: "5px 10px", borderBottom: "1px solid var(--line)", fontSize: "var(--fs-xs)", color: "var(--fg-dim)", alignItems: "center" }}>
          <span><Sw c="#a78bfa" />colour = cluster</span>
          <span><Sw c="#00e5ff" />size = risk_score</span>
          <span><Sw c="#a78bfa" ring="#ffb347" />amber ring = geo-temporal mismatch</span>
          <span><Sw c="#163044" />unscored context</span>
          <span><Sw c="#00e5ff" sq />particles = flow along scored edges</span>
          <span style={{ marginLeft: "auto" }}>drag rotate · wheel zoom · click node → record</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: "5px 10px", borderBottom: "1px solid var(--line)" }}>
          {cids.map((c) => <span key={c} className="tag" style={{ color: clusterColor(c), borderColor: clusterColor(c) + "77", boxShadow: `0 0 5px ${clusterColor(c)}44` }}>c{c}</span>)}
        </div>
        <Suspense fallback={<div className="empty" style={{ height: "68vh" }}>loading 3d renderer…</div>}>
          <ForensicGraph3D data={data} focusNodeId={focus} onSelectNode={onOpen} height="68vh" />
        </Suspense>
        <div className="note" style={{ padding: "5px 10px", borderTop: "1px solid var(--line)" }}>Neighbourhood view of the flagged entities, not the full 1M-node pipeline graph. Context nodes carry no persisted score and are drawn dim. Layout is force-directed — position carries no meaning beyond connectivity.</div>
      </Panel>
    </Reveal>
  );
}
