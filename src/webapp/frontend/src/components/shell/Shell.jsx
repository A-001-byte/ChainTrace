import { useState } from "react";
import { useStats } from "../../hooks/useStats";
import { SECTIONS } from "../../lib/sections";
import { num } from "../../lib/format";

/** Entity lookup — a SEARCH over already-computed output via /api/entity-lookup.
 *  Not an ingestion control; nothing here re-runs the pipeline. */
function Lookup({ onSubmit }) {
  const [v, setV] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); const id = v.trim(); if (id) onSubmit?.(id); }} style={{ display: "flex", gap: 8 }}>
      <input className="inp sm mono" aria-label="Look up an entity by node id" placeholder="wallet_… / tx_…" value={v} onChange={(e) => setV(e.target.value)} style={{ width: 200 }} />
      <button type="submit" className="btn sm primary" disabled={!v.trim()}>Look up</button>
    </form>
  );
}

export function TopNav({ active, onSelect, onLookup }) {
  const { data, error } = useStats();
  const mock = data?.data_source_label?.toLowerCase().includes("mock");
  return (
    <header className="topnav">
      <div className="inner">
        <span className="wordmark">Chain<i>Trace</i></span>
        <nav>{SECTIONS.map((s) => <button key={s.id} className={active === s.id ? "on" : ""} onClick={() => onSelect(s.id)} title={s.key}>{s.label}</button>)}</nav>
        <Lookup onSubmit={onLookup} />
        <span className="status"><i className={error || mock ? "warn" : ""} />{error ? "Offline" : mock ? "Mock data" : "Live"}</span>
      </div>
    </header>
  );
}

export function FootBar() {
  const { data } = useStats();
  return (
    <footer className="footbar">
      <div className="inner">
        <span>Source <b>{data?.data_source_label ?? "…"}</b></span>
        <span>Transactions <b>{num(data?.total_transactions)}</b></span>
        <span>Flagged <b>{num(data?.total_flagged)}</b></span>
        <span style={{ marginLeft: "auto" }}>Runs offline · no external calls at runtime · not a real-world identity claim</span>
      </div>
    </footer>
  );
}
