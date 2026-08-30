"""End-to-end Phase 2 orchestration: raw data -> graph -> clusters -> detection ->
explainability -> ranked alerts. This is what run_phase2.py calls, and what Person D
(dashboard integration) will import directly once wiring the dashboard to real output.
"""

from __future__ import annotations

import logging

import networkx as nx
import pandas as pd

from . import data_loader
from .clustering import detect_communities
from .config import TOP_N_ALERTS
from .detection import feature_matrix, score_node_type
from .graph_builder import add_wallet_layer, build_transaction_graph
from .risk_scoring import build_ranked_alerts

logger = logging.getLogger(__name__)


def run(sample_timesteps: int | None = None, top_n: int = TOP_N_ALERTS) -> tuple[nx.Graph, pd.DataFrame]:
    """Run the full Phase 2 pipeline.

    Args:
        sample_timesteps: pass e.g. 3 to subsample the Elliptic graph to the first N time
            steps (Section 8 risk mitigation — keeps the demo fast and laptop-friendly).
        top_n: how many top-ranked alerts to return.

    Returns:
        (graph, ranked_alerts_df)
    """
    logger.info("=== Phase 2: Graph + ML core ===")

    nodes_df, edges_df = data_loader.load_elliptic_transactions(sample_timesteps=sample_timesteps)
    graph = build_transaction_graph(nodes_df, edges_df)

    if data_loader.elliptic_pp_available():
        # When the tx graph is subsampled, filter the wallet layer down to only the wallets
        # still connected to a kept tx — otherwise a 3-time-step demo run would still drag in
        # all ~823k wallets regardless of how few transactions are actually in the graph.
        keep_tx_ids = set(nodes_df["txId"]) if sample_timesteps is not None else None
        wallets_df, addr_tx_edges, tx_addr_edges = data_loader.load_elliptic_pp_wallets(keep_tx_ids=keep_tx_ids)
        graph = add_wallet_layer(graph, wallets_df, addr_tx_edges, tx_addr_edges)
        node_types = ["tx", "wallet"]
    else:
        logger.warning(
            "Elliptic++ wallet data not available yet — running tx-only. "
            "Drop the real CSVs in data/raw/elliptic_pp/ to add the wallet layer."
        )
        node_types = ["tx"]

    detect_communities(graph)

    detection_results = []
    feature_frames = {}
    for node_type in node_types:
        prefix = "feat_" if node_type == "tx" else "wallet_"
        _, features = feature_matrix(graph, node_type, prefix)
        feature_frames[node_type] = features
        detection_results.append(score_node_type(graph, node_type, feature_prefix=prefix))

    alerts = build_ranked_alerts(graph, detection_results, feature_frames, top_n=top_n)
    return graph, alerts


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    run()
