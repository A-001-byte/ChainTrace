import { useMemo, useState } from "react";
import { useAlerts } from "../../hooks/useAlerts";
import { clusterColor } from "../../lib/clusterColors";
import { CHART_COLORS as C } from "../../lib/chartColors";
import { short, num } from "../../lib/format";
import { Card, Tile, Tiles, Section, RiskTag, Tag, Empty, ErrorCard, Reveal } from "../ui";
import { Histogram } from "../charts";

const PAGE = 12;
const COLS = [["node_id", "Node"], ["label", "Label"], ["cluster_id", "Cluster"], ["risk_score", "Risk"], ["classifier_confidence", "Confidence"], ["anomaly_score", "Anomaly"], ["intent_label", "Intent"], ["geo_temporal_flag", "Geo"]];

function Table({ title, rows, onOpen, selected }) {
  const [sort, setSort] = useState(["risk_score", -1]);
  const [q, setQ] = useState("");
  const [rawPage, setPage] = useState(0);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    const out = n ? rows.filter((r) => String(r.node_id ?? "").toLowerCase().includes(n)) : rows;
    const [f, d] = sort;
    return [...out].sort((a, b) => { const av = a[f] ?? 0, bv = b[f] ?? 0; return av > bv ? d : av < bv ? -d : 0; });
  }, [rows, q, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  // clamp during render — no effect needed when the filter shrinks the result set
  const page = Math.min(rawPage, pages - 1);
  const slice = filtered.slice(page * PAGE, page * PAGE + PAGE);
  return (
    <Card flush title={title} right={<input className="inp" placeholder="Filter" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} style={{ width: 160, height: 28 }} />}>
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table className="tbl">
          <thead><tr>{COLS.map(([f, l]) => <th key={f} className={`sortable${sort[0] === f ? " on" : ""}${f === "risk_score" ? " r" : ""}`} onClick={() => setSort(([cf, cd]) => (cf === f ? [f, -cd] : [f, -1]))}>{l}{sort[0] === f ? (sort[1] < 0 ? " ↓" : " ↑") : ""}</th>)}</tr></thead>
          <tbody>{slice.length === 0 ? <tr><td colSpan={COLS.length} className="muted">No matching entities</td></tr> : slice.map((r) => (
            <tr key={r.node_id} className={`row${selected === r.node_id ? " sel" : ""}`} onClick={() => onOpen(r.node_id)}>
              <td className="fg mono" title={r.node_id}>{short(r.node_id, 26)}</td><td>{r.label ?? "—"}</td>
              <td className="mono" style={{ color: clusterColor(r.cluster_id) }}>{r.cluster_id ?? "—"}</td><td className="r"><RiskTag score={r.risk_score} /></td>
              <td className="mono">{typeof r.classifier_confidence === "number" ? r.classifier_confidence.toFixed(3) : "—"}</td>
              <td className="mono">{typeof r.anomaly_score === "number" ? r.anomaly_score.toFixed(3) : "—"}</td>
              <td className="trunc">{r.intent_label ?? "—"}</td><td>{r.geo_temporal_flag ? <Tag t="hi">mismatch</Tag> : <span className="muted">—</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: "1px solid var(--lift)" }}>
        <span className="eyebrow">{filtered.length === 0 ? "0 of 0" : `${page * PAGE + 1}–${Math.min((page + 1) * PAGE, filtered.length)} of ${filtered.length}`}</span>
        <span style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Prev</button>
        <span className="eyebrow">{page + 1} / {pages}</span>
        <button className="btn sm" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>Next</button>
      </div>
    </Card>
  );
}

export default function AlertsPage({ onOpen, selected }) {
  const { data, error, loading } = useAlerts();
  if (loading) return <Empty>Loading…</Empty>;
  if (error) return <ErrorCard error={error} />;
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const wallets = rows.filter((r) => (r.node_type || "").toLowerCase() === "wallet");
  const txs = rows.filter((r) => (r.node_type || "").toLowerCase() !== "wallet");
  const hi = rows.filter((r) => (r.risk_score ?? 0) >= 0.6).length;
  return (
    <>
      <Section eyebrow="Alert queue">
        <Reveal>
          <Tiles>
            <Tile k="Wallets" v={num(wallets.length)} s="flagged" />
            <Tile k="Transactions" v={num(txs.length)} s="flagged" />
            <Tile k="High" v={num(hi)} tone="orange" s="risk ≥ 0.6" />
            <Tile k="Mismatches" v={num(rows.filter((r) => r.geo_temporal_flag).length)} s="geo-temporal" />
          </Tiles>
        </Reveal>
        <div className="grid g3">
          <Reveal delay={0.03}><Card title="Risk" right="wallets vs transactions"><Histogram rows={rows} field="risk_score" byRisk /></Card></Reveal>
          <Reveal delay={0.06}><Card title="Confidence"><Histogram rows={rows} field="classifier_confidence" color={C.STONE} min={0} max={1} /></Card></Reveal>
          <Reveal delay={0.09}><Card title="Anomaly"><Histogram rows={rows} field="anomaly_score" color={C.STONE} min={0} max={1} /></Card></Reveal>
        </div>
      </Section>
      <Section eyebrow="Wallets"><Reveal><Table title="Addresses by risk" rows={wallets} onOpen={onOpen} selected={selected} /></Reveal></Section>
      <Section eyebrow="Transactions"><Reveal><Table title="Flagged transactions" rows={txs} onOpen={onOpen} selected={selected} /></Reveal></Section>
    </>
  );
}
