"""Tests for src/webapp/server.py — the Flask backend for the alternative web frontend.

Verifies each endpoint against synthetic fixtures (see conftest.py) that mirror the real
ranked_alerts.csv / unified_dataset.csv schemas, and that the schema validation reused from
src.dashboard.data_loader actually runs (not bypassed).
"""

from __future__ import annotations

import json


def test_index_serves_html(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"ChainTrace" in resp.data


def test_static_assets_are_served(client):
    for path in ("/static/style.css", "/static/app.js"):
        resp = client.get(path)
        assert resp.status_code == 200, path


def test_alerts_endpoint_returns_real_rows_sorted_by_risk_score(client):
    resp = client.get("/api/alerts")
    assert resp.status_code == 200
    assert resp.mimetype == "application/json"

    rows = json.loads(resp.data)
    assert len(rows) == 3
    # sanitize_alerts_df() sorts descending by risk_score — confirms it actually ran.
    assert [r["node_id"] for r in rows] == ["wallet_AAA", "tx_123", "wallet_BBB"]
    assert rows[0]["reason"] == "high fees"


def test_alerts_endpoint_emits_valid_json_not_bare_nan(client, alerts_csv):
    # A row with a missing risk_score would produce jsonify's invalid bare `NaN` if the
    # endpoint used jsonify(df.to_dict(...)) instead of df.to_json() — this is the exact
    # bug caught during manual verification; guard against a regression.
    import pandas as pd

    df = pd.read_csv(alerts_csv)
    df.loc[0, "classifier_confidence"] = None
    df.to_csv(alerts_csv, index=False)

    resp = client.get("/api/alerts")
    # json.loads succeeding at all proves there's no bare NaN literal in the payload.
    rows = json.loads(resp.data)
    assert rows[0]["classifier_confidence"] is None


def test_stats_endpoint_computes_correct_breakdown(client):
    resp = client.get("/api/stats")
    assert resp.status_code == 200
    stats = resp.get_json()

    assert stats["total_flagged"] == 3
    assert stats["node_type_breakdown"] == {"wallet": 2, "tx": 1}
    assert stats["risk_tier_counts"]["high"] == 1  # only wallet_AAA (0.91) >= 0.80
    assert stats["risk_tier_counts"]["medium"] == 0  # none in [0.60, 0.80)
    # both tx_123 (0.55) and wallet_BBB (0.20) are < 0.60 -> low
    assert stats["risk_tier_counts"]["low"] == 2


def test_graph_endpoint_returns_offline_safe_html_with_real_node(client):
    resp = client.get("/api/graph")
    assert resp.status_code == 200
    assert resp.mimetype == "text/html"

    html = resp.get_data(as_text=True)
    assert "wallet_AAA" in html  # real alert data made it into the graph, not fallback demo nodes
    assert "cdnjs" not in html
    assert "jsdelivr" not in html
    assert "https://" not in html


def test_geo_endpoint_returns_country_and_asn_breakdown(client):
    resp = client.get("/api/geo")
    assert resp.status_code == 200
    geo = resp.get_json()

    assert geo["total_transactions"] == 3
    countries = {row["country"]: row["count"] for row in geo["by_country"]}
    assert countries == {"US": 2, "CN": 1}


def test_endpoints_return_404_with_helpful_message_when_files_missing(client_missing_files):
    for path in ("/api/alerts", "/api/stats", "/api/geo"):
        resp = client_missing_files.get(path)
        assert resp.status_code == 404
        body = resp.get_json()
        assert "not found" in body["error"].lower()


def test_graph_endpoint_degrades_gracefully_when_files_missing(client_missing_files):
    # The graph endpoint has its own fallback (matches render_graph_section()'s behavior)
    # rather than a hard 404 — it should still return renderable HTML, not crash.
    resp = client_missing_files.get("/api/graph")
    assert resp.status_code == 200
    assert resp.mimetype == "text/html"
