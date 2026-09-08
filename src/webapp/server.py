"""ChainTrace — alternative HTML/CSS/JS web frontend backend (Flask).

A second, independent way to view the same pipeline outputs the Streamlit dashboard
(src/dashboard/) shows — not a replacement. Built to full feature parity with the
Streamlit app: same stats, same mock-data safety net when real pipeline output isn't
ready yet, same entity drill-down, same linked-transaction lookup, same raw transaction
browser, same graph focus-on-select behavior.

Reuses src/dashboard's logic rather than re-implementing it:
- src.dashboard.data_loader.get_active_datasets() for loading + mock-data fallback —
  the exact same function the Streamlit app calls, just handed default file paths
  instead of Streamlit file_uploader objects (this app has no manual upload step).
- src.dashboard.components.graph_container.build_graph_html for the interactive graph.
- src.dashboard.components.alerts_table.find_linked_transactions for the drill-down's
  "linked blockchain transactions" lookup.
- src.dashboard.config's HIGH_RISK_THRESHOLD/MEDIUM_RISK_THRESHOLD so both surfaces agree
  on what "high risk" means.

Fully offline: reads only local files under data/processed/ and outputs/alerts/ (or
generates synthetic mock data entirely in-process if those aren't there yet), and the
graph HTML is post-processed (see graph_assets.py) so it never references a CDN.

Run directly:
    python -m src.webapp.server
or via the Flask CLI:
    flask --app src.webapp.server run
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import networkx as nx
import pandas as pd
from flask import Flask, Response, jsonify, redirect, request, send_from_directory

from src.dashboard.components.alerts_table import find_linked_transactions, find_linked_transactions_bulk
from src.dashboard.components.graph_container import build_graph_html
from src.dashboard.components.sidebar import DEFAULT_ALERTS_PATH, DEFAULT_TX_PATH
from src.dashboard.config import HIGH_RISK_THRESHOLD, MEDIUM_RISK_THRESHOLD
from src.dashboard.data_loader import get_active_datasets
from src.data_pipeline.config import COUNTRY_UTC_OFFSET
from src.graph_ml.clustering import kick_down_doors
# Read-only imports of the detector's own constants so the "claimed vs actual" panel
# uses the exact same business-hours window the detector judged the wallet against,
# rather than a second hardcoded copy that could drift.
from src.graph_ml.geo_temporal import BUSINESS_HOUR_END, BUSINESS_HOUR_START
from src.webapp.graph_assets import make_graph_html_offline_safe
# Adversarial Provenance Layer: paths only. The endpoints below read its output artifacts;
# they never recompute agency at request time and never embed one of its numbers.
from src.adversarial_provenance import config as apl_config

# The detector writes its verdict as "claims US, but 57% of activity falls in ..." --
# the claimed country is parsed back out of that sentence because that string is the
# authoritative record of what the detector actually judged. The alert row's own
# geo_country column is derived differently and genuinely disagrees for some wallets.
_CLAIMS_RE = re.compile(r"^claims\s+([A-Z]{2})")

STATIC_DIR = Path(__file__).resolve().parent / "static"
GRAPH_HTML_PATH = "outputs/graphs/cluster_graph.html"  # same default as render_graph_section()

# A single find_linked_transactions() scan is O(len(tx_df)); the geo overlay and, in the
# worst case, the alert table's country-filter values need one scan per flagged alert to
# enrich its geo — capped here so a very large top_n never turns "show me the geo
# breakdown" into a multi-minute wait. 50 matches the default TOP_N_ALERTS in graph_ml's
# config, i.e. the normal case does no capping at all.
MAX_ALERTS_TO_GEO_ENRICH = 50


# Module-level cache keyed by each file's (path, mtime) — avoids re-reading and
# re-sanitizing the ~87MB/204k-row unified_dataset.csv (measured at ~6.5s: 1.3s read +
# 5.1s for sanitize_transaction_df()'s row-wise address-list parsing) on every single API
# call. Streamlit's own app.py has this exact same per-rerun cost with no caching at all —
# this isn't a parity requirement, it's a genuine improvement on top of it, since the
# webapp's request-per-endpoint model makes the uncached cost far more noticeable than
# Streamlit's single-script-rerun model does.
_dataset_cache: dict = {}

# Separate cache for the Adversarial Provenance Layer's agency table (822k rows). Keyed on
# (path, mtime) like the dataset cache, so rerunning the APL pipeline is picked up without
# restarting the server.
_apl_cache: dict = {}


def _apl_taint() -> pd.DataFrame | None:
    """taint_scores.parquet indexed by bare address, or None if not built.

    Carries Module B's columns once pipeline_b has run: risk_cwt_ablated, fragility_span,
    queue, cfi, cluster_id.
    """
    path = apl_config.TAINT_PARQUET
    if not path.exists():
        return None
    key = (str(path), path.stat().st_mtime)
    if _apl_cache.get("taint_key") != key:
        _apl_cache["taint_key"] = key
        _apl_cache["taint"] = pd.read_parquet(path).set_index("address")
    return _apl_cache["taint"]


def _apl_fragility_for(address: str) -> dict:
    """Module B's per-address fragility interval, or explicit nulls if B hasn't run.

    Returns the evidence INTERVAL a judge can point at: [risk_cwt_ablated, risk_baseline].
    Every value is read from taint_scores.parquet; nothing is computed here.
    """
    taint = _apl_taint()
    empty = {
        "module_b_available": False,
        "risk_baseline": None, "risk_cwt": None, "risk_cwt_ablated": None,
        "fragility_span": None, "queue": None, "cluster_id": None,
        "cluster_size": None, "cluster_cfi": None, "cluster_cfi_status": None,
    }
    if taint is None or address not in taint.index or "risk_cwt_ablated" not in taint.columns:
        return empty

    row = taint.loc[address]
    if isinstance(row, pd.DataFrame):
        row = row.iloc[0]

    def _num(value):
        return None if pd.isna(value) else float(value)

    return {
        "module_b_available": True,
        "risk_baseline": _num(row.get("risk_baseline")),
        "risk_cwt": _num(row.get("risk_cwt")),
        "risk_cwt_ablated": _num(row.get("risk_cwt_ablated")),
        "fragility_span": _num(row.get("fragility_span")),
        "queue": None if pd.isna(row.get("queue")) else str(row.get("queue")),
        "cluster_id": None if pd.isna(row.get("cluster_id")) else int(row.get("cluster_id")),
        "cluster_size": None if pd.isna(row.get("cluster_size")) else int(row.get("cluster_size")),
        # cfi is NaN for oversize clusters -- that means NOT COMPUTED, never "clean".
        "cluster_cfi": _num(row.get("cfi")),
        "cluster_cfi_status": None if pd.isna(row.get("cfi_status")) else str(row.get("cfi_status")),
    }


def _apl_agency() -> pd.DataFrame | None:
    """agency.parquet indexed by bare address, or None if the layer hasn't been built."""
    path = apl_config.AGENCY_PARQUET
    if not path.exists():
        return None
    key = (str(path), path.stat().st_mtime)
    if _apl_cache.get("key") != key:
        _apl_cache["key"] = key
        _apl_cache["agency"] = pd.read_parquet(path).set_index("address")
    return _apl_cache["agency"]


def _current_cache_key() -> tuple:
    """(path, mtime) pair for both default files — the cache key both _active_datasets()
    and _cached_enrich_geo() key off of, so a fresh pipeline run (new mtime) invalidates
    both caches together and nothing stale can be served from just one of them.
    """
    tx_exists = DEFAULT_TX_PATH.exists()
    alerts_exists = DEFAULT_ALERTS_PATH.exists()
    return (
        str(DEFAULT_TX_PATH), DEFAULT_TX_PATH.stat().st_mtime if tx_exists else None,
        str(DEFAULT_ALERTS_PATH), DEFAULT_ALERTS_PATH.stat().st_mtime if alerts_exists else None,
    )


def _active_datasets() -> tuple[pd.DataFrame, pd.DataFrame, str, list[str]]:
    """(tx_df, alerts_df, source_label, warnings) — identical semantics to what the
    Streamlit sidebar produces, including the mock-data fallback, just fed default file
    paths instead of an uploaded-file object. Cached on (path, mtime) so a fresh pipeline
    run (which changes the file's mtime) is still picked up automatically without
    restarting the server, but repeated requests against an unchanged file don't pay the
    full load+sanitize cost again.
    """
    cache_key = _current_cache_key()
    if cache_key in _dataset_cache:
        return _dataset_cache[cache_key]

    tx_input, _, alerts_input, _ = cache_key
    tx_input = tx_input if Path(tx_input).exists() else None
    alerts_input = alerts_input if Path(alerts_input).exists() else None
    result = get_active_datasets(tx_file_input=tx_input, alerts_file_input=alerts_input)

    _dataset_cache.clear()  # only ever one entry live — no unbounded growth across runs
    _dataset_cache[cache_key] = result
    return result


_enriched_alerts_cache: dict = {}


def _cached_enrich_geo(alerts_df: pd.DataFrame, tx_df: pd.DataFrame) -> pd.DataFrame:
    """_enrich_geo() itself costs ~9s on the real dataset (50 literal substring scans
    across 3 columns) — worth caching by the same (path, mtime) key _active_datasets()
    uses, so /api/alerts and /api/geo (both of which need the enriched frame) only pay it
    once per pipeline run rather than once per request.
    """
    cache_key = _current_cache_key()
    if cache_key in _enriched_alerts_cache:
        return _enriched_alerts_cache[cache_key]
    enriched = _enrich_geo(alerts_df, tx_df)
    _enriched_alerts_cache.clear()
    _enriched_alerts_cache[cache_key] = enriched
    return enriched


def _enrich_geo(alerts_df: pd.DataFrame, tx_df: pd.DataFrame) -> pd.DataFrame:
    """Fill in each alert's real geo_country/asn from its linked transactions, when the
    alert's own value is the "Unknown" placeholder sanitize_alerts_df() defaults to.

    Why this exists: ranked_alerts.csv (graph_ml's real output) has no geo_country/asn
    column at all — verified directly, not assumed — so every real alert row's geo comes
    back as "Unknown"/"Unknown ASN" after sanitize_alerts_df()'s defaulting. Streamlit's
    own geo-overlay tab groups by that same all-"Unknown" column, so as literally coded it
    isn't currently a useful view against real pipeline output. Rather than reproduce that
    gap, this looks up each alert's real geo through the transactions it's actually linked
    to (same find_linked_transactions() used by the entity drill-down) — same presentation
    Streamlit uses (per-country counts + avg/max risk score), genuinely populated data.
    Mock data already carries real-ish geo_country/asn per alert, so this is a no-op there.
    """
    enriched = alerts_df.copy()
    needs_geo = (enriched["geo_country"].isna() | enriched["geo_country"].isin(["Unknown"])) | (enriched["asn"].isna() | enriched["asn"].isin(["Unknown ASN"]))
    candidates = enriched[needs_geo].head(MAX_ALERTS_TO_GEO_ENRICH)
    if candidates.empty:
        return enriched

    # Bulk lookup — literal per-address substring scans (see find_linked_transactions_bulk's
    # own docstring for why literal, not a combined regex alternation, is what's actually
    # fast here). Also cached one level up (_cached_enrich_geo), since this alone still
    # costs ~9s against the real dataset.
    matches_by_id = find_linked_transactions_bulk(tx_df, candidates["node_id"].astype(str).tolist())

    for idx, row in candidates.iterrows():
        matches = matches_by_id.get(str(row["node_id"]))
        if matches is None or matches.empty:
            continue
        first = matches.iloc[0]
        # str()-cast both — alerts_df's geo_country/asn columns can be a strict
        # arrow-backed string dtype (observed under pandas' "future" string-dtype
        # inference), which raises TypeError on assigning tx_df's raw value directly
        # (e.g. asn as int64 rather than str). Both columns are display-only text either
        # way, so this loses nothing.
        if row["geo_country"] in ("Unknown", None) and "geo_country" in first and pd.notna(first["geo_country"]):
            enriched.at[idx, "geo_country"] = str(first["geo_country"])
        if row["asn"] in ("Unknown ASN", None) and "asn" in first and pd.notna(first["asn"]):
            enriched.at[idx, "asn"] = str(first["asn"])

    return enriched


def _compute_stats(tx_df: pd.DataFrame, alerts_df: pd.DataFrame) -> dict:
    """Summary numbers for the stats-cards row — matches Streamlit's render_stat_cards()
    exactly (same 4 metrics: total transactions, flagged+critical counts, avg confidence
    among flagged, distinct Louvain clusters among flagged), plus the extra breakdown
    fields this app already exposed before parity work (node_type_breakdown, risk tiers
    across *all* alerts rather than just flagged) — kept as additive extras, not replaced.
    """
    total_tx = len(tx_df)
    total = len(alerts_df)

    flagged_df = alerts_df[alerts_df["risk_score"] >= MEDIUM_RISK_THRESHOLD]
    high_risk_df = alerts_df[alerts_df["risk_score"] >= HIGH_RISK_THRESHOLD]
    flagged_count = len(flagged_df)
    high_risk_count = len(high_risk_df)

    flagged_avg_confidence_pct = (
        round(float(flagged_df["risk_score"].mean()) * 100, 1) if flagged_count else 0.0
    )
    distinct_clusters = (
        int(flagged_df["cluster_id"].nunique())
        if "cluster_id" in alerts_df.columns and flagged_count
        else 0
    )

    by_type = (
        {str(k): int(v) for k, v in alerts_df["node_type"].value_counts().items()}
        if "node_type" in alerts_df.columns
        else {}
    )
    avg_risk_score = float(alerts_df["risk_score"].mean()) if total else 0.0
    avg_classifier_confidence = (
        float(alerts_df["classifier_confidence"].mean())
        if "classifier_confidence" in alerts_df.columns and total
        else None
    )
    risk_score = alerts_df["risk_score"]
    high = int((risk_score >= HIGH_RISK_THRESHOLD).sum())
    medium = int(((risk_score >= MEDIUM_RISK_THRESHOLD) & (risk_score < HIGH_RISK_THRESHOLD)).sum())
    low = total - high - medium

    return {
        # Streamlit-parity fields (render_stat_cards()) —
        "total_transactions": total_tx,
        "flagged_count": flagged_count,
        "high_risk_count": high_risk_count,
        "flagged_avg_confidence_pct": flagged_avg_confidence_pct,
        "distinct_clusters": distinct_clusters,
        # Pre-existing extra fields (all-alerts view, not just flagged) —
        "total_flagged": total,
        "node_type_breakdown": by_type,
        "avg_risk_score": round(avg_risk_score, 4),
        "avg_classifier_confidence": (
            round(avg_classifier_confidence, 4) if avg_classifier_confidence is not None else None
        ),
        "risk_tier_counts": {"high": high, "medium": medium, "low": low},
        "risk_tier_thresholds": {"high": HIGH_RISK_THRESHOLD, "medium": MEDIUM_RISK_THRESHOLD},
    }


def _compute_geo_summary(enriched_alerts_df: pd.DataFrame, tx_df: pd.DataFrame, top_n: int = 20) -> dict:
    """Country/ASN breakdown among *flagged* entities (risk_score >= MEDIUM_RISK_THRESHOLD)
    with avg/max risk score per group — matches Streamlit's render_geo_overlay() exactly,
    except its geo source is enriched (see _enrich_geo) rather than reproducing the
    "100% Unknown" gap real ranked_alerts.csv currently has.

    Takes the already-enriched alerts DataFrame (via _cached_enrich_geo — enrichment costs
    ~9s, so the caller does it once and this just filters/groups the result) rather than
    enriching internally, so /api/geo and /api/alerts share one enrichment pass instead of
    each paying for their own.
    """
    flagged = enriched_alerts_df[enriched_alerts_df["risk_score"] >= MEDIUM_RISK_THRESHOLD]
    if flagged.empty:
        flagged = enriched_alerts_df

    def _grouped(source_col: str, output_key: str) -> list[dict]:
        if source_col not in flagged.columns or flagged.empty:
            return []
        grouped = (
            flagged.groupby(source_col)
            .agg(flagged_count=("node_id", "count"), avg_risk_score=("risk_score", "mean"), max_risk_score=("risk_score", "max"))
            .reset_index()
            .sort_values("flagged_count", ascending=False)
            .head(top_n)
        )
        return [
            {
                output_key: str(r[source_col]),
                "flagged_count": int(r["flagged_count"]),
                "avg_risk_score": round(float(r["avg_risk_score"]), 4),
                "max_risk_score": round(float(r["max_risk_score"]), 4),
            }
            for _, r in grouped.iterrows()
        ]

    by_country = _grouped("geo_country", "country")
    by_asn = _grouped("asn", "asn")

    return {"total_transactions": len(tx_df), "flagged_considered": len(flagged), "by_country": by_country, "by_asn": by_asn}


# Graph fan-out caps. The forensic graph is a *readable* neighbourhood view, not the full
# 1.02M-node pipeline graph -- these bound it so vis-network's physics stays interactive.
GRAPH_MAX_TX_PER_ALERT = 2
GRAPH_MAX_ADDRS_PER_TX = 3


def _build_graph_payload(alerts_df: pd.DataFrame, tx_df: pd.DataFrame) -> dict:
    """Node/edge JSON for the client-side forensic graph.

    Carries the fields the frontend needs to *encode* structure visually -- cluster_id
    (categorical colour), risk_score (node size), node_type (shape) -- rather than
    shipping a pre-rendered picture. Alert entities are the real subjects; the
    transactions and counterparty addresses around them are context, flagged with
    is_context so the frontend can mute them instead of implying they were scored.
    """
    nodes: dict[str, dict] = {}
    edges: list[dict] = []

    def put(node_id: str, **attrs) -> None:
        if node_id not in nodes:
            nodes[node_id] = {"id": node_id, **attrs}

    alert_ids = [str(n) for n in alerts_df["node_id"].tolist()]
    linked_map = find_linked_transactions_bulk(tx_df, alert_ids)

    # Scored entities go in FIRST, before any neighbourhood walking. An alert can also be
    # some other alert's linked transaction; if the context pass reached it first, put()'s
    # first-write-wins would leave a genuinely scored entity permanently marked
    # is_context=True and drawn muted, hiding a real alert in plain sight.
    for _, row in alerts_df.iterrows():
        node_id = str(row["node_id"])
        cluster_id = row.get("cluster_id")
        risk = row.get("risk_score")
        put(
            node_id,
            node_type=str(row.get("node_type") or ("tx" if node_id.startswith("tx_") else "wallet")),
            # Native Python types only -- numpy scalars are not JSON-serializable by jsonify.
            cluster_id=None if pd.isna(cluster_id) else int(cluster_id),
            risk_score=None if pd.isna(risk) else float(risk),
            label=None if pd.isna(row.get("label")) else str(row.get("label")),
            reason=None if pd.isna(row.get("reason")) else str(row.get("reason")),
            intent_label=None if pd.isna(row.get("intent_label")) else str(row.get("intent_label")),
            geo_temporal_flag=bool(row.get("geo_temporal_flag")) if not pd.isna(row.get("geo_temporal_flag")) else False,
            is_context=False,
        )

    for _, row in alerts_df.iterrows():
        node_id = str(row["node_id"])
        linked = linked_map.get(node_id)
        if linked is None or linked.empty:
            continue

        for _, t_row in linked.head(GRAPH_MAX_TX_PER_ALERT).iterrows():
            tx_node = f"tx_{t_row['txid']}"
            if tx_node != node_id:
                put(tx_node, node_type="tx", cluster_id=None, risk_score=None, label=None,
                    reason=None, intent_label=None, geo_temporal_flag=False, is_context=True)
                edges.append({"from": node_id, "to": tx_node})

            seen = 0
            for fld in ("input_addresses", "output_addresses"):
                for addr in _parse_addr_list_for_kdd(t_row.get(fld)):
                    if seen >= GRAPH_MAX_ADDRS_PER_TX:
                        break
                    w_node = f"wallet_{addr}"
                    if w_node == node_id or w_node == tx_node:
                        continue
                    put(w_node, node_type="wallet", cluster_id=None, risk_score=None, label=None,
                        reason=None, intent_label=None, geo_temporal_flag=False, is_context=True)
                    edges.append({"from": tx_node, "to": w_node})
                    seen += 1

    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "alert_node_count": len(alert_ids),
        "caps": {"max_tx_per_alert": GRAPH_MAX_TX_PER_ALERT, "max_addrs_per_tx": GRAPH_MAX_ADDRS_PER_TX},
    }


def _lookup_entity_beyond_alerts(node_id: str, tx_df: pd.DataFrame) -> dict | None:
    """Best-effort record for an entity that is NOT in the top-N ranked alerts.

    Read-only lookup against already-computed unified_dataset.csv. This deliberately
    returns risk_score/cluster_id as None rather than inventing them: only the top-N
    alerts have persisted scores, so anything else genuinely has no score on disk, and
    fabricating one would misrepresent the pipeline's output.
    """
    linked = find_linked_transactions(tx_df, node_id)
    if linked.empty:
        return None

    def _modal(col: str):
        if col not in linked.columns:
            return None
        vals = linked[col].dropna()
        return None if vals.empty else str(vals.mode().iloc[0])

    return {
        "node_id": node_id,
        "node_type": "tx" if node_id.startswith("tx_") else "wallet",
        "label": _modal("label"),
        "cluster_id": None,
        "risk_score": None,
        "classifier_confidence": None,
        "anomaly_score": None,
        "reason": None,
        "intent_label": None,
        "geo_temporal_flag": None,
        "geo_temporal_reason": None,
        "geo_country": _modal("geo_country"),
        "asn": _modal("asn"),
        "transaction_count": int(len(linked)),
    }


def _parse_addr_list_for_kdd(val: object) -> list[str]:
    """Same address-list parsing as Streamlit's Kick Down Doors expander (see
    _build_kick_down_doors_subgraph) -- ported verbatim, not reimplemented.
    """
    if isinstance(val, list):
        return [str(v).strip() for v in val if str(v).strip()]
    if isinstance(val, str) and val.strip():
        s = val.strip()
        if s.startswith("[") and s.endswith("]"):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    return [str(v).strip() for v in parsed if str(v).strip()]
            except Exception:
                pass
        return [s]
    return []


def _build_kick_down_doors_subgraph(target_addr: str, row: pd.Series, matching_txs: pd.DataFrame) -> nx.Graph:
    """Build the exact same LOCAL neighborhood graph as Streamlit's "💥 Kick Down Doors"
    expander (src/dashboard/components/alerts_table.py::render_entity_drilldown) -- ported
    node-for-node from there, not reimplemented, so both surfaces agree on identical
    results for identical entities: this entity plus its matching transactions (capped at
    15) and those transactions' input/output addresses. Deliberately local, not a
    network-wide graph -- matches what's already decided to tell judges tomorrow.
    """
    cluster_id = row.get("cluster_id")
    # numpy int64 (a raw pandas scalar) isn't JSON-serializable by Flask's jsonify --
    # cast to a native Python int (or None) here, at the source, rather than downstream.
    cluster_id = None if pd.isna(cluster_id) else int(cluster_id)

    sub_g = nx.Graph()
    sub_g.add_node(target_addr, label=str(row.get("label", "unknown")), cluster=cluster_id)
    if not matching_txs.empty:
        for _, t_row in matching_txs.head(15).iterrows():
            tx_node = f"tx_{t_row['txid']}"
            sub_g.add_node(tx_node, label=str(t_row.get("label", "unknown")), node_type="tx")
            sub_g.add_edge(target_addr, tx_node)
            for fld in ("input_addresses", "output_addresses"):
                for addr in _parse_addr_list_for_kdd(t_row.get(fld)):
                    if addr and addr != target_addr:
                        w_node = f"wallet_{addr}"
                        sub_g.add_node(w_node, label="unknown", node_type="wallet")
                        sub_g.add_edge(tx_node, w_node)
    return sub_g


def create_app() -> Flask:
    app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")

    @app.get("/")
    def index() -> Response:
        # The old standalone HTML/CSS/JS frontend (static/index.html, app.js, style.css)
        # is retired -- the React app at /app/ is the only frontend now. Redirect rather
        # than making "/" itself serve the React shell: keeps exactly one URL (/app/) that
        # actually owns the SPA's routing/asset paths, so a bookmarked or shared "/" link
        # still lands somewhere real instead of quietly 404ing.
        return redirect("/app/")

    @app.get("/app/")
    @app.get("/app/<path:filename>")
    def react_app(filename: str = "index.html") -> Response:
        target = STATIC_DIR / "app" / filename
        if not target.exists():
            # SPA fallback: any unknown sub-path (e.g. browser refresh mid-navigation)
            # still serves index.html so React's own routing can take over client-side.
            return send_from_directory(STATIC_DIR / "app", "index.html")
        return send_from_directory(STATIC_DIR / "app", filename)

    @app.get("/api/alerts")
    def api_alerts():
        tx_df, alerts_df, source_label, warnings = _active_datasets()
        enriched = _cached_enrich_geo(alerts_df, tx_df)
        # Route each DataFrame through pandas' own to_json first, then re-parse with the
        # stdlib json module before handing it to jsonify — jsonify(df.to_dict(...)) emits
        # a bare `NaN` literal for missing floats, which is not valid JSON and breaks
        # JSON.parse() in the browser; to_json() correctly emits `null`. Verified directly,
        # not assumed (this bit us once already — see the commit history).
        rows = json.loads(enriched.to_json(orient="records"))
        return jsonify({"rows": rows, "data_source_label": source_label, "warnings": warnings})

    @app.get("/api/stats")
    def api_stats():
        tx_df, alerts_df, source_label, warnings = _active_datasets()
        stats = _compute_stats(tx_df, alerts_df)
        stats["data_source_label"] = source_label
        stats["warnings"] = warnings
        return jsonify(stats)

    @app.get("/api/graph")
    def api_graph():
        tx_df, alerts_df, _, _ = _active_datasets()
        focus = request.args.get("focus") or None
        try:
            html = build_graph_html(alerts_df=alerts_df, tx_df=tx_df, selected_entity=focus, html_path=GRAPH_HTML_PATH)
            html = make_graph_html_offline_safe(html)
        except Exception as err:  # mirrors render_graph_section()'s own fallback-on-error
            html = (
                "<html><body style='background:#0b0e14;color:#94a3b8;"
                "font-family:sans-serif;padding:2rem;'>"
                f"<h3 style='color:#00e5ff'>Graph unavailable</h3><p>{err}</p></body></html>"
            )
        return Response(html, mimetype="text/html")

    @app.get("/api/geo")
    def api_geo():
        tx_df, alerts_df, _, _ = _active_datasets()
        enriched = _cached_enrich_geo(alerts_df, tx_df)
        return jsonify(_compute_geo_summary(enriched, tx_df))

    @app.get("/api/graph-data")
    def api_graph_data():
        """Node/edge JSON for the client-side forensic graph.

        Additive: /api/graph (the pre-rendered pyvis HTML) is untouched and still served.
        This exists because a picture in an iframe can't encode cluster membership or
        report clicks back to React -- see _build_graph_payload().
        """
        tx_df, alerts_df, _, _ = _active_datasets()
        return jsonify(_build_graph_payload(alerts_df, tx_df))

    @app.get("/api/apl/summary")
    def api_apl_summary():
        """Adversarial Provenance Layer: the manifest (honesty contract) and the measured
        headline statistics, served straight off disk.

        Additive; touches no existing route. Everything returned here was computed by
        `python -m src.adversarial_provenance.pipeline` and
        `python -m src.adversarial_provenance.headline_stats` over real Elliptic++ rows --
        this endpoint reads JSON, it does not calculate or embed any figure.
        """
        manifest_path = apl_config.MANIFEST_JSON
        stats_path = apl_config.HEADLINE_STATS_JSON
        if not manifest_path.exists() or not stats_path.exists():
            return jsonify({
                "available": False,
                "error": (
                    "Adversarial Provenance Layer has not been built. Run "
                    "python -m src.adversarial_provenance.pipeline then "
                    "python -m src.adversarial_provenance.headline_stats"
                ),
            }), 404
        manifest_b_path = apl_config.OUTPUT_DIR / "_manifest_b.json"
        return jsonify({
            "available": True,
            "manifest": json.loads(manifest_path.read_text(encoding="utf-8")),
            "manifest_b": (
                json.loads(manifest_b_path.read_text(encoding="utf-8"))
                if manifest_b_path.exists() else None
            ),
            "headline_stats": json.loads(stats_path.read_text(encoding="utf-8")),
        })

    @app.get("/api/apl/agency/<path:node_id>")
    def api_apl_agency(node_id: str):
        """Per-wallet agency record: alpha plus every component that produced it.

        node_id may be a graph node id ("wallet_<address>") or a bare address.
        """
        agency = _apl_agency()
        if agency is None:
            return jsonify({"available": False, "error": "Adversarial Provenance Layer not built."}), 404

        address = str(node_id)
        if address.startswith("wallet_"):
            address = address[len("wallet_"):]

        if address not in agency.index:
            return jsonify({
                "available": True,
                "found": False,
                "node_id": node_id,
                "error": f"'{address}' is not present in the Elliptic++ address-transaction edge lists.",
            }), 404

        row = agency.loc[address]
        if isinstance(row, pd.DataFrame):  # defensive: duplicate index would break .loc
            row = row.iloc[0]

        return jsonify({
            "available": True,
            "found": True,
            "node_id": node_id,
            "address": address,
            "alpha": float(row.alpha),
            "has_spent": bool(row.has_spent),
            "has_received": bool(row.has_received),
            "spend_after_exposure": bool(row.spend_after_exposure),
            "commingled": bool(row.commingled),
            "n_taint_links": int(row.n_taint_links),
            "repeat_counterparty": bool(row.repeat_counterparty),
            "first_contact": bool(row.first_contact),
            "evidence_reason": str(row.evidence_reason),
            **_apl_fragility_for(address),
        })

    @app.get("/api/entity-hours/<path:node_id>")
    def api_entity_hours(node_id: str):
        """Activity-hour histogram for one entity, in UTC and in the CLAIMED country's
        local time, alongside that country's expected business-hours window.

        Additive. This exists because the per-wallet hour distribution is genuinely not
        exposed anywhere else: /api/alerts carries the detector's verdict sentence but not
        the histogram behind it, and /api/geo is aggregate-only. It powers the
        "claimed vs actual" explainer — showing the reader the mismatch the detector
        describes in words, rather than restating the sentence a second time.

        Read-only over unified_dataset.csv; computes nothing the detector didn't already
        act on, and re-runs no part of the pipeline.
        """
        tx_df, alerts_df, _, _ = _active_datasets()

        linked = find_linked_transactions(tx_df, str(node_id))
        if linked.empty or "timestamp" not in linked.columns:
            return jsonify({"error": f"No transactions found for entity '{node_id}'."}), 404

        timestamps = pd.to_datetime(linked["timestamp"], errors="coerce").dropna()
        if timestamps.empty:
            return jsonify({"error": f"No usable timestamps for entity '{node_id}'."}), 404

        utc_hours = [0] * 24
        for h in timestamps.dt.hour:
            utc_hours[int(h)] += 1

        # Claimed country comes from the detector's own sentence (see _CLAIMS_RE).
        match = alerts_df[alerts_df["node_id"].astype(str) == str(node_id)]
        claimed_country, reason = None, None
        if not match.empty:
            raw_reason = match.iloc[0].get("geo_temporal_reason")
            if pd.notna(raw_reason):
                reason = str(raw_reason)
                m = _CLAIMS_RE.match(reason)
                if m:
                    claimed_country = m.group(1)

        claimed_offset = COUNTRY_UTC_OFFSET.get(claimed_country) if claimed_country else None

        local_hours = None
        business_fraction = None
        if claimed_offset is not None:
            local_hours = [0] * 24
            for utc_hour, count in enumerate(utc_hours):
                local_hours[(utc_hour + claimed_offset) % 24] += count
            total = sum(local_hours) or 1
            in_window = sum(local_hours[BUSINESS_HOUR_START:BUSINESS_HOUR_END])
            business_fraction = round(in_window / total, 4)

        return jsonify({
            "node_id": node_id,
            "claimed_country": claimed_country,
            "claimed_utc_offset": claimed_offset,
            "geo_temporal_reason": reason,
            "utc_hours": utc_hours,
            "local_hours": local_hours,
            "business_hour_start": BUSINESS_HOUR_START,
            "business_hour_end": BUSINESS_HOUR_END,
            "claimed_business_fraction": business_fraction,
            "transaction_count": int(len(timestamps)),
        })

    @app.get("/api/entity-lookup/<path:node_id>")
    def api_entity_lookup(node_id: str):
        """Entity drill-down for ANY node_id, not just the top-N ranked alerts.

        Superset of /api/entity/<node_id>, which stays exactly as it was: same
        {alert, linked_transactions} shape, plus an `in_top_alerts` flag. Entities outside
        the ranked set come back with real dataset fields (geo, ASN, linked transactions)
        and explicit nulls for the scores that were never persisted for them.

        This is a read-only lookup over existing pipeline output. It does not ingest data
        and does not re-run anything.
        """
        tx_df, alerts_df, _, _ = _active_datasets()
        enriched_alerts_df = _cached_enrich_geo(alerts_df, tx_df)
        match = enriched_alerts_df[enriched_alerts_df["node_id"].astype(str) == str(node_id)]

        if not match.empty:
            alert = json.loads(match.iloc[[0]].to_json(orient="records"))[0]
            in_top_alerts = True
        else:
            alert = _lookup_entity_beyond_alerts(str(node_id), tx_df)
            if alert is None:
                return jsonify({
                    "error": f"'{node_id}' was not found in the ranked alerts or the scored dataset."
                }), 404
            in_top_alerts = False

        linked = find_linked_transactions(tx_df, str(node_id))
        tx_cols = [c for c in ("txid", "timestamp", "src_ip", "dst_ip", "script_type", "fee", "geo_country", "asn") if c in linked.columns]
        linked_transactions = json.loads(linked[tx_cols].head(5).to_json(orient="records")) if not linked.empty else []

        return jsonify({"alert": alert, "linked_transactions": linked_transactions, "in_top_alerts": in_top_alerts})

    @app.get("/api/entity/<path:node_id>")
    def api_entity(node_id: str):
        """Full drill-down record for one entity — same content as Streamlit's
        render_entity_drilldown(): the alert row plus its linked blockchain transactions.
        """
        tx_df, alerts_df, _, _ = _active_datasets()
        enriched_alerts_df = _cached_enrich_geo(alerts_df, tx_df)  # same real geo as /api/alerts, not raw "Unknown"
        match = enriched_alerts_df[enriched_alerts_df["node_id"].astype(str) == str(node_id)]
        if match.empty:
            return jsonify({"error": f"No alert found for entity '{node_id}'."}), 404

        # see api_alerts() for why json.loads(df.to_json()) rather than jsonify(df.to_dict())
        alert = json.loads(match.iloc[[0]].to_json(orient="records"))[0]

        linked = find_linked_transactions(tx_df, str(node_id))
        tx_cols = [c for c in ("txid", "timestamp", "src_ip", "dst_ip", "script_type", "fee", "geo_country", "asn") if c in linked.columns]
        linked_transactions = json.loads(linked[tx_cols].head(5).to_json(orient="records")) if not linked.empty else []

        return jsonify({"alert": alert, "linked_transactions": linked_transactions})

    @app.get("/api/entity/<path:node_id>/kick-down-doors")
    def api_kick_down_doors(node_id: str):
        """Local (not network-wide) high-leverage disruption analysis for one entity --
        ported from Streamlit's "💥 Kick Down Doors" expander in alerts_table.py, same
        scope: this entity plus its up-to-15 matching transactions and their input/output
        addresses, scored with src.graph_ml.clustering.kick_down_doors(). See
        _build_kick_down_doors_subgraph() for the ported subgraph-construction logic.
        """
        tx_df, alerts_df, _, _ = _active_datasets()
        enriched_alerts_df = _cached_enrich_geo(alerts_df, tx_df)
        match = enriched_alerts_df[enriched_alerts_df["node_id"].astype(str) == str(node_id)]
        if match.empty:
            return jsonify({"error": f"No alert found for entity '{node_id}'."}), 404
        row = match.iloc[0]

        target_addr = str(node_id)
        matching_txs = find_linked_transactions(tx_df, target_addr)

        try:
            sub_g = _build_kick_down_doors_subgraph(target_addr, row, matching_txs)
            ranked = kick_down_doors(sub_g, [target_addr], top_n=5)
        except Exception as err:
            return jsonify({"error": f"Kick Down Doors analysis unavailable: {err}"}), 500

        fields = ("node_id", "node_type", "impact_score", "betweenness", "is_articulation_point", "reason")
        results = [{k: r[k] for k in fields} for r in ranked]
        return jsonify({"entity_id": node_id, "results": results})

    @app.get("/api/transactions")
    def api_transactions():
        """Paginated raw transaction stream — matches Streamlit's "Ingested Transaction
        Stream" tab, which shows the full unified_dataset.csv; paginated here since this
        is a plain page fetched over HTTP, not a Streamlit component with its own
        scroll-virtualized grid.
        """
        tx_df, _, _, _ = _active_datasets()
        try:
            limit = max(1, min(int(request.args.get("limit", 50)), 500))
        except ValueError:
            limit = 50
        try:
            offset = max(0, int(request.args.get("offset", 0)))
        except ValueError:
            offset = 0

        page = tx_df.iloc[offset : offset + limit]
        rows = json.loads(page.to_json(orient="records"))  # see api_alerts() for why to_json(), not jsonify(to_dict())
        return jsonify({"total": len(tx_df), "limit": limit, "offset": offset, "rows": rows})

    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=5000, debug=False)
