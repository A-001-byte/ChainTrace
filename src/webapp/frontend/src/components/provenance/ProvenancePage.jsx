import { motion, useReducedMotion } from "motion/react";
import { useAplSummary } from "../../hooks/useAplSummary";
import { motionTokens } from "../../lib/motionTokens";

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

/** Estimator declaration card — the honesty contract, rendered from the manifest. */
function EstimatorCard({ id, spec }) {
  const notUsed = spec.mode === "NOT_USED";
  return (
    <div style={{
      padding: "var(--spacing-16)",
      borderBottom: "1px solid var(--color-graphite)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", marginBottom: "var(--spacing-8)", flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: "var(--text-caption)", color: "var(--color-mist)" }}>
          {id}
        </span>
        <span className="badge mono" style={{
          color: notUsed ? "var(--color-pulse-green)" : "var(--signal)",
          background: notUsed ? "var(--risk-low-tint)" : "var(--signal-tint)",
          boxShadow: `${notUsed ? "var(--risk-low-line)" : "var(--signal-line)"} 0px 0px 0px 1px inset`,
        }}>
          {spec.mode}
        </span>
      </div>
      <div style={{ fontSize: "var(--text-caption)", color: "var(--color-fog)", lineHeight: 1.6 }}>
        <div><span style={{ color: "var(--color-ash)" }}>observed:</span> {spec.observed}</div>
        <div><span style={{ color: "var(--color-ash)" }}>estimated:</span> {spec.estimated}</div>
        <div style={{ marginTop: "var(--spacing-8)" }}>{spec.why}</div>
      </div>
    </div>
  );
}

export default function ProvenancePage() {
  const reduceMotion = useReducedMotion();
  const { data, error, loading } = useAplSummary();

  if (loading) return <p style={{ color: "var(--color-ash)" }}>Loading provenance layer…</p>;

  if (error || !data?.available) {
    return (
      <div className="panel" style={{ padding: "var(--spacing-32)" }}>
        <h3 style={{ color: "var(--signal)", marginBottom: "var(--spacing-8)" }}>
          Adversarial Provenance Layer not built
        </h3>
        <p style={{ color: "var(--color-fog)", fontSize: "var(--text-caption)", lineHeight: 1.6 }}>
          {error ?? data?.error}
        </p>
      </div>
    );
  }

  const m = data.manifest;
  const s = data.headline_stats;
  const defaultThr = s.default_threshold;
  const headline = s.exoneration_by_threshold.find((r) => r.threshold === defaultThr)
    ?? s.exoneration_by_threshold[0];
  const heldout = s.heldout_seed_recall;
  const heldoutAtThr = heldout?.by_threshold?.find((r) => r.threshold === defaultThr);
  const overlap = s.ranked_alerts_overlap;

  const reveal = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : motionTokens.distance.md },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <div>
      <div className="page-header">
        <h2>Adversarial Provenance</h2>
        <p className="lede">
          Standard taint analysis propagates on receipt alone: an address is scored because
          value reached it. This layer asks a second question of the same graph — did that
          address ever exercise spend authority over what it received? Where the answer is
          no, the alert rests on custody the address never had.
        </p>
      </div>

      <motion.div
        variants={{ hidden: {}, visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.07 } } }}
        initial="hidden"
        animate="visible"
      >
        {/* --- Headline number --- */}
        <motion.div
          variants={reveal}
          transition={{ duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
          className="panel"
          style={{ padding: "var(--spacing-24)", marginBottom: "var(--spacing-24)" }}
        >
          <span className="eyebrow">
            Of wallets the industry-standard haircut model flags at threshold {defaultThr}
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--spacing-20)", flexWrap: "wrap", marginTop: "var(--spacing-12)" }}>
            <span className="mono" style={{
              fontSize: "var(--text-heading)", lineHeight: "var(--leading-heading)",
              letterSpacing: "var(--tracking-heading)", fontWeight: "var(--weight-medium)",
              color: "var(--color-paper)",
            }}>
              {pct(headline.pct_zero_agency)}
            </span>
            <span style={{ fontSize: "var(--text-body-sm)", color: "var(--color-fog)", lineHeight: 1.6, maxWidth: "48ch" }}>
              have <strong style={{ color: "var(--color-mist)" }}>zero custody agency</strong> —
              {" "}<span className="mono">{headline.n_zero_agency.toLocaleString()}</span> of{" "}
              <span className="mono">{headline.n_flagged_baseline.toLocaleString()}</span> flagged addresses.
            </span>
          </div>
          <div style={{ marginTop: "var(--spacing-20)", paddingTop: "var(--spacing-16)", borderTop: "1px solid var(--color-graphite)" }}>
            <span className="eyebrow" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>
              Of which, the strongest subset
            </span>
            <span style={{ fontSize: "var(--text-caption)", color: "var(--color-fog)", lineHeight: 1.6 }}>
              <span className="mono" style={{ color: "var(--color-mist)" }}>
                {headline.n_never_spent.toLocaleString()}
              </span>{" "}
              ({pct(headline.pct_never_spent)}) never appear as a transaction input anywhere in the
              dataset — they received value and never once produced a signature against it. That is a
              set difference over two edge lists, not a model output.
            </span>
          </div>
        </motion.div>

        {/* --- Threshold sweep --- */}
        <motion.div
          variants={reveal}
          transition={{ duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
          className="panel"
          style={{ marginBottom: "var(--spacing-24)", overflow: "hidden" }}
        >
          <div style={{ padding: "var(--spacing-16)", borderBottom: "1px solid var(--color-graphite)" }}>
            <span className="eyebrow">Across every threshold, not one chosen cut</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ cursor: "default" }}>Threshold</th>
                  <th style={{ cursor: "default" }}>Flagged by haircut</th>
                  <th style={{ cursor: "default" }}>Zero agency</th>
                  <th style={{ cursor: "default" }}>% zero agency</th>
                  <th style={{ cursor: "default" }}>Never spent</th>
                </tr>
              </thead>
              <tbody>
                {s.exoneration_by_threshold.map((r) => (
                  <tr key={r.threshold}>
                    <td className="mono">{r.threshold.toFixed(2)}</td>
                    <td className="mono">{r.n_flagged_baseline.toLocaleString()}</td>
                    <td className="mono">{r.n_zero_agency.toLocaleString()}</td>
                    <td className="mono" style={{ color: "var(--color-mist)" }}>{pct(r.pct_zero_agency)}</td>
                    <td className="mono">{r.n_never_spent.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* --- The trade-off that could look bad. Shown, not buried. --- */}
        {heldoutAtThr && (
          <motion.div
            variants={reveal}
            transition={{ duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
            className="panel"
            style={{ padding: "var(--spacing-24)", marginBottom: "var(--spacing-24)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", marginBottom: "var(--spacing-12)", flexWrap: "wrap" }}>
              <span className="eyebrow">Measured cost of this substitution</span>
              <span className="badge mono" style={{
                color: "var(--risk-high)", background: "var(--risk-high-tint)",
                boxShadow: "var(--risk-high-line) 0px 0px 0px 1px inset",
              }}>
                CWT RECALL IS LOWER
              </span>
            </div>
            <p style={{ fontSize: "var(--text-caption)", color: "var(--color-fog)", lineHeight: 1.6, maxWidth: "80ch", marginBottom: "var(--spacing-16)" }}>
              {heldout.n_seeds_pinned.toLocaleString()} of the known-illicit addresses were pinned as
              seeds and the remaining {heldout.n_seeds_heldout.toLocaleString()} withheld. At threshold{" "}
              {defaultThr} the haircut model recovers {pct(heldoutAtThr.recall_heldout_baseline)} of the
              withheld illicit addresses; the custody-weighted score recovers{" "}
              {pct(heldoutAtThr.recall_heldout_cwt)}. Custody weighting suppresses inherited taint
              indiscriminately — it removes genuine signal along with the unearned kind.
            </p>
            <p style={{ fontSize: "var(--text-caption)", color: "var(--color-ash)", lineHeight: 1.6, maxWidth: "80ch" }}>
              This is why the layer is presented as an evidence-quality overlay on the existing alert
              queue and <strong style={{ color: "var(--color-fog)" }}>not</strong> as a replacement
              risk score. The exoneration figure above is a statement about the haircut model's own
              output and does not depend on the custody-weighted score being the better ranker.
            </p>
            <div style={{ overflowX: "auto", marginTop: "var(--spacing-16)" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ cursor: "default" }}>Threshold</th>
                    <th style={{ cursor: "default" }}>Held-out recall — haircut</th>
                    <th style={{ cursor: "default" }}>Held-out recall — custody-weighted</th>
                  </tr>
                </thead>
                <tbody>
                  {heldout.by_threshold.map((r) => (
                    <tr key={r.threshold}>
                      <td className="mono">{r.threshold.toFixed(2)}</td>
                      <td className="mono">{pct(r.recall_heldout_baseline)}</td>
                      <td className="mono" style={{ color: "var(--risk-high)" }}>{pct(r.recall_heldout_cwt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* --- Overlap with the live alert queue --- */}
        {overlap && (
          <motion.div
            variants={reveal}
            transition={{ duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
            className="panel"
            style={{ padding: "var(--spacing-24)", marginBottom: "var(--spacing-24)" }}
          >
            <span className="eyebrow" style={{ display: "block", marginBottom: "var(--spacing-16)" }}>
              Applied to this system's own alert queue
            </span>
            <div style={{ display: "flex", gap: "var(--spacing-48)", flexWrap: "wrap" }}>
              {[
                ["Wallet alerts", overlap.n_wallet_alerts],
                ["Matched in the layer", overlap.n_matched_in_apl],
                ["Zero custody agency", overlap.n_zero_agency],
                ["Never spent at all", overlap.n_never_spent],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="eyebrow">{label}</div>
                  <div className="mono" style={{
                    fontSize: "var(--text-subheading)", lineHeight: "var(--leading-subheading)",
                    letterSpacing: "var(--tracking-subheading)", fontWeight: "var(--weight-medium)",
                    color: "var(--color-bone)", marginTop: "var(--spacing-4)",
                  }}>
                    {value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: "var(--text-caption)", color: "var(--color-ash)", lineHeight: 1.6, marginTop: "var(--spacing-16)", maxWidth: "80ch" }}>
              These alerts are routed, never suppressed. A zero-agency alert stays in the queue with
              its evidence quality attached, so an analyst sees what the score rests on before acting.
            </p>
          </motion.div>
        )}

        {/* --- The honesty contract, straight from the manifest --- */}
        <motion.div
          variants={reveal}
          transition={{ duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
          className="panel"
          style={{ overflow: "hidden" }}
        >
          <div style={{ padding: "var(--spacing-16)", borderBottom: "1px solid var(--color-graphite)" }}>
            <span className="eyebrow">Declared estimators — what is measured vs. what is inferred</span>
          </div>
          {Object.entries(m.estimators).map(([id, spec]) => (
            <EstimatorCard key={id} id={id} spec={spec} />
          ))}

          <div style={{ padding: "var(--spacing-16)", borderBottom: "1px solid var(--color-graphite)" }}>
            <span className="eyebrow" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>
              Components held neutral because the data cannot support them
            </span>
            {Object.entries(m.unavailable_components).map(([id, why]) => (
              <div key={id} style={{ fontSize: "var(--text-caption)", color: "var(--color-fog)", lineHeight: 1.6, marginBottom: "var(--spacing-8)" }}>
                <span className="mono" style={{ color: "var(--color-mist)" }}>{id}</span> — {why}
              </div>
            ))}
          </div>

          {/* Integrity strip */}
          <div style={{ padding: "var(--spacing-16)", display: "flex", gap: "var(--spacing-24)", flexWrap: "wrap" }}>
            {[
              ["run", m.run_id.slice(0, 8)],
              ["git", m.git_sha.slice(0, 7)],
              ["addresses", m.n_addresses.toLocaleString()],
              ["transactions", m.n_transactions.toLocaleString()],
              ["illicit seeds", m.n_seeds_illicit.toLocaleString()],
              ["hops K", m.hops_K],
              ["exposure", m.exposure_mode],
              ["multiplicity", m.multiplicity_mode],
            ].map(([k, v]) => (
              <span key={k} style={{ fontSize: "var(--text-caption)", color: "var(--color-ash)" }}>
                {k} <span className="mono" style={{ color: "var(--color-mist)" }}>{v}</span>
              </span>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
