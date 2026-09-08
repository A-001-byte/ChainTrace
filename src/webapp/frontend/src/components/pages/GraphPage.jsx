import { lazy, Suspense, useMemo } from "react";
import { useGraphData } from "../../hooks/useGraphData";
import { clusterColor } from "../../lib/clusterColors";
import { Panel, Empty, ErrorPanel, Reveal } from "../ui";

// vis-network is ~650kB; only load it when this page is opened.
const ForensicGraph = lazy(() => import("../graph/ForensicGraph"));

function Sw({ c, sq, ring }) {
  return <i style={{ display: "inline-block", width: 9, height: 9, background: c, borderRadius: sq ? 0 : "50%", border: ring ? `2px solid ${ring}` : "none", verticalAlign: -1, marginRight: 5 }} />;
}

export default function GraphPage({ focus, onOpen }) {
  const { data, error, loading } = useGraphData();
  const cids = useMemo(() => (!data ? [] : [...new Set(data.nodes.filter((n) => !n.is_context && n.cluster_id !== null).map((n) => n.cluster_id))].sort((a, b) => a - b)), [data]);
  if (loading) return <Empty>building graph…</Empty>;
  if (error) return <ErrorPanel title="GRAPH UNAVAILABLE" error={error} />;
  return (
    <Reveal>
      <Panel
        title="forensic graph"
        right={<span>{data.nodes.length} nodes · {data.edges.length} edges · {cids.length} clusters{focus ? ` · focus ${focus}` : ""}</span>}
        flush
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: "4px 8px", borderBottom: "1px solid var(--rule)", fontSize: "var(--fs-xs)", color: "var(--fg-dim)", alignItems: "center" }}>
          <span><Sw c="#8f7cff" />colour = cluster</span>
          <span><Sw c="#8a94a3" sq />square = transaction</span>
          <span><Sw c="#8a94a3" />circle = wallet</span>
          <span><Sw c="#8f7cff" ring="#f0a030" />amber ring = geo-temporal mismatch</span>
          <span><Sw c="#1c1e22" />unscored context</span>
          <span style={{ marginLeft: "auto" }}>size = risk_score · click node → record</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: "4px 8px", borderBottom: "1px solid var(--rule)" }}>
          {cids.map((c) => <span key={c} className="tag" style={{ color: clusterColor(c), borderColor: clusterColor(c) + "66" }}>c{c}</span>)}
        </div>
        <Suspense fallback={<div className="empty" style={{ height: "66vh" }}>loading renderer…</div>}>
          <ForensicGraph data={data} focusNodeId={focus} onSelectNode={onOpen} height="66vh" />
        </Suspense>
        <div className="note" style={{ padding: "4px 8px", borderTop: "1px solid var(--rule)" }}>Neighbourhood view of the flagged entities, not the full 1M-node pipeline graph. Context nodes carry no persisted score and are drawn muted.</div>
      </Panel>
    </Reveal>
  );
}
