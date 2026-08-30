from src.graph_ml.detection import feature_matrix, score_node_type
from src.graph_ml.explainability import explain_cluster_membership, explain_node, top_global_features
from src.graph_ml.graph_builder import build_transaction_graph


def test_explain_node_returns_nonempty_reason_for_extreme_node(synthetic_nodes_df, synthetic_edges_df):
    graph = build_transaction_graph(synthetic_nodes_df, synthetic_edges_df)
    result = score_node_type(graph, "tx", feature_prefix="feat_")
    _, features = feature_matrix(graph, "tx", "feat_")

    illicit_tx_id = synthetic_nodes_df.loc[synthetic_nodes_df["class"] == "illicit", "txId"].iloc[0]
    illicit_node = f"tx_{illicit_tx_id}"
    reason = explain_node(illicit_node, features, result.classifier)

    assert isinstance(reason, str)
    assert len(reason) > 0


def test_explain_node_handles_missing_node_id_gracefully(synthetic_nodes_df, synthetic_edges_df):
    graph = build_transaction_graph(synthetic_nodes_df, synthetic_edges_df)
    result = score_node_type(graph, "tx", feature_prefix="feat_")
    _, features = feature_matrix(graph, "tx", "feat_")

    reason = explain_node("tx_does_not_exist", features, result.classifier)
    assert "No feature data" in reason


def test_top_global_features_returns_requested_count(synthetic_nodes_df, synthetic_edges_df):
    graph = build_transaction_graph(synthetic_nodes_df, synthetic_edges_df)
    result = score_node_type(graph, "tx", feature_prefix="feat_")

    top = top_global_features(result.classifier, result.feature_names, top_k=3)
    assert len(top) == 3
    assert all(f in result.feature_names for f in top)


def test_explain_cluster_membership_thresholds():
    assert explain_cluster_membership(0.9) is not None
    assert "90%" in explain_cluster_membership(0.9)
    assert explain_cluster_membership(0.1) is None
