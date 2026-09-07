import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useStats } from "../../hooks/useStats";
import { useAlerts } from "../../hooks/useAlerts";
import { motionTokens } from "../../lib/motionTokens";
import { clusterColor } from "../../lib/clusterColors";
import KpiRow from "./KpiRow";
import RiskDistribution from "./RiskDistribution";
import TopEntitiesPreview from "./TopEntitiesPreview";

function ClusterSummary({ rows }) {
  const clusters = useMemo(() => {
    const byCluster = new Map();
    for (const r of rows ?? []) {
      if (r.cluster_id === null || r.cluster_id === undefined) continue;
      const cur = byCluster.get(r.cluster_id) ?? { id: r.cluster_id, count: 0, maxRisk: 0 };
      cur.count += 1;
      cur.maxRisk = Math.max(cur.maxRisk, r.risk_score ?? 0);
      byCluster.set(r.cluster_id, cur);
    }
    return [...byCluster.values()].sort((a, b) => b.count - a.count || b.maxRisk - a.maxRisk);
  }, [rows]);

  const top = clusters.slice(0, 8);
  const maxCount = top[0]?.count ?? 1;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--space-3)" }}>
        <span className="eyebrow">Cluster Concentration</span>
        <span className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--text-faint)" }}>
          {clusters.length} clusters
        </span>
      </div>

      {top.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>No cluster assignments available.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
          {top.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <span className="mono" style={{ fontSize: "var(--text-2xs)", color: clusterColor(c.id), minWidth: "2.6rem" }}>
                c{c.id}
              </span>
              <div style={{ flex: 1, height: 6, background: "var(--surface-sunken)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  width: `${(c.count / maxCount) * 100}%`, height: "100%",
                  background: clusterColor(c.id), borderRadius: 3, opacity: 0.85,
                }} />
              </div>
              <span className="mono" style={{ fontSize: "var(--text-2xs)", color: "var(--text-secondary)", minWidth: "1.6rem", textAlign: "right" }}>
                {c.count}
              </span>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: "var(--text-2xs)", color: "var(--text-faint)", marginTop: "var(--space-3)", lineHeight: 1.5 }}>
        Louvain communities among flagged entities — concentration indicates coordinated
        rather than isolated activity.
      </p>
    </div>
  );
}

export default function Overview({ onSelectEntity, onNavigate }) {
  const reduceMotion = useReducedMotion();
  const { data, error, loading } = useStats();
  const { data: alertsData } = useAlerts();

  if (loading) {
    return <p style={{ color: "var(--text-muted)" }}>Loading overview…</p>;
  }

  // Genuine network/parse failure — fetch() itself threw. Still a real possibility
  // (server not running, malformed JSON), so this branch stays.
  if (error) {
    return (
      <div className="panel" style={{ padding: "var(--space-5)", borderStyle: "dashed" }}>
        <h3 style={{ color: "var(--signal)", marginBottom: "var(--space-2)" }}>Data Source Unavailable</h3>
        <p style={{ color: "var(--text-secondary)" }}>{error}</p>
      </div>
    );
  }

  const isMock = data.data_source_label?.toLowerCase().includes("mock");
  const rows = Array.isArray(alertsData?.rows) ? alertsData.rows : [];

  const panelReveal = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : motionTokens.distance.md },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-4)" }}>
        <div>
          <h2>Command Overview</h2>
          <p className="lede">
            Live posture across the scored Bitcoin transaction graph — flagged entities,
            how risk is distributed, and where coordinated cluster activity is concentrated.
          </p>
        </div>
        <span style={{
          fontSize: "var(--text-2xs)", padding: "0.3rem 0.7rem", borderRadius: 20,
          fontWeight: 600, letterSpacing: "var(--tracking-wide)", textTransform: "uppercase",
          flexShrink: 0, whiteSpace: "nowrap",
          color: isMock ? "var(--signal)" : "var(--risk-low)",
          background: isMock ? "var(--signal-dim)" : "var(--risk-low-dim)",
          border: `1px solid ${isMock ? "var(--signal-line)" : "rgba(34,197,94,0.3)"}`,
        }}>
          {isMock ? "Offline Mock Data" : "Live Dataset"}
        </span>
      </div>

      {data.warnings?.length > 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)", marginBottom: "var(--space-4)" }}>
          {data.warnings.join(" ")}
        </p>
      )}

      <KpiRow stats={data} />

      <motion.div
        variants={{ hidden: {}, visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.08, delayChildren: 0.1 } } }}
        initial="hidden"
        animate="visible"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "var(--space-4)",
          marginTop: "var(--space-4)",
        }}
      >
        <motion.div
          variants={panelReveal}
          transition={{ duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
          className="panel"
          style={{ padding: "var(--space-4)" }}
        >
          <RiskDistribution counts={data.risk_tier_counts} total={data.total_flagged} />
        </motion.div>

        <motion.div
          variants={panelReveal}
          transition={{ duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
          className="panel"
          style={{ padding: "var(--space-4)" }}
        >
          <TopEntitiesPreview
            rows={rows}
            onSelectEntity={onSelectEntity}
            onViewAll={() => onNavigate?.("alerts")}
          />
        </motion.div>

        <motion.div
          variants={panelReveal}
          transition={{ duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
          className="panel"
          style={{ padding: "var(--space-4)" }}
        >
          <ClusterSummary rows={rows} />
        </motion.div>
      </motion.div>

      <div style={{
        display: "flex", gap: "var(--space-5)", flexWrap: "wrap",
        marginTop: "var(--space-4)", padding: "var(--space-4)",
      }} className="panel">
        <div>
          <div className="eyebrow">Transactions Scanned</div>
          <div className="mono" style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginTop: 4 }}>
            {data.total_transactions?.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="eyebrow">Distinct Clusters (flagged)</div>
          <div className="mono" style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginTop: 4 }}>
            {data.distinct_clusters}
          </div>
        </div>
        <div>
          <div className="eyebrow">Avg Confidence (flagged)</div>
          <div className="mono" style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginTop: 4 }}>
            {data.flagged_avg_confidence_pct}%
          </div>
        </div>
        <button className="btn btn-accent" style={{ marginLeft: "auto", alignSelf: "center" }} onClick={() => onNavigate?.("graph")}>
          Open forensic graph →
        </button>
      </div>
    </div>
  );
}
