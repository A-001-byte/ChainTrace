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
from pathlib import Path

import pandas as pd
from flask import Flask, Response, jsonify, request, send_from_directory

from src.dashboard.components.alerts_table import find_linked_transactions, find_linked_transactions_bulk
from src.dashboard.components.graph_container import build_graph_html
from src.dashboard.components.sidebar import DEFAULT_ALERTS_PATH, DEFAULT_TX_PATH
from src.dashboard.config import HIGH_RISK_THRESHOLD, MEDIUM_RISK_THRESHOLD
from src.dashboard.data_loader import get_active_datasets
from src.webapp.graph_assets import make_graph_html_offline_safe

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


def create_app() -> Flask:
    app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")

    @app.get("/")
    def index() -> Response:
        return send_from_directory(STATIC_DIR, "index.html")

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
