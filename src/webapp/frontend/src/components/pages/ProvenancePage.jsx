import { useAplSummary } from "../../hooks/useAplSummary";
import { CHART_COLORS as C } from "../../lib/chartColors";
import { pct, num } from "../../lib/format";
import { Card, Stat, Stats, PageHead, Section, Tag, KV, Empty, ErrorCard, Reveal } from "../ui";
import { Curve, Lines } from "../charts";

export default function ProvenancePage() {
  const { data, error, loading } = useAplSummary();
  if (loading) return <Empty>Loading provenance layer…</Empty>;
  if (error || !data?.available) return <ErrorCard error={error ?? data?.error ?? "Adversarial provenance has not been built for this dataset."} />;

  const m = data.manifest, mb = data.manifest_b, s = data.headline_stats;
  const thr = s.default_threshold;
  const h = s.exoneration_by_threshold.find((r) => r.threshold === thr) ?? s.exoneration_by_threshold[0];
  const ho = s.heldout_seed_recall;
  const ov = s.ranked_alerts_overlap;
  const fr = s.fragility;

  return (
    <>
      <Reveal>
        <PageHead
          title="Adversarial provenance"
          sub="Standard taint analysis scores an address because value reached it. This layer asks a second question of the same graph: did that address ever exercise spend authority over what it received?"
        />
      </Reveal>

      <Reveal delay={0.04}>
        <Stats>
          <Stat k="Exonerated" v={pct(h.pct_zero_agency)} t="up" s={`${num(h.n_zero_agency)} of ${num(h.n_flagged_baseline)} flagged at threshold ${thr}`} />
          <Stat k="Unspent" v={pct(h.pct_never_spent)} s={`${num(h.n_never_spent)} never a transaction input`} />
          <Stat k="Queue" v={ov ? `${ov.n_zero_agency}/${ov.n_wallet_alerts}` : "—"} s="on this alert queue — routed, never suppressed" />
          <Stat k="Fragility" v={fr ? fr.cfi_median.toFixed(2) : "—"} s="median cluster fragility index" />
        </Stats>
      </Reveal>

      <div className="grid g2">
        <Reveal delay={0.08}>
          <Card title="Exoneration across thresholds" right="not one chosen cut">
            <Curve data={s.exoneration_by_threshold} yKey="pct_zero_agency" name="Zero agency" color={C.VIOLET} />
          </Card>
        </Reveal>
        {ho && (
          <Reveal delay={0.12}>
            <Card title="What the substitution costs" right="held-out seed recall">
              <Lines data={ho.by_threshold} series={[
                { key: "recall_heldout_baseline", name: "Industry haircut", color: C.SLATE },
                { key: "recall_heldout_cwt", name: "Custody-weighted", color: C.VIOLET },
              ]} />
              <p className="note" style={{ marginTop: 16 }}>
                {num(ho.n_seeds_pinned)} illicit seeds pinned, {num(ho.n_seeds_heldout)} withheld. Custody weighting suppresses
                genuine signal along with unearned taint — which is why this is an evidence-quality overlay, not a replacement risk score.
              </p>
            </Card>
          </Reveal>
        )}
      </div>

      {fr && (
        <Section title="Cluster fragility" right={<Tag t="hi">{num(fr.n_contested_evidence ?? 0)} routed to contested evidence</Tag>}>
          <Reveal>
            <Card band>
              <Stats sm>
                <Stat k="Witnessed" v={num(fr.n_fully_witnessed)} t="up" s="fully corroborated · CFI 0" />
                <Stat k="Fragile" v={pct(fr.pct_cfi_gt_30)} t="down" s="CFI above 0.30" />
                <Stat k="Scored" v={num(fr.n_clusters_scored)} s={`${num(fr.n_clusters_trivial)} trivial · ${num(fr.n_clusters_skipped_oversize)} oversize, never reported as zero`} />
              </Stats>
              <p className="note" style={{ marginTop: 24 }}>
                Co-spend clustering asserts that addresses funding one transaction share a wallet. Where a single transaction is the
                only thing holding two halves of a cluster together, that assertion has one witness and no corroboration. {fr.note}
              </p>
            </Card>
          </Reveal>
        </Section>
      )}

      <Section title="Provenance of these numbers">
        <div className="grid g2">
          <Reveal>
            <Card flush title="Declared estimators">
              <table className="tbl">
                <thead><tr><th>Estimator</th><th>Mode</th><th>Basis</th></tr></thead>
                <tbody>{Object.entries(m.estimators).map(([id, sp]) => (
                  <tr key={id}>
                    <td className="mono">{id}</td>
                    <td><Tag t={sp.mode === "NOT_USED" ? "" : "on"}>{sp.mode}</Tag></td>
                    <td className="sec trunc" title={`${sp.observed} · ${sp.estimated}`}>{sp.observed}</td>
                  </tr>
                ))}</tbody>
              </table>
              <div style={{ padding: "16px 24px 24px" }}>
                <p className="label" style={{ marginBottom: 8 }}>Held neutral — the data cannot support them</p>
                {Object.entries(m.unavailable_components).map(([k, why]) => (
                  <p key={k} className="note"><span className="mono">{k}</span> — {why}</p>
                ))}
              </div>
            </Card>
          </Reveal>
          <Reveal delay={0.04}>
            <Card title="Run">
              <KV rows={[
                ["Run A / B", `${m.run_id.slice(0, 8)} / ${mb ? mb.run_id.slice(0, 8) : "—"}`],
                ["Git", m.git_sha.slice(0, 7)],
                ["Addresses", num(m.n_addresses)],
                ["Transactions", num(m.n_transactions)],
                ["Illicit seeds", num(m.n_seeds_illicit)],
                ["Spent / never", `${num(m.n_spent)} / ${num(m.n_never_spent)}`],
                ["Hops", m.hops_K],
                ["Exposure", m.exposure_mode],
                ["Elapsed", `${m.elapsed_seconds}s / ${mb ? `${mb.elapsed_seconds}s` : "not built"}`],
              ]} />
              <p className="note" style={{ marginTop: 20 }}>
                Claims rest on Elliptic++&apos;s address-transaction structure, not a live UTXO ledger. Every figure on this page is
                read from computed artifacts; none is typed into the view.
              </p>
            </Card>
          </Reveal>
        </div>
      </Section>
    </>
  );
}
