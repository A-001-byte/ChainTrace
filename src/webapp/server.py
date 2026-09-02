"""ChainTrace — alternative HTML/CSS/JS web frontend backend (Flask).

A second, independent way to view the same pipeline outputs the Streamlit dashboard
(src/dashboard/) shows — not a replacement, and it doesn't import or modify anything in
src/dashboard/ except by calling its already-public, pure functions:

- src.dashboard.data_loader.load_file / sanitize_transaction_df / sanitize_alerts_df
  for schema validation, reused as-is rather than re-implemented here.
- src.dashboard.components.graph_container.build_graph_html for the interactive graph,
  same graph-building logic as the Streamlit "Entity-Transaction Graph" tab.

Fully offline: reads only local files under data/processed/ and outputs/alerts/, and the
graph HTML is post-processed (see graph_assets.py) so it never references a CDN.

Run directly:
    python -m src.webapp.server
or via the Flask CLI:
    flask --app src.webapp.server run
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
from flask import Flask, Response, jsonify, send_from_directory

from src.dashboard.components.graph_container import build_graph_html
from src.dashboard.components.sidebar import DEFAULT_ALERTS_PATH, DEFAULT_TX_PATH
from src.dashboard.config import HIGH_RISK_THRESHOLD, MEDIUM_RISK_THRESHOLD
from src.dashboard.data_loader import load_file, sanitize_alerts_df, sanitize_transaction_df
from src.webapp.graph_assets import make_graph_html_offline_safe

STATIC_DIR = Path(__file__).resolve().parent / "static"
GRAPH_HTML_PATH = "outputs/graphs/cluster_graph.html"  # same default as render_graph_section()


def _load_alerts() -> tuple[pd.DataFrame | None, str | None]:
    """Load+validate ranked_alerts.csv via the existing dashboard schema logic.

    Returns (dataframe, None) on success, or (None, error_message) on failure — mirrors
    the (ok, message, df) shape of load_file()/sanitize_alerts_df() without forcing every
    caller to unpack three values when only success/failure matters.
    """
    if not DEFAULT_ALERTS_PATH.exists():
        return None, (
            f"Alerts file not found at {DEFAULT_ALERTS_PATH}. "
            "Run the graph_ml pipeline (see run_all.sh/run_all.bat) first."
        )
    ok, msg, raw_df = load_file(str(DEFAULT_ALERTS_PATH))
    if not ok:
        return None, msg
    valid, msg2, clean_df = sanitize_alerts_df(raw_df)
    if not valid:
        return None, msg2
    return clean_df, None


def _load_transactions() -> tuple[pd.DataFrame | None, str | None]:
    """Load+validate unified_dataset.csv via the existing dashboard schema logic."""
    if not DEFAULT_TX_PATH.exists():
        return None, (
            f"Transaction file not found at {DEFAULT_TX_PATH}. "
            "Run the data pipeline (see run_all.sh/run_all.bat) first."
        )
    ok, msg, raw_df = load_file(str(DEFAULT_TX_PATH))
    if not ok:
        return None, msg
    valid, msg2, clean_df = sanitize_transaction_df(raw_df)
    if not valid:
        return None, msg2
    return clean_df, None


def _compute_stats(alerts_df: pd.DataFrame) -> dict:
    """Summary numbers for the stats-cards row: totals, node-type breakdown, average
    confidence, and risk-tier counts — using the same HIGH/MEDIUM thresholds as the
    Streamlit dashboard (src.dashboard.config) so both surfaces agree on what "high risk"
    means.
    """
    total = len(alerts_df)
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
        "total_flagged": total,
        "node_type_breakdown": by_type,
        "avg_risk_score": round(avg_risk_score, 4),
        "avg_classifier_confidence": (
            round(avg_classifier_confidence, 4) if avg_classifier_confidence is not None else None
        ),
        "risk_tier_counts": {"high": high, "medium": medium, "low": low},
        "risk_tier_thresholds": {"high": HIGH_RISK_THRESHOLD, "medium": MEDIUM_RISK_THRESHOLD},
    }


def _compute_geo_summary(tx_df: pd.DataFrame, top_n: int = 20) -> dict:
    """Country/ASN breakdown from the unified transaction dataset, top N each by count."""
    by_country = []
    if "geo_country" in tx_df.columns:
        counts = tx_df["geo_country"].value_counts().head(top_n)
        by_country = [{"country": str(k), "count": int(v)} for k, v in counts.items()]

    by_asn = []
    if "asn" in tx_df.columns:
        counts = tx_df["asn"].value_counts().head(top_n)
        by_asn = [{"asn": str(k), "count": int(v)} for k, v in counts.items()]

    return {"total_transactions": len(tx_df), "by_country": by_country, "by_asn": by_asn}


def create_app() -> Flask:
    app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")

    @app.get("/")
    def index() -> Response:
        return send_from_directory(STATIC_DIR, "index.html")

    @app.get("/api/alerts")
    def api_alerts():
        alerts_df, error = _load_alerts()
        if error:
            return jsonify({"error": error}), 404
        # pandas' own to_json (not jsonify(df.to_dict(...))) — jsonify emits a bare `NaN`
        # literal for missing floats, which is not valid JSON and breaks JSON.parse() in
        # the browser; to_json() correctly emits `null`. Verified directly, not assumed.
        return Response(alerts_df.to_json(orient="records"), mimetype="application/json")

    @app.get("/api/stats")
    def api_stats():
        alerts_df, error = _load_alerts()
        if error:
            return jsonify({"error": error}), 404
        return jsonify(_compute_stats(alerts_df))

    @app.get("/api/graph")
    def api_graph():
        alerts_df, _ = _load_alerts()  # graph degrades gracefully if alerts aren't ready yet
        tx_df, _ = _load_transactions()
        try:
            html = build_graph_html(alerts_df=alerts_df, tx_df=tx_df, html_path=GRAPH_HTML_PATH)
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
        tx_df, error = _load_transactions()
        if error:
            return jsonify({"error": error}), 404
        return jsonify(_compute_geo_summary(tx_df))

    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=5000, debug=False)
