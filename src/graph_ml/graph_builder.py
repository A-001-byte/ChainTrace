"""Builds the unified entity-transaction graph (Section 4 of the blueprint):
wallets <-> transactions as nodes, money flow / funding relationships as edges.

Node types:
  "tx"     - a transaction, node id = f"tx_{txId}"
  "wallet" - a wallet address, node id = f"wallet_{address}"  (only if Elliptic++ loaded)

This is the artifact Phase 2's clustering/detection/explainability steps all operate on.
"""

from __future__ import annotations

import logging

import networkx as nx
import pandas as pd

logger = logging.getLogger(__name__)


def _tx_node_id(tx_id) -> str:
    return f"tx_{tx_id}"


def _wallet_node_id(address) -> str:
    return f"wallet_{address}"


def build_transaction_graph(nodes_df: pd.DataFrame, edges_df: pd.DataFrame) -> nx.Graph:
    """Build a tx-tx graph from Elliptic data alone.

    Node attributes: time_step, class, and every feat_* column (used later by the
    classifier/anomaly detector and by explainability).
    """
    graph = nx.Graph()

    # "class" is a Python keyword — itertuples() silently can't expose it as a named
    # attribute, so rename to "label" locally before iterating (rest of the codebase still
    # uses the node attribute name "label", set explicitly below).
    nodes_df = nodes_df.rename(columns={"class": "label"})

    feature_cols = [c for c in nodes_df.columns if c.startswith("feat_")]
    for row in nodes_df.itertuples(index=False):
        row_dict = row._asdict()
        node_id = _tx_node_id(row_dict["txId"])
        graph.add_node(
            node_id,
            node_type="tx",
            tx_id=row_dict["txId"],
            time_step=row_dict["time_step"],
            label=row_dict["label"],
            **{c: row_dict[c] for c in feature_cols},
        )

    for row in edges_df.itertuples(index=False):
        u, v = _tx_node_id(row.txId1), _tx_node_id(row.txId2)
        if graph.has_node(u) and graph.has_node(v):
            graph.add_edge(u, v, edge_type="tx_tx")

    logger.info(
        "Built tx-only graph: %d nodes, %d edges", graph.number_of_nodes(), graph.number_of_edges()
    )
    return graph


def add_wallet_layer(
    graph: nx.Graph,
    wallets_df: pd.DataFrame,
    addr_tx_edges: pd.DataFrame,
    tx_addr_edges: pd.DataFrame,
) -> nx.Graph:
    """Extend a tx-tx graph with wallet nodes and wallet<->tx edges from Elliptic++.

    Mutates and returns the same graph so it can be chained after build_transaction_graph().
    Wallet-feature columns are namespaced with a "wallet_" prefix so they never collide with
    tx feature columns when both node types coexist in one graph.
    """
    wallets_df = wallets_df.rename(columns={"class": "label"})
    # "time_step" (when present) is metadata like tx nodes' own time_step, not a predictive
    # feature — keep it as a plain node attribute rather than namespacing it "wallet_time_step".
    non_feature_cols = {"address", "label", "time_step"}
    feature_cols = [c for c in wallets_df.columns if c not in non_feature_cols]

    # wallets_df may have multiple rows per address (one per active time step — see
    # data_loader.load_elliptic_pp_wallets); add_node with a repeated node_id overwrites the
    # previous attrs, so pre-sorting by time_step there means the row that "wins" here is
    # always the latest (most complete) snapshot for that address, not an arbitrary one.
    unique_wallets_added = set()
    for row in wallets_df.itertuples(index=False):
        row_dict = row._asdict()
        node_id = _wallet_node_id(row_dict["address"])
        unique_wallets_added.add(node_id)
        graph.add_node(
            node_id,
            node_type="wallet",
            address=row_dict["address"],
            label=row_dict["label"],
            time_step=row_dict.get("time_step"),
            **{f"wallet_{c}": row_dict[c] for c in feature_cols},
        )

    added_edges = 0
    for row in addr_tx_edges.itertuples(index=False):
        wallet_node, tx_node = _wallet_node_id(row.address), _tx_node_id(row.txId)
        if graph.has_node(wallet_node) and graph.has_node(tx_node):
            graph.add_edge(wallet_node, tx_node, edge_type="addr_tx")
            added_edges += 1

    for row in tx_addr_edges.itertuples(index=False):
        tx_node, wallet_node = _tx_node_id(row.txId), _wallet_node_id(row.address)
        if graph.has_node(tx_node) and graph.has_node(wallet_node):
            graph.add_edge(tx_node, wallet_node, edge_type="tx_addr")
            added_edges += 1

    logger.info(
        "Added wallet layer: %d wallet rows -> %d unique wallet nodes, %d wallet<->tx edges. "
        "Graph now %d nodes, %d edges",
        len(wallets_df), len(unique_wallets_added), added_edges,
        graph.number_of_nodes(), graph.number_of_edges(),
    )
    return graph
