import { useMemo } from "react";
import { useAlerts } from "../../hooks/useAlerts";
import { CHART_COLORS as C } from "../../lib/chartColors";
import { num, short, pct } from "../../lib/format";
import { Card, Tile, Tiles, Section, Tag, Empty, ErrorCard, Reveal } from "../ui";
import { Donut, Histogram, CountBars, XYScatter, HBars } from "../charts";

export default function PatternPage() {
  const { data, error, loading } = useAlerts();
  const rows = useMemo(() => (Array.isArray(data?.rows) ? data.rows : []), [data]);
  const withIntent = useMemo(() => rows.filter((r) => r.intent_label), [rows]);
  const byLabel = useMemo(() => {
    const m = new Map();
    for (const r of withIntent) { const e = m.get(r.intent_label) ?? { k: r.intent_label, n: 0, sum: 0, c: 0 }; e.n += 1; if (typeof r.intent_confidence === "number") { e.sum += r.intent_confidence; e.c += 1; } m.set(r.intent_label, e); }
    return [...m.values()].map((e) => ({ ...e, avg: e.c ? e.sum / e.c : 0 })).sort((a, b) => b.n - a.n);
  }, [withIntent]);

  if (loading) return <Empty>Loading pattern intelligence…</Empty>;
  if (error) return <ErrorCard error={error} />;
  const total = withIntent.length;
  const conf = withIntent.map((r) => r.intent_confidence).filter((v) => typeof v === "number");
  const avgConf = conf.length ? conf.reduce((s, v) => s + v, 0) / conf.length : null;

  return (
    <>
      <Section eyebrow="Intent intelligence" right={<span className="eyebrow">rule-based structural pattern matcher</span>}>
        <Reveal>
          <Card light panel>
            <div style={{ padding: 24 }}>
              <Tiles>
                <Tile k="Labelled" v={num(total)} s={`of ${num(rows.length)} alerts`} />
                <Tile k="Coverage" v={rows.length ? pct(total / rows.length, 0) : "—"} s="alerts with a label" />
                <Tile k="Archetypes" v={num(byLabel.length)} s="distinct" />
                <Tile k="Confidence" v={avgConf === null ? "—" : avgConf.toFixed(2)} s="average" />
              </Tiles>
              <div className="note" style={{ marginTop: 20, maxWidth: "none" }}>Scores transaction structure against published descriptions of known crime-type money-movement shapes. It is not a trained crime-type classifier — no crime-type ground truth exists in the dataset. Labels reflect pattern similarity, not determinations of fact; hence "-shaped".</div>
            </div>
          </Card>
        </Reveal>
        {total === 0 ? <Empty>No flagged entity in the current dataset has an intent_label yet.</Empty> : (
          <div className="grid g3">
            <Reveal delay={0.03}><Card title="Archetypes" right="categorical · never severity"><Donut rows={withIntent} field="intent_label" /></Card></Reveal>
            <Reveal delay={0.06}><Card title="Confidence" right="by archetype · average"><HBars data={byLabel.map((e) => ({ k: e.k, n: e.avg }))} name="avg confidence" color={C.STONE} fmt={(v) => Number(v).toFixed(2)} /></Card></Reveal>
            <Reveal delay={0.09}><Card title="Confidence" right="distribution"><Histogram rows={withIntent} field="intent_confidence" name="entities" min={0} max={1} color={C.STONE} /></Card></Reveal>
            <Reveal delay={0.12}><Card title="Hop depth"><CountBars rows={withIntent} field="intent_hop_depth" color={C.STONE} /></Card></Reveal>
            <Reveal delay={0.15}><Card title="Timing"><CountBars rows={withIntent} field="intent_timing_pattern" color={C.STONE} /></Card></Reveal>
            <Reveal delay={0.18}><Card title="Fan-in × Fan-out" right="size = risk"><XYScatter rows={withIntent} x="intent_fan_in" y="intent_fan_out" z="risk_score" xName="fan-in" yName="fan-out" /></Card></Reveal>
          </div>
        )}
      </Section>

      {total > 0 && (
        <Section eyebrow="Labelled entities">
          <Reveal>
            <Card flush>
              <div style={{ maxHeight: 480, overflowY: "auto" }}>
                <table className="tbl">
                  <thead><tr><th>Node</th><th>Archetype</th><th className="r">Confidence</th><th className="r">Fan-in</th><th className="r">Fan-out</th><th className="r">Hops</th><th>Explanation</th></tr></thead>
                  <tbody>{withIntent.map((r) => (
                    <tr key={r.node_id}>
                      <td className="fg mono" title={r.node_id}>{short(r.node_id, 22)}</td><td><Tag>{r.intent_label}</Tag></td>
                      <td className="r mono">{typeof r.intent_confidence === "number" ? r.intent_confidence.toFixed(2) : "—"}</td>
                      <td className="r mono">{r.intent_fan_in ?? "—"}</td><td className="r mono">{r.intent_fan_out ?? "—"}</td><td className="r mono">{r.intent_hop_depth ?? "—"}</td>
                      <td className="trunc" style={{ maxWidth: 420 }} title={r.intent_explanation}>{r.intent_explanation ?? "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          </Reveal>
        </Section>
      )}
    </>
  );
}
