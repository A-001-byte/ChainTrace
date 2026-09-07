import { useState, useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import RiskPill from "../shared/RiskPill";
import { motionTokens } from "../../lib/motionTokens";

// Only the first N rows are staggered; everything past that shares the last delay so a
// 48-row table never feels like it's slowly dealing cards.
const MAX_STAGGERED_ROWS = 10;
const PER_ROW_DELAY = 0.03;

// Same hue as --bg-card-hover (#1a2336), written as rgba so the hover transition
// interpolates alpha directly instead of passing through a grey "transparent".
const ROW_BG_IDLE = "rgba(26, 35, 54, 0)";
const ROW_BG_HOVER = "rgba(26, 35, 54, 1)";

export default function AlertsTable({ title, rows, onSelectRow }) {
  const reduceMotion = useReducedMotion();
  const [sortField, setSortField] = useState("risk_score");
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");

  const safeRows = Array.isArray(rows) ? rows : [];

  const filtered = useMemo(() => {
    let out = safeRows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) => String(r.node_id ?? "").toLowerCase().includes(q));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const av = a[sortField] ?? 0, bv = b[sortField] ?? 0;
      return av > bv ? dir : av < bv ? -dir : 0;
    });
  }, [safeRows, search, sortField, sortDir]);

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const columns = [
    { key: "node_id", label: "Node ID" },
    { key: "label", label: "Label" },
    { key: "cluster_id", label: "Cluster" },
    { key: "risk_score", label: "Risk" },
    { key: "classifier_confidence", label: "Confidence" },
    { key: "anomaly_score", label: "Anomaly" },
    { key: "reason", label: "Reason" },
  ];

  return (
    <div style={{ marginBottom: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
        <h3 style={{ color: "var(--text-primary)", fontSize: "0.95rem" }}>
          {title} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({safeRows.length})</span>
        </h3>
        <input
          placeholder="Search node ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: "var(--bg-card)", border: "1px solid var(--border-color)",
            borderRadius: "6px", padding: "0.35rem 0.6rem", color: "var(--text-primary)",
            fontSize: "0.8rem", width: "200px",
          }}
        />
      </div>

      <div style={{ border: "1px solid var(--border-color)", borderRadius: "8px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
          <thead>
            <tr style={{ background: "var(--bg-card)" }}>
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  style={{
                    textAlign: "left", padding: "0.6rem 0.8rem", cursor: "pointer",
                    color: sortField === c.key ? "var(--accent-cyan)" : "var(--text-secondary)",
                    borderBottom: "1px solid var(--border-color)", fontWeight: 600,
                    textTransform: "uppercase", fontSize: "0.7rem", letterSpacing: "0.04em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.label}{sortField === c.key ? (sortDir === "desc" ? " ▼" : " ▲") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={columns.length} style={{ padding: "1rem", color: "var(--text-muted)" }}>No matching entities.</td></tr>
            ) : filtered.map((row, i) => (
              <motion.tr
                key={row.node_id ?? i}
                initial={{ opacity: 0, y: reduceMotion ? 0 : motionTokens.distance.sm, backgroundColor: ROW_BG_IDLE }}
                animate={{ opacity: 1, y: 0, backgroundColor: ROW_BG_IDLE }}
                transition={{
                  duration: reduceMotion ? motionTokens.duration.fast : motionTokens.duration.normal,
                  ease: motionTokens.easing.smooth,
                  delay: Math.min(i, MAX_STAGGERED_ROWS) * PER_ROW_DELAY,
                }}
                whileHover={{
                  backgroundColor: ROW_BG_HOVER,
                  transition: { duration: motionTokens.duration.fast, ease: motionTokens.easing.sharp },
                }}
                style={{ borderBottom: "1px solid var(--border-color)", cursor: "pointer" }}
                onClick={() => onSelectRow?.(row.node_id)}
              >
                <td style={{ padding: "0.55rem 0.8rem", fontFamily: "var(--font-mono)" }} title={row.node_id}>
                  {String(row.node_id ?? "-").length > 28 ? String(row.node_id).slice(0, 28) + "…" : (row.node_id ?? "-")}
                </td>
                <td style={{ padding: "0.55rem 0.8rem" }}>{row.label ?? "-"}</td>
                <td style={{ padding: "0.55rem 0.8rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{row.cluster_id ?? "-"}</td>
                <td style={{ padding: "0.55rem 0.8rem" }}><RiskPill score={row.risk_score} /></td>
                <td style={{ padding: "0.55rem 0.8rem", color: "var(--text-secondary)" }}>
                  {typeof row.classifier_confidence === "number" ? row.classifier_confidence.toFixed(3) : "-"}
                </td>
                <td style={{ padding: "0.55rem 0.8rem", color: "var(--text-secondary)" }}>
                  {typeof row.anomaly_score === "number" ? row.anomaly_score.toFixed(3) : "-"}
                </td>
                <td style={{ padding: "0.55rem 0.8rem", color: "var(--text-secondary)", maxWidth: "280px" }} title={row.reason}>
                  {row.reason ?? "-"}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}