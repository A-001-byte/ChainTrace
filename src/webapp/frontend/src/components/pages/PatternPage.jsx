import { useAlerts } from "../../hooks/useAlerts";
import { Panel, Bar, Tag, Empty, ErrorPanel, Reveal } from "../ui";

const ARCHETYPES = ["Ransomware-shaped", "Darknet-market-shaped", "Sanctions-evasion-shaped", "Pattern unclear", "Insufficient signal"];
// Categorical, never severity: a "Ransomware-shaped" tag must not read as "high risk".
const TONE = { "Ransomware-shaped": "vi", "Darknet-market-shaped": "vi", "Sanctions-evasion-shaped": "te", "Pattern unclear": "", "Insufficient signal": "" };
const COLOR = { vi: "var(--tag-violet)", te: "var(--tag-teal)", "": "var(--fg-mute)" };

export default function PatternPage() {
  const { data, error, loading } = useAlerts();
  if (loading) return <Empty>loading pattern intelligence…</Empty>;
  if (error) return <ErrorPanel error={error} />;
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const withIntent = rows.filter((r) => r.intent_label);
  const total = withIntent.length;

  return (
    <>
      <Reveal>
        <div className="prose">
          Intent Intelligence is a <b>rule-based structural pattern matcher</b> — it scores transaction structure against published qualitative descriptions of known crime-type money-movement shapes. It is not a trained crime-type classifier, since no crime-type ground truth exists in the underlying dataset. Labels reflect pattern similarity, not determinations of fact — hence "-shaped," not a bare accusation.
        </div>
      </Reveal>
      <Reveal delay={0.05}>
        <Panel title="archetype distribution" right={`${total} of ${rows.length} alerts labelled`} flush>
          {total === 0 ? <Empty>No flagged entity in the current dataset has an intent_label yet.</Empty> : (
            <table className="tbl">
              <thead><tr><th>archetype</th><th style={{ width: "50%" }}>share</th><th className="r">n</th><th className="r">%</th></tr></thead>
              <tbody>
                {ARCHETYPES.map((k, i) => {
                  const n = withIntent.filter((r) => r.intent_label === k).length;
                  return (
                    <tr key={k}>
                      <td><Tag t={TONE[k]}>{k}</Tag></td>
                      <td><Bar frac={n / total} color={COLOR[TONE[k]]} delay={i * 0.05} /></td>
                      <td className="r fg">{n}</td>
                      <td className="r">{((n / total) * 100).toFixed(0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </Reveal>
      {total > 0 && (
        <Reveal delay={0.1}>
          <Panel title="labelled entities" flush>
            <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
              <table className="tbl">
                <thead><tr><th>node_id</th><th>archetype</th><th className="r">confidence</th><th>explanation</th></tr></thead>
                <tbody>
                  {withIntent.map((r) => (
                    <tr key={r.node_id}>
                      <td className="fg">{r.node_id}</td>
                      <td><Tag t={TONE[r.intent_label] ?? ""}>{r.intent_label}</Tag></td>
                      <td className="r">{typeof r.intent_confidence === "number" ? r.intent_confidence.toFixed(2) : "—"}</td>
                      <td className="trunc" style={{ maxWidth: 520 }} title={r.intent_explanation}>{r.intent_explanation ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </Reveal>
      )}
    </>
  );
}
