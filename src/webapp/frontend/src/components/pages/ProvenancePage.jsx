import { useAplSummary } from "../../hooks/useAplSummary";
import { CHART_COLORS as C } from "../../lib/chartColors";
import { pct, num } from "../../lib/format";
import { Card, Tile, Tiles, Section, Tag, KV, Empty, ErrorCard, Reveal } from "../ui";
import { ThresholdArea, ThresholdLines, HBars } from "../charts";

export default function ProvenancePage() {
  const { data, error, loading } = useAplSummary();
  if (loading) return <Empty>Loading provenance layer…</Empty>;
  if (error || !data?.available) return <ErrorCard error={error ?? data?.error ?? "adversarial provenance not built"} />;
  const m = data.manifest, mb = data.manifest_b, s = data.headline_stats;
  const thr = s.default_threshold;
  const h = s.exoneration_by_threshold.find((r) => r.threshold === thr) ?? s.exoneration_by_threshold[0];
  const ho = s.heldout_seed_recall;
  const hoT = ho?.by_threshold?.find((r) => r.threshold === thr);
  const ov = s.ranked_alerts_overlap;
  const fr = s.fragility;
  const es = s.exposure_sensitivity;
  const byThr = s.exoneration_by_threshold.map((r) => ({ k: r.threshold.toFixed(2), n: r.n_zero_agency, flagged: r.n_flagged_baseline, never: r.n_never_spent }));
  const frRows = fr ? [
    { k: "witnessed", n: fr.n_fully_witnessed, c: C.GREEN },
    { k: "partial", n: Math.max(0, fr.n_clusters_scored - fr.n_fully_witnessed - fr.n_entirely_fragile), c: C.STONE },
    { k: "fragile", n: fr.n_entirely_fragile, c: C.ORANGE },
    { k: "trivial", n: fr.n_clusters_trivial, c: C.GRAPHITE },
    { k: "skipped", n: fr.n_clusters_skipped_oversize, c: C.STROKE },
  ] : [];
  const esRows = es ? [{ k: "seed spend", n: es.SEED_SPEND.n_alpha_positive }, { k: "baseline taint", n: es.BASELINE_TAINT.n_alpha_positive }] : [];
  const spend = [{ k: "spent", n: m.n_spent, c: C.STONE }, { k: "never spent", n: m.n_never_spent, c: C.GREEN }];

  return (
    <>
      <Section eyebrow="Adversarial provenance" title="Did the address ever exercise spend authority?">
        <Reveal>
          <Card light panel>
            <div style={{ padding: 24 }}>
              <Tiles>
                <Tile k="Exonerated" v={pct(h.pct_zero_agency)} s={`${num(h.n_zero_agency)} of ${num(h.n_flagged_baseline)} · α = 0 at ${thr}`} />
                <Tile k="Unspent" v={pct(h.pct_never_spent)} s={`${num(h.n_never_spent)} never a transaction input`} />
                <Tile k="Queue" v={ov ? `${ov.n_zero_agency}/${ov.n_wallet_alerts}` : "—"} s={ov ? `${ov.n_never_spent} never spent · routed, never suppressed` : ""} />
                {hoT && <Tile k="Recall" v={`${pct(hoT.recall_heldout_baseline, 0)} → ${pct(hoT.recall_heldout_cwt, 0)}`} s="haircut → custody-weighted · held-out" />}
              </Tiles>
            </div>
          </Card>
        </Reveal>
        <div className="grid g3">
          <Reveal delay={0.03}><Card title="Exoneration" right="zero agency · by threshold"><ThresholdArea data={s.exoneration_by_threshold} yKey="pct_zero_agency" name="zero agency" color={C.GREEN} /></Card></Reveal>
          <Reveal delay={0.06}><Card title="Counts" right="zero agency · by threshold"><HBars data={byThr} name="zero agency" color={C.GREEN} /></Card></Reveal>
          <Reveal delay={0.09}><Card title="Spend" right="all addresses"><HBars data={spend} name="addresses" colorBy={(e) => e.c} /></Card></Reveal>
          {ho && <Reveal delay={0.12} className="span2"><Card title="Cost" right={<Tag t="hi">custody-weighted recall is lower</Tag>}><ThresholdLines data={ho.by_threshold} series={[{ key: "recall_heldout_baseline", name: "haircut", color: C.STONE }, { key: "recall_heldout_cwt", name: "custody-weighted", color: C.ORANGE }]} /><div className="note" style={{ marginTop: 12 }}>{num(ho.n_seeds_pinned)} seeds pinned, {num(ho.n_seeds_heldout)} withheld. An evidence-quality overlay, not a replacement risk score.</div></Card></Reveal>}
          {es && <Reveal delay={0.15}><Card title="Exposure" right="α > 0 under each mode"><HBars data={esRows} name="α > 0" color={C.STONE} /></Card></Reveal>}
        </div>
      </Section>

      {fr && (
        <Section eyebrow="Cluster fragility" right={<Tag t="hi">{num(fr.n_contested_evidence ?? 0)} contested evidence</Tag>}>
          <Reveal>
            <Tiles>
              <Tile k="Median" v={fr.cfi_median.toFixed(2)} s="cfi" />
              <Tile k="P90" v={fr.cfi_p90.toFixed(2)} s="cfi" />
              <Tile k="Scored" v={num(fr.n_clusters_scored)} s="clusters ≥ 3" />
              <Tile k="Fragile" v={pct(fr.pct_cfi_gt_30)} tone="orange" s="cfi > 0.30" />
              <Tile k="Witnessed" v={num(fr.n_fully_witnessed)} tone="green" s="cfi = 0" />
              <Tile k="Skipped" v={num(fr.n_clusters_skipped_oversize)} s="oversize · never zero" />
            </Tiles>
          </Reveal>
          <div className="grid g3">
            <Reveal delay={0.03} className="span2"><Card title="Clusters" right="by fragility"><HBars data={frRows} name="clusters" colorBy={(e) => e.c} /></Card></Reveal>
            <Reveal delay={0.06}><Card title="Note"><div className="note">{fr.note}</div></Card></Reveal>
          </div>
        </Section>
      )}

      <Section eyebrow="Integrity">
        <div className="grid g2">
          <Reveal>
            <Card flush title="Estimators">
              <table className="tbl" style={{ marginTop: 12 }}>
                <thead><tr><th>Estimator</th><th>Mode</th><th>Observed</th><th>Estimated</th></tr></thead>
                <tbody>{Object.entries(m.estimators).map(([id, sp]) => (
                  <tr key={id}><td className="fg mono">{id}</td><td><Tag t={sp.mode === "NOT_USED" ? "lo" : ""}>{sp.mode}</Tag></td><td className="trunc" title={sp.observed}>{sp.observed}</td><td className="trunc" title={sp.estimated}>{sp.estimated}</td></tr>
                ))}</tbody>
              </table>
              <div style={{ padding: 20 }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>held neutral</div>
                {Object.entries(m.unavailable_components).map(([k, why]) => <div key={k} className="note"><span className="mono" style={{ color: "var(--bone)" }}>{k}</span> — {why}</div>)}
              </div>
            </Card>
          </Reveal>
          <Reveal delay={0.04}>
            <Card title="Run">
              <KV rows={[
                ["run A / B", `${m.run_id.slice(0, 8)} / ${mb ? mb.run_id.slice(0, 8) : "—"}`], ["git", m.git_sha.slice(0, 7)],
                ["addresses", num(m.n_addresses)], ["transactions", num(m.n_transactions)], ["seeds", num(m.n_seeds_illicit)],
                ["hops", m.hops_K], ["exposure", m.exposure_mode], ["multiplicity", m.multiplicity_mode],
                ["alpha", m.alpha_weights_applied.join(", ")], ["elapsed", `${m.elapsed_seconds}s / ${mb ? `${mb.elapsed_seconds}s` : "not built"}`],
              ]} />
              {mb && <div className="note" style={{ marginTop: 16 }}>{mb.algorithm} {mb.clustering_equivalence}</div>}
              <div className="note" style={{ marginTop: 12 }}>Elliptic++ address-transaction structure, not a live UTXO ledger. Every figure is read from computed artifacts.</div>
            </Card>
          </Reveal>
        </div>
      </Section>
    </>
  );
}
