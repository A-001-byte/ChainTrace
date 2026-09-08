import { lazy, Suspense, useMemo } from "react";
import { useGraphData } from "../../hooks/useGraphData";
import { CHART_COLORS as C } from "../../lib/chartColors";
import { num } from "../../lib/format";
import { Card, Stat, Stats, PageHead, Empty, ErrorCard, Reveal } from "../ui";

// three.js is ~1MB; it only loads when this page is opened.
const ForensicGraph3D = lazy(() => import("../graph/ForensicGraph3D"));

function Key({ c, ring, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <i style={{ width: 10, height: 10, borderRadius: "50%", background: ring ? "transparent" : c, border: ring ? `2px solid ${ring}` : "none", flex: "none" }} />
      {children}
    </span>
  );
}

export default function GraphPage({ focus, onOpen }) {
  const { data, error, loading } = useGraphData();
  const m = useMemo(() => {
    if (!data) return null;
    const scored = data.nodes.filter((n) => !n.is_context);
    const clusters = new Set(scored.map((n) => n.cluster_id).filter((c) => c !== null && c !== undefined));
    return { scored: scored.length, clusters: clusters.size, geo: scored.filter((n) => n.geo_temporal_flag).length };
  }, [data]);

  if (loading) return <Empty>Building graph…</Empty>;
  if (error) return <ErrorCard error={error} />;

  return (
    <>
      <Reveal>
        <PageHead
          title="Forensic graph"
          sub="The neighbourhood around the flagged entities. Layout is force-directed — position carries no meaning beyond connectivity."
        />
      </Reveal>

      <Reveal delay={0.04}>
        <Stats>
          <Stat k="Nodes" v={num(data.nodes.length)} s={`${num(m.scored)} scored`} />
          <Stat k="Edges" v={num(data.edges.length)} s="connections" />
          <Stat k="Clusters" v={num(m.clusters)} s="co-spend groups" />
          <Stat k="Mismatches" v={num(m.geo)} t="down" s="geo-temporal" />
        </Stats>
      </Reveal>

      <Reveal delay={0.08}>
        <Card flush>
          <Suspense fallback={<div className="empty" style={{ padding: 24, height: "62vh" }}>Loading renderer…</div>}>
            <ForensicGraph3D data={data} focusNodeId={focus} onSelectNode={onOpen} height="62vh" />
          </Suspense>
          <div className="meta" style={{ display: "flex", flexWrap: "wrap", gap: 24, padding: "16px 24px", borderTop: "1px solid var(--hair)", alignItems: "center" }}>
            <Key c={C.VIOLET}>Colour is the cluster</Key>
            <Key c={C.SLATE}>Size is the risk score</Key>
            <Key ring={C.DOWN}>Geo-temporal mismatch</Key>
            <Key c={C.LINE}>Unscored context</Key>
            <span style={{ marginLeft: "auto" }}>Drag to rotate · scroll to zoom · click a node for its record</span>
          </div>
        </Card>
      </Reveal>
    </>
  );
}
