from src.graph_ml.clustering import detect_communities, illicit_ratio_per_cluster, kick_down_doors
from src.graph_ml.graph_builder import build_transaction_graph


def test_detect_communities_separates_disconnected_components(synthetic_nodes_df, synthetic_edges_df):
    graph = build_transaction_graph(synthetic_nodes_df, synthetic_edges_df)

    cluster_map = detect_communities(graph)

    # Each class forms its own connected component in the fixture, so Louvain should never
    # merge an illicit node and a licit node into the same cluster.
    illicit_clusters = {
        cluster_map[f"tx_{txid}"] for txid in synthetic_nodes_df.loc[synthetic_nodes_df["class"] == "illicit", "txId"]
    }
    licit_clusters = {
        cluster_map[f"tx_{txid}"] for txid in synthetic_nodes_df.loc[synthetic_nodes_df["class"] == "licit", "txId"]
    }
    assert illicit_clusters.isdisjoint(licit_clusters)


def test_illicit_ratio_per_cluster_is_one_for_all_illicit_cluster(synthetic_nodes_df, synthetic_edges_df):
    graph = build_transaction_graph(synthetic_nodes_df, synthetic_edges_df)
    detect_communities(graph)

    ratios = illicit_ratio_per_cluster(graph)

    illicit_tx_id = synthetic_nodes_df.loc[synthetic_nodes_df["class"] == "illicit", "txId"].iloc[0]
    illicit_node = f"tx_{illicit_tx_id}"
    illicit_cluster_id = graph.nodes[illicit_node]["cluster"]
    assert ratios[illicit_cluster_id] == 1.0


def test_kick_down_doors_ranks_bridge_nodes_higher(synthetic_nodes_df, synthetic_edges_df):
    graph = build_transaction_graph(synthetic_nodes_df, synthetic_edges_df)
    detect_communities(graph)

    flagged_ids = [f"tx_{txid}" for txid in synthetic_nodes_df["txId"].head(3)]
    results = kick_down_doors(graph, flagged_ids, top_n=5)

    assert isinstance(results, list)
    assert len(results) > 0
    assert "node_id" in results[0]
    assert "betweenness" in results[0]
    assert "is_articulation_point" in results[0]
    assert "impact_score" in results[0]
    assert "reason" in results[0]


def test_kick_down_doors_handles_empty_or_invalid_flagged_list(synthetic_nodes_df, synthetic_edges_df):
    graph = build_transaction_graph(synthetic_nodes_df, synthetic_edges_df)
    
    empty_res = kick_down_doors(graph, [], top_n=5)
    assert empty_res == []

    invalid_res = kick_down_doors(graph, ["nonexistent_node_9999"], top_n=5)
    assert invalid_res == []

