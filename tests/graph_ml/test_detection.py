import pandas as pd
import pytest

from src.graph_ml.detection import feature_matrix, score_node_type
from src.graph_ml.graph_builder import build_transaction_graph


def test_score_node_type_covers_every_node_including_unlabeled(synthetic_nodes_df, synthetic_edges_df):
    graph = build_transaction_graph(synthetic_nodes_df, synthetic_edges_df)

    result = score_node_type(graph, "tx", feature_prefix="feat_")

    all_node_ids = {f"tx_{txid}" for txid in synthetic_nodes_df["txId"]}
    assert set(result.illicit_probability.keys()) == all_node_ids
    assert set(result.anomaly_score.keys()) == all_node_ids
    assert all(0.0 <= p <= 1.0 for p in result.illicit_probability.values())
    assert all(0.0 <= a <= 1.0 for a in result.anomaly_score.values())


def test_score_node_type_ranks_illicit_nodes_above_licit(synthetic_nodes_df, synthetic_edges_df):
    # The fixture gives illicit nodes a strongly shifted feat_0, so a correctly trained
    # classifier should score them higher on average than licit nodes — a real behavioral
    # check, not just "did it run".
    graph = build_transaction_graph(synthetic_nodes_df, synthetic_edges_df)
    result = score_node_type(graph, "tx", feature_prefix="feat_")

    illicit_ids = [f"tx_{t}" for t in synthetic_nodes_df.loc[synthetic_nodes_df["class"] == "illicit", "txId"]]
    licit_ids = [f"tx_{t}" for t in synthetic_nodes_df.loc[synthetic_nodes_df["class"] == "licit", "txId"]]

    avg_illicit = sum(result.illicit_probability[n] for n in illicit_ids) / len(illicit_ids)
    avg_licit = sum(result.illicit_probability[n] for n in licit_ids) / len(licit_ids)
    assert avg_illicit > avg_licit


def test_score_node_type_handles_too_few_labeled_nodes_gracefully():
    # Fewer than 10 labeled nodes -> should not attempt to train/holdout-split, just
    # default to 0.0 confidence rather than raising (stratified split would fail on this
    # few samples per class).
    nodes_df = pd.DataFrame(
        [
            {"txId": 1, "time_step": 0, "feat_0": 0.1, "feat_1": 0.2, "class": "illicit"},
            {"txId": 2, "time_step": 0, "feat_0": 0.3, "feat_1": 0.1, "class": "licit"},
            {"txId": 3, "time_step": 0, "feat_0": 0.2, "feat_1": 0.4, "class": "unknown"},
        ]
    )
    graph = build_transaction_graph(nodes_df, pd.DataFrame(columns=["txId1", "txId2"]))

    result = score_node_type(graph, "tx", feature_prefix="feat_")

    assert all(p == 0.0 for p in result.illicit_probability.values())


def test_feature_matrix_only_includes_matching_node_type(synthetic_nodes_df, synthetic_edges_df):
    graph = build_transaction_graph(synthetic_nodes_df, synthetic_edges_df)
    node_ids, features = feature_matrix(graph, "tx", "feat_")

    assert len(node_ids) == len(synthetic_nodes_df)
    assert list(features.columns) == [f"feat_{i}" for i in range(6)]
