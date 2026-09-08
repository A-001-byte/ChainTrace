import { useAplSummary } from "../../hooks/useAplSummary";
import { Panel, Stat, Tag, KV, Empty, Reveal, pct, num } from "../ui";

export default function ProvenancePage() {
  const { data, error, loading } = useAplSummary();
  if (loading) return <Empty>loading provenance layer…</Empty>;
  if (error || !data?.available) {
    return <Panel title="adversarial provenance — not built"><div className="note">{error ?? data?.error}</div></Panel>;
  }
  const m = data.manifest, mb = data.manifest_b, s = data.headline_stats;
  const thr = s.default_threshold;
  const h = s.exoneration_by_threshold.find((r) => r.threshold === thr) ?? s.exoneration_by_threshold[0];
  const ho = s.heldout_seed_recall;
  const hoT = ho?.by_threshold?.find((r) => r.threshold === thr);
  const ov = s.ranked_alerts_overlap;
  const fr = s.fragility;

  return (
    <>
      <Reveal>
        <div className="prose" style={{ marginBottom: 2 }}>
          Standard taint analysis propagates on receipt alone: an address is scored because value reached it. This layer asks a second question of the same graph — <b>did that address ever exercise spend authority over what it received?</b> Where it did not, the alert rests on custody the address never had.
        </div>
      </Reveal>

      <Reveal delay={0.04}>
        <Panel title={`of wallets the industry-standard haircut flags at threshold ${thr}`} flush>
          <div className="statrow">
            <Stat k="zero custody agency" v={pct(h.pct_zero_agency)} s={`${num(h.n_zero_agency)} of ${num(h.n_flagged_baseline)} flagged`} />
            <Stat k="never spent at all" v={pct(h.pct_never_spent)} s={`${num(h.n_never_spent)} never a tx input — a set difference, not a model output`} />
            <Stat k="on this alert queue" v={ov ? `${ov.n_zero_agency}/${ov.n_wallet_alerts}` : "—"} s={ov ? `${ov.n_never_spent} never spent · routed, never suppressed` : ""} size="md" />
          </div>
        </Panel>
      </Reveal>

      <div className="grid g2">
        <Reveal delay={0.08}>
          <Panel title="across every threshold, not one chosen cut" flush>
            <table className="tbl">
              <thead><tr><th>thr</th><th className="r">flagged</th><th className="r">zero agency</th><th className="r">%</th><th className="r">never spent</th></tr></thead>
              <tbody>{s.exoneration_by_threshold.map((r) => (
                <tr key={r.threshold}><td>{r.threshold.toFixed(2)}</td><td className="r">{num(r.n_flagged_baseline)}</td><td className="r">{num(r.n_zero_agency)}</td><td className="r fg">{pct(r.pct_zero_agency)}</td><td className="r">{num(r.n_never_spent)}</td></tr>
              ))}</tbody>
            </table>
          </Panel>
        </Reveal>

        {hoT && (
          <Reveal delay={0.12}>
            <Panel title="measured cost of the substitution" right={<Tag t="hi">CWT RECALL IS LOWER</Tag>} flush>
              <table className="tbl">
                <thead><tr><th>thr</th><th className="r">held-out recall · haircut</th><th className="r">held-out recall · custody-weighted</th></tr></thead>
                <tbody>{ho.by_threshold.map((r) => (
                  <tr key={r.threshold}><td>{r.threshold.toFixed(2)}</td><td className="r">{pct(r.recall_heldout_baseline)}</td><td className="r hi">{pct(r.recall_heldout_cwt)}</td></tr>
                ))}</tbody>
              </table>
              <div className="note" style={{ padding: 8 }}>
                {num(ho.n_seeds_pinned)} illicit seeds pinned, {num(ho.n_seeds_heldout)} withheld. Custody weighting suppresses genuine signal along with unearned taint — which is why this layer is an <b className="fg">evidence-quality overlay</b>, not a replacement risk score. The exoneration figure above does not depend on the custody-weighted score being the better ranker. Naive class-1 recall is 1.0 for both models by construction (seeds are pinned) and is not reported as evidence.
              </div>
            </Panel>
          </Reveal>
        )}
      </div>

      {fr && (
        <Reveal delay={0.16}>
          <Panel title="cluster fragility — share of an entity resting on a single unreplicated merge" right={`${num(fr.n_contested_evidence ?? 0)} routed to CONTESTED_EVIDENCE`} flush>
            <div className="statrow">
              <Stat k="median CFI" v={fr.cfi_median.toFixed(2)} size="md" />
              <Stat k="CFI p90" v={fr.cfi_p90.toFixed(2)} size="md" />
              <Stat k="clusters scored" v={num(fr.n_clusters_scored)} size="md" s={`${num(fr.n_clusters_trivial)} trivial (<3 addr)`} />
              <Stat k="CFI > 0.30" v={pct(fr.pct_cfi_gt_30)} size="md" />
              <Stat k="fully witnessed" v={num(fr.n_fully_witnessed)} size="md" s="CFI = 0" />
              <Stat k="entirely fragile" v={num(fr.n_entirely_fragile)} size="md" s="CFI = 1" />
              <Stat k="not computed" v={num(fr.n_clusters_skipped_oversize)} size="md" s="oversize — never reported as zero" />
            </div>
            <div className="note" style={{ padding: 8, borderTop: "1px solid var(--rule)" }}>
              Co-spend clustering asserts that addresses funding one transaction share a wallet. Where a single transaction is the only thing holding two halves of a cluster together, that assertion has one witness and no corroboration. {fr.note}
            </div>
          </Panel>
        </Reveal>
      )}

      <div className="grid g2">
        <Reveal delay={0.2}>
          <Panel title="declared estimators — measured vs inferred" flush>
            {Object.entries(m.estimators).map(([id, sp]) => (
              <div key={id} style={{ padding: 8, borderBottom: "1px solid var(--rule)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span className="fg">{id}</span>
                  <Tag t={sp.mode === "NOT_USED" ? "lo" : "md"}>{sp.mode}</Tag>
                </div>
                <KV rows={[["observed", sp.observed], ["estimated", sp.estimated]]} />
                <div className="note" style={{ marginTop: 4 }}>{sp.why}</div>
              </div>
            ))}
            <div style={{ padding: 8 }}>
              <div className="mute" style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>held neutral — data cannot support them</div>
              {Object.entries(m.unavailable_components).map(([k, why]) => <div key={k} className="note"><span className="fg">{k}</span> — {why}</div>)}
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={0.24}>
          <Panel title="integrity strip" flush>
            <div style={{ padding: 8 }}>
              <KV rows={[
                ["run A", m.run_id.slice(0, 8)], ["run B", mb ? mb.run_id.slice(0, 8) : "—"], ["git", m.git_sha.slice(0, 7)],
                ["addresses", num(m.n_addresses)], ["transactions", num(m.n_transactions)], ["illicit seeds", num(m.n_seeds_illicit)],
                ["spent / never", `${num(m.n_spent)} / ${num(m.n_never_spent)}`],
                ["hops K", m.hops_K], ["exposure", m.exposure_mode], ["multiplicity", m.multiplicity_mode],
                ["alpha applied", m.alpha_weights_applied.join(", ")],
                ["module A", `${m.elapsed_seconds}s`], ["module B", mb ? `${mb.elapsed_seconds}s` : "not built"],
                ["exposure sensitivity", `SEED_SPEND α>0 = ${num(s.exposure_sensitivity.SEED_SPEND.n_alpha_positive)} · BASELINE_TAINT α>0 = ${num(s.exposure_sensitivity.BASELINE_TAINT.n_alpha_positive)}`],
              ]} />
              {mb && <div className="note" style={{ marginTop: 8 }}>{mb.algorithm} {mb.clustering_equivalence}</div>}
              <div className="note" style={{ marginTop: 8 }}>Claims rest on Elliptic++'s address-transaction structure, not a live UTXO ledger. Every figure on this page is read from artifacts computed over that data; none is typed into the view.</div>
            </div>
          </Panel>
        </Reveal>
      </div>
    </>
  );
}
