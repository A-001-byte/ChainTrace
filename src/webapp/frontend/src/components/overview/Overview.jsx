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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--spacing-16)" }}>
        <span className="eyebrow">Cluster Concentration</span>
        <span className="mono" style={{ fontSize: "var(--text-caption)", color: "var(--color-ash)" }}>
          {clusters.length} clusters
        </span>
      </div>

      {top.length === 0 ? (
        <p style={{ color: "var(--color-ash)", fontSize: "var(--text-caption)" }}>No cluster assignments available.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
          {top.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)" }}>
              <span className="mono" style={{ fontSize: "var(--text-caption)", color: clusterColor(c.id), minWidth: "2.4rem" }}>
                c{c.id}
              </span>
              <div style={{ flex: 1, height: 4, background: "var(--color-void)", borderRadius: "var(--radius-pills)", overflow: "hidden" }}>
                <div style={{
                  width: `${(c.count / maxCount) * 100}%`, height: "100%",
                  background: clusterColor(c.id), borderRadius: "var(--radius-pills)",
                }} />
              </div>
              <span className="mono" style={{ fontSize: "var(--text-caption)", color: "var(--color-fog)", minWidth: "1.4rem", textAlign: "right" }}>
                {c.count}
              </span>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: "var(--text-caption)", lineHeight: 1.5, color: "var(--color-ash)", marginTop: "var(--spacing-16)" }}>
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
    return <p style={{ color: "var(--color-ash)" }}>Loading overview…</p>;
  }

  // Genuine network/parse failure — fetch() itself threw. Still a real possibility
  // (server not running, malformed JSON), so this branch stays.
  if (error) {
    return (
      <div className="panel" style={{ padding: "var(--spacing-32)" }}>
        <h3 style={{ color: "var(--signal)", marginBottom: "var(--spacing-8)" }}>Data Source Unavailable</h3>
        <p style={{ color: "var(--color-fog)" }}>{error}</p>
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
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--spacing-24)" }}>
        <div>
          <h1 style={{ color: "var(--color-paper)" }}>Command Overview</h1>
          <p className="lede">
            Live posture across the scored Bitcoin transaction graph — flagged entities,
            how risk is distributed, and where coordinated cluster activity is concentrated.
          </p>
        </div>
        <span className="badge" style={{
          flexShrink: 0,
          color: isMock ? "var(--signal)" : "var(--color-pulse-green)",
          background: isMock ? "var(--signal-tint)" : "var(--risk-low-tint)",
          boxShadow: `${isMock ? "var(--signal-line)" : "var(--risk-low-line)"} 0px 0px 0px 1px inset`,
        }}>
          {isMock ? "Offline Mock Data" : "Live Dataset"}
        </span>
      </div>

      {data.warnings?.length > 0 && (
        <p style={{ color: "var(--color-ash)", fontSize: "var(--text-caption)", marginBottom: "var(--spacing-24)" }}>
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
          gap: "var(--spacing-24)",
          marginTop: "var(--spacing-48)",
        }}
      >
        {[
          <RiskDistribution key="risk" counts={data.risk_tier_counts} total={data.total_flagged} />,
          <TopEntitiesPreview key="top" rows={rows} onSelectEntity={onSelectEntity} onViewAll={() => onNavigate?.("alerts")} />,
          <ClusterSummary key="clusters" rows={rows} />,
        ].map((child, i) => (
          <motion.div
            key={i}
            variants={panelReveal}
            transition={{ duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
            className="panel"
            style={{ padding: "var(--spacing-20)" }}
          >
            {child}
          </motion.div>
        ))}
      </motion.div>

      <div className="panel" style={{
        display: "flex", gap: "var(--spacing-48)", flexWrap: "wrap", alignItems: "center",
        marginTop: "var(--spacing-24)", padding: "var(--spacing-20)",
      }}>
        {[
          ["Transactions Scanned", data.total_transactions?.toLocaleString()],
          ["Distinct Clusters (flagged)", data.distinct_clusters],
          ["Avg Confidence (flagged)", `${data.flagged_avg_confidence_pct}%`],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="eyebrow">{label}</div>
            <div className="mono" style={{
              fontSize: "var(--text-body-lg)", lineHeight: "var(--leading-body-lg)",
              letterSpacing: "var(--tracking-body-lg)", fontWeight: "var(--weight-medium)",
              color: "var(--color-bone)", marginTop: "var(--spacing-4)",
            }}>
              {value}
            </div>
          </div>
        ))}
        <button className="btn btn-accent" style={{ marginLeft: "auto" }} onClick={() => onNavigate?.("graph")}>
          Open forensic graph
        </button>
      </div>
    </div>
  );
}
