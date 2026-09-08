import { lazy, Suspense, useMemo } from "react";
import { useGraphData } from "../../hooks/useGraphData";
import { clusterColor } from "../../lib/clusterColors";
import { CHART_COLORS as C } from "../../lib/chartColors";
import { num } from "../../lib/format";
import { Card, Tile, Tiles, Section, Empty, ErrorCard, Reveal } from "../ui";
import { Histogram, HBars, Donut } from "../charts";

// three.js is ~1MB; it only loads when this page is opened.
const ForensicGraph3D = lazy(() => import("../graph/ForensicGraph3D"));

function Sw({ c, ring }) {
  return <i style={{ display: "inline-block", width: 8, height: 8, background: ring ? "transparent" : c, border: `2px solid ${ring ?? c}`, borderRadius: "50%", verticalAlign: -1, marginRight: 6 }} />;
}

export default function GraphPage({ focus, onOpen }) {
  const { data, error, loading } = useGraphData();
  const m = useMemo(() => {
    if (!data) return null;
    const scored = data.nodes.filter((n) => !n.is_context);
    const deg = new Map();
    for (const e of data.edges) { deg.set(e.from, (deg.get(e.from) ?? 0) + 1); deg.set(e.to, (deg.get(e.to) ?? 0) + 1); }
    const withDeg = data.nodes.map((n) => ({ ...n, deg: deg.get(n.id) ?? 0 }));
    const cl = new Map();
    for (const n of scored) { if (n.cluster_id == null) continue; const e = cl.get(n.cluster_id) ?? { k: `c${n.cluster_id}`, id: n.cluster_id, n: 0 }; e.n += 1; cl.set(n.cluster_id, e); }
    const clusters = [...cl.values()].sort((a, b) => b.n - a.n);
    const kind = data.nodes.map((n) => ({ kind: n.is_context ? "context" : "scored" }));
    return { scored, withDeg, clusters, kind, geo: scored.filter((n) => n.geo_temporal_flag).length, maxDeg: Math.max(0, ...withDeg.map((n) => n.deg)) };
  }, [data]);

  if (loading) return <Empty>Building graph…</Empty>;
  if (error) return <ErrorCard error={error} />;

  return (
    <>
      <Section eyebrow="Forensic graph">
        <Reveal>
          <Tiles>
            <Tile k="Nodes" v={num(data.nodes.length)} s={`${num(m.scored.length)} scored`} />
            <Tile k="Edges" v={num(data.edges.length)} s="neighbourhood" />
            <Tile k="Clusters" v={num(m.clusters.length)} s="louvain" />
            <Tile k="Context" v={num(data.nodes.length - m.scored.length)} s="unscored" />
            <Tile k="Mismatches" v={num(m.geo)} tone="orange" s="geo-temporal" />
            <Tile k="Degree" v={num(m.maxDeg)} s="maximum" />
          </Tiles>
        </Reveal>
        <div className="grid g3">
          <Reveal delay={0.03}><Card title="Degree" right="edges per node"><Histogram rows={m.withDeg} field="deg" name="nodes" min={0} color={C.STONE} /></Card></Reveal>
          <Reveal delay={0.06}><Card title="Clusters" right="scored members"><HBars data={m.clusters.slice(0, 8)} name="members" colorBy={(e) => clusterColor(e.id)} /></Card></Reveal>
          <Reveal delay={0.09}><Card title="Composition" right="scored vs context"><Donut rows={m.kind} field="kind" colors={[C.BONE, C.GRAPHITE]} /></Card></Reveal>
        </div>
      </Section>

      <Section eyebrow="3D view" right={<span className="eyebrow">drag rotate · wheel zoom · click → record{focus ? ` · focus ${focus}` : ""}</span>}>
        <Reveal>
          <Card panel>
            <Suspense fallback={<div className="empty" style={{ height: "64vh", padding: 24 }}>Loading renderer…</div>}>
              <ForensicGraph3D data={data} focusNodeId={focus} onSelectNode={onOpen} height="64vh" />
            </Suspense>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, padding: "14px 20px", borderTop: "1px solid var(--lift)" }} className="eyebrow">
              <span><Sw c={clusterColor(1)} />cluster</span>
              <span><Sw c={C.BONE} />size = risk</span>
              <span><Sw c={C.ORANGE} ring={C.ORANGE} />geo-temporal mismatch</span>
              <span><Sw c={C.STROKE} />context</span>
              <span style={{ marginLeft: "auto", color: "var(--granite)" }}>neighbourhood of flagged entities · layout carries no meaning</span>
            </div>
          </Card>
        </Reveal>
      </Section>
    </>
  );
}
