"""Tests for src/webapp/server.py — the Flask backend for the alternative web frontend.

Verifies each endpoint against synthetic fixtures (see conftest.py) that mirror the real
ranked_alerts.csv / unified_dataset.csv schemas, and that the schema validation reused from
src.dashboard.data_loader actually runs (not bypassed).
"""

from __future__ import annotations

import json


def test_index_redirects_to_react_app(client):
    # The old standalone HTML/CSS/JS frontend is retired -- "/" now redirects to the
    # React app at /app/ instead of serving its own index.html.
    resp = client.get("/")
    assert resp.status_code in (301, 302, 308)
    assert resp.headers["Location"].rstrip("/").endswith("/app")


def test_react_app_root_is_served(client):
    resp = client.get("/app/")
    assert resp.status_code == 200
    assert resp.mimetype == "text/html"


def test_vendor_assets_are_still_served(client):
    # vendor/ (vis-network, pyvis-lib) is NOT part of the old retired frontend -- /api/graph
    # depends on it (see graph_assets.py's make_graph_html_offline_safe), so it must survive
    # the old-webapp cleanup even though it lives outside static/app/.
    for path in ("/static/vendor/vis-network/vis-network.min.js", "/static/vendor/pyvis-lib/bindings/utils.js"):
        resp = client.get(path)
        assert resp.status_code == 200, path


def test_alerts_endpoint_returns_real_rows_sorted_by_risk_score(client):
    resp = client.get("/api/alerts")
    assert resp.status_code == 200
    assert resp.mimetype == "application/json"

    body = resp.get_json()
    rows = body["rows"]
    assert len(rows) == 3
    # sanitize_alerts_df() sorts descending by risk_score — confirms it actually ran.
    assert [r["node_id"] for r in rows] == ["wallet_AAA", "tx_123", "wallet_BBB"]
    assert rows[0]["reason"] == "high fees"
    assert body["data_source_label"] == "Live Uploaded Data"
    assert body["warnings"] == []


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
    rows = json.loads(resp.data)["rows"]
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
    # Matches Streamlit's render_geo_overlay(): restricted to flagged (risk_score >=
    # MEDIUM_RISK_THRESHOLD) entities, with avg/max risk score per group — not a raw
    # count of all transactions. Only wallet_AAA (risk 0.91) clears that bar in the
    # fixtures; its real geo (US / ASN 7922) comes from the transaction it's linked to
    # via find_linked_transactions(), not a hardcoded "Unknown".
    resp = client.get("/api/geo")
    assert resp.status_code == 200
    geo = resp.get_json()

    assert geo["total_transactions"] == 3
    assert geo["flagged_considered"] == 1
    assert geo["by_country"] == [{"country": "US", "flagged_count": 1, "avg_risk_score": 0.91, "max_risk_score": 0.91}]
    assert geo["by_asn"] == [{"asn": "7922", "flagged_count": 1, "avg_risk_score": 0.91, "max_risk_score": 0.91}]


def test_endpoints_fall_back_to_mock_data_when_files_missing(client_missing_files):
    # Matches Streamlit's get_active_datasets(): missing real files means synthetic mock
    # data, not a broken/empty page — this app has no manual-upload step, so "missing
    # real pipeline output" is the normal state before anyone's run the pipelines yet,
    # and should still render something, exactly like Streamlit does.
    resp = client_missing_files.get("/api/alerts")
    assert resp.status_code == 200
    body = resp.get_json()
    assert len(body["rows"]) > 0
    assert body["data_source_label"] == "Synthetic Mock Data (Offline Prototype Mode)"

    stats = client_missing_files.get("/api/stats").get_json()
    assert stats["data_source_label"] == "Synthetic Mock Data (Offline Prototype Mode)"
    assert stats["total_transactions"] > 0

    geo = client_missing_files.get("/api/geo").get_json()
    assert geo["total_transactions"] > 0


def test_graph_endpoint_degrades_gracefully_when_files_missing(client_missing_files):
    # The graph endpoint has its own fallback (matches render_graph_section()'s behavior)
    # rather than a hard 404 — it should still return renderable HTML, not crash.
    resp = client_missing_files.get("/api/graph")
    assert resp.status_code == 200
    assert resp.mimetype == "text/html"


def test_stats_endpoint_matches_streamlit_render_stat_cards_fields(client):
    # The 4 Streamlit-parity metrics from render_stat_cards(): total transactions,
    # flagged+critical counts, avg confidence among *flagged* (not all) alerts, and
    # distinct Louvain clusters among flagged alerts.
    stats = client.get("/api/stats").get_json()

    assert stats["total_transactions"] == 3
    assert stats["flagged_count"] == 1  # only wallet_AAA (0.91) >= MEDIUM_RISK_THRESHOLD
    assert stats["high_risk_count"] == 1  # only wallet_AAA (0.91) >= HIGH_RISK_THRESHOLD
    assert stats["flagged_avg_confidence_pct"] == 91.0
    assert stats["distinct_clusters"] == 1  # wallet_AAA's own cluster (5)


def test_entity_endpoint_returns_alert_and_linked_transactions(client):
    resp = client.get("/api/entity/wallet_AAA")
    assert resp.status_code == 200
    body = resp.get_json()

    assert body["alert"]["node_id"] == "wallet_AAA"
    assert body["alert"]["reason"] == "high fees"
    # real geo enriched from its linked transaction, not the raw "Unknown" default
    assert body["alert"]["geo_country"] == "US"
    assert len(body["linked_transactions"]) == 1
    assert body["linked_transactions"][0]["txid"] == 123


def test_entity_endpoint_404s_for_unknown_entity(client):
    resp = client.get("/api/entity/wallet_does_not_exist")
    assert resp.status_code == 404
    assert "no alert found" in resp.get_json()["error"].lower()


def test_kick_down_doors_endpoint_returns_local_ranked_results(client):
    # wallet_AAA is linked to tx_123 (see unified_dataset_csv fixture), giving the local
    # subgraph builder a real 1-hop neighborhood to score -- same local scope as
    # Streamlit's Kick Down Doors expander, not a network-wide analysis.
    resp = client.get("/api/entity/wallet_AAA/kick-down-doors")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["entity_id"] == "wallet_AAA"
    assert isinstance(body["results"], list)
    assert len(body["results"]) > 0
    expected_fields = {"node_id", "node_type", "impact_score", "betweenness", "is_articulation_point", "reason"}
    for r in body["results"]:
        assert set(r.keys()) == expected_fields


def test_kick_down_doors_endpoint_404s_for_unknown_entity(client):
    resp = client.get("/api/entity/wallet_does_not_exist/kick-down-doors")
    assert resp.status_code == 404
    assert "no alert found" in resp.get_json()["error"].lower()


def test_kick_down_doors_subgraph_builder_handles_isolated_entity_gracefully():
    # An entity with zero matching transactions -- e.g. a wallet just added to alerts,
    # not yet seen in unified_dataset.csv -- must degrade cleanly, not crash. Confirmed
    # empirically (not assumed): the entity is always added to the subgraph itself, so
    # kick_down_doors() returns that single degenerate node (impact_score 0.0, no
    # articulation point) rather than an empty list -- still a real, valid, non-crashing
    # response for the frontend's empty/trivial-case handling to render.
    # Exercised directly (not through the Flask app) since the shared alerts_csv/
    # unified_dataset_csv fixtures are relied on by row/column-count assertions elsewhere;
    # adding an unlinked wallet there would ripple into those unrelated tests.
    import pandas as pd

    from src.webapp.server import _build_kick_down_doors_subgraph
    from src.graph_ml.clustering import kick_down_doors

    row = pd.Series({"label": "unknown", "cluster_id": None})
    empty_matching_txs = pd.DataFrame(columns=["txid", "input_addresses", "output_addresses"])

    sub_g = _build_kick_down_doors_subgraph("wallet_isolated", row, empty_matching_txs)
    results = kick_down_doors(sub_g, ["wallet_isolated"], top_n=5)

    assert len(results) == 1
    assert results[0]["node_id"] == "wallet_isolated"
    assert results[0]["impact_score"] == 0.0
    assert results[0]["is_articulation_point"] is False


def test_transactions_endpoint_paginates(client):
    page1 = client.get("/api/transactions?limit=2&offset=0").get_json()
    assert page1["total"] == 3
    assert page1["limit"] == 2
    assert len(page1["rows"]) == 2

    page2 = client.get("/api/transactions?limit=2&offset=2").get_json()
    assert len(page2["rows"]) == 1


def test_transactions_endpoint_caps_limit_to_reasonable_max(client):
    resp = client.get("/api/transactions?limit=999999").get_json()
    assert resp["limit"] <= 500


def test_graph_endpoint_accepts_focus_query_param(client):
    resp = client.get("/api/graph?focus=wallet_AAA")
    assert resp.status_code == 200
    html = resp.get_data(as_text=True)
    assert "wallet_AAA" in html
