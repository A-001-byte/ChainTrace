import pandas as pd

from src.graph_ml.graph_builder import add_wallet_layer, build_transaction_graph


def test_build_transaction_graph_creates_expected_nodes_and_edges(synthetic_nodes_df, synthetic_edges_df):
    graph = build_transaction_graph(synthetic_nodes_df, synthetic_edges_df)

    assert graph.number_of_nodes() == len(synthetic_nodes_df)
    assert graph.number_of_edges() == len(synthetic_edges_df)

    sample_node = f"tx_{synthetic_nodes_df.iloc[0]['txId']}"
    attrs = graph.nodes[sample_node]
    assert attrs["node_type"] == "tx"
    assert attrs["label"] in {"illicit", "licit", "unknown"}
    assert "feat_0" in attrs


def test_build_transaction_graph_drops_edges_to_unknown_nodes(synthetic_nodes_df, synthetic_edges_df):
    # Edge pointing at a txId that doesn't exist in nodes_df should be silently skipped,
    # not raise — real edgelists reference nodes outside a subsampled time-step window.
    edges_with_dangling = pd.concat(
        [synthetic_edges_df, pd.DataFrame([{"txId1": 999999, "txId2": synthetic_nodes_df.iloc[0]["txId"]}])],
        ignore_index=True,
    )
    graph = build_transaction_graph(synthetic_nodes_df, edges_with_dangling)
    assert graph.number_of_edges() == len(synthetic_edges_df)
    assert "tx_999999" not in graph.nodes


def test_add_wallet_layer_links_wallets_to_transactions(synthetic_nodes_df, synthetic_edges_df):
    graph = build_transaction_graph(synthetic_nodes_df, synthetic_edges_df)

    first_tx_id = synthetic_nodes_df.iloc[0]["txId"]
    wallets_df = pd.DataFrame([{"address": "addr_A", "wallet_feat_0": 1.5, "class": "illicit"}])
    addr_tx_edges = pd.DataFrame([{"address": "addr_A", "txId": first_tx_id}])
    tx_addr_edges = pd.DataFrame(columns=["txId", "address"])

    graph = add_wallet_layer(graph, wallets_df, addr_tx_edges, tx_addr_edges)

    assert "wallet_addr_A" in graph.nodes
    assert graph.nodes["wallet_addr_A"]["node_type"] == "wallet"
    assert graph.has_edge("wallet_addr_A", f"tx_{first_tx_id}")
