import { useMemo, useState } from "react";
import { useAlerts } from "../../hooks/useAlerts";
import { clusterColor } from "../../lib/clusterColors";
import { riskColor } from "../../lib/chartColors";
import { short, num } from "../../lib/format";
import { Card, Stat, Stats, PageHead, Risk, Bar, Tag, Empty, ErrorCard, Reveal } from "../ui";

const PAGE = 14;
const TABS = [["all", "All"], ["wallet", "Wallets"], ["tx", "Transactions"]];
const COLS = [
  ["node_id", "Entity", ""], ["node_type", "Type", ""], ["cluster_id", "Cluster", ""],
  ["classifier_confidence", "Confidence", "r"], ["anomaly_score", "Anomaly", "r"], ["risk_score", "Risk", "r"],
];

export default function AlertsPage({ onOpen, selected }) {
  const { data, error, loading } = useAlerts();
  const [tab, setTab] = useState("all");
  const [sort, setSort] = useState(["risk_score", -1]);
  const [q, setQ] = useState("");
  const [rawPage, setPage] = useState(0);

  const rows = useMemo(() => (Array.isArray(data?.rows) ? data.rows : []), [data]);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    let out = rows;
    if (tab !== "all") out = out.filter((r) => ((r.node_type || "").toLowerCase() === "wallet") === (tab === "wallet"));
    if (n) out = out.filter((r) => String(r.node_id ?? "").toLowerCase().includes(n));
    const [f, d] = sort;
    return [...out].sort((a, b) => { const av = a[f] ?? 0, bv = b[f] ?? 0; return av > bv ? d : av < bv ? -d : 0; });
  }, [rows, tab, q, sort]);

  if (loading) return <Empty>Loading…</Empty>;
  if (error) return <ErrorCard error={error} />;

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const page = Math.min(rawPage, pages - 1); // clamp in render — no effect needed
  const slice = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const wallets = rows.filter((r) => (r.node_type || "").toLowerCase() === "wallet").length;
  const hi = rows.filter((r) => (r.risk_score ?? 0) >= 0.6).length;

  return (
    <>
      <Reveal>
        <PageHead title="Alerts" sub="The ranked alert queue. Select any row to open its full record, explanation and disruption analysis." />
      </Reveal>

      <Reveal delay={0.04}>
        <Stats>
          <Stat k="Alerts" v={num(rows.length)} s="ranked entities" />
          <Stat k="Wallets" v={num(wallets)} s={`${num(rows.length - wallets)} transactions`} />
          <Stat k="High" v={num(hi)} t="down" s="risk ≥ 0.6" />
          <Stat k="Mismatches" v={num(rows.filter((r) => r.geo_temporal_flag).length)} s="geo-temporal" />
        </Stats>
      </Reveal>

      <Reveal delay={0.08}>
        <Card flush>
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 24px", flexWrap: "wrap" }}>
            <div className="pills">{TABS.map(([id, l]) => <button key={id} className={tab === id ? "on" : ""} onClick={() => { setTab(id); setPage(0); }}>{l}</button>)}</div>
            <input className="inp sm" placeholder="Filter by id" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} style={{ width: 180, marginLeft: "auto" }} />
          </div>
          <table className="tbl">
            <thead><tr>{COLS.map(([f, l, cls]) => (
              <th key={f} className={`sortable${cls ? ` ${cls}` : ""}${sort[0] === f ? " on" : ""}`} onClick={() => setSort(([cf, cd]) => (cf === f ? [f, -cd] : [f, -1]))}>
                {l}{sort[0] === f ? (sort[1] < 0 ? " ↓" : " ↑") : ""}
              </th>
            ))}</tr></thead>
            <tbody>
              {slice.length === 0 ? <tr><td colSpan={COLS.length} className="sec">No matching entities</td></tr> : slice.map((r) => (
                <tr key={r.node_id} className={`row${selected === r.node_id ? " sel" : ""}`} onClick={() => onOpen(r.node_id)}>
                  <td className="mono" title={r.node_id}>
                    {short(r.node_id, 26)}
                    {r.geo_temporal_flag && <Tag t="hi" title={r.geo_temporal_reason}>Geo</Tag>}
                  </td>
                  <td className="sec">{r.node_type}</td>
                  <td><span className="num" style={{ color: clusterColor(r.cluster_id) }}>{r.cluster_id ?? "—"}</span></td>
                  <td className="r num sec">{typeof r.classifier_confidence === "number" ? r.classifier_confidence.toFixed(3) : "—"}</td>
                  <td className="r num sec">{typeof r.anomaly_score === "number" ? r.anomaly_score.toFixed(3) : "—"}</td>
                  <td className="r">
                    <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }}>
                      <Bar frac={r.risk_score} color={riskColor(r.risk_score)} />
                      <Risk score={r.risk_score} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pager">
            <span className="meta">{filtered.length === 0 ? "Nothing to show" : `${page * PAGE + 1}–${Math.min((page + 1) * PAGE, filtered.length)} of ${filtered.length}`}</span>
            <span style={{ flex: 1 }} />
            <button className="btn sm" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>Previous</button>
            <span className="meta">{page + 1} / {pages}</span>
            <button className="btn sm" onClick={() => setPage(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1}>Next</button>
          </div>
        </Card>
      </Reveal>
    </>
  );
}
