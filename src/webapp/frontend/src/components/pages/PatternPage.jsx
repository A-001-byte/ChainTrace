import { useMemo } from "react";
import { useAlerts } from "../../hooks/useAlerts";
import { short, num, pct, tally } from "../../lib/format";
import { Card, Stat, Stats, PageHead, Section, Bar, Scroll, Empty, ErrorCard, Reveal } from "../ui";

export default function PatternPage() {
  const { data, error, loading } = useAlerts();
  const rows = useMemo(() => (Array.isArray(data?.rows) ? data.rows : []), [data]);
  const labelled = useMemo(() => rows.filter((r) => r.intent_label), [rows]);
  const archetypes = useMemo(() => tally(labelled, "intent_label"), [labelled]);

  if (loading) return <Empty>Loading pattern intelligence…</Empty>;
  if (error) return <ErrorCard error={error} />;

  const total = labelled.length;
  const conf = labelled.map((r) => r.intent_confidence).filter((v) => typeof v === "number");
  const avg = conf.length ? conf.reduce((s, v) => s + v, 0) / conf.length : null;

  return (
    <>
      <Reveal>
        <PageHead
          title="Intent intelligence"
          sub="A rule-based structural pattern matcher: it scores transaction structure against published descriptions of known crime-type money-movement shapes. It is not a trained crime-type classifier, since no crime-type ground truth exists in the underlying dataset. Labels reflect pattern similarity, not determinations of fact — hence “-shaped”."
        />
      </Reveal>

      {total === 0 ? <Empty>No flagged entity in the current dataset has an intent_label yet.</Empty> : (
        <>
          <Reveal delay={0.04}>
            <Stats>
              <Stat k="Labelled" v={num(total)} s={`of ${num(rows.length)} alerts`} />
              <Stat k="Coverage" v={pct(total / rows.length, 0)} s="alerts carrying a label" />
              <Stat k="Archetypes" v={num(archetypes.length)} s="distinct shapes matched" />
              <Stat k="Confidence" v={avg === null ? "—" : avg.toFixed(2)} s="average pattern similarity" />
            </Stats>
          </Reveal>

          <Section title="Archetype distribution">
            <Reveal>
              <Card flush>
                <table className="tbl">
                  <thead><tr><th>Archetype</th><th style={{ width: "45%" }}>Share</th><th className="r">Entities</th></tr></thead>
                  <tbody>{archetypes.map((e) => (
                    <tr key={e.k}>
                      <td>{e.k}</td>
                      <td><Bar frac={e.n / total} /></td>
                      <td className="r"><span className="num">{e.n}</span> <span className="dim">· {Math.round((e.n / total) * 100)}%</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </Card>
            </Reveal>
          </Section>

          <Section title="Labelled entities">
            <Reveal>
              <Card flush>
                <Scroll max={480}>
                  <table className="tbl">
                    <thead><tr><th>Entity</th><th>Archetype</th><th className="r">Confidence</th><th>Explanation</th></tr></thead>
                    <tbody>{labelled.map((r) => (
                      <tr key={r.node_id}>
                        <td className="mono" title={r.node_id}>{short(r.node_id, 22)}</td>
                        <td>{r.intent_label}</td>
                        <td className="r num sec">{typeof r.intent_confidence === "number" ? r.intent_confidence.toFixed(2) : "—"}</td>
                        <td className="sec trunc" style={{ maxWidth: 420 }} title={r.intent_explanation}>{r.intent_explanation ?? "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </Scroll>
              </Card>
            </Reveal>
          </Section>
        </>
      )}
    </>
  );
}
