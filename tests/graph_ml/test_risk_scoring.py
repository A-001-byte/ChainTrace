from src.graph_ml.clustering import detect_communities
from src.graph_ml.detection import feature_matrix, score_node_type
from src.graph_ml.graph_builder import build_transaction_graph
from src.graph_ml.risk_scoring import build_ranked_alerts


def _run_detection(graph):
    _, features = feature_matrix(graph, "tx", "feat_")
    result = score_node_type(graph, "tx", feature_prefix="feat_")
    return [result], {"tx": features}


def test_build_ranked_alerts_is_sorted_descending_by_risk_score(synthetic_nodes_df, synthetic_edges_df):
    graph = build_transaction_graph(synthetic_nodes_df, synthetic_edges_df)
    detect_communities(graph)
    detection_results, feature_frames = _run_detection(graph)

    alerts = build_ranked_alerts(graph, detection_results, feature_frames, top_n=10)

    assert list(alerts["risk_score"]) == sorted(alerts["risk_score"], reverse=True)
    assert (alerts["risk_score"] <= 1.0).all()
    assert (alerts["risk_score"] >= 0.0).all()


def test_build_ranked_alerts_respects_top_n(synthetic_nodes_df, synthetic_edges_df):
    graph = build_transaction_graph(synthetic_nodes_df, synthetic_edges_df)
    detect_communities(graph)
    detection_results, feature_frames = _run_detection(graph)

    alerts = build_ranked_alerts(graph, detection_results, feature_frames, top_n=5)
    assert len(alerts) == 5


def test_build_ranked_alerts_includes_reason_only_for_returned_rows(synthetic_nodes_df, synthetic_edges_df):
    graph = build_transaction_graph(synthetic_nodes_df, synthetic_edges_df)
    detect_communities(graph)
    detection_results, feature_frames = _run_detection(graph)

    alerts = build_ranked_alerts(graph, detection_results, feature_frames, top_n=3)

    assert "reason" in alerts.columns
    assert alerts["reason"].apply(lambda r: isinstance(r, str) and len(r) > 0).all()


def test_build_ranked_alerts_surfaces_illicit_nodes_near_the_top(synthetic_nodes_df, synthetic_edges_df):
    graph = build_transaction_graph(synthetic_nodes_df, synthetic_edges_df)
    detect_communities(graph)
    detection_results, feature_frames = _run_detection(graph)

    alerts = build_ranked_alerts(graph, detection_results, feature_frames, top_n=10)

    # With a strong synthetic illicit signal, the top-10 ranked alerts should be
    # dominated by illicit-labeled nodes, not unknown/licit ones.
    assert (alerts["label"] == "illicit").sum() >= 7
